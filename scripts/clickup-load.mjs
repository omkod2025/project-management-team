#!/usr/bin/env node
/**
 * clickup-load.mjs — transform a raw ClickUp capture into Field Book rows.
 *
 * See docs/spec/06-clickup-migration.md.
 *
 *   node scripts/clickup-load.mjs [capture-dir] [list-name]
 *
 * One ClickUp list becomes one Field Book project. The list name is a CLI
 * argument rather than a constant because the workspace turned out to hold
 * more than one importable list, and hard-coding it would have meant editing
 * the script to run it again — which is how a migration script stops being
 * reproducible.
 *
 * Emits, into data/import/<timestamp>/ :
 *   load.sql    idempotent DDL-free INSERT ... ON CONFLICT script
 *   report.md   what was imported, what was dropped, and what needs a human
 *
 * It writes no database itself. Run the SQL with psql, read the report first.
 * Splitting it this way means the transform is auditable before it lands, and
 * re-runnable: every row upserts on a deterministic id derived from the
 * ClickUp id, so running it twice changes nothing.
 *
 * Working-day snapping is NOT done here. The generated SQL calls
 * pmf_next_workday() so the holiday calendar in the database stays the single
 * source of truth (D-15, D-41).
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/* ------------------------------------------------------------------ */
/* configuration — the decisions from spec 06                          */
/* ------------------------------------------------------------------ */

const IMPORT_LIST = process.argv[3] ?? 'Bannayuu Next';
const PROJECT_NAME = IMPORT_LIST;
const PROJECT_SLUG = IMPORT_LIST.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const MAX_DEPTH = 6;                           // D-2

// Fields dropped outright: zero values across 174 tasks (§3.2).
const DROP_FIELDS = new Set(['Completion Criteria', 'Next Steps']);

// Imported for the record, then archived (§3.1, §3.2).
const ARCHIVE_FIELDS = new Set(['🫀 Module', 'ClickUp Status']);

// Corrections to a source setting that is simply wrong. ClickUp left this
// field on its default currency and nobody changed it. The owner confirmed on
// 2026-09-07 that the amounts are *millions of baht*, so the unit is M฿ and
// the stored numbers stay as they are. Kept here rather than fixed in the
// database alone, so re-running the load does not undo the correction.
const CURRENCY_OVERRIDES = { 'Budget Allocation': 'M฿' };

// Stages for the project's status field (§3.2b). Keyed by orderindex.
const TASK_STATUS_STAGES = { 0: 'notStarted', 1: 'inProgress', 2: 'done', 3: 'done', 4: null };
const RELABEL = { CANCLE: 'CANCELLED' };       // §3.2b — display text, not a key

