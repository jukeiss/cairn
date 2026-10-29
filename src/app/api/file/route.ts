import { attFile, fail, guard, removeFile, saveUpload, serveFile } from '@/lib/vault'
import { promises as fsp } from 'node:fs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const pathOf = (req: Request) => new URL(req.url).searchParams.get('p')

/** GET /api/file?p=attachments/photo.png */
export async function GET(req: Request) {
  try {
    guard(req)
    return await serveFile(req, attFile(pathOf(req)))
  } catch (e) {
    return fail(e)
  }
}

/** PUT /api/file?p=attachments/photo.png  body: raw bytes */
export async function PUT(req: Request) {
  try {
    guard(req)
    const file = attFile(pathOf(req))
    const size = await saveUpload(req, file)
    return Response.json({ ok: true, size, t: Math.round((await fsp.stat(file)).mtimeMs) })
  } catch (e) {
    return fail(e)
  }
}

/** DELETE /api/file?p=attachments/photo.png */
export async function DELETE(req: Request) {
  try {
    guard(req)
    await removeFile(attFile(pathOf(req)))
    return Response.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
