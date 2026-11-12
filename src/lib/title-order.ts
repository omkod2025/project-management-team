/**
 * Ordering a table by title — the Wiki list and a project's Docs list share
 * it. Pure and dependency-free, so a client component may import it.
 *
 * `name` is A→Z, the default; `-name` is Z→A. Thai and English titles go in
 * dictionary order, "2" before "10", case ignored.
 */
export type TitleSort = 'name' | '-name';

/** Anything but `-name` in a query string or a toggle is the default, never an error. */
export function parseTitleSort(value: unknown): TitleSort {
  return value === '-name' ? '-name' : 'name';
}

const TITLE_ORDER = new Intl.Collator(['th', 'en'], { sensitivity: 'base', numeric: true });

/** A new array in the order `sort` asks for; ties keep their incoming order. */
export function sortByTitle<T extends { title: string }>(items: readonly T[], sort: TitleSort): T[] {
  const sign = sort === 'name' ? 1 : -1;
  return [...items].sort((a, b) => sign * TITLE_ORDER.compare(a.title.trim(), b.title.trim()));
}
