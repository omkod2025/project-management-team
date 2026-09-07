import { rawQuery } from '@/db/client';
import type { LedgerRow } from '@/db/schema';
import { authorize } from '@/lib/permissions';
import { handle } from '@/lib/api';

/**
 * The whole project ledger.
 *
 * The views are server-rendered, so this exists for the one write that cannot
 * be answered by a single row: a move re-depths an entire subtree, and the
 * client has no way to recompute that locally.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`GET /api/projects/${id}/ledger`, async (userId) => {
    await authorize(userId, id, 'node.read');
    return rawQuery<LedgerRow>('SELECT * FROM pmf_project_ledger($1)', [id]);
  });
}
