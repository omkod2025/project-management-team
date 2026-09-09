import { Fragment, Slice, type Schema } from '@tiptap/pm/model';
import { handlePaste as pasteTableCells } from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';

/** Excel's text clipboard is TSV, with quoted multiline cells and doubled quotes. */
export function parseSpreadsheetText(text: string): string[][] | null {
  if (!text.includes('\t')) return null;
  if (text.length > 200_000) throw new Error('This table is too large. Paste a smaller range of cells.');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closedQuote = false, separated = false;
  const finishCell = () => { row.push(cell); cell = ''; closedQuote = false; };
  const finishRow = () => {
    finishCell(); rows.push(row); row = [];
    if (rows.length > 500) throw new Error('Paste at most 500 spreadsheet rows at a time.');
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else if (char === '\r') { cell += '\n'; if (text[i + 1] === '\n') i++; }
      else cell += char;
    } else if (char === '\t') {
      separated = true; finishCell();
      if (row.length >= 100) throw new Error('Paste at most 100 spreadsheet columns at a time.');
    } else if (char === '\r' || char === '\n') {
      finishRow(); if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"' && !cell && !closedQuote) quoted = true;
    else {
      if (closedQuote) return null; // Not a well-formed spreadsheet range.
      cell += char;
    }
  }
  if (quoted || !separated) return null;
  if (cell || row.length || closedQuote) finishRow();
  const width = Math.max(...rows.map(item => item.length));
  if (width * rows.length > 5000) throw new Error('Paste at most 5,000 spreadsheet cells at a time.');
  return rows.map(item => [...item, ...Array<string>(width - item.length).fill('')]);
}

export function spreadsheetSlice(text: string, schema: Schema): Slice | null {
  const rows = parseSpreadsheetText(text);
  if (!rows) return null;
  const table = schema.node('table', null, rows.map(row => schema.node('tableRow', null,
    row.map(cell => schema.node('tableCell', null,
      cell.split('\n').map(line => schema.node('paragraph', null, line ? schema.text(line) : undefined)),
    )),
  )));
  return new Slice(Fragment.from(table), 0, 0);
}

export function sliceHasTable(slice: Slice): boolean {
  let found = false;
  slice.content.descendants(node => { if (node.type.spec.tableRole) found = true; return !found; });
  return found;
}

export function pasteSpreadsheetText(view: EditorView, event: ClipboardEvent): boolean {
  const slice = spreadsheetSlice(event.clipboardData?.getData('text/plain') ?? '', view.state.schema);
  if (!slice) return false;
  // Within an existing table, replace/grow cells instead of nesting a new table.
  if (!pasteTableCells(view, event, slice)) {
    view.dispatch(view.state.tr.replaceSelection(slice).setMeta('paste', true).setMeta('uiEvent', 'paste').scrollIntoView());
  }
  return true;
}
