'use client'

/**
 * Keeps the in-memory notes store and the vault on disk in step.
 *
 *  - load():   read every .md file from the vault into the store
 *  - flush():  push only what changed (writes, renames, deletes) to disk
 *  - pull():   notice edits made outside Cairn (any editor, git, sync tools)
 *
 * Nothing is ever deleted that this module did not itself write or read, and a flush never runs
 * before the first successful load, so a failed request can't wipe a vault.
 */

import { toast } from 'sonner'
import { SEED_FOLDERS, SEED_NOTES, useNotes, type Folder, type Note } from './notes-store'

const TRASH = '.trash'
const ATTACH_DIR = 'attachments'
const FLUSH_DELAY = 400
const POLL_MS = 4000

type Listing = {
  notes: Record<string, { c: string; t: number }>
  folders: string[]
  files: Record<string, { size: number; t: number }>
  vault: string
}
type Meta = {
  seeded?: boolean
  notes?: Record<string, { p: string; fav?: boolean; created?: number }>
}

/* ---------- api ---------- */

async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j.error || res.statusText)
  }
  return res.json() as Promise<T>
}
const noteUrl = (p: string) => `/api/note?p=${encodeURIComponent(p)}`
export const fileUrl = (p: string) => `/api/file?p=${encodeURIComponent(p)}`

/* ---------- note <-> file mapping ---------- */

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const dirName = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

/** A title becomes a filename: strip what filesystems reject, keep it readable. */
export function safeName(s: string): string {
  const clean = s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120)
  return clean || 'Untitled'
}
function safeFolder(name: string): string {
  return name.split('/').map(safeName).join('/')
}

/** Where every note should live on disk. Deterministic, so names never flip between flushes. */
function layout(notes: Note[], folders: Folder[]): Map<string, { path: string; content: string; id: string }> {
  const dirOf = new Map(folders.map((f) => [f.id, safeFolder(f.name)]))
  const out = new Map<string, { path: string; content: string; id: string }>()
  const taken = new Set<string>()
  const ordered = [...notes].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  for (const n of ordered) {
    const dir = n.folderId ? dirOf.get(n.folderId) ?? '' : ''
    const stem = [n.deleted ? TRASH : '', dir, safeName(n.title)].filter(Boolean).join('/')
    let path = stem
    for (let i = 2; taken.has(path.toLowerCase()); i++) path = `${stem} ${i}`
    taken.add(path.toLowerCase())
    out.set(path, { path, content: n.content, id: n.id })
  }
  return out
}

/* ---------- module state ---------- */

let loaded = false
let snap = new Map<string, string>() // path -> content the server is known to hold
let snapFolders = new Set<string>()
let metaJson = ''
let pathToId = new Map<string, string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false
let again = false
let dirty = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let started = false
let vaultPath = ''
export const getVaultPath = () => vaultPath

/* ---------- load ---------- */

function hash(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function buildFromListing(listing: Listing, meta: Meta) {
  const byPath = new Map(Object.entries(meta.notes ?? {}).map(([id, m]) => [m.p, { id, ...m }]))
  const folders: Folder[] = []
  const folderId = (name: string) => {
    let f = folders.find((x) => x.name === name)
    if (!f) folders.push((f = { id: `f:${name}`, name }))
    return f.id
  }
  for (const d of listing.folders) if (d !== ATTACH_DIR && !d.startsWith(ATTACH_DIR + '/')) folderId(d)

  const notes: Note[] = []
  for (const [path, file] of Object.entries(listing.notes)) {
    const deleted = path.startsWith(TRASH + '/')
    const shown = deleted ? path.slice(TRASH.length + 1) : path
    const m = byPath.get(path)
    const dir = dirName(shown)
    notes.push({
      id: m?.id ?? `n-${hash(path)}-${notes.length}`,
      title: baseName(shown),
      content: file.c,
      folderId: dir ? folderId(dir) : null,
      favorite: !!m?.fav && !deleted,
      deleted,
      createdAt: m?.created ?? file.t,
      updatedAt: file.t,
    })
  }
  return { notes, folders }
}

export async function load() {
  const [listing, meta] = await Promise.all([api<Listing>('GET', '/api/vault'), api<Meta>('GET', '/api/state')])
  vaultPath = listing.vault
  let { notes, folders } = buildFromListing(listing, meta)

  snap = new Map(Object.entries(listing.notes).map(([p, f]) => [p, f.c]))
  snapFolders = new Set(listing.folders)

  const fresh = notes.length === 0 && folders.length === 0 && !meta.seeded
  let seededNow = false
  if (fresh) {
    notes = SEED_NOTES
    folders = SEED_FOLDERS
    seededNow = true
  }
  const st = useNotes.getState()
  const activeId = notes.some((n) => n.id === st.activeId && !n.deleted)
    ? st.activeId
    : (notes.find((n) => !n.deleted && n.favorite) ?? notes.find((n) => !n.deleted))?.id ?? null
  useNotes.setState({ notes, folders, files: listing.files, activeId, ready: true })
  loaded = true
  pathToId = new Map([...layout(notes, folders)].map(([p, v]) => [p, v.id]))
  metaJson = seededNow ? '' : JSON.stringify(makeMeta(notes, folders, true))
  if (seededNow) scheduleFlush(0)
}

function makeMeta(notes: Note[], folders: Folder[], seeded: boolean): Meta {
  const lay = layout(notes, folders)
  const byId = new Map(notes.map((n) => [n.id, n]))
  const out: Meta['notes'] = {}
  for (const [path, v] of lay) {
    const n = byId.get(v.id)!
    out[n.id] = { p: path, ...(n.favorite ? { fav: true } : {}), created: n.createdAt }
  }
  return { seeded, notes: out }
}

/* ---------- flush: store -> disk ---------- */

export function scheduleFlush(delay = FLUSH_DELAY) {
  if (!loaded) return
  dirty = true
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, delay)
}

