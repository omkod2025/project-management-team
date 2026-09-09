import test from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { docEditorExtensions } from '../src/lib/doc-editor-extensions.ts';
import { parseSpreadsheetText, spreadsheetSlice, sliceHasTable } from '../src/lib/doc-table-paste.ts';
import { encodeRich, decodeRich } from '../src/lib/doc-rich-content.ts';

test('TSV preserves Thai text, blank cells, leading zeros and displayed numeric values', () => {
  assert.deepEqual(parseSpreadsheetText('รหัส\tจำนวน\tหมายเหตุ\r\n0012\t1,234.50\t\r\n'), [
    ['รหัส', 'จำนวน', 'หมายเหตุ'], ['0012', '1,234.50', ''],
  ]);
  assert.deepEqual(parseSpreadsheetText('a\tb\n\n'), [['a', 'b'], ['', '']]);
});

test('Excel quoted fields preserve embedded tabs, line breaks and escaped quotes', () => {
  assert.deepEqual(parseSpreadsheetText('"บรรทัด 1\r\nบรรทัด 2"\t"พูดว่า ""ใช่"""\r\n"a\tb"\tend'), [
    ['บรรทัด 1\nบรรทัด 2', 'พูดว่า "ใช่"'], ['a\tb', 'end'],
  ]);
});

test('ordinary text is not turned into a table and oversized ranges are refused', () => {
  assert.equal(parseSpreadsheetText('Paragraph one\nParagraph two'), null);
  assert.equal(parseSpreadsheetText('"only\tone quoted cell"'), null);
  assert.equal(parseSpreadsheetText('"unfinished\tcell'), null);
  assert.throws(() => parseSpreadsheetText(('a\tb\n').repeat(501)), /500/);
  assert.throws(() => parseSpreadsheetText(Array(101).fill('cell').join('\t')), /100/);
});

test('spreadsheet slices use the editable table schema and serialize without interpreting HTML', () => {
  const schema = getSchema(docEditorExtensions(true));
  const slice = spreadsheetSlice('<script>alert(1)</script>\t001\n"multi\nline"\t', schema)!;
  assert.ok(sliceHasTable(slice));
  const doc = schema.node('doc', null, slice.content);
  assert.doesNotThrow(() => doc.check());
  assert.deepEqual(decodeRich(encodeRich(doc.toJSON())), JSON.parse(JSON.stringify(doc.toJSON())));
  assert.equal(doc.firstChild!.firstChild!.firstChild!.textContent, '<script>alert(1)</script>');
  assert.equal(doc.firstChild!.child(1).firstChild!.childCount, 2);
});
