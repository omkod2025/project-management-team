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
