import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import { Alignment, Banner, Column, Columns, Highlight, TextColor, Toggle, LinkButton, Embed, TableOfContents, FocusBlock } from './doc-rich-extensions.ts';

// GFM tables contain inline content; refuse block layouts and merged cells.
export function docEditorExtensions(rich = false) {
  return [
    StarterKit.configure({ underline: rich ? {} : false, strike: rich ? {} : false, link: { openOnClick: false }, trailingNode: false }),
    Markdown,
    TableKit.configure({ table: { resizable: false }, tableCell: false, tableHeader: false }),
    rich ? TableCell : TableCell.extend({ content: 'paragraph' }), rich ? TableHeader : TableHeader.extend({ content: 'paragraph' }),
    TaskList, TaskItem.configure({ nested: true }), Image.configure({ allowBase64: false }),
    ...(rich ? [TextColor, Highlight, Alignment, Banner, Toggle, Columns, Column, LinkButton, Embed, TableOfContents, FocusBlock] : []),
  ];
}
