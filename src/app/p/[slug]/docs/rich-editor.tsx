'use client';
import { MAX_UPLOAD_BYTES } from '@/lib/upload-limits';
import DocIcon from "./doc-icon";
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { ChainedCommands } from '@tiptap/core';
import {TextSelection} from '@tiptap/pm/state';
import { docEditorExtensions } from '@/lib/doc-editor-extensions';
import EditorToolbar from './editor-toolbar';
import { downloadDocFile, isDocAssetLink } from '@/lib/doc-download';
import { decodeRich, encodeRich, RICH_PREFIX, safeEmbed } from '@/lib/doc-rich-content';

export default function RichEditor({ value, label, onChange, projectId, onProblem, onUploadChange, autoFocus = false }: {
  value: string; label: string; onChange: (value: string) => void; projectId: string; onProblem: (message: string) => void; onUploadChange: (delta: number) => void; autoFocus?: boolean;
}) {
  const [toolbarPosition, setToolbarPosition] = useState<'floating' | 'top'>('floating');
  const [inserting, setInserting] = useState(false);
  const [insertQuery, setInsertQuery] = useState('');
  const [anchor, setAnchor] = useState({ left: 0, top: 0, gutterTop: 0 });
  const menuRoot = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadPending = useRef(false);
  async function download(href: string) {
    if (downloadPending.current) return;
    downloadPending.current = true; setDownloading(true);
    try { await downloadDocFile(href); }
    catch (error) { onProblem(error instanceof Error ? error.message : 'Download failed. Please try again.'); }
    finally { downloadPending.current = false; setDownloading(false); }
  }
  const [dismissed, setDismissed] = useState('');
  const [choice, setChoice] = useState(0);
  const [linkBlock,setLinkBlock]=useState<'button'|'embed'|null>(null),[blockUrl,setBlockUrl]=useState(''),[blockLabel,setBlockLabel]=useState('Open link');
  const root = useRef<HTMLDivElement>(null);
  const handleCommandKey = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const editor = useEditor({
    extensions: docEditorExtensions(true), content: decodeRich(value) ?? value, contentType: decodeRich(value) ? 'json' : 'markdown', immediatelyRender: false, autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': label, 'aria-multiline': 'true', class: 'doc-prose' },
      handleKeyDown: (_view, event) => handleCommandKey.current(event),
      handleClick: (_view, _pos, event) => {
        const link = event.target instanceof Element ? event.target.closest('a') : null;
        const href = link?.getAttribute('href') ?? '';
        if (!isDocAssetLink(href)) return false;
        event.preventDefault(); void download(href); return true;
      },
      handlePaste: (_view, event) => {
        if (event.clipboardData?.files.length) { void uploadFiles(Array.from(event.clipboardData.files)); return true; }
        return false;
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.files.length) { event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files)); return true; }
        return false;
      },
    },
    onUpdate: ({ editor }) => { const json=editor.getJSON(); try {onChange(encodeRich(json));}catch{onChange(RICH_PREFIX+JSON.stringify(json));onProblem('This draft contains unsupported formatting. Download the complete draft before reloading; it has not been saved.');} },
  });
  useEditorState({ editor, selector: ({ editor }) => editor?.state });
  const selection = editor?.state.selection;
  const textBefore = selection?.empty && selection.$from.parent.type.name === 'paragraph'
    ? selection.$from.parent.textBetween(0, selection.$from.parentOffset, '', '') : '';
  const match = /^\/([^/]*)$/.exec(textBefore);
  const commandKey = match ? `${selection?.from}:${textBefore}` : '';
  const commands: { label: string; hint: string; apply: (chain: ChainedCommands) => ChainedCommands }[] = [
    { label: 'Heading 1', hint: 'Large section title · h1', apply: (c) => c.setHeading({ level: 1 }) },
    { label: 'Heading 2', hint: 'Section title · h2', apply: (c) => c.setHeading({ level: 2 }) },
    { label: 'Heading 3', hint: 'Small section title · h3', apply: (c) => c.setHeading({ level: 3 }) },
    { label: 'Heading 4', hint: 'Small heading · h4', apply: (c) => c.setHeading({ level: 4 }) },
    { label: 'Normal text', hint: 'Paragraph', apply: (c) => c.setParagraph() },
    { label: 'Bulleted list', hint: 'A simple list', apply: (c) => c.toggleBulletList() },
    { label: 'Numbered list', hint: 'Steps in order', apply: (c) => c.toggleOrderedList() },
    { label: 'Checklist', hint: 'Track items to complete', apply: (c) => c.toggleTaskList() },
    { label: 'Quote', hint: 'Highlight a quotation', apply: (c) => c.toggleBlockquote() },
    { label: 'Code block', hint: 'Code and technical notes', apply: (c) => c.toggleCodeBlock() },
    { label: 'Table', hint: 'Three columns with a header', apply: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
    { label: 'Divider', hint: 'Separate sections', apply: (c) => c.setHorizontalRule() },
    ...(['info','success','warning','danger'] as const).map(tone => ({ label: `${tone.charAt(0).toUpperCase()+tone.slice(1)} banner`, hint: 'Callout with background color', apply: (c: ChainedCommands) => c.insertContent({ type: 'banner', attrs: {tone}, content: [{type:'paragraph'}] }) })),
    { label: 'Toggle list', hint: 'Collapsible content', apply: (c) => c.insertContent({type:'toggle',content:[{type:'paragraph'}]}) },
    { label: 'Columns', hint: 'Two columns side by side', apply: (c) => c.insertContent({type:'columns',content:[{type:'column',content:[{type:'paragraph'}]},{type:'column',content:[{type:'paragraph'}]}]}) },
    { label:'Table of contents',hint:'Links to headings on this page',apply:c=>c.insertContent({type:'tableOfContents'}) },
    { label:'Button',hint:'A labelled link button',apply:c=>{setLinkBlock('button');setBlockUrl('');return c;} },
    { label:'Embed',hint:'YouTube, Vimeo, Figma, Google Docs, Loom or Miro embed URL',apply:c=>{setLinkBlock('embed');setBlockUrl('');return c;} },
    { label: 'Attachment', hint: 'Upload a file · PDF, Office, ZIP and more · 50 MB max', apply: (c) => { attachmentInput.current?.click(); return c; } },
  ];
  const filtered = commands.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes((inserting ? insertQuery : match?.[1] ?? '').toLowerCase()));
  const showCommands = inserting || (!!match && dismissed !== commandKey);
  const selected = Math.min(choice, Math.max(0, filtered.length - 1));
  const applyCommand = (item: typeof commands[number]) => {
    if (!editor || !selection) return;
    let chain = editor.chain().focus();
    if (match) chain = chain.deleteRange({ from: selection.from - textBefore.length, to: selection.from });
    item.apply(chain).run();
    setChoice(0); setInserting(false);
  };
  handleCommandKey.current = (event) => {
    if (!showCommands || event.isComposing) return false;
    if (event.key === 'Escape') { setDismissed(commandKey); setInserting(false); editor?.commands.focus(); return true; }
    if (filtered.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setChoice((selected + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length); return true;
    }
    if (event.key === 'Enter' && filtered[selected]) { applyCommand(filtered[selected]); return true; }
    return false;
  };
  useEffect(() => { setChoice(0); }, [textBefore]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !menuRoot.current?.contains(event.target as Node)) { setDismissed(commandKey); setInserting(false); } };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [commandKey]);
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (editor.isDestroyed || !root.current) return;
      const point = editor.view.coordsAtPos(editor.state.selection.from);
      const rect = root.current.getBoundingClientRect();
      setAnchor({ left: Math.max(12, Math.min(point.left, window.innerWidth - 332)), top: Math.max(12, Math.min(point.bottom + 8, window.innerHeight - 350)), gutterTop: point.top - rect.top });
    };
    update(); document.addEventListener('scroll', update, true); window.addEventListener('resize', update);
    return () => { document.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [editor, selection?.from, selection?.to]);
  if (!editor) return <p role="status">Loading {label}…</p>;
  const openInsert = () => {
    // Adding a block must never replace the text currently selected for formatting.
    const current = editor.state.selection;
    if (!current.empty || current.$from.parent.content.size > 0) {
      const after = current.$from.depth ? current.$from.after(1) : editor.state.doc.content.size;
      editor.chain().insertContentAt(after, { type: 'paragraph' }).setTextSelection(after + 1).run();
    }
    setInserting(true); setInsertQuery(''); setChoice(0);
  };
  const formatting = <EditorToolbar editor={editor} position={toolbarPosition} onPosition={setToolbarPosition} onInsert={openInsert} />;
  const blockIndex=editor.state.selection.$from.index(0);
  function moveBlock(direction:-1|1){
    if(!editor)return;const blocks:{node:import('@tiptap/pm/model').Node;pos:number}[]=[];editor.state.doc.forEach((node,pos)=>blocks.push({node,pos}));
    const current=blocks[blockIndex],neighbor=blocks[blockIndex+direction];if(!current||!neighbor)return;
    const destination=direction<0?neighbor.pos:current.pos+neighbor.node.nodeSize;
    const tr=editor.state.tr.delete(current.pos,current.pos+current.node.nodeSize).insert(destination,current.node);tr.setSelection(TextSelection.near(tr.doc.resolve(destination+1)));editor.view.dispatch(tr);editor.commands.focus();
  }

  async function upload(file: File, attachment = false) {
    if (!editor) return;
    if (!file.size || file.size > MAX_UPLOAD_BYTES) { onProblem('Choose a non-empty file no larger than 50 MB.'); return; }
    setUploading(true); onUploadChange(1);
    try {
      const data = new FormData(); data.set('file', file); data.set('kind', attachment ? 'attachment' : 'image');
      const res = await fetch(`/api/projects/${projectId}/doc-assets`, { method: 'POST', body: data });
      const body = await res.json();
      if (!res.ok) { onProblem(body.message ?? 'Upload failed. Try again.'); return; }
      if (attachment) {
        const size = body.bytes < 1024 * 1024 ? `${Math.ceil(body.bytes / 1024)} KB` : `${(body.bytes / (1024 * 1024)).toFixed(1)} MB`;
        editor.chain().focus().insertContent([{ type: 'text', text: `📎 ${body.filename} (${size})`, marks: [{ type: 'link', attrs: { href: body.url } }] }, { type: 'text', text: ' ' }]).run();
      } else editor.chain().focus().setImage({ src: body.url, alt: file.name }).run();
    } catch { onProblem('File upload failed. Check your connection and try again.'); }
    finally { setUploading(false); onUploadChange(-1); }
  }
  async function uploadFiles(files: File[]) { for (const file of files) await upload(file, !/^image\/(png|jpeg|webp|gif)$/.test(file.type)); }

  return <div className="rich-editor" ref={root}>
    {toolbarPosition === 'top' ? <div className="doc-toolbar-top">{formatting}</div> : <BubbleMenu editor={editor} appendTo={() => document.body} options={{ strategy: 'fixed', placement: 'top', offset: 10, shift: { padding: 12 } }} updateDelay={60}>{formatting}</BubbleMenu>}
    <div className="doc-block-gutter" style={{ top: anchor.gutterTop }}>
      <button type="button" aria-label="Add block" title="Add block" onMouseDown={(e) => e.preventDefault()} onClick={openInsert}><DocIcon name="plus" /></button>
      <button type="button" aria-label="Show formatting toolbar" title="Show formatting toolbar" onMouseDown={(e) => e.preventDefault()} onClick={() => setToolbarPosition(toolbarPosition === 'top' ? 'floating' : 'top')}><DocIcon name="text" /></button>
      <button type="button" draggable aria-label="Drag block" title="Drag block to reorder" onDragStart={e=>{const from=editor.state.selection.$from;if(from.depth<1)return;editor.commands.setNodeSelection(from.before(1));e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',editor.state.selection.content().content.textBetween(0,editor.state.selection.content().content.size,'\n'));editor.view.dragging={slice:editor.state.selection.content(),move:true};}} onDragEnd={()=>{editor.view.dragging=null;}}><DocIcon name="grip" /></button>
      <button type="button" aria-label="Move block up" title="Move block up" disabled={blockIndex===0} onMouseDown={e=>e.preventDefault()} onClick={()=>moveBlock(-1)}><DocIcon name="up" /></button>
      <button type="button" aria-label="Move block down" title="Move block down" disabled={blockIndex>=editor.state.doc.childCount-1} onMouseDown={e=>e.preventDefault()} onClick={()=>moveBlock(1)}><DocIcon name="down" /></button>
    </div>
    <input hidden ref={imageInput} type="file" aria-label={`Upload image to ${label}`} accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg" disabled={uploading}
      onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} />
    <input hidden ref={attachmentInput} type="file" aria-label={`Attach file to ${label}`} disabled={uploading}
      onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, true); e.target.value = ''; }} />
    {uploading && <p role="status">Uploading file…</p>}
    {downloading && <p role="status">Downloading file…</p>}
    <EditorContent editor={editor} />
    {linkBlock&&<form className="doc-block-form" onSubmit={e=>{e.preventDefault();if(!/^https?:\/\//i.test(blockUrl)||(linkBlock==='embed'&&!safeEmbed(blockUrl))){onProblem('Use a valid HTTPS embed URL from a supported provider, or an HTTP(S) button link.');return;}editor.chain().focus().insertContent(linkBlock==='button'?{type:'linkButton',attrs:{href:blockUrl,label:blockLabel}}:{type:'embed',attrs:{src:blockUrl}}).run();setLinkBlock(null);}}><label>{linkBlock==='embed'?'Embed URL':'Button URL'}<input type="url" required autoFocus value={blockUrl} onChange={e=>setBlockUrl(e.target.value)}/></label>{linkBlock==='button'&&<label>Button label<input required maxLength={200} value={blockLabel} onChange={e=>setBlockLabel(e.target.value)}/></label>}<button type="submit"><DocIcon name="plus" />Insert {linkBlock}</button><button type="button" onClick={()=>setLinkBlock(null)}><DocIcon name="close" />Cancel</button></form>}
    {isDocAssetLink(editor.getAttributes('link').href ?? '') && <button type="button" disabled={downloading} onClick={() => void download(editor.getAttributes('link').href)}><DocIcon name="download" />Download attachment</button>}
    {editor.isEmpty && <p className="doc-empty-hint">Type / for commands</p>}
    {editor.isActive('table') && <div className="doc-table-tools" role="group" aria-label="Table actions">
      <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}><DocIcon name="table" />+ Row</button>
      <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}><DocIcon name="columns" />+ Column</button>
      <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}><DocIcon name="close" />Remove row</button>
      <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}><DocIcon name="close" />Remove column</button>
      <button type="button" disabled={!editor.can().mergeCells()} onClick={() => editor.chain().focus().mergeCells().run()}><DocIcon name="table" />Merge cells</button>
      <button type="button" disabled={!editor.can().splitCell()} onClick={() => editor.chain().focus().splitCell().run()}><DocIcon name="table" />Split cell</button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeaderRow().run()}><DocIcon name="table" />Header row</button>
      <button type="button" onClick={() => editor.chain().focus().deleteTable().run()}><DocIcon name="close" />Remove table</button>
    </div>}
    {showCommands && createPortal(<div ref={menuRoot} className="editor-commands doc-command-popover" style={{ left: anchor.left, top: anchor.top }} role="region" aria-label="Insert block">
      <div className="editor-command-heading">Insert block <span>↑ ↓ to navigate · Enter to insert · Esc to close</span></div>
      {inserting && <input aria-label="Search blocks" placeholder="Search blocks…" autoFocus value={insertQuery} onChange={(e) => { setInsertQuery(e.target.value); setChoice(0); }} onKeyDown={(e) => { if (handleCommandKey.current(e.nativeEvent)) e.preventDefault(); }} />}
      {filtered.length ? filtered.map((item, index) => <button key={item.label} type="button" className={selected === index ? 'is-selected' : ''}
        onMouseDown={(e) => e.preventDefault()} onClick={() => applyCommand(item)}><DocIcon name={item.label} /><strong>{item.label}</strong><span>{item.hint}</span></button>) : <p>No matching blocks. Try /table or /heading.</p>}
      {'image upload png jpeg webp gif svg'.includes((inserting ? insertQuery : match?.[1] ?? '').toLowerCase()) && <button type="button" onClick={() => { if (match && selection) editor.commands.deleteRange({ from: selection.from - textBefore.length, to: selection.from }); setInserting(false); setDismissed(commandKey); imageInput.current?.click(); }}><DocIcon name="image" /><strong>Image</strong><span>Upload PNG, JPEG, WebP, GIF or SVG</span></button>}
    </div>, document.body)}
  </div>;
}
