import { headers } from 'next/headers';
import { listWikis, wikiViewer } from '@/lib/wiki';
import { isInstallAdmin } from '@/lib/wiki-rules';
import { listAllTokens, listMyTokens } from '@/lib/wiki-tokens';
import Bell from '../../bell';
import { requireReader } from '../load-workspace';
import TokensView from './tokens-view';
import '../../p/[slug]/list.css';
import '../../p/[slug]/docs/docs.css';
import '../wiki.css';

/**
 * The origin MCP clients should call, from this request's own headers — the
 * same host the person is looking at, with no address written into the code.
 * Anything that is not a plain host[:port] falls back to a placeholder rather
 * than being echoed into a snippet someone will paste into a config file.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0]!.trim();
  const forwarded = (h.get('x-forwarded-proto') ?? '').split(',')[0]!.trim();
  const proto = forwarded === 'https' || forwarded === 'http' ? forwarded : 'http';
  return /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:]+\](:\d{1,5})?$/.test(host) ? `${proto}://${host}` : 'https://<this-server>';
}

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
      </nav>
    </header>
    <div className="docs-content">
      <div className="docs-heading">
        <div><h1>Tokens / MCP</h1><p>Let an AI assistant read the wikis you choose, as you, through MCP.</p></div>
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
