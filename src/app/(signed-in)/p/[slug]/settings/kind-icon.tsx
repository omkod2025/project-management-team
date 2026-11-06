import type { FieldKind } from '@/lib/node-rules';

/**
 * The mark in front of every column in Settings: it says what kind of value
 * the column holds, and doubles as the bullet that shows the column belongs
 * to the section above it. Grey on paper, never a hue — a kind is not a state.
 */

const paths: Record<FieldKind | 'status', string> = {
  text: 'M5 6h14M12 6v13',
  long_text: 'M4 6h16M4 11h16M4 16h10',
  number: 'M10 4 8 20M16 4l-2 16M5 9h15M4 15h15',
  money: 'M3 6h18v12H3V6Zm9 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  date: 'M4 6h16v14H4V6Zm0 4h16M8 3v4M16 3v4',
  select: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-4 7.5 4 4 4-4',
  multi_select: 'm3 6 2 2 3-4m-5 9 2 2 3-4M11 6h10M11 13h10M11 20h10',
  checkbox: 'M4 4h16v16H4V4Zm4 8 3 3 5-6',
  people: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  image: 'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M8 8h.01',
  file: 'M13 3H5v18h14V9l-6-6Zm0 0v6h6',
  status: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10a5 5 0 0 0 0-10Z',
};

export const KIND_LABEL: Record<FieldKind, string> = {
  text: 'Text',
  long_text: 'Long text',
  number: 'Number',
  money: 'Money',
  date: 'Date',
  select: 'Select',
  multi_select: 'Multi-select',
  checkbox: 'Checkbox',
  people: 'People',
  image: 'Image',
  file: 'File',
};

export default function KindIcon({ kind, status = false }: { kind: FieldKind; status?: boolean }) {
  return (
    <span className="kind-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
           strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[status ? 'status' : kind]} />
      </svg>
    </span>
  );
}
