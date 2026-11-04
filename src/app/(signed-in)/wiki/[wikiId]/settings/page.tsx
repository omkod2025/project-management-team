import { redirect } from 'next/navigation';
import { getWiki, listMembers, wikiPeopleChoices } from '@/lib/wiki';
import { wikiAbilities } from '@/lib/wiki-rules';
import { listMyTokens } from '@/lib/wiki-tokens';
import Bell from '../../../bell';
import { orNotFound, requireReader } from '../../load-workspace';
import WikiSettings from './wiki-settings';
import '../../../p/[slug]/list.css';
import '../../../p/[slug]/docs/docs.css';
import '../../wiki.css';

/**
 * A wiki's settings. The owner and the install admin manage it (spec §5a);
 * a writer reaches only "Allow my token" (§6a), and is drawn nothing else.
 * Someone who can only read is sent back to the wiki — there is nothing here
 * they could use. A stranger gets the same 404 as the wiki itself.
 */
export default async function WikiSettingsPage({ params }: { params: Promise<{ wikiId: string }> }) {
  const { wikiId } = await params;
  const userId = await requireReader();
  const wiki = await orNotFound(() => getWiki(userId, wikiId));
  const { canManage, canWrite } = wikiAbilities(wiki.role, wiki.archived);
  if (!canManage && !canWrite) redirect(`/wiki/${wiki.id}`);
  const [members, people, tokens] = await Promise.all([
    canManage ? orNotFound(() => listMembers(userId, wiki.id)) : [],
    canManage ? orNotFound(() => wikiPeopleChoices(userId, wiki.id)) : [],
    canWrite ? listMyTokens(userId) : [],
  ]);
  const myLiveTokens = tokens.filter((t) => t.status === 'active').map((t) => ({
    id: t.id, label: t.label, prefix: t.prefix, allowed: t.wikis.some((w) => w.id === wiki.id),
  }));

  return <div className="book docs-book wiki-book"><main className="docs-main">
    <header className="head">
      <a href="/wiki">Wiki</a>
      <span className="docs-project">{wiki.title}</span>
      {wiki.archived && <span className="wiki-flag">Archived</span>}
      <Bell />
      <nav className="views" aria-label="Wiki views">
        <a href={`/wiki/${wiki.id}`}>Pages</a>
        <span aria-current="page">Settings</span>
      </nav>
    </header>
    <div className="docs-content">
      <WikiSettings
        wiki={{ id: wiki.id, title: wiki.title, description: wiki.description, archived: wiki.archived, ownerId: wiki.ownerId, ownerName: wiki.ownerName, publicToken: wiki.publicToken ?? null }}
        canManage={canManage}
        members={members}
        people={people}
        tokens={canWrite ? myLiveTokens : null}
      />
    </div>
  </main></div>;
}
