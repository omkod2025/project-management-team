'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LedgerRow } from '@/db/schema';
import type { FieldDef, Person } from '@/lib/ledger';
import { loadRecord, saveRecord } from '../view-state';
import '../list.css';
import './report.css';

/**
 * The client report (Q4).
 *
 * A printed page, which is what this design world is made of anyway. It uses
 * the reader's existing session — there is no share link and no guest account
 * (spec 05 §5), so nothing here can leak to someone who was not already
 * trusted with the project. What leaves the building is a PDF the sender
 * chose, not a URL they cannot take back.
 *
 * One rule is not the sender's to choose: **every `money` column is off by
 * default.** Budget figures reaching a client is the failure this whole
 * surface has to avoid, and a default that depends on remembering is not a
 * safeguard. Written against the field's kind rather than its name, so the
 * next money column is safe too.
 */

type Props = {
  projectName: string;
  slug: string;
  rows: LedgerRow[];
  fields: FieldDef[];
  people: Person[];
  statusFieldId: string | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso: string | null) =>
  iso ? `${iso.slice(8)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}` : null;
const isThai = (s: string) => /[฀-๿]/.test(s);

type Prefs = {
  columns: Record<string, boolean>;
  showVariance: boolean;
  depth: number;
  preparedFor: string;
};

