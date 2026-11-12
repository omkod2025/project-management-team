'use client';
/**
 * The Docs page tree, drawn with the shadcn Sidebar (DESIGN.md § 7).
 *
 * Each level nests inside the one above, so the hairline down the left of a
 * sub-list is the hierarchy: a subpage sits on its parent's line. Folding is a
 * chevron that turns, never a glyph that swaps. Docs and the wiki share it;
 * each passes its own row actions.
 */
import type { ReactNode } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, PanelLeft, Plus } from 'lucide-react';
import {
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { TrashIcon } from '../../../confirm-delete';

/** What a row needs to draw: Docs pages and wiki pages both fit. */
export type TreeNode = { id: string; parentId: string | null; title: string; slug: string; depth: number; hue?: number | null; nodeArchived?: boolean };

export type PageTreeProps<T extends TreeNode> = {
  pages: T[];
  currentId?: string;
  /** The open page's title as it is being edited, so the row renames live. */
  currentTitle: string;
  base: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  /** The buttons at the end of a row, if the reader may change the page. */
  actions?: (page: T) => ReactNode;
  /** Anything drawn under a row, such as an open actions menu. */
  below?: (page: T) => ReactNode;
};

/** One page: fold, link, then whatever actions the caller gives it. */
function PageRow<T extends TreeNode>({ page: p, hasChildren, flat, tree }: { page: T; hasChildren: boolean; flat: boolean; tree: PageTreeProps<T> }) {
  const open = tree.expanded.has(p.id);
  const current = p.id === tree.currentId;
  const title = current ? tree.currentTitle : p.title;
  return <><div className="doc-tree-row">
    {flat ? null : hasChildren
      ? <button type="button" className="doc-tree-fold" aria-label={`${open ? 'Collapse' : 'Expand'} ${p.title}`} aria-expanded={open} onClick={() => tree.onToggle(p.id)}><ChevronRight aria-hidden /></button>
      : <span className="doc-tree-fold-space" aria-hidden />}
    <SidebarMenuButton asChild isActive={current}>
      <a href={`${tree.base}/${p.slug}`} aria-current={current ? 'page' : undefined} title={title}
        style={p.hue ? { borderLeft: `1px solid color-mix(in srgb, var(--color-tab-${p.hue}) 65%, white)` } : undefined}>
        <span className="doc-tree-title">{title}</span>{p.nodeArchived && <small>Module archived</small>}
      </a>
    </SidebarMenuButton>
    {tree.actions?.(p)}
  </div>{tree.below?.(p)}</>;
}

/** The pages under `parentId`, each followed by its own subpages when unfolded. */
function PageBranch<T extends TreeNode>({ parentId, tree }: { parentId: string | null; tree: PageTreeProps<T> }) {
  const items = tree.pages.filter((p) => p.parentId === parentId).map((p) => {
    const hasChildren = tree.pages.some((c) => c.parentId === p.id);
    const row = <>
      <PageRow page={p} hasChildren={hasChildren} flat={false} tree={tree} />
      {hasChildren && tree.expanded.has(p.id) && <PageBranch parentId={p.id} tree={tree} />}
    </>;
    return parentId ? <SidebarMenuSubItem key={p.id}>{row}</SidebarMenuSubItem> : <SidebarMenuItem key={p.id}>{row}</SidebarMenuItem>;
  });
  return parentId ? <SidebarMenuSub>{items}</SidebarMenuSub> : <SidebarMenu>{items}</SidebarMenu>;
}

/** The whole tree, or — while searching — the matching pages as one flat list. */
export function PageTree<T extends TreeNode>({ matches, ...tree }: PageTreeProps<T> & { matches?: T[] | null }) {
  if (matches) return <SidebarMenu>{matches.map((p) => <SidebarMenuItem key={p.id}><PageRow page={p} hasChildren={false} flat tree={tree} /></SidebarMenuItem>)}</SidebarMenu>;
  return <PageBranch parentId={null} tree={tree} />;
}

/**
 * A row's own add-subpage and delete icons, for Docs and the wiki alike. They
 * keep their `doc-tree-*` classes, which the house-style tests read.
 */
export function DocRowActions<T extends TreeNode & { protected?: boolean }>({ page: p, canCreate, editing, busy, onAddSubpage, onRemove }: {
  page: T; canCreate: boolean; editing: boolean; busy: boolean; onAddSubpage: (page: T) => void; onRemove: (page: T) => void;
}) {
  if (!canCreate) return null;
  return <>
    {p.depth < 3 && <button type="button" className="doc-tree-add" aria-label={`Add subpage to ${p.title}`} title="Add subpage" disabled={editing} onClick={() => onAddSubpage(p)}><Plus aria-hidden /></button>}
    <button type="button" className="doc-tree-delete" aria-label={`Delete page ${p.title}`} title={p.protected ? 'Unlock this page before deleting' : editing ? 'Finish editing before deleting' : 'Delete page'} disabled={editing || busy || p.protected} onClick={() => onRemove(p)}><TrashIcon /></button>
  </>;
}

/** The ids of every page above `id` in the tree, nearest first, so the tree opens on the page being read. */
export function ancestorIds(pages: readonly TreeNode[], id: string | undefined): string[] {
  const ids: string[] = [];
  let parent = pages.find((p) => p.id === id)?.parentId ?? null;
  while (parent && !ids.includes(parent)) { ids.push(parent); parent = pages.find((p) => p.id === parent)?.parentId ?? null; }
  return ids;
}

/** Unfold every page that has subpages, or fold them all back. */
export function FoldAll({ allOpen, onClick }: { allOpen: boolean; onClick: () => void }) {
  const label = allOpen ? 'Collapse all pages' : 'Expand all pages';
  return <button type="button" className="doc-tree-fold-all" aria-label={label} title={label} onClick={onClick}>
    {allOpen ? <ChevronsDownUp aria-hidden /> : <ChevronsUpDown aria-hidden />}
  </button>;
}

/** Hides or shows the page tree on a wide screen. The phone has its own bar. */
export function PagesTrigger({ controls }: { controls: string }) {
  const { isMobile, open } = useSidebar();
  if (isMobile) return null;
  return <SidebarTrigger className="doc-pages-trigger" aria-label={open ? 'Hide pages' : 'Show pages'} title={`${open ? 'Hide' : 'Show'} pages (Ctrl+\\)`} aria-controls={controls} aria-expanded={open} />;
}

/** The phone's bar above the page: opens the tree as a drawer. */
export function PagesBar({ title }: { title: string }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  if (!isMobile) return null;
  return <button type="button" className="doc-sidebar-toggle" aria-expanded={openMobile} onClick={() => setOpenMobile(true)}>
    <PanelLeft aria-hidden />Pages · {title}
  </button>;
}
