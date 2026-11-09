import type { TokenRow } from '@/lib/access-tokens';
import type { TokenGrants, TokenScope } from '@/lib/token-modules';

/** The create response: the row, and the secret that is shown once and never again. */
export type CreatedToken = { token: TokenRow; secret: string };

/**
 * One JSON call to `/api/tokens`. Resolves to the response body, or throws
 * with the route's own message so the screen can show it as written.
 */
async function tokenCall<T>(url: string, method: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const json = await res.json().catch(() => null) as (T & { message?: string }) | null;
  if (!res.ok) throw new Error(json?.message ?? 'That did not save. Reload and try again.');
  return json as T;
}

/**
 * Both scope lists always travel, `[]` for a kind no chosen module uses: the
 * edit route reads a missing kind as "none", so leaving one out would wipe it.
 */
export function createToken(body: { label: string; expiresAt: string | null; grants: TokenGrants; scope: TokenScope }) {
  return tokenCall<CreatedToken>('/api/tokens', 'POST', body);
}

export function updateToken(id: string, body: { label: string; grants: TokenGrants; scope: TokenScope }) {
  return tokenCall<TokenRow>(`/api/tokens/${id}`, 'PATCH', body);
}

export function revokeToken(id: string) {
  return tokenCall<unknown>(`/api/tokens/${id}`, 'DELETE');
}

export const problem = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
