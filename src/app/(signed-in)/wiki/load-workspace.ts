import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { DomainError } from '@/lib/errors';
import { asDocPage, loadWiki, loadWikiPageBySlug, type WikiPage } from '@/lib/wiki';
import { wikiAbilities } from '@/lib/wiki-rules';
import type { WorkspaceProps } from './wiki-workspace';

/** The signed-in reader, or the sign-in page. */
export async function requireReader(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');
  return userId;
}

/** Every wiki refusal a screen can meet is the 404 page — a stranger cannot tell a wiki exists. */
export async function orNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof DomainError && err.code === 'E_NOT_FOUND') notFound();
    throw err;
  }
}

/**
 * What `WikiWorkspace` needs for one wiki, and for one of its pages when a
 * slug is given. Only what the client draws crosses the wire.
 */
export async function loadWorkspace(wikiId: string, pageSlug?: string): Promise<Omit<WorkspaceProps, 'initialEditing'>> {
  const userId = await requireReader();
  const data: Awaited<ReturnType<typeof loadWiki>> & { page?: WikiPage } = await orNotFound(() => (pageSlug === undefined
    ? loadWiki(userId, wikiId)
    : loadWikiPageBySlug(userId, wikiId, pageSlug)));
  const { wiki, pages, archivedPages, page } = data;
  return {
    wiki: { id: wiki.id, title: wiki.title, description: wiki.description, archived: wiki.archived },
    pages: pages.map(({ id, parentId, depth, title, slug }) => ({ id, parentId, depth, title, slug })),
    archivedPages: archivedPages.map(({ id, title }) => ({ id, title })),
    page: page ? asDocPage(page) : undefined,
    ...wikiAbilities(wiki.role, wiki.archived),
  };
}
