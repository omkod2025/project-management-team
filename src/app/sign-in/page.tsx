import { redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import AuthShell from '../auth-shell';
import SignInForm from './form';

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string; set?: string }>;
}) {
  if (await currentUserId()) redirect('/');
  const { changed, set } = await searchParams;

  return (
    <AuthShell
      title="Welcome back"
      lede={
        set
          ? 'Your password is set. Sign in with it to begin.'
          : changed
            ? 'Your password is changed. Sign in with the new one.'
            : 'Sign in to pick up where the work was left.'
      }
    >
      <SignInForm />
    </AuthShell>
  );
}
