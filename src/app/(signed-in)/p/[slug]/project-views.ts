import type { HeaderView } from '../../app-header';
import { siblingHref } from './view-state';

/**
 * The views of one project, in the order every project page shows them.
 *
 * `selected` carries the List's open task across to Timeline and Calendar, as
 * it always has. A page that is not one of the five — Report — passes itself
 * as `extra`, and is marked at the end rather than lost.
 */
export function projectViews(slug: string, current: string, {
  canSettings, selected = null, defects = false, extra,
}: { canSettings: boolean; selected?: string | null; defects?: boolean; extra?: HeaderView }): HeaderView[] {
  const base = `/p/${slug}`;
  const views: HeaderView[] = [
    { label: 'List', href: defects ? `${base}/defects` : siblingHref(base, selected) },
    { label: 'Timeline', href: siblingHref(`${base}/timeline`, selected) },
    { label: 'Calendar', href: siblingHref(`${base}/calendar`, selected) },
    { label: 'Docs', href: `${base}/docs` },
  ];
  if (canSettings) views.push({ label: 'Settings', href: `${base}${defects ? '/defects' : ''}/settings` });
  if (extra) views.push(extra);
  return views.map((v) => (v.label === current ? { ...v, current: true } : v));
}
