import { redirect } from 'next/navigation';
import { getWiki, listMembers, wikiPeopleChoices } from '@/lib/wiki';
import { wikiAbilities } from '@/lib/wiki-rules';
import Bell from '../../../bell';
import { orNotFound, requireReader } from '../../load-workspace';
import WikiSettings from './wiki-settings';
import '../../../p/[slug]/list.css';
import '../../../p/[slug]/docs/docs.css';
import '../../wiki.css';

/**
 * A wiki's settings: owner and install admin only (spec §5a). Someone who
 * can read the wiki but not manage it is sent back to it — there is nothing
 * here they could use. A stranger gets the same 404 as the wiki itself.
 */
export default async function WikiSettingsPage({ params }: { params: Promise<{ wikiId: string }> }) {
  const { wikiId } = await params;
  const userId = await requireReader();
  const wiki = await orNotFound(() => getWiki(userId, wikiId));
  if (!wikiAbilities(wiki.role, wiki.archived).canManage) redirect(`/wiki/${wiki.id}`);
  const [members, people] = await Promise.all([
    orNotFound(() => listMembers(userId, wiki.id)),
    orNotFound(() => wikiPeopleChoices(userId, wiki.id)),
  ]);

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
        members={members}
        people={people}
      />
    </div>
  </main></div>;
}
