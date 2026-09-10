import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { currentUserId } from '@/auth';
import { db } from '@/db/client';
import { nodes, projects } from '@/db/schema';
import { authorize, can } from '@/lib/permissions';
import { archiveNode, moveNode, updateNode, type NodePatch } from '@/lib/nodes';
import { DomainError, domainError } from '@/lib/errors';
import { handle } from '@/lib/api';
import { loadLedger } from '@/lib/ledger';
import type { TaskDetail } from '@/lib/task-detail';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`GET /api/nodes/${id}`, async (userId): Promise<TaskDetail> => {
    const [node] = await db.select({ slug: projects.slug }).from(nodes)
      .innerJoin(projects, eq(projects.id, nodes.projectId)).where(eq(nodes.id, id)).limit(1);
    if (!node) throw domainError('E_NOT_FOUND', 'No such task.');
    const ledger = await loadLedger(userId, node.slug);
    const row = ledger.rows.find((r) => r.led_node_id === id);
    if (!row) throw domainError('E_NOT_FOUND', 'No such task.');
    return {
      row, projectName: ledger.project.name, fields: ledger.fields, people: ledger.people,
      permissions: {
        rename: can(ledger.role, 'node.rename'), dates: can(ledger.role, 'node.editDates'),
        values: can(ledger.role, 'node.editValues'),
      },
    };
  });
}

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

    const patch = (await req.json()) as NodePatch & {
      parentId?: string; afterId?: string | null;
    };

    /* Moving is a different capability from editing, so it is checked and
       handled separately rather than folded into the field write. Both keys
       reach the same operation: `parentId` alone re-parents and keeps the
       order, `afterId` alone reorders under the parent it already has, and
       together they are the drag that crosses a module. */
    if (patch.parentId !== undefined || patch.afterId !== undefined) {
      await authorize(userId, node.projectId, 'node.move');
      return NextResponse.json(
        await moveNode(id, { parentId: patch.parentId, afterId: patch.afterId }),
      );
    }

    // Dates and values are different capabilities, so the check follows what
    // the request actually changes rather than a blanket "can write".
    const touchesDates =
      patch.estimateStart !== undefined || patch.estimateEnd !== undefined ||
      patch.actualStart !== undefined || patch.actualEnd !== undefined;

    if (touchesDates) await authorize(userId, node.projectId, 'node.editDates');
    if (patch.values) await authorize(userId, node.projectId, 'node.editValues');
    if (patch.name !== undefined) await authorize(userId, node.projectId, 'node.rename');

    return NextResponse.json(await updateNode(id, patch, userId));
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
