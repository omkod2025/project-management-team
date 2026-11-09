import { notFound, redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { listMyTokens } from '@/lib/access-tokens';
import EditorPage from '../../editor-page';

/**
 * `/tokens/<id>/edit` — reopen the stepper on one of your own tokens. Anyone
 * else's token, a revoked one or a malformed id is simply not found.
 */
export default async function EditTokenPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');
  const { id } = await params;
  const token = (await listMyTokens(userId)).find((t) => t.id === id && t.status !== 'revoked');
  if (!token) notFound();
  return <EditorPage userId={userId} token={token} />;
}
