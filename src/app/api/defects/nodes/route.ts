import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { currentUserId } from '@/auth';
import { db } from '@/db/client';
import { defectNodes as nodes } from '@/db/schema';
import { authorize } from '@/lib/permissions';
import { nodeStore } from '@/lib/nodes';
import { DomainError } from '@/lib/errors';

const { createNode } = nodeStore('defect');

/** POST a new child node. Returns its ledger row, ready to splice into the grid. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ code: 'E_FORBIDDEN', message: 'Sign in first.' }, { status: 401 });

  try {
    const { parentId, name, afterId } = (await req.json()) as {
      parentId?: string; name?: string; afterId?: string | null;
    };
    if (!parentId) return NextResponse.json({ code: 'E_NOT_FOUND', message: 'No parent given.' }, { status: 404 });

    const [parent] = await db
      .select({ projectId: nodes.projectId })
      .from(nodes)
      .where(eq(nodes.id, parentId))
      .limit(1);
    if (!parent) return NextResponse.json({ code: 'E_NOT_FOUND', message: 'No such parent.' }, { status: 404 });

    await authorize(userId, parent.projectId, 'node.create');
    return NextResponse.json(await createNode(parentId, name ?? '', afterId ?? null));
  } catch (err) {
    if (err instanceof DomainError) return NextResponse.json(err.toJSON(), { status: err.status });
    console.error('POST /api/defects/nodes', err);
    return NextResponse.json({ code: 'E_UNKNOWN', message: 'The defect was not created.' }, { status: 500 });
  }
}
