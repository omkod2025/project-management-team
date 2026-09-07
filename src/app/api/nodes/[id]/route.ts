import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { currentUserId } from '@/auth';
import { db } from '@/db/client';
import { nodes } from '@/db/schema';
import { authorize } from '@/lib/permissions';
import { archiveNode, moveNode, updateNode, type NodePatch } from '@/lib/nodes';
import { DomainError } from '@/lib/errors';

/**
 * PATCH one node. Returns its recomputed ledger row, so the grid updates
 * without refetching the project (spec 03 §9).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ code: 'E_FORBIDDEN', message: 'Sign in first.' }, { status: 401 });

  const { id } = await ctx.params;

  try {
    const [node] = await db
      .select({ projectId: nodes.projectId })
      .from(nodes)
      .where(eq(nodes.id, id))
      .limit(1);
    if (!node) return NextResponse.json({ code: 'E_NOT_FOUND', message: 'No such task.' }, { status: 404 });

    const patch = (await req.json()) as NodePatch & { parentId?: string };

    // Re-parenting is a different capability from editing, so it is checked
    // and handled separately rather than folded into the field write.
    if (patch.parentId) {
      await authorize(userId, node.projectId, 'node.move');
      return NextResponse.json(await moveNode(id, patch.parentId));
    }

    // Dates and values are different capabilities, so the check follows what
    // the request actually changes rather than a blanket "can write".
    const touchesDates =
      patch.estimateStart !== undefined || patch.estimateEnd !== undefined ||
      patch.actualStart !== undefined || patch.actualEnd !== undefined;

    if (touchesDates) await authorize(userId, node.projectId, 'node.editDates');
    if (patch.values) await authorize(userId, node.projectId, 'node.editValues');
    if (patch.name !== undefined) await authorize(userId, node.projectId, 'node.rename');

    return NextResponse.json(await updateNode(id, patch));
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json(err.toJSON(), { status: err.status });
    }
    console.error('PATCH /api/nodes/%s', id, err);
    return NextResponse.json({ code: 'E_UNKNOWN', message: 'The change did not save.' }, { status: 500 });
  }
}


/** Archive a node and its subtree. Admin only (D-4). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ code: 'E_FORBIDDEN', message: 'Sign in first.' }, { status: 401 });

  const { id } = await ctx.params;

  try {
    const [node] = await db
      .select({ projectId: nodes.projectId })
      .from(nodes)
      .where(eq(nodes.id, id))
      .limit(1);
    if (!node) return NextResponse.json({ code: 'E_NOT_FOUND', message: 'No such task.' }, { status: 404 });

    await authorize(userId, node.projectId, 'node.archive');
    return NextResponse.json(await archiveNode(id));
  } catch (err) {
    if (err instanceof DomainError) return NextResponse.json(err.toJSON(), { status: err.status });
    console.error('DELETE /api/nodes/%s', id, err);
    return NextResponse.json({ code: 'E_UNKNOWN', message: 'The task was not archived.' }, { status: 500 });
  }
}
