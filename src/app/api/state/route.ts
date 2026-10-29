import { HttpError, fail, guard, readState, writeState } from '@/lib/vault'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET/PUT /api/state — small JSON blob for note metadata (favorites, ids) kept in <vault>/.cairn/. */
export async function GET(req: Request) {
  try {
    guard(req)
    return Response.json(await readState())
  } catch (e) {
    return fail(e)
  }
}

export async function PUT(req: Request) {
  try {
    guard(req)
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new HttpError(400, 'bad state')
    await writeState(body)
    return Response.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
