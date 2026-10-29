import { fail, guard, listVault } from '@/lib/vault'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/vault — every note, folder and attachment in the vault. */
export async function GET(req: Request) {
  try {
    guard(req)
    return Response.json(await listVault(), { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return fail(e)
  }
}
