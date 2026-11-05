/** A page as the tree draws it: no body, which the tree never needs. */
export type TreePage = { id: string; parentId: string | null; depth: number; title: string; slug: string };

/** Pages in reading order: each parent followed by its children, siblings in the order given. */
export function treeOrder<P extends TreePage>(pages: readonly P[]): P[] {
  const children = new Map<string | null, P[]>();
  for (const p of pages) children.set(p.parentId, [...(children.get(p.parentId) ?? []), p]);
  const ordered: P[] = [];
  const walk = (parent: string | null) => {
    for (const p of children.get(parent) ?? []) { ordered.push(p); walk(p.id); }
  };
  walk(null);
  return ordered;
}

/** The page and every page below it. */
export function subtreeOf(pages: readonly TreePage[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  for (const p of treeOrder(pages)) if (p.parentId && ids.has(p.parentId)) ids.add(p.id);
  return ids;
}

/** Where a page may move: top level or any page outside its own subtree that keeps the whole subtree within three levels. */
export function moveTargets(pages: readonly TreePage[], pageId: string): TreePage[] {
  const subtree = subtreeOf(pages, pageId);
  const self = pages.find((p) => p.id === pageId);
  if (!self) return [];
  const height = Math.max(...pages.filter((p) => subtree.has(p.id)).map((p) => p.depth)) - self.depth;
  return treeOrder(pages).filter((p) => !subtree.has(p.id) && p.depth + 1 + height <= 3);
}
