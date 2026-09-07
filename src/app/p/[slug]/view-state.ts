'use client';

/**
 * The state the two views share.
 *
 * DESIGN.md commits to a "carried object" staging: moving from List to
 * Timeline changes the instrument pointed at the work, not the work. That is
 * only true if selection and expansion survive the navigation, so they live
 * here — the selected node in the URL, where a link carries it and a reload
 * keeps it, and the rest in localStorage, where it belongs to this reader on
 * this machine rather than to the project.
 */

const key = (slug: string, part: string) => `fieldbook:${slug}:${part}`;

export function loadSet(slug: string, part: string, fallback: string[] = []): Set<string> {
  if (typeof window === 'undefined') return new Set(fallback);
  try {
    const raw = window.localStorage.getItem(key(slug, part));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set(fallback);
  } catch {
    return new Set(fallback);
  }
}

export function saveSet(slug: string, part: string, value: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(slug, part), JSON.stringify([...value]));
  } catch {
    // A full or blocked storage must never break the grid. Losing the
    // expansion state is a smaller cost than losing the session.
  }
}

export function loadRecord<T>(slug: string, part: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key(slug, part));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveRecord(slug: string, part: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(slug, part), JSON.stringify(value));
  } catch {
    /* see above */
  }
}

/** The selected node travels in the URL so a link to a view carries it. */
export function selectedFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('node');
}

export function writeSelectedToUrl(nodeId: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (nodeId) url.searchParams.set('node', nodeId);
  else url.searchParams.delete('node');
  window.history.replaceState(null, '', url);
}

/** Build the sibling view's href, carrying the selection with it. */
export function siblingHref(base: string, nodeId: string | null): string {
  return nodeId ? `${base}?node=${encodeURIComponent(nodeId)}` : base;
}
