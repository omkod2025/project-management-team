import { redirect } from 'next/navigation';
import { signIn, currentUserId } from '@/auth';

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUserId()) redirect('/');
  const { error } = await searchParams;

  async function submit(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', {
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? ''),
        redirectTo: '/',
      });
    } catch (err) {
      // next-auth signals a successful redirect by throwing; re-throw it.
      if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
      if ((err as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw err;
      redirect('/sign-in?error=1');
    }
  }

  return (
    <main className="page" style={{ padding: '32px 20px', maxWidth: 420 }}>
      <h1 style={{ fontFamily: 'var(--font-struct)', fontSize: 'var(--type-headline-size)', margin: 0 }}>
        Field Book
      </h1>

      <form action={submit} style={{ marginTop: 28 }}>
        <label className="label" htmlFor="email" style={labelStyle}>Email</label>
        <input id="email" name="email" type="email" required autoFocus style={inputStyle} />

        <label className="label" htmlFor="password" style={{ ...labelStyle, marginTop: 16 }}>Password</label>
        <input id="password" name="password" type="password" required style={inputStyle} />

        {error && (
          // The one thing vermilion is for, applied to the one thing that is wrong.
          <p className="figure" style={{ marginTop: 14, color: 'var(--color-vermilion)' }}>
            That email and password do not match an active account.
          </p>
        )}

        <button type="submit" className="label" style={buttonStyle}>Sign in</button>
      </form>
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--color-ink-graphite-soft)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 34,
  padding: '0 10px',
  background: 'var(--color-page)',
  border: '1px solid var(--color-ink-graphite)',
};

// The primary action inverts; there is no filled accent button in the system.
const buttonStyle: React.CSSProperties = {
  marginTop: 24,
  height: 34,
  padding: '0 18px',
  background: 'var(--color-ink-graphite)',
  color: 'var(--color-page)',
  border: '1px solid var(--color-ink-graphite)',
  cursor: 'pointer',
};
