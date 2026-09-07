#!/usr/bin/env node
/**
 * clickup-diff.mjs — compare two raw ClickUp captures.
 *
 *   node scripts/clickup-diff.mjs [older] [newer]
 *
 * With no arguments it compares the two most recent captures.
 *
 * The point is not curiosity. A second capture taken before the trial lapses
 * is the last chance to catch anything the first one missed or that changed in
 * between, and "nothing changed" is only reassuring if something checked.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const base = join('data', 'clickup-raw');
const runs = readdirSync(base).sort();

const older = process.argv[2] ?? runs[runs.length - 2];
const newer = process.argv[3] ?? runs[runs.length - 1];

if (!older || !newer || older === newer) {
  console.error('Need two captures to compare. Found:', runs.join(', '));
  process.exit(1);
}

const load = (run) => {
  const dir = join(base, run);
  const taskDir = join(dir, 'task');
  if (!existsSync(taskDir)) return { run, tasks: new Map(), fields: new Map() };

  const tasks = new Map();
  for (const file of readdirSync(taskDir)) {
    if (!file.endsWith('.json') || file.endsWith('.comments.json')) continue;
    const t = JSON.parse(readFileSync(join(taskDir, file), 'utf8'));
    tasks.set(t.id, t);
  }

  const fields = new Map();
  for (const entry of readdirSync(dir)) {
    if (!entry.startsWith('list-')) continue;
    const p = join(dir, entry, 'fields.json');
    if (!existsSync(p)) continue;
    for (const f of JSON.parse(readFileSync(p, 'utf8')).fields ?? []) {
      fields.set(`${entry}:${f.id}`, f);
    }
  }
  return { run, tasks, fields };
};

const a = load(older);
const b = load(newer);

console.log(`older: ${older}  (${a.tasks.size} tasks)`);
console.log(`newer: ${newer}  (${b.tasks.size} tasks)\n`);

/* ---------------------------------------------------------------- tasks */

const added = [...b.tasks.keys()].filter((id) => !a.tasks.has(id));
const removed = [...a.tasks.keys()].filter((id) => !b.tasks.has(id));

// The fields whose change would alter what the product shows. Everything else
// (view counts, last-viewed timestamps) is noise for this purpose.
const WATCHED = ['name', 'parent', 'start_date', 'due_date', 'date_done', 'date_closed'];

const changed = [];
for (const [id, before] of a.tasks) {
  const after = b.tasks.get(id);
  if (!after) continue;

  const diffs = [];
  for (const key of WATCHED) {
    if (String(before[key] ?? '') !== String(after[key] ?? '')) {
      diffs.push(`${key}: ${before[key] ?? '—'} → ${after[key] ?? '—'}`);
    }
  }

  if (String(before.status?.status) !== String(after.status?.status)) {
    diffs.push(`status: ${before.status?.status} → ${after.status?.status}`);
  }

  const valueOf = (task, name) =>
    task.custom_fields?.find((f) => f.name === name)?.value ?? null;
  const names = new Set([
    ...(before.custom_fields ?? []).map((f) => f.name),
    ...(after.custom_fields ?? []).map((f) => f.name),
  ]);
  for (const name of names) {
    const x = JSON.stringify(valueOf(before, name));
    const y = JSON.stringify(valueOf(after, name));
    if (x !== y) diffs.push(`${name}: ${x} → ${y}`);
  }

  if (diffs.length) changed.push({ id, name: after.name, diffs });
}

console.log(`Added:   ${added.length}`);
for (const id of added) console.log(`  + ${b.tasks.get(id).name}`);

console.log(`Removed: ${removed.length}`);
for (const id of removed) console.log(`  − ${a.tasks.get(id).name}`);

console.log(`Changed: ${changed.length}`);
for (const c of changed) {
  console.log(`  ~ ${c.name}`);
  for (const d of c.diffs) console.log(`      ${d}`);
}

/* --------------------------------------------------------------- fields */

const fieldsAdded = [...b.fields.keys()].filter((k) => !a.fields.has(k));
const fieldsRemoved = [...a.fields.keys()].filter((k) => !b.fields.has(k));

console.log(`\nField definitions added:   ${fieldsAdded.length}`);
for (const k of fieldsAdded) console.log(`  + ${b.fields.get(k).name}`);
console.log(`Field definitions removed: ${fieldsRemoved.length}`);
for (const k of fieldsRemoved) console.log(`  − ${a.fields.get(k).name}`);

const optionChanges = [];
for (const [k, before] of a.fields) {
  const after = b.fields.get(k);
  if (!after) continue;
  const labels = (f) => (f.type_config?.options ?? []).map((o) => `${o.orderindex}:${o.name ?? o.label}`).join(', ');
  if (labels(before) !== labels(after)) {
    optionChanges.push(`  ~ ${after.name}\n      ${labels(before)}\n      ${labels(after)}`);
  }
}
console.log(`Option sets changed:       ${optionChanges.length}`);
for (const line of optionChanges) console.log(line);

const quiet =
  !added.length && !removed.length && !changed.length &&
  !fieldsAdded.length && !fieldsRemoved.length && !optionChanges.length;

console.log(`\n${quiet ? 'Identical. The first capture is complete and current.' : 'Differences above — the newer capture is the one to import from.'}`);
