import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNewDoc, parsePageContent, nextPageDepth, extendRevision, pageMarkdown } from '../src/lib/doc-rules.ts';

test('document creation preserves Thai and trims title and optional version', () => {
  assert.deepEqual(parseNewDoc({ title: '  ขอบเขตงาน  ', version: ' V.1.0.0 ' }), {
    title: 'ขอบเขตงาน', version: 'V.1.0.0',
  });
  assert.deepEqual(parseNewDoc({ title: 'Hardware' }), { title: 'Hardware', version: '' });
});

test('document creation refuses malformed input and missing or oversized titles', () => {
  for (const input of [null, [], 'title', {}, { title: '  ' }, { title: 123 }, { title: 'a'.repeat(201) }]) {
    assert.throws(() => parseNewDoc(input), { code: 'E_INVALID_DOC' });
  }
});

test('version stamp remains free text with bounded size', () => {
  assert.equal(parseNewDoc({ title: 'Scope', version: 'รุ่นทดลอง 2026' }).version, 'รุ่นทดลอง 2026');
  for (const version of [null, 12, {}, 'v'.repeat(101)]) {
    assert.throws(() => parseNewDoc({ title: 'Scope', version }), { code: 'E_INVALID_DOC' });
  }
});

test('D-54: page sections preserve Markdown and reject foreign or oversized data', () => {
  assert.deepEqual(parsePageContent({ body: '**ภาษาไทย**\n\n- [x] done' }, 'free'), { body: '**ภาษาไทย**\n\n- [x] done' });
  assert.throws(() => parsePageContent({ body: '', extra: 'lost?' }, 'free'));
  assert.throws(() => parsePageContent({ body: 'x'.repeat(200001) }, 'free'));
  assert.throws(() => parsePageContent({ body: '' }, 'module'));
});
test('D-50: pages stop at depth three', () => {
  assert.equal(nextPageDepth(null), 1); assert.equal(nextPageDepth(2), 3);
  assert.throws(() => nextPageDepth(3), { code: 'E_MAX_DEPTH' });
});
test('D-59: continuous edits collapse; changing editor or waiting opens another revision', () => {
  assert.equal(extendRevision('a', 'a', 0, 1000), true);
  assert.equal(extendRevision('a', 'b', 0, 1000), false);
  assert.equal(extendRevision('a', 'a', 0, 30 * 60 * 1000), false);
});
test('copying a Module page includes every section in order', () => {
  const markdown = pageMarkdown('module', { description: 'A', wantFeature: 'B', decisions: 'C', currentScope: 'D', nextPhase: 'E' });
  assert.match(markdown, /Description\n\nA[\s\S]*Want Feature\n\nB[\s\S]*Decisions\n\nC[\s\S]*Current Scope\n\nD[\s\S]*Next Phase\n\nE/);
});

test('D-61: deleting a page takes every level of its subpages, and nothing beside them', async () => {
  const { pageSubtree } = await import('../src/lib/doc-rules.ts');
  const pages = [
    { id: 'a', parentId: null }, { id: 'a1', parentId: 'a' }, { id: 'a1x', parentId: 'a1' },
    { id: 'a2', parentId: 'a' }, { id: 'b', parentId: null }, { id: 'b1', parentId: 'b' },
  ];
  assert.deepEqual([...pageSubtree(pages, 'a')].sort(), ['a', 'a1', 'a1x', 'a2']);
  assert.deepEqual([...pageSubtree(pages, 'a1x')], ['a1x']);
});

test('D-61: a subtree stops at a page left out, and never skips past it to its children', async () => {
  const { pageSubtree } = await import('../src/lib/doc-rules.ts');
  // Restoring 'a' brings back what was archived with it, not 'a1' archived earlier on its own.
  const pages = [
    { id: 'a', parentId: null, at: 2 }, { id: 'a1', parentId: 'a', at: 1 }, { id: 'a1x', parentId: 'a1', at: 2 },
    { id: 'a2', parentId: 'a', at: 2 },
  ];
  assert.deepEqual([...pageSubtree(pages, 'a', (p) => p.at === 2)].sort(), ['a', 'a2']);
});

test('D-61: the delete dialog counts the subpages that go, and names a protected one that stops it', async () => {
  const { pageDeletion, pageDeletionNote } = await import('../src/lib/doc-rules.ts');
  const pages = [
    { id: 'a', parentId: null, title: 'A' }, { id: 'a1', parentId: 'a', title: 'A1' },
    { id: 'a1x', parentId: 'a1', title: 'A1x', protected: true }, { id: 'b', parentId: null, title: 'B', protected: true },
  ];
  assert.deepEqual(pageDeletion(pages, 'a'), { subpages: 2, lockedBy: 'A1x' });
  assert.deepEqual(pageDeletion(pages, 'b'), { subpages: 0, lockedBy: null });
  assert.match(pageDeletionNote(2), /2 subpages are deleted with it/);
  assert.match(pageDeletionNote(1), /1 subpage is deleted/);
  assert.doesNotMatch(pageDeletionNote(0), /subpage/);
});

test('D-61: permanent deletion goes deepest first, and only through deleted pages', async () => {
  const { pagePurgeOrder } = await import('../src/lib/doc-rules.ts');
  const pages = [
    { id: 'a', parentId: null, depth: 1, archived: true }, { id: 'a1', parentId: 'a', depth: 2, archived: true },
    { id: 'a1x', parentId: 'a1', depth: 3, archived: true }, { id: 'a2', parentId: 'a', depth: 2, archived: true },
    { id: 'b', parentId: null, depth: 1, archived: false }, { id: 'c', parentId: null, depth: 1, archived: true },
    { id: 'c1', parentId: 'c', depth: 2, archived: false },
  ];
  const order = pagePurgeOrder(pages, 'a');
  assert.deepEqual([...order].sort(), ['a', 'a1', 'a1x', 'a2']);
  assert.equal(order[0], 'a1x');
  assert.equal(order.at(-1), 'a');
  assert.deepEqual(pagePurgeOrder(pages, 'a1x'), ['a1x']);
  assert.throws(() => pagePurgeOrder(pages, 'b'), (e: { code?: string }) => e.code === 'E_INVALID_DOC');
  assert.throws(() => pagePurgeOrder(pages, 'c'), (e: { code?: string }) => e.code === 'E_INVALID_DOC');
  assert.throws(() => pagePurgeOrder(pages, 'nope'), (e: { code?: string }) => e.code === 'E_NOT_FOUND');
});

test('D-61: the permanent-delete dialog says it cannot be undone and counts the subpages', async () => {
  const { pagePurgeNote, DOC_PURGE_NOTE } = await import('../src/lib/doc-rules.ts');
  assert.match(pagePurgeNote(0), /cannot be undone/);
  assert.doesNotMatch(pagePurgeNote(0), /subpage/);
  assert.match(pagePurgeNote(1), /Its 1 deleted subpage goes with it/);
  assert.match(pagePurgeNote(3), /Its 3 deleted subpages go with it/);
  assert.match(DOC_PURGE_NOTE, /cannot be undone/);
});
