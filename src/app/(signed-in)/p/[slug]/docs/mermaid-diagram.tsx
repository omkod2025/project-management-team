'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MERMAID_CONFIG, MERMAID_FONT_PX, mermaidProblem, type MermaidProblem } from '@/lib/mermaid-rules.ts';

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
const COPY_IDLE = 'Copy Mermaid';
let renderCounter = 0;

/**
 * mermaid's `initialize` mutates its argument, so each call gets its own copy.
 * The font is the page's own reading face, read live: Mermaid measures label
 * text with it, so it must be a family name, not a `var()`.
 */
function cloneConfig() {
  const read = getComputedStyle(document.documentElement).getPropertyValue('--font-read').trim();
  return {
    ...MERMAID_CONFIG,
    secure: [...MERMAID_CONFIG.secure],
    themeVariables: { ...MERMAID_CONFIG.themeVariables, ...(read ? { fontFamily: `${read}, sans-serif` } : {}) },
  };
}

/**
 * A diagram shrinks to fit its column, but never below 13/16 of its drawn
 * size, so 16px labels never fall under 13px (CLAUDE.md § Language). Past
 * that it scrolls inside `.doc-mermaid` instead of the page.
 */
function holdLegible(host: HTMLElement) {
  const svg = host.querySelector('svg');
  const drawn = svg ? parseFloat(svg.style.maxWidth) : NaN;
  if (svg && drawn > 0) svg.style.minWidth = `${Math.round((drawn * 13) / MERMAID_FONT_PX)}px`;
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
  const [error, setError] = useState<MermaidProblem | null>(null);
  const [copyLabel, setCopyLabel] = useState(COPY_IDLE);

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
        setError(mermaidProblem(source, err));
      } finally {
        // mermaid.render can leave a detached temporary element in
        // document.body behind when it fails partway through.
        // Its wrapper is `d<id>`; the svg itself may be left there too.
        for (const strayId of [id, `d${id}`]) {
          const stray = document.getElementById(strayId);
          if (stray && stray.parentNode === document.body) stray.remove();
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, reactId]);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = html ?? '';
    holdLegible(container.current);
  }, [html]);

  // The clipboard can refuse (no permission, an insecure origin, a
  // locked-down browser); say so on the button rather than throw.
  const copy = () => {
    navigator.clipboard
      .writeText(source)
      .then(() => setCopyLabel('Copied'), () => setCopyLabel('Copy failed'))
      .finally(() => setTimeout(() => setCopyLabel(COPY_IDLE), 2000));
  };

  return (
    <div data-mermaid-block="" data-mermaid-state={html ? 'rendered' : error ? 'failed' : 'pending'}>
      {!html && <pre className="doc-mermaid-source"><code>{source}</code></pre>}
      {html && <div ref={container} className="doc-mermaid" />}
      {/* Mermaid's parse error is for the author fixing the source (spec §3c).
          A reader gets the source block alone, not a stack of parser jargon. */}
      {error && showSource && <MermaidError problem={error} />}
      {!showSource && (
        <button type="button" className="doc-mermaid-copy" onClick={copy}>
          {copyLabel}
        </button>
      )}
    </div>
  );
}

/** Where the source fails, for the author (spec 12 D-71): the line, as typed, then what Mermaid expected. */
function MermaidError({ problem }: { problem: MermaidProblem }) {
  return (
    <div className="doc-mermaid-error" role="status">
      <p><strong>{problem.line ? `Syntax error on line ${problem.line}` : 'Syntax error'}</strong></p>
      {problem.line !== null && (
        <pre className="doc-mermaid-error-line"><span aria-hidden="true">{problem.line}</span><code>{problem.text || ' '}</code></pre>
      )}
      <p className="doc-mermaid-error-detail">{problem.detail}</p>
      <p><a href="/wiki/mermaid-guide" target="_blank" rel="noopener noreferrer">How to write Mermaid that renders</a></p>
    </div>
  );
}
