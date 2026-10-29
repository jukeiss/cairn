import { HttpError, MAX_NOTE, fail, guard, noteFile, removeFile, writeAtomic } from '@/lib/vault'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const pathOf = (req: Request) => new URL(req.url).searchParams.get('p')

/** PUT /api/note?p=Folder/Title  body: { c: string } */
export async function PUT(req: Request) {
  try {
    guard(req)
    const file = noteFile(pathOf(req))
    const body = await req.json().catch(() => null)
    if (!body || typeof body.c !== 'string') throw new HttpError(400, 'content must be a string')
    if (body.c.length > MAX_NOTE) throw new HttpError(413, 'note too large')
    return Response.json({ ok: true, t: await writeAtomic(file, body.c) })
  } catch (e) {
    return fail(e)
  }
}

/** DELETE /api/note?p=Folder/Title */
export async function DELETE(req: Request) {
  try {
    guard(req)
    await removeFile(noteFile(pathOf(req)))
    return Response.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
