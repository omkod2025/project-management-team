import Link from 'next/link';
import type { ReactNode } from 'react';
import Bell from './bell';
import SignOut from './sign-out';
import './app-header.css';

export type HeaderView = { label: string; href: string; current?: boolean };

/**
 * The one header every signed-in page wears except the shelf itself.
 *
 * It is the List's head, lifted out so the other pages stop drawing their
 * own: the way out to the shelf, the page's title, the bell, the views of the
 * place you are in, and Sign out — always in that order, so a hand that has
 * learned where Home is on one page finds it on all of them. Only the title
 * and the views change from page to page.
 *
 * Home and Sign out sit at opposite ends on purpose: both change level rather
 * than view, and the one that ends the session should not be the neighbour of
 * the one reached for constantly. The bell stands immediately before the
 * views, so notice and navigation stay one cluster (spec 11 §6).
 *
 * The current view is a link too, not a dead label: on an open document,
 * "Docs" is the way back to the list of documents.
 *
 * The Calendar keeps its own Google-Calendar header (CLAUDE.md, the pinned
 * exception) and does not use this.
 */
export default function AppHeader({ title, views, navLabel }: {
  title: ReactNode; views: HeaderView[]; navLabel: string;
}) {
  return (
    <header className="head app-head">
      <Link className="app-head-home" href="/">‹ Home</Link>
      <div className="app-head-title">{typeof title === 'string' ? <h1>{title}</h1> : title}</div>
      <Bell />
      <nav className="app-head-views" aria-label={navLabel}>
        {views.map((v) => (
          <a key={v.label} href={v.href} aria-current={v.current ? 'page' : undefined}>{v.label}</a>
        ))}
      </nav>
      <SignOut className="app-head-out" />
    </header>
  );
}

/** The views of the places outside any one project. Tokens / MCP is one: a token reaches List, Docs and the Wiki. */
export function crossViews(current: 'All Timeline' | 'People' | 'Tokens / MCP' | null): HeaderView[] {
  return [
    { label: 'Projects', href: '/' },
    { label: 'All Timeline', href: '/timeline', current: current === 'All Timeline' },
    { label: 'People', href: '/people', current: current === 'People' },
    { label: 'Tokens / MCP', href: '/tokens', current: current === 'Tokens / MCP' },
  ];
}

/**
 * The views of the Wiki. Inside one wiki its Pages join them, and its
 * Settings for the people who may open them.
 */
export function wikiViews(
  current: 'Wikis' | 'Mermaid guide' | 'Pages' | 'Settings',
  wiki?: { id: string; canSettings: boolean },
): HeaderView[] {
  const views: HeaderView[] = [
    { label: 'Wikis', href: '/wiki' },
    { label: 'Mermaid guide', href: '/wiki/mermaid-guide' },
  ];
  if (wiki) {
    views.push({ label: 'Pages', href: `/wiki/${wiki.id}` });
    if (wiki.canSettings) views.push({ label: 'Settings', href: `/wiki/${wiki.id}/settings` });
  }
  return views.map((v) => (v.label === current ? { ...v, current: true } : v));
}
