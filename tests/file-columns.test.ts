import test from 'node:test';
import assert from 'node:assert/strict';
import { coerceValue } from '../src/lib/node-rules.ts';
import { MAX_FILE_FIELD_BYTES } from '../src/lib/upload-limits.ts';

const field = { id: 'files', kind: 'file' as const, archived: false };
const url = '/api/doc-assets/12345678-1234-1234-1234-123456789abc';
const other = '/api/doc-assets/87654321-4321-4321-4321-cba987654321';
const attachment = (over: Partial<{ url: string; name: string; bytes: number }> = {}) =>
  ({ url, name: 'budget.xlsx', bytes: 1024, ...over });

test('file columns store bounded, local attachments with a name and a size', () => {
  assert.deepEqual(coerceValue(field, [attachment()]), [{ url, name: 'budget.xlsx', bytes: 1024 }]);
  assert.deepEqual(coerceValue(field, []), []);
  assert.equal(coerceValue(field, null), null);
});

test('a repeated attachment is kept once, in the order it first appeared', () => {
  assert.deepEqual(
    coerceValue(field, [attachment(), attachment({ url: other, name: 'plan.pdf' }), attachment()]),
    [{ url, name: 'budget.xlsx', bytes: 1024 }, { url: other, name: 'plan.pdf', bytes: 1024 }],
  );
});

test('a file cell refuses anything that is not an attachment this server issued', () => {
  for (const value of [
    url,                                              // the bare URL an image column would store
    [url],
    [attachment({ url: 'https://example.com/a.pdf' })],
    [attachment({ url: 'javascript:alert(1)' })],
    [attachment({ name: '' })],
    [attachment({ name: '   ' })],
    [{ url, bytes: 1024 }],
    [{ url, name: 'a.pdf' }],
    [[url, 'a.pdf', 1]],
    [null],
    Array(21).fill(attachment()),
  ]) {
    assert.throws(() => coerceValue(field, value as unknown));
  }
});

test('20 MB is the ceiling a file cell will record, and zero is not a file', () => {
  assert.deepEqual(coerceValue(field, [attachment({ bytes: MAX_FILE_FIELD_BYTES })]), [{ url, name: 'budget.xlsx', bytes: MAX_FILE_FIELD_BYTES }]);
  assert.equal(MAX_FILE_FIELD_BYTES, 20 * 1024 * 1024);
  for (const bytes of [0, -1, 1.5, MAX_FILE_FIELD_BYTES + 1]) {
    assert.throws(() => coerceValue(field, [attachment({ bytes })]));
  }
});

test('a stored file name is trimmed of control characters and bounded in length', () => {
  const raw = 'a' + String.fromCharCode(9) + 'b' + String.fromCharCode(127) + 'c'.padEnd(300, 'x');
  const saved = (coerceValue(field, [attachment({ name: raw })]) as { name: string }[])[0]!;
  assert.equal(saved.name.length, 200);
  assert.equal(saved.name.slice(0, 5), 'a b c');
});
