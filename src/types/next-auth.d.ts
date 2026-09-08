import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string;
    /** Read by `proxy.ts` to send the account to /change-password. */
    mustChangePassword?: boolean;
  }
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
    };
  }
}
