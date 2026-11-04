'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MERMAID_CONFIG } from '@/lib/mermaid-rules.ts';

/**
 * Renders a Mermaid source block to an inline SVG.
 *
 * The server render and first paint are always the `<pre>` source, so a
 * reader without JavaScript — or a crawler, or the moment before the
 * `mermaid` chunk loads — still sees the diagram's text. Rendering only
 * ever adds a `div.doc-mermaid` alongside it; it never replaces the `<pre>`,
 * because an error leaves the source as the fallback.
 */

let initialized = false;
let renderCounter = 0;

/** mermaid's `initialize` mutates its argument, so each call gets its own copy. */
function cloneConfig() {
  return {
    ...MERMAID_CONFIG,
    themeVariables: { ...MERMAID_CONFIG.themeVariables },
  };
}

export default function MermaidDiagram({
  source,
  showSource = false,
}: {
  source: string;
  showSource?: boolean;
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '-');
  const container = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const id = `doc-mermaid-${reactId}-${renderCounter++}`;
      try {
        const { default: mermaid } = await import('mermaid');
        if (!initialized) {
          mermaid.initialize(cloneConfig());
          initialized = true;
        }
        const { svg } = await mermaid.render(id, source);
        if (cancelled) return;
        const { default: DOMPurify } = await import('dompurify');
        const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
        setHtml(clean);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setHtml(null);
        setError(err instanceof Error ? err.message : 'Could not render this diagram.');
      } finally {
        // mermaid.render can leave a detached temporary element in
        // document.body behind when it fails partway through.
        const stray = document.getElementById(id);
        if (stray && stray.parentNode === document.body) stray.remove();
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, reactId]);

  useEffect(() => {
    if (container.current) container.current.innerHTML = html ?? '';
  }, [html]);

  const copy = () => {
    navigator.clipboard.writeText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div data-mermaid-block="">
      {!html && <pre className="doc-mermaid-source"><code>{source}</code></pre>}
      {html && <div ref={container} className="doc-mermaid" />}
      {error && <p className="doc-mermaid-error">{error}</p>}
      {!showSource && (
        <button type="button" className="doc-mermaid-copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy Mermaid'}
        </button>
      )}
    </div>
  );
}
