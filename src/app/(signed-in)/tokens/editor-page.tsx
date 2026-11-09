import Link from 'next/link';
import type { TokenRow } from '@/lib/access-tokens';
import { visibleProjects } from '@/lib/project-access';
import { listWikis } from '@/lib/wiki';
import AppHeader, { crossViews } from '../app-header';
import GuideLink from './guide-link';
import { requestOrigin } from './request-origin';
import TokenEditor from './token-editor';
import './tokens.css';

/** The shared frame of `/tokens/new` and `/tokens/<id>/edit`: the stepper alone, no token tables. */
export default async function EditorPage({ userId, token }: { userId: string; token?: TokenRow }) {
  const [projects, wikis, origin] = await Promise.all([visibleProjects(userId), listWikis(userId), requestOrigin()]);
  return <main className="tk-page">
    <AppHeader title={token ? 'Edit token' : 'New token'} navLabel="Places" views={crossViews('Tokens / MCP')} />
    <div className="tk-body tk-body-narrow">
      <div className="tk-intro">
        <Link className="tk-back" href="/tokens">‹ All tokens</Link>
        <div className="tk-intro-actions"><GuideLink /></div>
      </div>
      <TokenEditor origin={origin} projects={projects} token={token}
        wikis={wikis.map((w) => ({ id: w.id, title: w.title, role: w.role }))} />
    </div>
  </main>;
}
