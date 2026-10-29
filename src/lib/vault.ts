/**
 * Server-side vault: notes are plain `.md` files in a folder on your disk,
 * attachments sit beside them. Everything here is local filesystem access —
 * no network, no database.
 *
 * Only imported from route handlers (Node runtime).
 */
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'

export const VAULT = path.resolve(/*turbopackIgnore: true*/ process.env.CAIRN_VAULT || path.join(process.cwd(), 'vault'))
export const MAX_FILE = 200 * 1024 * 1024
export const MAX_NOTE = 25 * 1024 * 1024
const STATE = path.join(VAULT, '.cairn', 'state.json')
const TRASH = '.trash'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

fs.mkdirSync(VAULT, { recursive: true })

/* ---------- request guard ---------- */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The API is for the page we serve and nobody else. Refuse requests addressed to a
 * non-loopback Host (DNS rebinding) or sent from another origin (cross-site writes).
 * Set CAIRN_ALLOW_REMOTE=1 to disable the host check (you then own the auth story).
 */
export function guard(req: Request) {
  const host = req.headers.get('host') || ''
  if (!process.env.CAIRN_ALLOW_REMOTE && !LOCAL_HOSTS.has(host.replace(/:\d+$/, ''))) {
    throw new HttpError(403, 'bad host')
  }
  const origin = req.headers.get('origin')
  if (origin) {
    let ok = false
    try { ok = new URL(origin).host === host } catch { /* malformed */ }
    if (!ok) throw new HttpError(403, 'cross-origin request refused')
  }
}

export function fail(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status })
  console.error(e)
  return Response.json({ error: 'server error' }, { status: 500 })
}

/* ---------- paths ---------- */

function cleanParts(p: string | null, allowTrash: boolean): string[] {
  if (!p || !p.trim()) throw new HttpError(400, 'missing path')
  const parts = p.split('/').map((s) => s.trim())
  parts.forEach((s, i) => {
    const trashRoot = allowTrash && i === 0 && s === TRASH
    if (!s || s === '.' || s === '..' || (s.startsWith('.') && !trashRoot) || /[\0\\:*?"<>|]/.test(s)) {
      throw new HttpError(400, 'invalid path')
    }
  })
  return parts
}
function inside(file: string) {
  if (!file.startsWith(VAULT + path.sep)) throw new HttpError(400, 'invalid path')
  return file
}
export const noteFile = (p: string | null) => inside(path.join(VAULT, ...cleanParts(p, true)) + '.md')
export const folderDir = (p: string | null) => inside(path.join(VAULT, ...cleanParts(p, false)))
export function attFile(p: string | null) {
  const parts = cleanParts(p, false)
  const rel = parts.join('/')
  if (/\.md$/i.test(rel) || rel.includes('.tmp-')) throw new HttpError(400, 'invalid path')
  return inside(path.join(VAULT, ...parts))
}

/* ---------- listing ---------- */

export type Listing = {
  notes: Record<string, { c: string; t: number }>
  folders: string[]
  files: Record<string, { size: number; t: number }>
  vault: string
}

async function walk(dir: string, rel: string, out: Listing) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const isTrash = rel === '' && e.name === TRASH
    if (e.name.startsWith('.') && !isTrash) continue
    const full = path.join(dir, e.name)
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (!isTrash) out.folders.push(r)
      await walk(full, r, out)
    } else if (e.isFile() && e.name.endsWith('.md')) {
      const st = await fsp.stat(full)
      out.notes[r.slice(0, -3)] = { c: await fsp.readFile(full, 'utf8'), t: Math.round(st.mtimeMs) }
    } else if (e.isFile() && !e.name.includes('.tmp-') && !r.startsWith(TRASH + '/')) {
      const st = await fsp.stat(full)
      out.files[r] = { size: st.size, t: Math.round(st.mtimeMs) }
    }
  }
}

export async function listVault(): Promise<Listing> {
  const out: Listing = { notes: {}, folders: [], files: {}, vault: VAULT }
  await walk(VAULT, '', out)
  return out
}

/* ---------- writes ---------- */

export async function writeAtomic(file: string, data: string) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  await fsp.writeFile(tmp, data)
  await fsp.rename(tmp, file) // atomic: a crash never leaves a half-written note
  return Math.round((await fsp.stat(file)).mtimeMs)
}

/** Stream an upload to disk, aborting past MAX_FILE. */
export async function saveUpload(req: Request, file: string) {
  if (!req.body) throw new HttpError(400, 'empty body')
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  let n = 0
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      n += chunk.length
      cb(n > MAX_FILE ? new HttpError(413, 'file too large') : null, chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(req.body as never), limiter, fs.createWriteStream(tmp))
    await fsp.rename(tmp, file)
  } catch (e) {
    await fsp.unlink(tmp).catch(() => {})
    throw e
  }
  return n
}

export async function removeFile(file: string) {
  await fsp.unlink(file).catch((e) => {
    if (e.code !== 'ENOENT') throw e
  })
}

/* ---------- serving attachments ---------- */

// Only these are shown inline. Everything else (e.g. .html) is forced to download as opaque
// bytes, so an uploaded file can never run script on the app's origin.
const SAFE: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.txt': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8', '.json': 'text/plain; charset=utf-8',
  '.canva': 'text/plain; charset=utf-8',
}

export async function serveFile(req: Request, file: string) {
  let st: fs.Stats
  try {
    st = await fsp.stat(file)
    if (!st.isFile()) throw new Error()
  } catch {
    throw new HttpError(404, 'not found')
  }
  const ext = path.extname(file).toLowerCase()
  const type = SAFE[ext]
  const headers: Record<string, string> = {
    'content-type': type || 'application/octet-stream',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
    'cache-control': 'no-cache',
    'content-disposition': `${type ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
  }
  if (ext !== '.pdf') headers['content-security-policy'] = 'sandbox' // neutralise script in a directly-opened SVG
  let start = 0, end = st.size - 1, status = 200
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '')
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], end) } else start = Math.max(0, st.size - +m[2])
    if (start > end || start >= st.size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${st.size}` } })
    status = 206
    headers['content-range'] = `bytes ${start}-${end}/${st.size}`
  }
  headers['content-length'] = String(st.size === 0 ? 0 : end - start + 1)
  if (st.size === 0) return new Response(null, { status, headers })
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as never, { status, headers })
}

/* ---------- UI state ---------- */

export async function readState(): Promise<unknown> {
  try { return JSON.parse(await fsp.readFile(STATE, 'utf8')) } catch { return {} }
}
export async function writeState(s: unknown) {
  await writeAtomic(STATE, JSON.stringify(s))
}
