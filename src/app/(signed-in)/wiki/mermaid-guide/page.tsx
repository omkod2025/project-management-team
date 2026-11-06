import { readFile } from 'node:fs/promises';
import path from 'node:path';
import DocContent from '../../p/[slug]/docs/doc-content';
import AppHeader, { wikiViews } from '../../app-header';
import { requireReader } from '../load-workspace';
import '../../p/[slug]/list.css';
import '../../p/[slug]/docs/docs.css';
import '../../p/[slug]/docs/editor.css';
import '../wiki.css';

/**
 * The repo's own copy of the guide, read on every request so the page and
 * docs/guides/mermaid.md can never disagree. Resolved from the working
 * directory at runtime, not traced into the bundle.
 */
const guidePath = () => path.resolve(/* turbopackIgnore: true */ process.cwd(), 'docs/guides/mermaid.md');

/**
 * How to write a Mermaid block that renders (spec 12 D-71). Rendered through
 * `DocContent`'s Markdown path, so its closing example draws under the same
 * locked config every block does — if that example stops parsing, this page
 * shows it. Linked from the Wiki menu and from the editor's syntax error.
 */
export default async function MermaidGuidePage() {
  await requireReader();
  const markdown = await readFile(/* turbopackIgnore: true */ guidePath(), 'utf8');

  return <div className="book docs-book wiki-book"><main className="docs-main">
    <AppHeader title="Wiki" navLabel="Wiki menu" views={wikiViews('Mermaid guide')} />
    <div className="docs-content">
      <article className="doc-prose wiki-guide" lang="th">
        <DocContent value={markdown} />
      </article>
    </div>
  </main></div>;
}
