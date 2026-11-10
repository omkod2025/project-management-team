'use client';

import { useEffect, useRef, useState } from 'react';
import { DatePicker } from '@/components/date-picker';
import {
  EMPTY, filterCount, termCount, toggleValue, clearColumn, setText, setRange,
  type FilterColumn, type FilterTerm,
} from '@/lib/list-filter';

/**
 * The filter control, shared by the List and the Timeline.
 *
 * One button in the toolbar, one panel under it, one section per filterable
 * column. A column that is a choice from a set offers a checkbox per value —
 * because the question is "Doing *or* Blocked", and a `<select>` can only ever
 * answer one of them. A text column offers a box ("contains", `%` for any run
 * of characters); a date column offers a From and a To. The rules for how the
 * terms combine live in `list-filter.ts`; this file only draws them.
 *
 * It borrows the sort menu's chrome deliberately. Sort and Filter are the two
 * halves of the same act — deciding what the page shows and in what order —
 * and a reader who has learned one menu should not have to learn a second.
 */

type Props = {
  columns: FilterColumn[];
  terms: FilterTerm[];
  onChange: (terms: FilterTerm[]) => void;
  /** What the run counts down to, shown beside the button when filtering. */
  matching?: number;
};

/** The date picker's calendar is portalled to <body>; a click in it is still inside the menu. */
const inPopover = (el: Node) =>
  el instanceof Element && el.closest('[data-radix-popper-content-wrapper]') !== null;

export default function FilterMenu({ columns, terms, onChange, matching }: Props) {
  const [open, setOpen] = useState(false);
  /** Which sections are unfolded. A column with something chosen opens itself. */
  const [shown, setShown] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  /* A menu, not a mode: anything outside it, or Escape, ends it. */
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!(e.target instanceof Node) || ref.current?.contains(e.target) || inPopover(e.target)) return;
      setOpen(false);
    };
    /* The date picker claims its own Escape (it prevents the default), so the
       first Escape closes the calendar and only the second closes the menu. */
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) setOpen(false); };
    document.addEventListener('mousedown', away, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const count = filterCount(terms);
  const termOf = (key: string) => terms.find((t) => t.key === key);
  const isOpen = (key: string) => shown.has(key) || termCount(termOf(key)) > 0;
  const fold = (key: string) =>
    setShown((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  if (columns.length === 0) return null;

  return (
    <div className="sortby filterby" ref={ref}>
      <button
        type="button"
        className="sortby-open"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Show only the rows you choose. Values inside one column widen the answer; a second column narrows it."
      >
        Filter
        {count > 0 && <span className="figure sortby-count">{count}</span>}
      </button>

      {open && (
        <div className="sortby-panel filterby-panel" role="group" aria-label="Filter by">
          {count === 0 && <p className="sortby-empty">Everything is shown.</p>}

          {columns.map((c) => {
            const term = termOf(c.key);
            const asked = termCount(term);
            return (
              <section key={c.key} className="filterby-column">
                <h4>
                  <button
                    type="button"
                    className="filterby-fold"
                    aria-expanded={isOpen(c.key)}
                    onClick={() => fold(c.key)}
                  >
                    <span aria-hidden="true">{isOpen(c.key) ? '⌄' : '›'}</span>
                    <span className="sortby-name">{c.label}</span>
                    {asked > 0 && <span className="figure sortby-count">{asked}</span>}
                  </button>
                  {asked > 0 && (
                    <button
                      type="button"
                      className="filterby-clear"
                      onClick={() => onChange(clearColumn(terms, c.key))}
                      aria-label={`Clear the ${c.label} filter`}
                      title="Clear this column"
                    >
                      ×
                    </button>
                  )}
                </h4>

                {isOpen(c.key) && c.source === 'text' && (
                  <TextTerm column={c} term={term} onChange={(text) => onChange(setText(terms, c.key, text))} />
                )}

                {isOpen(c.key) && c.source === 'date' && (
                  <RangeTerm
                    column={c}
                    term={term}
                    onChange={(from, to) => onChange(setRange(terms, c.key, from, to))}
                  />
                )}

                {isOpen(c.key) && c.source !== 'text' && c.source !== 'date' && (
                  <ul className="filterby-values">
                    {c.choices.map((choice) => (
                      <li key={choice.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={term?.values.includes(choice.id) ?? false}
                            onChange={() => onChange(toggleValue(terms, c.key, choice.id))}
                          />
                          <span className="sortby-name">
                            {choice.label}
                            {choice.archived && <span className="filterby-archived"> (archived)</span>}
                          </span>
                        </label>
                      </li>
                    ))}

                    {/* A checkbox is ticked or it is not, so it has no empty
                        cell to offer. Every other column does, and "nothing
                        entered here yet" is one of the things most worth
                        asking for. */}
                    {c.source !== 'checkbox' && (
                      <li>
                        <label>
                          <input
                            type="checkbox"
                            checked={term?.values.includes(EMPTY) ?? false}
                            onChange={() => onChange(toggleValue(terms, c.key, EMPTY))}
                          />
                          <span className="sortby-name filterby-archived">Empty</span>
                        </label>
                      </li>
                    )}
                  </ul>
                )}
              </section>
            );
          })}

          <div className="sortby-add">
            {count > 0 && (
              <button type="button" onClick={() => onChange([])}>Clear the filter</button>
            )}
            {matching !== undefined && count > 0 && (
              <span className="figure" role="status">{matching} shown</span>
            )}
          </div>

          <p className="sortby-note">
            Several values in one column widen the answer; a second column narrows it.
            Text matches anywhere in the cell, and % stands for anything.
            The filter is yours alone — nobody else&rsquo;s page changes.
          </p>
        </div>
      )}
    </div>
  );
}

type TermProps = { column: FilterColumn; term: FilterTerm | undefined };

/** "Contains", SQL-LIKE style — see `likeMatch`. */
function TextTerm({ column, term, onChange }: TermProps & { onChange: (text: string) => void }) {
  return (
    <div className="filterby-typed">
      <input
        type="search"
        className="filterby-text"
        value={term?.text ?? ''}
        placeholder="Contains…"
        aria-label={`${column.label} contains`}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** A range of days, both ends inclusive and either one optional — see `inRange`. */
function RangeTerm({
  column, term, onChange,
}: TermProps & { onChange: (from: string | null, to: string | null) => void }) {
  const from = term?.from ?? null;
  const to = term?.to ?? null;
  return (
    <div className="filterby-typed filterby-range">
      <label className="filterby-range-end">
        <span className="filterby-range-label">From</span>
        <DatePicker
          value={from}
          placeholder="Any day"
          aria-label={`${column.label} from`}
          onChange={(next) => onChange(next, to)}
        />
      </label>
      <label className="filterby-range-end">
        <span className="filterby-range-label">To</span>
        <DatePicker
          value={to}
          placeholder="Any day"
          aria-label={`${column.label} to`}
          onChange={(next) => onChange(from, next)}
        />
      </label>
    </div>
  );
}
