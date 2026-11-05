import { handle } from '@/lib/api';
import { searchWikis } from '@/lib/wiki';

/**
 * Search across every wiki the caller can see, or one named by `wiki`
 * (wiki spec §4b). A static segment, so Next resolves it ahead of
 * `/api/wikis/[id]` — an unseen `wiki` id is the same 404 as reading it
 * directly.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  const wiki = url.searchParams.get('wiki') ?? undefined;
  return handle('GET /api/wikis/search', (userId) => searchWikis(userId, q, wiki));
}
