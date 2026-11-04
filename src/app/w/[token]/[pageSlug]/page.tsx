import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DomainError } from '@/lib/errors';
import { wikiPublishOptions } from '@/lib/doc-publish-rules';
import { loadPublishedWikiPage } from '@/lib/wiki-publish';
import { treeOrder } from '@/app/(signed-in)/wiki/wiki-tree-order';
import DocContent from '@/app/(signed-in)/p/[slug]/docs/doc-content';
import '@/app/(signed-in)/p/[slug]/docs/editor.css';
import '@/app/d/[token]/published.css';
import '../published-wiki.css';

/**
 * One page of a published wiki, read by somebody with no account (wiki spec
 * §5b). It prints the wiki title, the page tree, the page title, the date it
 * was last updated and the content — and nothing else: no owner, no members,
 * no authors, no way back into the application.
 *
 * Every refusal is `notFound()`. A malformed token, a revoked one, an
 * archived wiki or page and a slug that never existed are indistinguishable.
 */

type Params = { params: Promise<{ token: string; pageSlug: string }> };

/** The URL is the credential: a crawler must not publish it to everybody. */
const PRIVATE: Metadata = { robots: { index: false, follow: false } };

/** The secret is in the URL, so no shared cache may ever hold the answer. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  try {
    const { token, pageSlug } = await params;
    const data = await loadPublishedWikiPage(token, pageSlug);
    return { ...PRIVATE, title: `${data.page.title} · ${data.wiki.title}` };
  } catch {
    return PRIVATE;
  }
}

export default async function PublishedWikiPage({ params }: Params) {
  const { token, pageSlug } = await params;
  let data;
  try {
    data = await loadPublishedWikiPage(token, pageSlug);
  } catch (err) {
    if (err instanceof DomainError) notFound();
    throw err;
  }

  const { wiki, page } = data;
  const publish = {
    token,
    assets: new Set(data.assetIds),
    ...wikiPublishOptions(token, wiki.id),
  };
  const stamp = new Date(page.updatedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  });

  return (
    <main className="published published-wiki">
      <nav className="published-wiki-tree" aria-label="Pages">
        <p className="published-wiki-title">{wiki.title}</p>
        <ul>
          {treeOrder(data.pages).map((p) => (
            <li key={p.id} style={{ paddingLeft: (p.depth - 1) * 14 }}>
              <a href={`/w/${token}/${p.slug}`} aria-current={p.id === page.id ? 'page' : undefined}>
                {p.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="published-sheet">
        <header className="published-head">
          <h1>{page.title}</h1>
          <p className="published-meta">
            <span>Updated {stamp}</span>
          </p>
        </header>

        <section className="doc-section doc-prose">
          {page.body
            ? <DocContent value={page.body} publish={publish} />
            : <p className="published-quiet">Nothing written yet.</p>}
        </section>

        <footer className="published-foot">
          Published, read-only. This link can be withdrawn by its owner.
        </footer>
      </article>
    </main>
  );
}
