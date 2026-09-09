'use client';
import DocIcon from "./doc-icon";

import { useEffect, useState } from 'react';

export type ReadingStyle = { font: 'system' | 'serif' | 'mono'; size: 'small' | 'default' | 'large'; wide: boolean; focus?:'none'|'page'|'block' };
export default function PageStyles({ value, onChange, container }: {
  value: ReadingStyle; onChange: (value: ReadingStyle) => void; container: React.RefObject<HTMLDivElement | null>;
}) {
  const [panel, setPanel] = useState<'styles' | 'outline' | null>(null);
  const [headings, setHeadings] = useState<{ text: string; level: number; node: HTMLElement }[]>([]);
  useEffect(() => {
    if (panel !== 'outline' || !container.current) return;
    const update = () => setHeadings(Array.from(container.current!.querySelectorAll<HTMLElement>('.doc-prose h1,.doc-prose h2,.doc-prose h3,.doc-prose h4,.doc-prose h5,.doc-prose h6,.doc-section > h2'))
      .filter((node) => node.textContent?.trim()).map((node) => ({ text: node.textContent ?? '', level: Number(node.tagName.slice(1)), node })));
    update();
    const observer = new MutationObserver(update);
    container.current.querySelectorAll('.doc-prose').forEach((node) => observer.observe(node, { childList: true, subtree: true, characterData: true }));
    return () => observer.disconnect();
  }, [panel, container]);
  return <>
    <div className="doc-right-rail" role="group" aria-label="Page tools">
      <button type="button" aria-label="Page Styles" title="Page Styles" aria-expanded={panel === 'styles'} onClick={() => setPanel(panel === 'styles' ? null : 'styles')}><DocIcon name="text" /></button>
      <button type="button" aria-label="Page outline" title="Page outline" aria-expanded={panel === 'outline'} onClick={() => setPanel(panel === 'outline' ? null : 'outline')}><DocIcon name="list" /></button>
      <button type="button" aria-label={value.wide ? 'Default width' : 'Full width'} title={value.wide ? 'Default width' : 'Full width'} aria-pressed={value.wide} onClick={() => onChange({ ...value, wide: !value.wide })}><DocIcon name="width" /></button>
    </div>
    {panel && <aside className="doc-style-panel" aria-label={panel === 'styles' ? 'Page Styles' : 'Page outline'} onKeyDown={(e) => { if (e.key === 'Escape') setPanel(null); }}>
      <header><h2>{panel === 'styles' ? 'Page Styles' : 'Page outline'}</h2><button type="button" aria-label="Close page panel" onClick={() => setPanel(null)}><DocIcon name="close" /></button></header>
      {panel === 'styles' ? <>
        <h3>Font style</h3><div className="doc-style-choices">{(['system', 'serif', 'mono'] as const).map((font) => <button key={font} type="button" aria-pressed={value.font === font} className={`font-${font}`} onClick={() => onChange({ ...value, font })}><span>Aa</span>{font.charAt(0).toUpperCase() + font.slice(1)}</button>)}</div>
        <h3>Font size</h3><div className="doc-style-choices">{(['small', 'default', 'large'] as const).map((size) => <button key={size} type="button" aria-pressed={value.size === size} onClick={() => onChange({ ...value, size })}>{size.charAt(0).toUpperCase() + size.slice(1)}</button>)}</div>
        <h3>Page width</h3><div className="doc-style-choices"><button type="button" aria-pressed={!value.wide} onClick={() => onChange({ ...value, wide: false })}><DocIcon name="width" />Default</button><button type="button" aria-pressed={value.wide} onClick={() => onChange({ ...value, wide: true })}><DocIcon name="width" />Full width</button></div>
        <p className="docs-muted">Reading preferences apply to this view. Document content is unchanged.</p>
        <h3>Focus mode</h3><div className="doc-style-choices">{(['none','page','block'] as const).map(focus=><button key={focus} aria-pressed={(value.focus??'none')===focus} onClick={()=>onChange({...value,focus})}>{focus.charAt(0).toUpperCase()+focus.slice(1)}</button>)}</div><p className="docs-muted">Block focus follows the cursor while editing. Save shared typography in Page settings.</p>
      </> : <nav aria-label="Headings">{headings.length ? headings.map((heading, index) => <button key={index} type="button" style={{ paddingLeft: 10 + (heading.level - 1) * 12 }} onClick={() => { heading.node.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}>{heading.text}</button>) : <p className="docs-muted">Add headings to see the page outline.</p>}</nav>}
    </aside>}
  </>;
}
