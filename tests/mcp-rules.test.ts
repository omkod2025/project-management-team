/**
 * The List tools' pure rules over MCP: which id a token may name, and the
 * patch an `update_task` call becomes. The patch must carry exactly the keys
 * the call gave — an estimate never fills an actual, nor the other way round
 * (CLAUDE.md, "The rule the product exists for"). Pure, no database.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  docPageContent, filterTasks, listColumns, scopedId, taskPatch, type TaskFilter,
} from '../src/lib/mcp-rules.ts';
import { contentMarkdown, encodeRich } from '../src/lib/doc-rich-content.ts';
import { MODULE_SECTIONS } from '../src/lib/doc-rules.ts';

const a = '0f8e2d4c-1b3a-4c5d-8e9f-a0b1c2d3e4f5';
const b = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('taskPatch', () => {
  test('an estimate end alone stays alone — no actual is derived from it', () => {
    const patch = taskPatch({ estimate_end: '2026-12-01' });
    assert.deepEqual(patch, { estimateEnd: '2026-12-01' });
    assert.equal('actualEnd' in patch, false);
  });

  test('null clears, and is carried as null', () => {
    assert.deepEqual(taskPatch({ actual_start: null }), { actualStart: null });
  });

  test('nothing given is nothing written', () => {
    assert.deepEqual(taskPatch({}), {});
  });

  test('every key maps snake to camel, values passed through', () => {
    assert.deepEqual(
      taskPatch({ name: 'งาน', estimate_start: '2026-01-01', actual_end: '2026-01-09', values: { f: 1 } }),
      { name: 'งาน', estimateStart: '2026-01-01', actualEnd: '2026-01-09', values: { f: 1 } },
    );
  });
});

describe('scopedId', () => {
  test('a uuid in scope, in any case, comes back lowercased', () => {
    assert.equal(scopedId([a], a.toUpperCase()), a);
  });

  test('malformed, absent from scope, or not a string is null', () => {
    assert.equal(scopedId([a], 'x'), null);
    assert.equal(scopedId([a], b), null);
    assert.equal(scopedId([a], 5), null);
    assert.equal(scopedId([a], undefined), null);
  });
});

describe('docPageContent', () => {
  const FILE_REMOVAL = /This edit would remove a file from the page/;
  const assetId = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
  const link = `[แผนผัง.pdf](/api/doc-assets/${assetId})`;
  const modulePage = Object.fromEntries(MODULE_SECTIONS.map(([key]) => [key, `เดิม ${key}`]));

  test('a plain Free page takes the new Markdown as its body', () => {
    assert.deepEqual(docPageContent({ body: 'เดิม' }, 'free', { markdown: 'ใหม่' }), { body: 'ใหม่' });
  });

  test('a section outside the template is refused', () => {
    assert.throws(() => docPageContent(modulePage, 'module', { section: 'body', markdown: 'x' }),
      /This section does not belong to the page template/);
    assert.throws(() => docPageContent({ body: '' }, 'free', { section: 'decisions', markdown: 'x' }),
      /This section does not belong to the page template/);
  });

  test('a known section changes that key only', () => {
    const next = docPageContent(modulePage, 'module', { section: 'decisions', markdown: 'ตัดสินใจแล้ว' });
    assert.equal(next.decisions, 'ตัดสินใจแล้ว');
    assert.deepEqual({ ...next, decisions: modulePage.decisions }, modulePage);
  });

  test('Markdown that drops a file link is refused; Markdown that keeps it passes', () => {
    const current = { body: `ดูไฟล์ ${link}` };
    assert.throws(() => docPageContent(current, 'free', { markdown: 'ไม่มีไฟล์' }), FILE_REMOVAL);
    assert.deepEqual(docPageContent(current, 'free', { markdown: `ไฟล์ยังอยู่ ${link}` }), { body: `ไฟล์ยังอยู่ ${link}` });
  });

  test('rich content with its Markdown unchanged comes back byte for byte', () => {
    const rich = encodeRich({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'สวัสดี' }] }] });
    const next = docPageContent({ body: rich }, 'free', { markdown: contentMarkdown(rich) });
    assert.equal(next.body, rich);
  });
});

describe('listColumns', () => {
  const opt = (id: string, label: string, archived = false) => ({ id, label, stage: null, archived });
  const fields = [
    { id: 'f-who', name: 'Assign', kind: 'people', position: 2, archived: false, options: [] },
    { id: 'f-status', name: 'สถานะ', kind: 'select', position: 1, archived: false,
      options: [{ ...opt('o1', 'กำลังทำ'), stage: 'inProgress' }, opt('o2', 'เลิกใช้', true)] },
    { id: 'f-old', name: 'Old', kind: 'select', position: 3, archived: true, options: [opt('z', 'Z')] },
  ];
  const people = [{ id: 'u1', name: 'Ann' }];

  test('the five row columns first, keyed as list_tasks rows carry them, then the fields as filed', () => {
    const cols = listColumns(fields, people, 'f-status');
    assert.deepEqual(cols.map((c) => c.id), [
      'name', 'estimateStart', 'estimateEnd', 'actualStart', 'actualEnd', 'module', 'f-status', 'f-who',
    ]);
    assert.equal(cols.slice(0, 6).every((c) => c.builtIn), true);
  });

  test('each column says how list_tasks filters it, and an amount says nothing', () => {
    const cols = listColumns(
      [...fields, { id: 'f-cost', name: 'Cost', kind: 'money', position: 4, archived: false, options: [] }],
      people, 'f-status', [{ id: 'm1', name: 'One' }],
    );
    const by = Object.fromEntries(cols.map((c) => [c.id, c.filter ?? null]));
    assert.deepEqual(by, {
      name: 'contains', estimateStart: 'range', estimateEnd: 'range', actualStart: 'range', actualEnd: 'range',
      module: 'values', 'f-status': 'values', 'f-who': 'values', 'f-cost': null,
    });
    assert.deepEqual(cols.find((c) => c.id === 'module')?.options, [{ id: 'm1', label: 'One' }]);
  });

  test('a select lists its options with stage, and an archived option says so', () => {
    const status = listColumns(fields, people, 'f-status').find((c) => c.id === 'f-status')!;
    assert.equal(status.status, true);
    assert.deepEqual(status.options, [
      { id: 'o1', label: 'กำลังทำ', stage: 'inProgress' },
      { id: 'o2', label: 'เลิกใช้', stage: null, archived: true },
    ]);
  });

  test('a people column offers the roster, and an archived field is left out', () => {
    const cols = listColumns(fields, people, null);
    assert.deepEqual(cols.find((c) => c.id === 'f-who')?.options, [{ id: 'u1', label: 'Ann' }]);
    assert.equal(cols.some((c) => c.id === 'f-old'), false);
    assert.equal(cols.some((c) => c.status), false);
  });
});

describe('list_tasks filters', () => {
  const S = '00000000-0000-4000-8000-00000000000';
  const ids = { root: `${S}0`, m1: `${S}1`, m2: `${S}2`, t1: `${S}3`, t2: `${S}4`, sub: `${S}5` };
  const doing = 'aaaaaaaa-0000-4000-8000-000000000001';
  const done = 'aaaaaaaa-0000-4000-8000-000000000002';
  const ann = 'bbbbbbbb-0000-4000-8000-000000000001';
  const ledger = {
    fields: [
      { id: 'f-status', name: 'สถานะ', kind: 'select', archived: false,
        options: [{ id: doing, label: 'กำลังทำ', archived: false }, { id: done, label: 'เสร็จ', archived: false }] },
      { id: 'f-who', name: 'Assign', kind: 'people', archived: false, options: [] },
      { id: 'f-ok', name: 'Signed off', kind: 'checkbox', archived: false, options: [] },
      { id: 'f-cost', name: 'Cost', kind: 'money', archived: false, options: [] },
    ],
    people: [{ id: ann, name: 'Ann' }],
    statusFieldId: 'f-status',
  };
  const node = (id: string, parent: string | null, depth: number, name: string, end: string | null, values = {}) => ({
    led_node_id: id, led_parent_id: parent, led_depth: depth, led_name: name,
    led_estimate_start: null, led_estimate_end: end, led_actual_start: null, led_actual_end: null,
    led_custom_values: values,
  });
  const rows = [
    node(ids.root, null, 1, 'Project', null),
    node(ids.m1, ids.root, 2, 'Front end', '2026-11-30'),
    node(ids.m2, ids.root, 2, 'Back end', null),
    node(ids.t1, ids.m1, 3, 'ออกแบบหน้า Login', '2026-11-20', { 'f-status': doing, 'f-who': [ann], 'f-ok': true }),
    node(ids.t2, ids.m2, 3, 'API login', '2026-12-05', { 'f-status': done }),
    node(ids.sub, ids.t1, 4, 'ปุ่ม Login', null, { 'f-status': doing }),
  ];
  const run = (filters?: TaskFilter[]) => filterTasks(rows, ledger, filters).map((r) => r.led_node_id);

  test('no filters: every row below the project root', () => {
    assert.deepEqual(run(), [ids.m1, ids.m2, ids.t1, ids.t2, ids.sub]);
    assert.deepEqual(run([]), run());
  });

  test('values inside a filter are OR, filters are AND', () => {
    assert.deepEqual(run([{ column: 'f-status', values: [doing, done] }]), [ids.t1, ids.t2, ids.sub]);
    assert.deepEqual(run([{ column: 'f-status', values: [doing] }, { column: 'f-who', values: [ann] }]), [ids.t1]);
  });

  test('null asks for the empty cell', () => {
    assert.deepEqual(run([{ column: 'f-status', values: [null] }]), [ids.m1, ids.m2]);
  });

  test('contains is LIKE: any case, % for any run', () => {
    assert.deepEqual(run([{ column: 'name', contains: 'login' }]), [ids.t1, ids.t2, ids.sub]);
    assert.deepEqual(run([{ column: 'name', contains: 'ออกแบบ%login' }]), [ids.t1]);
  });

  test('a range is inclusive and never holds an empty cell', () => {
    assert.deepEqual(run([{ column: 'estimateEnd', from: '2026-11-20', to: '2026-11-30' }]), [ids.m1, ids.t1]);
    assert.deepEqual(run([{ column: 'estimateEnd', to: '2026-12-31' }]), [ids.m1, ids.t1, ids.t2]);
  });

  test('module reaches every depth below it', () => {
    assert.deepEqual(run([{ column: 'module', values: [ids.m1] }]), [ids.m1, ids.t1, ids.sub]);
  });

  test('a checkbox takes true or false', () => {
    assert.deepEqual(run([{ column: 'f-ok', values: [true] }]), [ids.t1]);
    assert.equal(run([{ column: 'f-ok', values: [false] }]).includes(ids.t1), false);
  });

  test('ids are read in any case', () => {
    assert.deepEqual(run([{ column: 'f-status', values: [done.toUpperCase()] }]), [ids.t2]);
  });

  test('what cannot be obeyed is refused, never quietly widened', () => {
    const refused = (f: TaskFilter[], pattern: RegExp) =>
      assert.throws(() => run(f), (e: Error) => pattern.test(e.message));
    refused([{ column: 'nope', values: ['x'] }], /cannot be filtered/);
    refused([{ column: 'f-cost', values: ['1'] }], /cannot be filtered/);
    refused([{ column: 'f-status', values: ['not-an-option'] }], /not an option/);
    refused([{ column: 'f-status', contains: 'x' }], /filtered by values/);
    refused([{ column: 'name', values: ['x'] }], /filtered by contains/);
    refused([{ column: 'estimateEnd', from: '20/11/2026' }], /YYYY-MM-DD/);
    refused([{ column: 'estimateEnd' }], /from and\/or to/);
    refused([{ column: 'f-ok', values: ['yes'] }], /true or false/);
    refused([{ column: 'name', contains: '  ' }], /empty/);
    refused([{ column: 'f-status', values: [doing] }, { column: 'f-status', values: [done] }], /twice/);
  });

  test('a filter never reads an actual for an estimate', () => {
    const late = [...rows, { ...node(`${S}6`, ids.m1, 3, 'x', null), led_actual_end: '2026-11-25' }];
    const found = filterTasks(late, ledger, [{ column: 'estimateEnd', from: '2026-11-21', to: '2026-11-29' }]);
    assert.deepEqual(found.map((r) => r.led_node_id), []);
  });
});
