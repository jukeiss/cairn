import { promises as fsp } from 'node:fs'
import { HttpError, fail, folderDir, guard } from '@/lib/vault'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/folder  body: { p: "Folder/Sub" } */
export async function POST(req: Request) {
  try {
    guard(req)
    const body = await req.json().catch(() => null)
    if (!body || typeof body.p !== 'string') throw new HttpError(400, 'missing path')
    await fsp.mkdir(folderDir(body.p), { recursive: true })
    return Response.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}

/** DELETE /api/folder?p=Folder — only removes it if it is empty. */
export async function DELETE(req: Request) {
  try {
    guard(req)
    await fsp.rmdir(folderDir(new URL(req.url).searchParams.get('p'))).catch(() => {})
    return Response.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