const CLICKUP_TYPE_TO_KIND = {
  text: 'text',
  short_text: 'text',
  text_area: 'long_text',
  number: 'number',
  currency: 'money',
  date: 'date',
  drop_down: 'select',
  labels: 'multi_select',
  checkbox: 'checkbox',
  users: 'people',
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Deterministic UUID v5 over a namespace label, so re-runs upsert.
 *
 * Every key must be unique across the whole workspace, not just within one
 * run. Synthesised fields therefore carry the list id: without it, importing a
 * second list reused the first project's field ids and the upsert quietly
 * rewrote that project's columns instead of creating new ones.
 */
function uuid(kind, key) {
  const h = createHash('sha1').update(`fieldbook:${kind}:${key}`).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const s = b.toString('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** ClickUp gives UTC epoch ms. We want the calendar date in Asia/Bangkok. */
function bkkDate(ms) {
  if (ms === null || ms === undefined || ms === '') return null;
  const d = new Date(Number(ms) + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const qd = (v) => (v ? `DATE '${v}'` : 'NULL');
const qj = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

/* ------------------------------------------------------------------ */
/* load the capture                                                    */
/* ------------------------------------------------------------------ */

let dir = process.argv[2];
if (!dir) {
  const base = join('data', 'clickup-raw');
  const runs = readdirSync(base).sort();
  dir = join(base, runs[runs.length - 1]);
}
if (!existsSync(dir)) {
  console.error(`No capture at ${dir}`);
  process.exit(1);
}
console.log(`Reading ${dir}`);

const readJson = (p) => JSON.parse(readFileSync(join(dir, p), 'utf8'));
const manifest = readJson('_manifest.json');

const taskFiles = readdirSync(join(dir, 'task')).filter((f) => f.endsWith('.json') && !f.endsWith('.comments.json'));
const allTasks = taskFiles.map((f) => readJson(join('task', f)));
const tasks = allTasks.filter((t) => t.list.name === IMPORT_LIST);

const listEntry = manifest.lists.find((l) => l.name === IMPORT_LIST);
const fieldDefs = readJson(`list-${listEntry.id}/fields.json`).fields;
const members = (readJson('members.json').team?.members ?? []).map((m) => m.user ?? m);

const report = [];
const warn = (s) => { report.push(s); console.warn('  ! ' + s); };

/* ------------------------------------------------------------------ */
/* users                                                               */
/* ------------------------------------------------------------------ */

const userId = (cuId) => uuid('user', cuId);
const sql = [];

sql.push('-- Generated by scripts/clickup-load.mjs. Do not edit by hand.');
sql.push('-- Re-runnable: every row upserts on a deterministic id.');
sql.push('--');
sql.push('-- Run it through `npm run db:load`, which pins PGCLIENTENCODING. Every');
sql.push('-- task name here is Thai, and psql otherwise picks the console codepage');
sql.push('-- when stdout is redirected, which fails on the first non-Latin byte.');
sql.push(String.raw`\encoding UTF8`);
sql.push('BEGIN;');
sql.push('');
sql.push('-- ---- users ----');
for (const m of members) {
  sql.push(
    `INSERT INTO pmt_users (user_id, user_email, user_full_name) VALUES (${q(userId(m.id))}, ${q(m.email)}, ${q(m.username)})\n` +
    `  ON CONFLICT (user_id) DO UPDATE SET user_full_name = EXCLUDED.user_full_name, user_updated_at = now();`
  );
}

/* ------------------------------------------------------------------ */
/* project                                                             */
/* ------------------------------------------------------------------ */

const PROJECT_ID = uuid('project', listEntry.id);
const PROJECT_ROOT = uuid('node', `root:${listEntry.id}`);

sql.push('', '-- ---- project ----');
sql.push(
  `INSERT INTO pmt_projects (project_id, project_name, project_slug, project_description)\n` +
  `VALUES (${q(PROJECT_ID)}, ${q(PROJECT_NAME)}, ${q(PROJECT_SLUG)}, ${q(`Imported from ClickUp list ${listEntry.id} on ${new Date().toISOString().slice(0, 10)}`)})\n` +
  `  ON CONFLICT (project_id) DO UPDATE SET project_name = EXCLUDED.project_name, project_updated_at = now();`
);

/* ------------------------------------------------------------------ */
/* field definitions                                                   */
/* ------------------------------------------------------------------ */

sql.push('', '-- ---- field definitions ----');

const fieldUuid = new Map();      // clickup field id -> our uuid
const optionUuid = new Map();     // `${fieldId}:${orderindex}` -> our uuid
let position = 0;
let statusFieldUuid = null;

function emitField({ key, name, kind, settings = {}, archived = false, options = [] }) {
  const fid = uuid('field', key);
  fieldUuid.set(key, fid);
  sql.push(
    `INSERT INTO pmt_field_definitions (field_id, field_project_id, field_name, field_kind, field_position, field_settings, field_archived_at)\n` +
    `VALUES (${q(fid)}, ${q(PROJECT_ID)}, ${q(name)}, ${q(kind)}::pm_field_kind, ${position++}, ${qj(settings)}, ${archived ? 'now()' : 'NULL'})\n` +
    `  ON CONFLICT (field_id) DO UPDATE SET field_name = EXCLUDED.field_name, field_position = EXCLUDED.field_position, field_archived_at = EXCLUDED.field_archived_at, field_updated_at = now();`
  );
  for (const o of options) {
    const oid = uuid('option', `${key}:${o.orderindex}`);
    optionUuid.set(`${key}:${o.orderindex}`, oid);
    sql.push(
      `INSERT INTO pmt_field_options (option_id, option_field_id, option_label, option_color_index, option_stage, option_position)\n` +
      `VALUES (${q(oid)}, ${q(fid)}, ${q(o.label)}, ${(o.orderindex % 6) + 1}, ${o.stage ? `'${o.stage}'::pm_stage_kind` : 'NULL'}, ${o.orderindex})\n` +
      `  ON CONFLICT (option_id) DO UPDATE SET option_label = EXCLUDED.option_label, option_stage = EXCLUDED.option_stage;`
    );
  }
  return fid;
}

for (const f of fieldDefs) {
  if (DROP_FIELDS.has(f.name)) {
    report.push(`Dropped field \`${f.name}\` — zero values in the source (spec 06 §3.2).`);
    continue;
  }
  const kind = CLICKUP_TYPE_TO_KIND[f.type];
  if (!kind) {
    warn(`Unmapped ClickUp field type \`${f.type}\` on \`${f.name}\` — not imported.`);
    continue;
  }

  const settings = {};
  if (kind === 'money') {
    const source = f.type_config?.currency_type ?? 'THB';
    const override = CURRENCY_OVERRIDES[f.name];
    settings.currency = override ?? source;

    if (override && override !== source) {
      report.push(`\`${f.name}\` is configured as **${source}** in ClickUp, which is its untouched default. Imported as **${override}** on the owner's confirmation. The amounts are unchanged — only the label.`);
    } else if (settings.currency !== 'THB') {
      warn(`\`${f.name}\` is configured as **${settings.currency}**, not THB. Imported as-is — confirm the stored amounts really are that currency.`);
    }
  }
  if (kind === 'number' && f.type_config?.precision != null) settings.precision = f.type_config.precision;

  const options = (f.type_config?.options ?? []).map((o) => ({
    orderindex: o.orderindex,
    label: RELABEL[o.name ?? o.label] ?? (o.name ?? o.label),
    stage: f.name === 'Task Status' ? TASK_STATUS_STAGES[o.orderindex] ?? null : null,
  }));

  const fid = emitField({
    key: f.id,
    name: f.name,
    kind,
    settings,
    archived: ARCHIVE_FIELDS.has(f.name),
    options,
  });
  if (f.name === 'Task Status') statusFieldUuid = fid;
}

// Synthesised fields — things ClickUp models as built-ins but we model as fields.
const statusOrder = [...new Set(tasks.map((t) => t.status.status))]
  .map((s, i) => ({ orderindex: i, label: s, stage: null }));
const SYN = (name) => `synthetic:${listEntry.id}:${name}`;   // scoped to this list

emitField({
  key: SYN('clickup-status'),
  name: 'ClickUp Status',
  kind: 'select',
  archived: true,             // a module tag, not a lifecycle (§07 §3)
  options: statusOrder,
});

// A synthesised column nobody uses is clutter in every row of the grid, so
// it is only created when the source list actually carries the data.
const tagNames = [...new Set(tasks.flatMap((t) => (t.tags ?? []).map((x) => x.name)))].sort();
const taggedCount = tasks.filter((t) => (t.tags ?? []).length).length;
if (tagNames.length) {
  emitField({
    key: SYN('tags'),
    name: 'Tags',
    kind: 'multi_select',
    options: tagNames.map((n, i) => ({ orderindex: i, label: n, stage: null })),
  });
  report.push(`Imported ClickUp tags as a \`multi_select\` field with ${tagNames.length} options, used by ${taggedCount} tasks. The specs never mentioned tags; without this the data would have been lost silently.`);
} else {
  report.push('No tags in this list, so no Tags column was created.');
}

const assignedCount = tasks.filter((t) => (t.assignees ?? []).length).length;
if (assignedCount) {
  emitField({ key: SYN('assignee'), name: 'Assignee', kind: 'people', settings: { multiple: true } });
  report.push(`Imported assignees as a \`people\` field, used by ${assignedCount} of ${tasks.length} tasks. \`pmt_nodes\` has no assignee column, though spec 03 §2.1 listed one — modelling it as a field needs no schema change.`);
} else {
  report.push('No assignees in this list, so no Assignee column was created.');
}

sql.push('', '-- ---- designate the status field (D-35, spec 06 §3.2b) ----');
if (statusFieldUuid) {
  sql.push(`UPDATE pmt_projects SET project_status_field_id = ${q(statusFieldUuid)} WHERE project_id = ${q(PROJECT_ID)};`);
} else {
  // D-35 permits a project with no status field; automatic actual capture is
  // simply inert there. Worth saying out loud rather than leaving to be noticed.
  sql.push('-- This list has no Task Status column, so the project has no status');
  sql.push('-- field and automatic actual capture does nothing in it (D-35).');
  report.push('**No `Task Status` column in this list**, so no status field was designated. Automatic actual capture (D-13) is inert for this project until an admin creates a select column and designates it in Settings.');
}

/* ------------------------------------------------------------------ */
/* the tree                                                            */
/* ------------------------------------------------------------------ */

const byId = new Map(tasks.map((t) => [t.id, t]));
function depthOf(t, seen = new Set()) {
  const p = t.parent;
  if (!p || !byId.has(p) || seen.has(t.id)) return 2;   // roots are modules (depth 2)
  seen.add(t.id);
  return 1 + depthOf(byId.get(p), seen);
}

sql.push('', '-- ---- project root node (depth 1) ----');
sql.push(
  `INSERT INTO pmt_nodes (node_id, node_project_id, node_parent_id, node_depth, node_name, node_sort_order, node_custom_values)\n` +
  `VALUES (${q(PROJECT_ROOT)}, ${q(PROJECT_ID)}, NULL, 1, ${q(PROJECT_NAME)}, 0, ${qj({ _clickup_id: `list:${listEntry.id}` })})\n` +
  `  ON CONFLICT (node_id) DO UPDATE SET node_name = EXCLUDED.node_name, node_updated_at = now();`
);

sql.push('', '-- ---- nodes ----');

const counts = { total: 0, byDepth: {}, tooDeep: [], noDates: 0, actualEnd: 0, inverted: [] };
const ordered = [...tasks].sort((a, b) => depthOf(a) - depthOf(b) || String(a.orderindex).localeCompare(String(b.orderindex)));

for (const t of ordered) {
  const d = depthOf(t);
  counts.byDepth[d] = (counts.byDepth[d] ?? 0) + 1;

  if (d > MAX_DEPTH) {
    counts.tooDeep.push(t);
    continue;                                   // reported, never silently collapsed (§3.4)
  }

  const parent = t.parent && byId.has(t.parent) ? uuid('node', t.parent) : PROJECT_ROOT;

  const estStart = bkkDate(t.start_date);
  const estEnd = bkkDate(t.due_date);
  const actEnd = bkkDate(t.date_done ?? t.date_closed);
  if (!estStart && !estEnd) counts.noDates++;
  if (actEnd) counts.actualEnd++;
  if (estStart && estEnd && estEnd < estStart) { counts.inverted.push(t); continue; }

  // custom values
  const cv = { _clickup_id: t.id };
  for (const f of t.custom_fields ?? []) {
    if (DROP_FIELDS.has(f.name)) continue;
    const fid = fieldUuid.get(f.id);
    if (!fid) continue;
    const v = f.value;
    if (v === null || v === undefined || v === '') continue;

    switch (CLICKUP_TYPE_TO_KIND[f.type]) {
      case 'select': {
        // ClickUp stores the option's orderindex, NOT its id (spec 06 §3.2)
        const oid = optionUuid.get(`${f.id}:${Number(v)}`);
        if (oid) cv[fid] = oid;
        else warn(`Task ${t.id} holds \`${f.name}\` = ${JSON.stringify(v)} with no matching option.`);
        break;
      }
      case 'money':
        cv[fid] = {
          amount: Number(v),
          currency: CURRENCY_OVERRIDES[f.name] ?? f.type_config?.currency_type ?? 'THB',
        };
        break;
      case 'number':
        cv[fid] = Number(v);
        break;
      case 'checkbox':
        cv[fid] = v === true || v === 'true';
        break;
      case 'date':
        cv[fid] = bkkDate(v);
        break;
      default:
        cv[fid] = v;
    }
  }

  // synthesised values
  const statusOpt = optionUuid.get(`${SYN('clickup-status')}:${statusOrder.findIndex((s) => s.label === t.status.status)}`);
  if (statusOpt) cv[fieldUuid.get(SYN('clickup-status'))] = statusOpt;

  const tagField = fieldUuid.get(SYN('tags'));
  if (tagField) {
    const tagVals = (t.tags ?? [])
      .map((x) => optionUuid.get(`${SYN('tags')}:${tagNames.indexOf(x.name)}`))
      .filter(Boolean);
    if (tagVals.length) cv[tagField] = tagVals;
  }

  const assigneeField = fieldUuid.get(SYN('assignee'));
  if (assigneeField) {
    const asg = (t.assignees ?? []).map((a) => userId(a.id));
    if (asg.length) cv[assigneeField] = asg;
  }

  // Actual end is snapped by the DATABASE so the holiday calendar stays the
  // single source of truth (D-15). The raw value is preserved untouched.
  sql.push(
    `INSERT INTO pmt_nodes (node_id, node_project_id, node_parent_id, node_depth, node_name, node_sort_order,\n` +
    `                       node_estimate_start, node_estimate_end,\n` +
    `                       node_actual_end, node_actual_end_raw, node_actual_source_end,\n` +
    `                       node_custom_values)\n` +
    `VALUES (${q(uuid('node', t.id))}, ${q(PROJECT_ID)}, ${q(parent)}, ${d}, ${q(t.name)}, ${Number(t.orderindex) || 0},\n` +
    `        ${qd(estStart)}, ${qd(estEnd)},\n` +
    `        ${actEnd ? `pmf_next_workday(DATE '${actEnd}')` : 'NULL'}, ${qd(actEnd)}, ${actEnd ? `'auto'::pm_source_kind` : 'NULL'},\n` +
    `        ${qj(cv)})\n` +
    `  ON CONFLICT (node_id) DO UPDATE SET\n` +
    `    node_parent_id = EXCLUDED.node_parent_id, node_depth = EXCLUDED.node_depth,\n` +
    `    node_name = EXCLUDED.node_name, node_sort_order = EXCLUDED.node_sort_order,\n` +
    `    node_estimate_start = EXCLUDED.node_estimate_start, node_estimate_end = EXCLUDED.node_estimate_end,\n` +
    `    node_actual_end = EXCLUDED.node_actual_end, node_actual_end_raw = EXCLUDED.node_actual_end_raw,\n` +
    `    node_actual_source_end = EXCLUDED.node_actual_source_end,\n` +
    `    node_custom_values = EXCLUDED.node_custom_values, node_updated_at = now();`
  );
  counts.total++;
}

sql.push('', 'COMMIT;');

/* ------------------------------------------------------------------ */
/* write out                                                           */
/* ------------------------------------------------------------------ */

// The list slug is part of the directory name: two runs in the same second
// otherwise overwrite each other, which is easy to miss and hard to explain.
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join('data', 'import', `${stamp}-${PROJECT_SLUG}`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'load.sql'), sql.join('\n') + '\n', 'utf8');

const md = [
  `# Import report — ${stamp}`,
  '',
  `Source capture: \`${dir}\``,
  `Generated SQL: \`${join(out, 'load.sql')}\``,
  '',
  '## Counts',
  '',
  '| | |',
  '|---|---|',
  `| Source tasks in \`${IMPORT_LIST}\` | ${tasks.length} |`,
  `| Nodes written (plus 1 project root) | ${counts.total} |`,
  `| Field definitions | ${fieldUuid.size} |`,
  `| Select options | ${optionUuid.size} |`,
  `| Users | ${members.length} |`,
  `| Tasks with no dates at all | ${counts.noDates} |`,
  `| Tasks with an actual end date | ${counts.actualEnd} |`,
  '',
  '### Depth distribution',
  '',
  '| Depth | Nodes |',
  '|---|---|',
  ...Object.keys(counts.byDepth).sort().map((d) => `| ${d} | ${counts.byDepth[d]} |`),
  '',
  '## Requires a human',
  '',
  counts.tooDeep.length
    ? `### ${counts.tooDeep.length} nodes exceed depth ${MAX_DEPTH} and were NOT imported\n\n` +
      counts.tooDeep.map((t) => `- \`${t.id}\` ${t.name}`).join('\n')
    : `- No node exceeded depth ${MAX_DEPTH}.`,
  '',
  counts.inverted.length
    ? `### ${counts.inverted.length} tasks have \`due_date\` before \`start_date\` and were NOT imported\n\n` +
      counts.inverted.map((t) => `- \`${t.id}\` ${t.name}`).join('\n')
    : '- No inverted date ranges.',
  '',
  ...(report.length ? ['### Notes', '', ...report.map((r) => `- ${r}`)] : []),
  '',
  '## Not imported, by decision',
  '',
  `- Every ClickUp list other than \`${IMPORT_LIST}\`. Each imported list becomes its own project; run this script again with another list name.`,
  '- `Completion Criteria`, `Next Steps` — zero values in the source',
  '- Comments — captured, and declined outright rather than deferred (PRD §3)',
  '',
  '## `node_actual_start` is empty everywhere',
  '',
  'ClickUp has no actual-start concept and none was invented (spec 06 §3.3). Start misclosure is therefore unavailable for all historical work, and only begins accumulating once the new system is in use.',
].join('\n');

writeFileSync(join(out, 'report.md'), md, 'utf8');

console.log(`\nNodes:   ${counts.total}`);
console.log(`Fields:  ${fieldUuid.size}   Options: ${optionUuid.size}`);
console.log(`Too deep: ${counts.tooDeep.length}   Inverted: ${counts.inverted.length}`);
console.log(`\nWrote ${join(out, 'load.sql')}`);
console.log(`Read  ${join(out, 'report.md')} before running it.`);
