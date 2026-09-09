import test from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { docEditorExtensions } from '../src/lib/doc-editor-extensions.ts';
import { encodeRich, decodeRich } from '../src/lib/doc-rich-content.ts';
const schema = getSchema(docEditorExtensions(true));
for (const name of ['table', 'orderedList']) {
  test(`editor-generated ${name} can be saved without removing attributes`, () => {
    const node = name === 'table' ? schema.nodes.table!.create(null, [schema.nodes.tableRow!.create(null, [schema.nodes.tableCell!.createAndFill()!])]) : schema.nodes[name]!.createAndFill()!;
    const tree = schema.nodes.doc!.create(null,[node]).toJSON();
    assert.deepEqual(decodeRich(encodeRich(tree)),JSON.parse(JSON.stringify(tree)));
  });
}
