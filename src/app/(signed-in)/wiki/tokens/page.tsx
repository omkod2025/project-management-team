import { listWikis, wikiViewer } from '@/lib/wiki';
import { isInstallAdmin } from '@/lib/wiki-rules';
import { listAllTokens, listMyTokens } from '@/lib/wiki-tokens';
import Bell from '../../bell';
import { requireReader } from '../load-workspace';
import { requestOrigin } from './request-origin';
import TokensView, { GuideLink } from './tokens-view';
import '../../p/[slug]/list.css';
import '../../p/[slug]/docs/docs.css';
import '../wiki.css';

/**
 * Tokens / MCP (spec §6): the person's own access tokens, and for the
 * install admin every token in the install (§6c). No secret ever reaches
 * this render — a secret exists only in the create response.
 */
export default async function WikiTokensPage() {
  const userId = await requireReader();
  const [viewer, mine, wikis, origin] = await Promise.all([
    wikiViewer(userId), listMyTokens(userId), listWikis(userId), requestOrigin(),
  ]);
  const all = isInstallAdmin(viewer) ? await listAllTokens(userId) : null;

  return <div className="book docs-book wiki-book"><main className="docs-main">
    <header className="head">
      <a href="/">Projects</a>
      <span className="docs-project">Wiki</span>
      <Bell />
      <nav className="views" aria-label="Wiki menu">
        <a href="/wiki">Wikis</a>
        <span aria-current="page">Tokens / MCP</span>
        <a href="/wiki/mermaid-guide">Mermaid guide</a>
      </nav>
    </header>
    <div className="docs-content">
      <div className="docs-heading">
        <div><h1>Tokens / MCP</h1><p>Let an AI assistant read the wikis you choose, as you, through MCP.</p></div>
        <GuideLink />
      </div>
      <TokensView
        origin={origin}
        wikis={wikis.map((w) => ({ id: w.id, title: w.title }))}
        mine={mine}
        all={all}
      />
    </div>
  </main></div>;
}
