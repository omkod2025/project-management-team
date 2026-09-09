'use client';
import { useMemo, useState, type ReactNode } from 'react';
import type { RichNode } from '@/lib/doc-rich-content';
import { matchingTableRows, tableFilterData } from '@/lib/doc-table-filter';

export default function FilterableTable({ table, header, rows }: { table: RichNode; header: ReactNode; rows: ReactNode[] }) {
  const data = useMemo(() => tableFilterData(table), [table]);
  const [filters, setFilters] = useState<Record<number, string[]>>({});
  const enabled = (table.content?.[0]?.content ?? []).flatMap(cell => Array.from({ length: Number(cell.attrs?.colspan ?? 1) }, () => cell.attrs?.filterEnabled === true));
  const visible = matchingTableRows(data, Object.fromEntries(Object.entries(filters).filter(([col]) => enabled[Number(col)])));
  const active = Object.keys(filters).some(col => enabled[Number(col)]);
  function select(col: number, values: string[] | null) {
    setFilters(previous => { const next = { ...previous }; if (values === null) delete next[col]; else next[col] = values; return next; });
  }
  return <div className="doc-filterable-table">
    <table>
      <thead>{header}{enabled.some(Boolean) && <tr className="doc-table-filters">{(data.grid[0] ?? []).map((label, col) => {
        const options = [...new Set(data.grid.slice(1).map(row => row[col] ?? ''))].sort((a, b) => a.localeCompare(b));
        const chosen = filters[col] ?? options;
        return <th key={col}>{enabled[col] && <details className="doc-table-filter-menu">
          <summary aria-label={`Filter ${label || `column ${col + 1}`}`}>Filter{filters[col] ? ` (${chosen.length})` : ''}</summary>
          <div className="doc-table-filter-options" role="group" aria-label={`Values for ${label || `column ${col + 1}`}`}>
            <div className="doc-filter-select-actions"><button type="button" onClick={() => select(col, null)}>Select all</button><button type="button" onClick={() => select(col, [])}>Clear selection</button></div>
            {options.map(value => <label key={value}><input type="checkbox" checked={chosen.includes(value)} onChange={event => {
              const next = event.target.checked ? [...chosen, value] : chosen.filter(item => item !== value);
              select(col, next.length === options.length ? null : next);
            }} /><span>{value || '(Blank)'}</span></label>)}
            {!options.length && <span>No values</span>}
          </div>
        </details>}</th>;
      })}</tr>}</thead>
      <tbody>{rows.filter((_, i) => visible.has(i + 1))}</tbody>
    </table>
    {active && <div className="doc-table-filter-status"><span role="status">{visible.size} of {rows.length} rows{visible.size === 0 ? ' — No matching rows' : ''}</span><button type="button" onClick={() => setFilters({})}>Clear filters</button></div>}
  </div>;
}