export async function flush() {
  if (!loaded) return
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (flushing) {
    again = true
    return
  }
  flushing = true
  try {
    const { notes, folders } = useNotes.getState()
    const lay = layout(notes, folders)

    // removed / renamed paths first (so a case-only rename can't delete its own new file)
    for (const path of [...snap.keys()]) {
      if (!lay.has(path)) {
        await api('DELETE', noteUrl(path))
        snap.delete(path)
      }
    }
    const jobs: Promise<unknown>[] = []
    for (const f of folders) {
      const dir = safeFolder(f.name)
      if (!snapFolders.has(dir)) jobs.push(api('POST', '/api/folder', { p: dir }).then(() => snapFolders.add(dir)))
    }
    for (const [path, v] of lay) {
      if (snap.get(path) !== v.content) {
        jobs.push(api('PUT', noteUrl(path), { c: v.content }).then(() => void snap.set(path, v.content)))
      }
    }
    await Promise.all(jobs)
    pathToId = new Map([...lay].map(([p, v]) => [p, v.id]))

    const meta = JSON.stringify(makeMeta(notes, folders, true))
    if (meta !== metaJson) {
      await api('PUT', '/api/state', JSON.parse(meta))
      metaJson = meta
    }
    dirty = false
    useNotes.setState({ saveState: 'saved' })
  } catch (e) {
    toast.error('Could not save to your vault', { id: 'vault-offline', description: 'Retrying…' })
    flushTimer = setTimeout(flush, 3000)
  }
  flushing = false
  if (again) {
    again = false
    void flush()
  }
}

/* ---------- pull: disk -> store ---------- */

async function pull() {
  if (!loaded || flushing || dirty) return
  let listing: Listing
  try {
    listing = await api<Listing>('GET', '/api/vault')
  } catch {
    return
  }
  const st = useNotes.getState()
  const editingId = st.mode === 'edit' ? st.activeId : null
  const lay = layout(st.notes, st.folders)
  let notes = st.notes
  let folders = st.folders
  let changed = false

  for (const [path, file] of Object.entries(listing.notes)) {
    const known = snap.get(path)
    const mine = lay.get(path)
    if (known === undefined || !mine) {
      // a file we have never seen
      const built = buildFromListing({ ...listing, notes: { [path]: file }, folders: [] }, {})
      const n = built.notes[0]
      const deleted = n.deleted
      const dir = dirName(deleted ? path.slice(TRASH.length + 1) : path)
      let folderId: string | null = null
      if (dir) {
        let f = folders.find((x) => x.name === dir)
        if (!f) {
          f = { id: `f:${dir}`, name: dir }
          folders = [...folders, f]
        }
        folderId = f.id
      }
      notes = [{ ...n, folderId }, ...notes]
      snap.set(path, file.c)
      changed = true
    } else if (known !== file.c && mine.content === known && mine.id !== editingId) {
      // changed on disk while we hold no unsaved edits
      notes = notes.map((n) => (n.id === mine.id ? { ...n, content: file.c, updatedAt: file.t } : n))
      snap.set(path, file.c)
      changed = true
    }
  }
  for (const path of [...snap.keys()]) {
    const mine = lay.get(path)
    if (!listing.notes[path] && mine && mine.content === snap.get(path) && mine.id !== editingId) {
      notes = notes.filter((n) => n.id !== mine.id)
      snap.delete(path)
      changed = true
    }
  }
  for (const d of listing.folders) {
    if (d === ATTACH_DIR || d.startsWith(ATTACH_DIR + '/')) continue
    snapFolders.add(d)
    if (!folders.some((f) => f.name === d)) {
      folders = [...folders, { id: `f:${d}`, name: d }]
      changed = true
    }
  }
  const fileKeys = (o: Record<string, unknown>) => Object.keys(o).sort().join('\n')
  const filesChanged = fileKeys(listing.files) !== fileKeys(st.files)
  if (changed || filesChanged) {
    useNotes.setState({
      ...(changed ? { notes, folders } : {}),
      ...(filesChanged ? { files: listing.files } : {}),
    })
    if (changed) pathToId = new Map([...layout(notes, folders)].map(([p, v]) => [p, v.id]))
  }
}

