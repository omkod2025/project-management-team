import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { isInTable, selectedRect } from '@tiptap/pm/tables';

/** A non-document slot above the selected table keeps controls out of saved content. */
export const TableControls = Extension.create({
  name: 'tableControls',
  addProseMirrorPlugins() {
    return [new Plugin({ props: {
      decorations(state) {
        if (!isInTable(state)) return DecorationSet.empty;
        const position = selectedRect(state).tableStart - 1;
        return DecorationSet.create(state.doc, [Decoration.widget(position, () => {
          const slot = document.createElement('div');
          slot.className = 'doc-table-config-anchor';
          slot.contentEditable = 'false';
          return slot;
        }, { side: -1, key: `table-controls-${position}`, ignoreSelection: true, stopEvent: () => true })]);
      },
    } })];
  },
});
