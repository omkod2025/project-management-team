import { redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { listAllTokens, listMyTokens } from '@/lib/access-tokens';
import { wikiViewer } from '@/lib/wiki';
import { isInstallAdmin } from '@/lib/wiki-rules';
import AppHeader, { crossViews } from '../app-header';
import TokensView from './tokens-view';
import './tokens.css';

/**
 * `/tokens` — Tokens / MCP, system-wide (central MCP tokens design): one
 * token can reach List, Docs and the Wiki. The person's own tokens, and for
 * the install admin every token in the install. Making and editing live at
 * `/tokens/new` and `/tokens/<id>/edit`. No secret ever reaches this render —
 * a secret exists only in the create response.
 */
export default async function TokensPage() {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');
  const [viewer, mine] = await Promise.all([wikiViewer(userId), listMyTokens(userId)]);
  const all = isInstallAdmin(viewer) ? await listAllTokens(userId) : null;

  return <main className="tk-page">
    <AppHeader title="Tokens / MCP" navLabel="Places" views={crossViews('Tokens / MCP')} />
    <TokensView mine={mine} all={all} />
  </main>;
}
