import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DomainError } from '@/lib/errors';
import { loadPublishedWiki } from '@/lib/wiki-publish';
import { treeOrder } from '@/app/(signed-in)/wiki/wiki-tree-order';
import '@/app/d/[token]/published.css';
import './published-wiki.css';

/**
 * The bare public link of a wiki (wiki spec §5b): it opens the first page in
 * reading order, or says plainly that nothing is written yet. Every refusal
 * is `notFound()` — the same 404 as the Docs public page.
 */

type Params = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublishedWikiRoot({ params }: Params) {
  const { token } = await params;
  let data;
  try {
    data = await loadPublishedWiki(token);
  } catch (err) {
    if (err instanceof DomainError) notFound();
    throw err;
  }

  const first = treeOrder(data.pages)[0];
  if (first) redirect(`/w/${token}/${first.slug}`);

  return (
    <main className="published">
      <article className="published-sheet">
        <header className="published-head">
          <h1>{data.wiki.title}</h1>
        </header>
        <p className="published-quiet">This wiki has no pages yet.</p>
        <footer className="published-foot">
          Published, read-only. This link can be withdrawn by its owner.
        </footer>
      </article>
    </main>
  );
}
