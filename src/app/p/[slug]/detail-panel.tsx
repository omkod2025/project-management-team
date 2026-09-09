'use client';

import { ImageLinks } from './image-field';
import type { ReactNode } from 'react';

import type { LedgerRow } from '@/db/schema';
import type { FieldDef, Person } from '@/lib/ledger';

/**
 * The facing page (spec 03 §7).
 *
 * Not a modal: the grid stays visible and scrollable beside it, because the
 * reason to open a task is usually to compare it with the one above.
 *
 * It is also the only surface that shows the pre-snap `*_raw` dates. Those
 * belong here rather than in the grid — a column of them would be noise on
 * every row, but their absence entirely would make forward-snapping look like
 * the system quietly moved a date (D-15).
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso: string | null) =>
  iso ? `${iso.slice(8)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : null;

const isThai = (s: string) => /[฀-๿]/.test(s);

export default function DetailPanel({
  row, ancestors, fields, people, statusFieldId, onClose,
}: {
  row: LedgerRow;
  ancestors: LedgerRow[];
  fields: FieldDef[];
  people: Person[];
  statusFieldId: string | null;
  onClose: () => void;
}) {
  const live = fields.filter((f) => !f.archived).sort((a, b) => a.position - b.position);

  return (
    <aside className="facing" aria-label="Task detail">
      <div className="facing-head">
        <div className="label crumb">
          {ancestors.map((a) => <span key={a.led_node_id}>{a.led_name}</span>)}
        </div>
        <button className="label" onClick={onClose} aria-label="Close">Close</button>
      </div>

      <h2 lang={isThai(row.led_name) ? 'th' : 'en'}>{row.led_name}</h2>

      <Section title="Dates">
        <Line label="Est start" value={fmt(row.led_estimate_start)} ink="entered" />
        <Line label="Est end" value={fmt(row.led_estimate_end)} ink="entered" />
        <Line
          label="Act start"
          value={fmt(row.led_actual_start)}
          ink={row.led_source_start === 'auto' ? 'computed' : 'entered'}
          note={sourceNote(row.led_source_start, row.led_actual_start, row.led_actual_start_raw)}
        />
        <Line
          label="Act end"
          value={fmt(row.led_actual_end)}
          ink={row.led_source_end === 'auto' ? 'computed' : 'entered'}
          note={sourceNote(row.led_source_end, row.led_actual_end, row.led_actual_end_raw)}
        />
        <Line label="Est days" value={row.led_estimate_workdays || null} ink="computed" note="working days" />
        <Line label="Act days" value={row.led_actual_workdays || null} ink="computed" note="working days" />
      </Section>

      <Section title="Misclosure">
        <Line label="Start" value={signed(row.led_misclosure_start)} ink={inkFor(row.led_misclosure_start)} />
        <Line label="End" value={signed(row.led_misclosure_end)} ink={inkFor(row.led_misclosure_end)} />
      </Section>

      {row.led_descendant_count > 0 && (
        <Section title="Children">
          <Line
            label="Closed"
            value={`${row.led_closed_count} of ${row.led_descendant_count}`}
            ink="computed"
            note="counted from the status column, not entered by hand"
          />
          <Line label="Roll-up start" value={fmt(row.led_rollup_est_start)} ink="computed" />
          <Line label="Roll-up end" value={fmt(row.led_rollup_est_end)} ink="computed" />
          {row.led_out_of_closure && (
            <p className="slip" style={{ marginTop: 8 }}>
              The children run past this baseline.
            </p>
          )}
        </Section>
      )}

      <Section title="Columns">
        {live.map((f) => (
          <Line
            key={f.id}
            label={f.name + (f.id === statusFieldId ? ' ·' : '')}
            value={display(f, row.led_custom_values?.[f.id] ?? null, people)}
            ink="entered"
          />
        ))}
      </Section>
    </aside>
  );
}

function sourceNote(
  source: 'auto' | 'manual' | null,
  value: string | null,
  raw: string | null,
): string | undefined {
  if (!value) return undefined;
  // Only worth saying when snapping actually moved the date.
  if (raw && raw !== value) return `recorded ${fmt(raw)}, snapped to the next working day`;
  return source === 'auto' ? 'captured from a status change' : 'entered by hand';
}

const signed = (n: number | null) => (n === null ? null : n === 0 ? '0' : `${n > 0 ? '+' : '−'}${Math.abs(n)}d`);
const inkFor = (n: number | null) => (n !== null && n !== 0 ? 'vermilion' : 'computed');

const TAB_HUE = (i: number) => `var(--color-tab-${((i - 1) % 6) + 1})`;

/** The same chip the grid draws — the facing page shows the value, not a
 *  paraphrase of it, so a status that is amber in the run is amber here too. */
const Chip = ({ label, colorIndex }: { label: string; colorIndex: number }) => (
  <span className="pill" style={{ ['--opt-hue' as string]: TAB_HUE(colorIndex) }}>{label}</span>
);

function display(f: FieldDef, raw: unknown, people: Person[]): ReactNode {
  if (raw === null || raw === undefined) return null;
  switch (f.kind) {
    case 'image': return <ImageLinks value={raw} />;
    case 'select': {
      const o = f.options.find((x) => x.id === raw);
      return o ? <Chip label={o.label} colorIndex={o.colorIndex} /> : null;
    }
    case 'multi_select': {
      const chips = (raw as string[])
        .map((id) => f.options.find((x) => x.id === id))
        .filter((o): o is NonNullable<typeof o> => !!o);
      if (!chips.length) return null;
      return (
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
          {chips.map((o) => <Chip key={o.id} label={o.label} colorIndex={o.colorIndex} />)}
        </span>
      );
    }
    case 'people':
      return (raw as string[]).map((id) => people.find((p) => p.id === id)?.name ?? '?').join(', ') || null;
    case 'money': {
      const m = raw as { amount: number; currency: string };
      return `${m.amount.toLocaleString('en-US')} ${m.currency}`;
    }
    case 'checkbox': return raw === true ? 'Yes' : 'No';
    default: return String(raw);
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="facing-section">
      <h3 className="label">{title}</h3>
      {children}
    </section>
  );
}

function Line({
  label, value, ink, note,
}: {
  label: string;
  value: ReactNode;
  ink: 'entered' | 'computed' | 'vermilion';
  note?: string;
}) {
  return (
    <div className="facing-line">
      <span className="label">{label}</span>
      <span className={ink === 'vermilion' ? 'slip' : ink}>
        {value ?? <span className="empty">—</span>}
      </span>
      {note && value !== null && value !== undefined && <span className="facing-note">{note}</span>}
    </div>
  );
}
