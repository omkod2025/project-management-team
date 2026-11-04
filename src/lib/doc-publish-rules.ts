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

const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where a published copy lives, and what it may still point at.
 *
 * Docs publish one page at `/d/<token>` and its files from `/api/doc-assets/`;
 * that is the default, so a Docs caller passes nothing. The Wiki publishes a
 * whole wiki at `/w/<token>` (wiki spec §5b), so it names its own asset route
 * and — the one difference in kind — a `rewriteInternal` that keeps links
 * between pages of the same wiki working inside the published copy.
 */
export type PublishedLinkOptions = {
  /** The authenticated asset route content refers to, e.g. `/api/doc-assets/`. */
  assetPrefix: string;
  /** The published root; files are served from `<publicBase>/assets/<id>`. */
  publicBase: string;
  /**
   * Another chance for an app-internal path. Returns the published address it
   * becomes, or `null` — and `null` is the answer for everything it does not
   * positively recognise.
   */
  rewriteInternal?: (path: string) => string | null;
};

const docsOptions = (token: string): PublishedLinkOptions => ({
  assetPrefix: '/api/doc-assets/',
  publicBase: publishedHref(token),
});

/**
 * The Wiki's options: its asset route, its `/w/<token>` root, and links to a
 * page of *this* wiki (`/wiki/<wikiId>/<slug>`, with an optional fragment)
 * rewritten onto the token. A page of another wiki, the settings screen, or
 * the wiki root are app addresses like any other and stop being links.
 */
export function wikiPublishOptions(token: string, wikiId: string): PublishedLinkOptions {
  const base = `/w/${token}`;
  // The slug shape is `parsePageSlug`'s. `settings` can be a page's slug, but
  // in the app `/wiki/<id>/settings` is always the settings screen.
  const page = new RegExp(`^/wiki/${escapeRegExp(wikiId)}/([a-z0-9]+(?:-[a-z0-9]+)*)(#\\S*)?$`, 'i');
  return {
    assetPrefix: '/api/wiki-assets/',
    publicBase: base,
    rewriteInternal: (path) => {
      const match = page.exec(path);
      const slug = match?.[1]!.toLowerCase();
      if (!slug || slug === 'settings') return null;
      return `${base}/${slug}${match![2] ?? ''}`;
    },
  };
}

/**
 * What a link in a document becomes when the page is read through a published
 * link.
 *
 * `null` means **not a link at all** — the caller renders the words and drops
 * the href. That is the answer for anything addressed to this application,
 * because the reader has no session: following it would land them on a sign-in
 * page, and the URL would have told them a project slug, a page slug or an
 * asset id on the way. The one exception is what `options.rewriteInternal`
 * positively recognises (the Wiki's links between its own pages).
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
  options: PublishedLinkOptions = docsOptions(token),
): string | null {
  if (typeof href !== 'string' || !href) return null;

  const asset = new RegExp(`^${escapeRegExp(options.assetPrefix)}(${UUID})$`, 'i').exec(href);
  if (asset) {
    const id = asset[1]!.toLowerCase();
    return referenced.has(id) ? `${options.publicBase}/assets/${id}` : null;
  }

  // A fragment points inside the page already open, so it survives untouched.
  if (href.startsWith('#')) return href;

  // Anything else addressed to this app — `/p/…`, `/api/…`, another `/d/…` —
  // unless the caller recognises it as part of what was published.
  if (href.startsWith('/')) return options.rewriteInternal?.(href) ?? null;

  // Only the schemes a document is allowed to hold in the first place (§5).
  return /^(https?:\/\/|mailto:|tel:)/i.test(href) ? href : null;
}
