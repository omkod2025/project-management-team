import { Extension } from '@tiptap/core';
import type { Command } from '@tiptap/pm/state';
import { isInTable, selectedRect } from '@tiptap/pm/tables';
import { safeColor } from './doc-rich-content.ts';
import { normalizedColor } from './doc-rich-extensions.ts';

export const TableBackground = Extension.create({
  name: 'tableBackground',
  addGlobalAttributes: () => [{
    types: ['tableCell', 'tableHeader'],
    attributes: { filterEnabled: {
      default: false,
      parseHTML: element => element.getAttribute('data-filter-enabled') === 'true',
      renderHTML: attrs => attrs.filterEnabled ? { 'data-filter-enabled': 'true' } : {},
    }, backgroundColor: {
      default: null,
      parseHTML: element => normalizedColor(element.style.backgroundColor, '') || null,
      renderHTML: attrs => safeColor(attrs.backgroundColor) ? { style: `background-color:${attrs.backgroundColor}` } : {},
    } },
  }],
});

/** Paint cells intersecting the selected rows/columns, including merged cells. */
export function colorTableBand(axis: 'row' | 'column', color: string | null): Command {
  return (state, dispatch) => {
    if (!isInTable(state) || (color !== null && !safeColor(color))) return false;
    const rect = selectedRect(state);
    const positions = new Set<number>();
    for (let row = axis === 'row' ? rect.top : 0; row < (axis === 'row' ? rect.bottom : rect.map.height); row++) {
      for (let col = axis === 'column' ? rect.left : 0; col < (axis === 'column' ? rect.right : rect.map.width); col++) {
        const offset = rect.map.map[row * rect.map.width + col];
        if (offset !== undefined) positions.add(rect.tableStart + offset);
      }
    }
    if (dispatch) {
      const tr = state.tr;
      for (const pos of positions) {
        const cell = tr.doc.nodeAt(pos)!;
        tr.setNodeMarkup(pos, undefined, { ...cell.attrs, backgroundColor: color });
      }
      dispatch(tr);
    }
    return true;
  };
}
