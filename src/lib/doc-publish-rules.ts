/**
 * Publishing a page as a read-only link (spec 10 §8b).
 *
 * The rules, with no database and nothing `server-only`, so `tests/
 * doc-publish.test.ts` can reach them — the same split as `node-rules.ts`.
 * What lives here is everything that decides *what an outsider may see*, which
 * is the part of this feature worth defending with tests.
 *
 * Spec 10 §10 refused public sharing once, and named exactly what it would
 * cost: an unauthenticated render path, a secret, a way to stop internal links
 * leaking out with the page, images served without an authorisation check, and
 * a revocation story. The owner asked for it anyway. These are the five
 * answers, in one file:
 *
 *   1. **One page, never a subtree.** A token publishes the page it was minted
 *      for. Children are separate pages and stay private until each is
 *      published in its own right — so "publish this" can never mean more than
 *      the thing on screen.
 *   2. **The secret is the whole guard**, so it is 32 random bytes, not a slug
 *      and not the page id. A page id is guessable from any export; a
 *      published link must be unguessable or it is not a secret.
 *   3. **A link out of the app is never followed.** Anything pointing back
 *      into the product renders as plain text: an outsider hitting `/p/…`
 *      would land on a sign-in page, and the URL itself names a project.
 *   4. **Assets are readable only through the token, and only if the page
 *      being published actually references them.** This is the narrowest hole
 *      that still renders the page, and it keeps `D-56` honest: there is no
 *      public asset endpoint, only a public *page* that can serve its own
 *      pictures.
 *   5. **Revocation is deletion of the secret.** Unpublishing clears the
 *      token; re-publishing mints a new one. A link that was let out never
 *      comes back to life.
 */

/** 32 bytes, base64url. Long enough that guessing is not a strategy. */
export function mintPublishToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The shape a token must have before it is worth a database round trip.
 *
 * A route parameter is whatever somebody typed, and the answer for a bad one
 * has to be the same 404 a revoked one gets — anything else tells a stranger
 * whether they were close.
 */
export function isPublishToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export const publishedHref = (token: string) => `/d/${token}`;

/** The one asset path an unauthenticated reader may use, scoped to the token. */
export const publishedAssetHref = (token: string, assetId: string) =>
  `/d/${token}/assets/${assetId}`;

const ASSET_LINK = /^\/api\/doc-assets\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;

/**
 * What a link in a document becomes when the page is read through a published
 * link.
 *
 * `null` means **not a link at all** — the caller renders the words and drops
 * the href. That is the answer for anything addressed to this application,
 * because the reader has no session: following it would land them on a sign-in
 * page, and the URL would have told them a project slug, a page slug or an
 * asset id on the way.
 *
 * An asset the page references is rewritten onto the token's own path. An
 * asset it does not reference is refused here as well as at the endpoint —
 * hand-edited HTML in an exported copy must not become a reader for the
 * project's whole file store.
 */
export function publishedLink(
  href: unknown,
  token: string,
  referenced: ReadonlySet<string>,
): string | null {
  if (typeof href !== 'string' || !href) return null;

  const asset = ASSET_LINK.exec(href);
  if (asset) {
    const id = asset[1]!.toLowerCase();
    return referenced.has(id) ? publishedAssetHref(token, id) : null;
  }

  // A fragment points inside the page already open, so it survives untouched.
  if (href.startsWith('#')) return href;

  // Anything else addressed to this app — `/p/…`, `/api/…`, another `/d/…`.
  if (href.startsWith('/')) return null;

  // Only the schemes a document is allowed to hold in the first place (§5).
  return /^(https?:\/\/|mailto:|tel:)/i.test(href) ? href : null;
}