/* ---------- attachments ---------- */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i

export function fileKind(path: string): 'img' | 'pdf' | 'audio' | 'video' | 'canva' | 'other' {
  const e = (path.match(/\.([^./]+)$/)?.[1] ?? '').toLowerCase()
  if (IMAGE_EXT.test(path)) return 'img'
  if (e === 'pdf') return 'pdf'
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(e)) return 'audio'
  if (['mp4', 'webm', 'mov'].includes(e)) return 'video'
  if (e === 'canva') return 'canva'
  return 'other'
}

/** Find an attachment by `[[name.ext]]` — full path or bare filename, case-insensitive. */
export function resolveFile(files: Record<string, unknown>, target: string): string | null {
  const t = target.trim()
  if (files[t]) return t
  const low = t.toLowerCase()
  const keys = Object.keys(files)
  return keys.find((p) => p.toLowerCase() === low) ?? keys.find((p) => baseName(p).toLowerCase() === low.split('/').pop()) ?? null
}

function uniqueFilePath(files: Record<string, unknown>, original: string): string {
  const base =
    original.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').slice(-120) || 'file'
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  let path = `${ATTACH_DIR}/${base}`
  for (let i = 1; files[path]; i++) path = `${ATTACH_DIR}/${stem} ${i}${ext}`
  return path
}

/** Upload files into the vault's attachments folder. Returns the stored paths. */
export async function uploadFiles(list: File[]): Promise<string[]> {
  const added: string[] = []
  for (const f of list) {
    if (f.size > 200 * 1024 * 1024) {
      toast.error(`${f.name} is over 200 MB`)
      continue
    }
    const files = useNotes.getState().files
    const path = uniqueFilePath(files, f.name)
    try {
      const res = await fetch(fileUrl(path), { method: 'PUT', body: f })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
      useNotes.setState((s) => ({ files: { ...s.files, [path]: { size: f.size } } }))
      added.push(path)
    } catch (e) {
      toast.error(`Could not add ${f.name}`, { description: (e as Error).message })
    }
  }
  return added
}

export async function deleteAttachment(path: string) {
  await api('DELETE', fileUrl(path))
  useNotes.setState((s) => {
    const files = { ...s.files }
    delete files[path]
    return { files, attachment: s.attachment === path ? null : s.attachment }
  })
}

/** The `![[…]]` / `[[…]]` text to drop into a note for an uploaded file. */
export function embedFor(path: string, files: Record<string, unknown>): string {
  const name = baseName(path)
  const ref = resolveFile(files, name) === path ? name : path
  return fileKind(path) === 'other' ? `[[${ref}]]` : `![[${ref}]]`
}

/* ---------- start ---------- */

export async function startVaultSync() {
  if (started) return
  started = true
  try {
    await load()
  } catch (e) {
    started = false
    throw e
  }
  let prev = useNotes.getState()
  useNotes.subscribe((s) => {
    if (s.notes !== prev.notes || s.folders !== prev.folders) scheduleFlush()
    prev = s
  })
  pollTimer = setInterval(() => void pull(), POLL_MS)
  window.addEventListener('beforeunload', (e) => {
    if (dirty || flushing) {
      void flush()
      e.preventDefault()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) void flush()
  })
}

export function stopVaultSync() {
  if (pollTimer) clearInterval(pollTimer)
}