export default function ReportView({ projectName, slug, rows, fields, people, statusFieldId }: Props) {
  const live = useMemo(
    () => fields.filter((f) => !f.archived).sort((a, b) => a.position - b.position),
    [fields],
  );

  const [prefs, setPrefs] = useState<Prefs>(() => ({
    columns: {},
    showVariance: false,
    depth: 3,
    preparedFor: '',
  }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = loadRecord<Partial<Prefs>>(slug, 'report', {});
    const columns: Record<string, boolean> = {};
    for (const f of live) {
      // Money is off unless this reader has previously turned it on for this
      // project, and even then they had to do it deliberately.
      const fallback = f.kind !== 'money' && f.id === statusFieldId;
      columns[f.id] = stored.columns?.[f.id] ?? fallback;
    }
    setPrefs({
      columns,
      showVariance: stored.showVariance ?? false,
      depth: stored.depth ?? 3,
      preparedFor: stored.preparedFor ?? '',
    });
    setReady(true);
  }, [slug, live, statusFieldId]);

  useEffect(() => { if (ready) saveRecord(slug, 'report', prefs); }, [ready, slug, prefs]);

  const chosen = live.filter((f) => prefs.columns[f.id]);
  const includesMoney = chosen.some((f) => f.kind === 'money');

  /* ---------------------------------------------------------------- tree */

  const byParent = useMemo(() => {
    const m = new Map<string | null, LedgerRow[]>();
    for (const r of rows) {
      const list = m.get(r.led_parent_id) ?? [];
      list.push(r);
      m.set(r.led_parent_id, list);
    }
    for (const l of m.values()) l.sort((a, b) => a.led_sort_order - b.led_sort_order);
    return m;
  }, [rows]);

  const root = rows.find((r) => r.led_depth === 1) ?? null;
  const modules = byParent.get(root?.led_node_id ?? null) ?? [];

  const rowsUnder = (id: string, depth: number): LedgerRow[] => {
    if (depth > prefs.depth) return [];
    const out: LedgerRow[] = [];
    for (const kid of byParent.get(id) ?? []) {
      out.push(kid);
      out.push(...rowsUnder(kid.led_node_id, depth + 1));
    }
    return out;
  };

  const value = (row: LedgerRow, f: FieldDef): string | null => {
    const raw = row.led_custom_values?.[f.id] ?? null;
    if (raw === null || raw === undefined) return null;
    switch (f.kind) {
      case 'select': return f.options.find((o) => o.id === raw)?.label ?? null;
      case 'multi_select':
        return (raw as string[]).map((id) => f.options.find((o) => o.id === id)?.label ?? '?').join(', ');
      case 'people':
        return (raw as string[]).map((id) => people.find((p) => p.id === id)?.name ?? '?').join(', ');
      case 'money': {
        const m = raw as { amount: number; currency: string };
        return `${m.amount.toLocaleString('en-US')} ${m.currency}`;
      }
      case 'image': return Array.isArray(raw) ? `${raw.length} image(s)` : '';
      case 'checkbox': return raw === true ? 'Yes' : '';
      default: return String(raw);
    }
  };

  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <>
      {/* Everything in here is screen-only; the printed page starts below. */}
      <div className="report-controls no-print">
        <div className="head">
          {/* Up a level, to the shelf. Deliberately not in the view nav
              beside List / Timeline / Report: those are views *of this
              project* and this is the way out of it — filing a level change
              among sibling views because the two sit near each other is the
              grouping-by-adjacency this page has been unpicking. */}
          <a className="shelf label" href="/">‹ Field Book</a>
          <h1>{projectName}</h1>
          <div className="views label">
            <a href={`/p/${slug}`}>List</a>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <a href={`/p/${slug}/timeline`}>Timeline</a>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <span aria-current="page">Report</span>
            <a href={`/p/${slug}/docs`}>Docs</a>
          </div>
        </div>

        <p className="aside">
          Prints as a client report. Nothing here is shared by link — you send
          the PDF, so you decide who reads it and you can stop sending it.
        </p>

        <div className="report-options">
          <label className="label">
            Prepared for
            <input
              className="field-input"
              value={prefs.preparedFor}
              placeholder="Client name (optional)"
              onChange={(e) => setPrefs({ ...prefs, preparedFor: e.target.value })}
            />
          </label>

          <label className="label">
            Depth
            <select
              className="field-input"
              value={prefs.depth}
              onChange={(e) => setPrefs({ ...prefs, depth: Number(e.target.value) })}
            >
              <option value={2}>Modules only</option>
              <option value={3}>Modules and tasks</option>
              <option value={4}>Down to subtasks</option>
              <option value={6}>Everything</option>
            </select>
          </label>

          <fieldset>
            <legend className="label">Columns</legend>
            {live.map((f) => (
              <label key={f.id} className={f.kind === 'money' ? 'money' : ''}>
                <input
                  type="checkbox"
                  checked={prefs.columns[f.id] ?? false}
                  onChange={(e) =>
                    setPrefs({ ...prefs, columns: { ...prefs.columns, [f.id]: e.target.checked } })
                  }
                />
                {f.name}
                {f.kind === 'money' && <span className="warn label">money</span>}
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={prefs.showVariance}
                onChange={(e) => setPrefs({ ...prefs, showVariance: e.target.checked })}
              />
              Variance against the estimate
            </label>
          </fieldset>
        </div>

        {includesMoney && (
          <p className="errata">
            This report includes a money column. Check that is what you mean before sending it.
          </p>
        )}

        <button className="label primary" onClick={() => window.print()}>Print</button>
      </div>

      {/* ------------------------------------------------------ the report */}
      <article className="report">
        <header className="report-head">
          <h1>{projectName}</h1>
          <div className="report-meta figure">
            {prefs.preparedFor && <div>Prepared for {prefs.preparedFor}</div>}
            <div>As at {fmt(today)}</div>
          </div>
        </header>

        {modules.map((m) => {
          const under = rowsUnder(m.led_node_id, 3);
          return (
            <section className="report-module" key={m.led_node_id}>
              <h2 lang={isThai(m.led_name) ? 'th' : 'en'}>
                {m.led_name}
                <span className="report-count figure">
                  {m.led_closed_count} of {m.led_descendant_count} closed
                </span>
              </h2>

              {(m.led_rollup_est_start || m.led_estimate_start) && (
                <p className="report-dates figure">
                  {fmt(m.led_estimate_start ?? m.led_rollup_est_start)} —{' '}
                  {fmt(m.led_estimate_end ?? m.led_rollup_est_end)}
                </p>
              )}

              {under.length > 0 ? (
                <table className="report-table">
                  <thead>
                    <tr className="label">
                      <th>Task</th>
                      {chosen.map((f) => <th key={f.id}>{f.name}</th>)}
                      <th className="num">Planned</th>
                      <th className="num">Actual</th>
                      {prefs.showVariance && <th className="num">Variance</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {under.map((r) => (
                      <tr key={r.led_node_id}>
                        <td style={{ paddingLeft: (r.led_depth - 3) * 16 }}>
                          <span lang={isThai(r.led_name) ? 'th' : 'en'}>{r.led_name}</span>
                          {r.led_descendant_count > 0 && (
                            <span className="report-count figure">
                              {r.led_closed_count}/{r.led_descendant_count}
                            </span>
                          )}
                        </td>
                        {chosen.map((f) => <td key={f.id}>{value(r, f) ?? '—'}</td>)}
                        <td className="num figure">{fmt(r.led_estimate_end) ?? '—'}</td>
                        <td className="num figure">{fmt(r.led_actual_end) ?? '—'}</td>
                        {prefs.showVariance && (
                          <td className="num figure">
                            {r.led_misclosure_end === null
                              ? '—'
                              : r.led_misclosure_end === 0
                                ? '0'
                                : `${r.led_misclosure_end > 0 ? '+' : '−'}${Math.abs(r.led_misclosure_end)}d`}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="report-empty">No tasks recorded under this module.</p>
              )}
            </section>
          );
        })}

        <footer className="report-foot figure">
          {/* A document sent outside the building says what produced it.
              Relying on the browser's own print header would not do: it is
              off by default in some browsers and switchable in all of them. */}
          <span className="report-mark">T-Timeline</span>
          Dates are working days in Asia/Bangkok. “Closed” counts tasks whose
          status has reached a finished stage.
        </footer>
      </article>
    </>
  );
}
