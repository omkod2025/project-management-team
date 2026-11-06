/**
 * Which requests the page-wide activity bar waits on. Pure, so the decision is
 * testable without a browser; `src/app/api-activity.tsx` is the adapter that
 * wraps `window.fetch` around it.
 *
 * A request counts when it goes to this app's own `/api/` routes and the
 * caller has not marked it quiet. Quiet is for work nobody asked for at that
 * moment: the bell's minute poll and a document's typing autosave, which
 * already says "Saving…" in its own status line. A bar that twitched every
 * second while someone typed would teach people to ignore it.
 */

/** Set on a request's headers to keep it off the bar. Stripped before sending. */
export const QUIET_HEADER = 'x-quiet-request';

/** A request to this origin's API, by path. Other origins and assets are never counted. */
export function isApiRequest(url: string, origin: string): boolean {
  let target: URL;
  try { target = new URL(url, origin); } catch { return false; }
  return target.origin === origin && /(^|\/)api\//.test(target.pathname);
}

/**
 * Reads and removes the quiet mark. Returns the headers to send, unchanged in
 * kind where nothing was removed, so a caller's own headers object survives.
 */
export function takeQuiet(headers: HeadersInit | undefined): { quiet: boolean; headers: HeadersInit | undefined } {
  if (!headers) return { quiet: false, headers };
  const copy = new Headers(headers);
  if (!copy.has(QUIET_HEADER)) return { quiet: false, headers };
  copy.delete(QUIET_HEADER);
  return { quiet: true, headers: copy };
}

/** Header to spread into a request that should not move the bar. */
export const quietHeaders = { [QUIET_HEADER]: '1' } as const;
