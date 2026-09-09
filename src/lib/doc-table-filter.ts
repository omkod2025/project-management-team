import type { RichNode } from './doc-rich-content.ts';

const textOf = (node: RichNode): string => node.text ?? (node.content ?? []).map(textOf).join(' ');

/** Expand spans to logical columns and keep vertically merged row groups together. */
export function tableFilterData(table: RichNode) {
  const rows = table.content ?? [];
  const grid: string[][] = rows.map(() => []);
  const ends = rows.map((_, i) => i);
  rows.forEach((row, r) => {
    let col = 0;
    for (const cell of row.content ?? []) {
      while (grid[r]![col] !== undefined) col++;
      const width = Number(cell.attrs?.colspan ?? 1);
      const height = Number(cell.attrs?.rowspan ?? 1);
      ends[r] = Math.max(ends[r]!, Math.min(rows.length - 1, r + height - 1));
      for (let y = r; y < Math.min(rows.length, r + height); y++) {
        for (let x = col; x < col + width; x++) grid[y]![x] = textOf(cell).trim();
      }
      col += width;
    }
  });
  const groups: number[][] = [];
  for (let r = 1; r < rows.length;) {
    const group: number[] = [];
    let end = ends[r]!;
    do { group.push(r); end = Math.max(end, ends[r]!); r++; } while (r <= end);
    groups.push(group);
  }
  return { grid, groups };
}

export function matchingTableRows(data: ReturnType<typeof tableFilterData>, filters: Record<number, string[]>) {
  return new Set(data.groups.filter(group => group.some(r => Object.entries(filters).every(([column, values]) =>
    values.includes(data.grid[r]?.[Number(column)] ?? ''),
  ))).flat());
}
