import { redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import EditorPage from '../editor-page';

/** `/tokens/new` — make a token in the stepper; the secret is shown once, here. */
export default async function NewTokenPage() {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');
  return <EditorPage userId={userId} />;
}
