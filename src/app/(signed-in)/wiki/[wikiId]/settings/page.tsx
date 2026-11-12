import { redirect } from 'next/navigation';
import { getWiki, listMembers, wikiPeopleChoices } from '@/lib/wiki';
import { wikiAbilities } from '@/lib/wiki-rules';
import { listMyTokens } from '@/lib/access-tokens';
import AppHeader, { wikiViews } from '../../../app-header';
import { orNotFound, requireReader } from '../../load-workspace';
import WikiSettings from './wiki-settings';
import '../../../p/[slug]/list.css';
import '../../../p/[slug]/docs/docs.css';
import '../../../p/[slug]/settings/settings.css';
import '../../wiki.css';

/**
 * A wiki's settings. The owner and the install admin manage it (spec §5a);
 * a writer reaches only "Allow my token" (§6a), and is drawn nothing else.
 * Someone who can only read is sent back to the wiki — there is nothing here
 * they could use. A stranger gets the same 404 as the wiki itself. Delete is
 * drawn for the owner and the install admin (D-82).
 */
export default async function WikiSettingsPage({ params }: { params: Promise<{ wikiId: string }> }) {
  const { wikiId } = await params;
  const userId = await requireReader();
  const wiki = await orNotFound(() => getWiki(userId, wikiId));
  const { canManage, canWrite, canDelete } = wikiAbilities(wiki.role, wiki.archived);
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
    <AppHeader
      title={<><h1>{wiki.title}</h1>{wiki.archived && <span className="wiki-flag">Archived</span>}</>}
      navLabel="Wiki views"
      views={wikiViews('Settings', { id: wiki.id, canSettings: true })}
    />
    <div className="docs-content">
      <WikiSettings
        wiki={{ id: wiki.id, title: wiki.title, description: wiki.description, archived: wiki.archived, ownerId: wiki.ownerId, ownerName: wiki.ownerName, publicToken: wiki.publicToken ?? null }}
        canManage={canManage}
        canDelete={canDelete}
        members={members}
        people={people}
        tokens={canWrite ? myLiveTokens : null}
      />
    </div>
  </main></div>;
}
