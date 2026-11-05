import { readFile } from 'node:fs/promises';
import path from 'node:path';
import DocContent from '../../../p/[slug]/docs/doc-content';
import Bell from '../../../bell';
import { requireReader } from '../../load-workspace';
import { requestOrigin } from '../request-origin';
import '../../../p/[slug]/list.css';
import '../../../p/[slug]/docs/docs.css';
import '../../../p/[slug]/docs/editor.css';
import '../../wiki.css';

/**
 * The repo's own copy of the guide, read on every request so the page and
 * docs/guides/wiki-mcp.md can never disagree. Resolved from the working
 * directory at runtime, not traced into the bundle.
 */
const guidePath = () => path.resolve(/* turbopackIgnore: true */ process.cwd(), 'docs/guides/wiki-mcp.md');

/**
 * How to connect an AI client to the wiki over MCP (wiki Task 11). The
 * Markdown is rendered through `DocContent`'s Markdown path, so it reads in
 * the same type as any wiki page; `<origin>` becomes this server's address.
 * `<secret>` stays a placeholder: no secret is ever shown after creation.
 */
export default async function WikiGuidePage() {
  // Signed-in only; the proxy already redirects, this is the page's own check.
  await requireReader();
  const [markdown, origin] = await Promise.all([readFile(/* turbopackIgnore: true */ guidePath(), 'utf8'), requestOrigin()]);

  return <div className="book docs-book wiki-book"><main className="docs-main">
    <header className="head">
      <a href="/">Projects</a>
      <span className="docs-project">Wiki</span>
      <Bell />
      <nav className="views" aria-label="Wiki menu">
        <a href="/wiki">Wikis</a>
        <a href="/wiki/tokens">Tokens / MCP</a>
        <span aria-current="page">How to connect</span>
        <a href="/wiki/mermaid-guide">Mermaid guide</a>
      </nav>
    </header>
    <div className="docs-content">
      <article className="doc-prose wiki-guide">
        <DocContent value={markdown.replaceAll('<origin>', origin)} />
      </article>
    </div>
  </main></div>;
}
