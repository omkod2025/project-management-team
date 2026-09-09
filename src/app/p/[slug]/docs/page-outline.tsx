'use client';

// THESIS: Jump through the current document from an outline within the page.
// OWN-WORLD: Quiet rules, inherited typography and the document's indigo focus.
// STORY: Scan H1/H2, choose a heading, continue reading at that position.
// FIRST VIEWPORT: The outline stays at the page's upper left while content scrolls.
// FORM: Reserved space beside the reading column, a compact top row on mobile.
import { useEffect, useState, type RefObject } from 'react';

type Heading = { node: HTMLElement; text: string; level: number };

export default function PageOutline({ container }: {
  container: RefObject<HTMLDivElement | null>;
}) {
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      const next = Array.from(root.querySelectorAll<HTMLElement>('.doc-prose h1, .doc-prose h2, .doc-section > h2'))
        .filter(node => !node.closest('.editor-history') && node.textContent?.trim())
        .map(node => ({ node, text: node.textContent!.trim(), level: Number(node.tagName.slice(1)) }));
      setHeadings(previous => previous.length === next.length && previous.every((heading, index) => {
        const item = next[index];
        return item && heading.node === item.node && heading.text === item.text && heading.level === item.level;
      }) ? previous : next);
    };
    update();
    // Observe the reading wrapper so switching modes and lazy editor mounts
    // refresh the outline as well as changes inside an existing editor.
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [container]);

  function navigate(node: HTMLElement) {
    if (!node.isConnected) return;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    // Wait for collapsed sections to open before scrolling to the destination.
    requestAnimationFrame(() => {
      if (!node.isConnected) return;
      if (node.isContentEditable) {
        node.closest<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else {
        node.tabIndex = -1;
        node.focus({ preventScroll: true });
      }
      node.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  }

  return <nav className="doc-page-outline" aria-label="On this page">
    <h2>On this page</h2>
    {headings.length ? <ol>{headings.map((heading, index) => <li key={index} data-level={heading.level}>
      <button type="button" onClick={() => navigate(heading.node)}>{heading.text}</button>
    </li>)}</ol> : <p className="docs-muted">H1 and H2 headings appear here.</p>}
  </nav>;
}
