import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { currentUserId } from '@/auth';
import { db } from '@/db/client';
import { nodes } from '@/db/schema';
import { authorize } from '@/lib/permissions';
import { restoreNode } from '@/lib/nodes';
import { DomainError } from '@/lib/errors';

/** Undo an archive. Same capability as archiving, since it is the same power. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json(await restoreNode(id));
  } catch (err) {
    if (err instanceof DomainError) return NextResponse.json(err.toJSON(), { status: err.status });
    console.error('POST /api/nodes/%s/restore', id, err);
    return NextResponse.json({ code: 'E_UNKNOWN', message: 'The task was not restored.' }, { status: 500 });
  }
}
