import type { TitleSort } from '@/lib/title-order';

/** The chevron beside a sortable column head: up for A→Z, down for Z→A. */
export default function SortMark({ sort }: { sort: TitleSort }) {
  return <svg className="table-sort-mark" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d={sort === 'name' ? 'M3 7.5 6 4.5l3 3' : 'M3 4.5 6 7.5l3-3'} />
  </svg>;
}
