/**
 * One JSON call to a wiki route. Resolves to the response body, or throws
 * with the route's own message so the screen can show it as written.
 */
export async function wikiCall<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and reload before retrying.');
  }
  const json = await res.json().catch(() => null) as (T & { message?: string }) | null;
  if (!res.ok) throw new Error(json?.message ?? 'That did not work. Reload and try again.');
  return json as T;
}

export const problem = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
