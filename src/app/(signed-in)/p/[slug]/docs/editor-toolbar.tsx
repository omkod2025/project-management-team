'use client';
import DocIcon from "./doc-icon";

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';

/** ClickUp's selection-first toolbar: marks stay one click away; insert and
 * less frequent actions live in menus instead of occupying the writing canvas. */
export default function EditorToolbar({ editor, position, onPosition, onInsert }: {
  editor: Editor; position: 'floating' | 'top'; onPosition: (value: 'floating' | 'top') => void; onInsert: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<'style' | 'lists' | 'more' | 'link' | 'color' | 'alignment' | null>(null);
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setMenu(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const act = (run: () => void) => { run(); setMenu(null); };
  const button = (name: string, text: React.ReactNode, run: () => void, active?: boolean) => <button type="button" title={name} aria-label={name} aria-pressed={active}
    onMouseDown={(e) => e.preventDefault()} onClick={run}>{text}</button>;
  const toggle = (value: typeof menu) => setMenu(menu === value ? null : value);
  return <div ref={root} className="doc-formatting" role="group" aria-label="Text formatting" onKeyDown={(e) => {
    if (e.key === 'Escape') { setMenu(null); editor.commands.focus(); e.stopPropagation(); }
  }}>
    <div className="doc-formatting-strip">
      {button('List options', <><DocIcon name="list" /><small>⌄</small></>, () => toggle('lists'), menu === 'lists')}
      {button('Turn Into', <>{editor.isActive('heading') ? `H${editor.getAttributes('heading').level}` : 'Text'} <small>⌄</small></>, () => toggle('style'), menu === 'style')}
      <span className="doc-tool-separator" />
      {button('Bold', <b>B</b>, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {button('Italic', <i>I</i>, () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {button('Underline', <u>U</u>, () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'))}
      {button('Strikethrough', <s>S</s>, () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'))}
      {button('Text color', 'A', () => toggle('color'), menu === 'color')}
      {button('Alignment', <DocIcon name="left" />, () => toggle('alignment'), menu === 'alignment')}
      {button('Code', <DocIcon name="code" />, () => editor.chain().focus().toggleCode().run(), editor.isActive('code'))}
      {button('Link', <DocIcon name="link" />, () => { setUrl(editor.getAttributes('link').href ?? ''); setProblem(''); toggle('link'); }, editor.isActive('link'))}
      <span className="doc-tool-separator" />
      {button('Insert block', <DocIcon name="plus" />, onInsert)}
      {button('More formatting', <DocIcon name="more" />, () => toggle('more'), menu === 'more')}
    </div>
    {menu && <div className="doc-formatting-menu" role="region" aria-label={menu === 'style' ? 'Turn Into' : menu === 'more' ? 'More formatting' : menu === 'lists' ? 'List options' : menu==='color'?'Text color':menu==='alignment'?'Alignment':'Insert link'}>
      {menu === 'alignment' && <><h3>Alignment</h3>{(['left','center','right','justify'] as const).map(textAlign=><button key={textAlign} onClick={()=>act(()=>editor.chain().focus().updateAttributes('paragraph',{textAlign}).updateAttributes('heading',{textAlign}).run())}><DocIcon name={textAlign} />{textAlign.charAt(0).toUpperCase()+textAlign.slice(1)}</button>)}</>}
      {menu === 'color' && <><h3>Text color</h3><div className="doc-color-grid">{[['Default','#202020'],['Red','#a62b36'],['Orange','#995218'],['Yellow','#806000'],['Blue','#235ab5'],['Purple','#7540a6'],['Pink','#a33173'],['Green','#257344'],['Grey','#616161']].map(([name,color])=><button key={name} aria-label={`${name} text`} title={name} style={{color}} onClick={()=>act(()=>editor.chain().focus().setMark('textColor',{color}).run())}>A</button>)}</div><h3>Highlight</h3><div className="doc-color-grid">{[['Red','#ffe2e2'],['Orange','#ffe9cf'],['Yellow','#fff0b3'],['Blue','#dceaff'],['Purple','#eee0ff'],['Pink','#fce0f0'],['Green','#d8f3e0'],['Grey','#e8e8e8']].map(([name,color])=><button key={name} aria-label={`${name} highlight`} title={name} style={{backgroundColor:color}} onClick={()=>act(()=>editor.chain().focus().setMark('highlight',{color}).run())}>A</button>)}</div><button onClick={()=>act(()=>editor.chain().focus().unsetMark('textColor').unsetMark('highlight').run())}><DocIcon name="text" />Reset colors</button></>}
      {menu === 'style' && <><h3>Turn Into</h3>
        <button onClick={() => act(() => editor.chain().focus().setParagraph().run())}><DocIcon name="text" />Text <span>Normal text</span></button>
        {[1, 2, 3, 4, 5, 6].map((level) => <button key={level} onClick={() => act(() => editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run())}><DocIcon name="heading" />Heading {level}<kbd>H{level}</kbd></button>)}
        <button onClick={() => act(() => editor.chain().focus().toggleCodeBlock().run())}><DocIcon name="code" />Code block</button>
        <button onClick={() => act(() => editor.chain().focus().toggleBlockquote().run())}><DocIcon name="quote" />Quote</button>
      </>}
      {menu === 'lists' && <><h3>Lists</h3>
        <button onClick={() => act(() => editor.chain().focus().toggleBulletList().run())}><DocIcon name="list" />Bulleted list <span>•</span></button>
        <button onClick={() => act(() => editor.chain().focus().toggleOrderedList().run())}><DocIcon name="numbered" />Numbered list <span>1.</span></button>
        <button onClick={() => act(() => editor.chain().focus().toggleTaskList().run())}><DocIcon name="checklist" />Checklist <span>☑</span></button>
      </>}
      {menu === 'more' && <>
        <button disabled={!editor.can().undo()} onClick={() => act(() => editor.chain().focus().undo().run())}><DocIcon name="undo" />Undo <kbd>Ctrl Z</kbd></button>
        <button disabled={!editor.can().redo()} onClick={() => act(() => editor.chain().focus().redo().run())}><DocIcon name="redo" />Redo <kbd>Ctrl Shift Z</kbd></button>
        <button onClick={() => act(() => editor.chain().focus().unsetAllMarks().clearNodes().run())}><DocIcon name="text" />Clear format</button>
        <button onClick={() => act(onInsert)}><DocIcon name="plus" />Insert <span>›</span></button>
        <h3>Toolbar position</h3>
        <button aria-pressed={position === 'floating'} onClick={() => act(() => onPosition('floating'))}><DocIcon name="focus" />Floating <span>{position === 'floating' ? '✓' : ''}</span></button>
        <button aria-pressed={position === 'top'} onClick={() => act(() => onPosition('top'))}><DocIcon name="focus" />Top <span>{position === 'top' ? '✓' : ''}</span></button>
      </>}
      {menu === 'link' && <form onSubmit={(event) => {
        event.preventDefault();
        if (!url.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
        else if (/^https?:\/\//i.test(url.trim())) editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
        else { setProblem('Use https:// or http://.'); return; }
        setMenu(null);
      }}><label>Link URL<input type="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
        {problem && <p role="alert">{problem}</p>}<button type="submit"><DocIcon name="link" />Apply link</button><button type="button" onClick={() => act(() => editor.chain().focus().unsetLink().run())}><DocIcon name="close" />Remove link</button>
      </form>}
    </div>}
  </div>;
}
