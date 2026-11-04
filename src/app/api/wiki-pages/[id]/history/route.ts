import { handle } from '@/lib/api';
import { wikiPageHistory } from '@/lib/wiki';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(`GET /api/wiki-pages/${id}/history`, (userId) => wikiPageHistory(userId, id));
}
