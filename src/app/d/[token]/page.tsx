import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublishedPage } from '@/lib/doc-publish';
import { DomainError } from '@/lib/errors';
import { pageSections } from '@/lib/doc-rules';
import DocContent from '../../(signed-in)/p/[slug]/docs/doc-content';
import '../../(signed-in)/p/[slug]/docs/editor.css';
import './published.css';

/**
 * A published page, read by somebody with no account (spec 10 §8b).
 *
 * This is the only route in the product that answers without a session, so it
 * is deliberately the thinnest page here: it loads one page by its secret,
 * prints it, and offers nothing else. No project name, no sibling pages, no
 * search, no comments, no way back into the app — every one of those would be
 * a door in a wall that is supposed to be solid.
 *
 * Every refusal is `notFound()`. A malformed token, a revoked one, an archived
 * page and a page that never existed must be indistinguishable from outside.
 */

type Params = { params: Promise<{ token: string }> };

/**
 * A link is "anyone who has it", not "anyone who searches". `noindex` is what
 * keeps those two different — without it the first crawler to see the URL in a
 * referrer header or a pasted message publishes it to everybody.
 */
const PRIVATE: Metadata = { robots: { index: false, follow: false } };

/** The secret is in the URL, so no shared cache may ever hold the answer. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  try {
    const page = await loadPublishedPage((await params).token);
    return { ...PRIVATE, title: page.title };
  } catch {
    return PRIVATE;
  }
}

export default async function PublishedPage({ params }: Params) {
  let page;
  try {
    page = await loadPublishedPage((await params).token);
  } catch (err) {
    if (err instanceof DomainError) notFound();
    throw err;
  }

  const publish = { token: page.token, assets: new Set(page.assetIds) };
  const stamp = new Date(page.updatedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  });

  return (
    <main className="published">
      <article className="published-sheet">
        <header className="published-head">
          <h1>{page.title}</h1>
          <p className="published-meta">
            {page.docTitle}
            {page.docVersion && <span className="published-version">{page.docVersion}</span>}
            <span>Updated {stamp}</span>
          </p>
        </header>

        {pageSections(page.template).map(([key, label]) => (
          <section key={key} className="doc-section doc-prose">
            {page.template === 'module' && <h2>{label}</h2>}
            {page.content[key]
              ? <DocContent value={page.content[key]} publish={publish} />
              : <p className="published-quiet">Nothing written yet.</p>}
          </section>
        ))}

        {/* Says what this is without naming the project it came from: a reader
            who was sent the link should know it is a copy that can be withdrawn,
            and a reader who found it by accident should learn nothing else. */}
        <footer className="published-foot">
          Published, read-only. This link can be withdrawn by its owner.
        </footer>
      </article>
    </main>
  );
}
