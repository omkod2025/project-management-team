import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './data-table.css';

/**
 * The one table every register page uses (Projects, Docs, the Wiki index,
 * Tokens / MCP): the panel, the house head row, hairlines and hover, and a
 * caption for screen readers. A page passes its own `thead`/`tbody` and, at
 * most, a class for what only it needs.
 */
export function DataTable({ caption, className, children }: {
  caption: string; className?: string; children: ReactNode;
}) {
  return <div className="data-table-wrap">
    <table className={cn('data-table', className)}>
      <caption className="data-table-caption">{caption}</caption>
      {children}
    </table>
  </div>;
}
