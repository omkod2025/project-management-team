import 'server-only';
import { headers } from 'next/headers';

const PLAIN_HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:]+\](:\d{1,5})?$/;

/**
 * The origin MCP clients should call, from this request's own headers — the
 * same host the person is looking at, with no address written into the code.
 * Anything that is not a plain host[:port] falls back to a placeholder rather
 * than being echoed into a snippet someone will paste into a config file.
 *
 * Shared by the tokens page (its config snippets) and the connection guide
 * (its `<origin>` placeholder).
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0]!.trim();
  const forwarded = (h.get('x-forwarded-proto') ?? '').split(',')[0]!.trim();
  const proto = forwarded === 'https' || forwarded === 'http' ? forwarded : 'http';
  return PLAIN_HOST.test(host) ? `${proto}://${host}` : 'https://<this-server>';
}
