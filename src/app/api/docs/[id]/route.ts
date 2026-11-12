import { handle } from '@/lib/api';
import { archiveDoc } from '@/lib/docs';

type Context = { params: Promise<{ id: string }> };

/** Delete a document — archival, never removal (D-61). Admin only. */
export async function DELETE(_req: Request, { params }: Context) {
  return handle('DELETE doc', async (userId) => archiveDoc(userId, (await params).id));
}
