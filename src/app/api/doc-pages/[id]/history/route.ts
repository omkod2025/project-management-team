import { handle } from '@/lib/api';
import { pageHistory } from '@/lib/docs';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle('GET doc history', async (userId) => pageHistory(userId, (await params).id));
}
