import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import DocImage from './doc-image';
import MermaidDiagram from './mermaid-diagram';
import CopySourceButton from './copy-source-button';
import { isMermaidLanguage } from "@/lib/mermaid-rules";
import { isMarkdownLanguage } from "@/lib/markdown-block-rules";

/**
 * Where a link opens.
 *
 * Every link written into a document leaves for its own window. A document is
 * read, not navigated through: following a reference used to replace the page
 * the reader was in the middle of, and coming back cost a load and the scroll
 * position. A fragment is the exception — it points inside this very page, so
 * a new window would be a copy of the one already open.
 *
 * `rel="noopener noreferrer"` travels with it everywhere, so the opened page
 * gets no handle on this one.
 */
export const linkTarget = (href: unknown): "_blank" | undefined =>
  typeof href === "string" && href.startsWith("#") ? undefined : "_blank";

/** The one gate every href and src passes through; `null` means no address a reader may follow. */
export type DocUrlGate = (raw: unknown) => string | null;

/** react-markdown hands `pre` a hast tree, so a fence's text comes from the AST. */
function hastText(n: unknown): string {
  const el = n as { type?: string; value?: string; children?: unknown[] } | null;
  if (!el) return "";
  if (el.type === "text") return el.value ?? "";
  return (el.children ?? []).map(hastText).join("");
}

function components(url: DocUrlGate, nested: boolean): Components {
  return {
    // `node` is the hast element, still holding the *original* href. It
    // must not be spread onto the <a>: on a published page it would
    // carry the app address the rewrite just removed into the payload.
    a: ({ href, children, node: _node, ...rest }) => {
      const to = url(href);
      // A link with nowhere to go keeps its words and loses its href —
      // deleting the text would silently edit the document.
      if (!to) return <>{children}</>;
      return (
        <a {...rest} href={to} target={linkTarget(to)} rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    img: ({ src, alt, node: _node, ...rest }) => {
      const to = url(src);
      return to ? <DocImage {...rest} src={to} alt={alt ?? ""} /> : null;
    },
    pre: ({ node, children, ...rest }) => {
      const code = node?.children.find(
        (c) => c.type === "element" && c.tagName === "code",
      ) as { properties?: { className?: unknown } } | undefined;
      const classes = Array.isArray(code?.properties?.className)
        ? code.properties.className.map(String)
        : [];
      const language = classes
        .find((c) => c.startsWith("language-"))
        ?.slice("language-".length);
      if (isMermaidLanguage(language))
        return <MermaidDiagram source={hastText(code)} />;
      // A Markdown fence inside a Markdown block is printed, not rendered:
      // rendering never recurses (spec 12 D-84).
      if (!nested && isMarkdownLanguage(language))
        return <MarkdownBlock source={hastText(code)} url={url} />;
      // Inside a Markdown block a fence is usually a command to run, so it
      // carries its own copy button (spec 12 D-84).
      if (nested)
        return (
          <div className="doc-code-copyable">
            <pre {...rest}>{children}</pre>
            <CopySourceButton source={hastText(code).replace(/\n$/, "")} label="Copy code" className="doc-code-copy" icon />
          </div>
        );
      return <pre {...rest}>{children}</pre>;
    },
  };
}

/**
 * Markdown source rendered as a document: GFM, raw HTML skipped, every link
 * and image through `url`. A page still held as Markdown and a Markdown block
 * inside rich content are read through this one renderer.
 */
export function MarkdownSource({ source, url, nested = false }: {
  source: string;
  url: DocUrlGate;
  nested?: boolean;
}) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components(url, nested)}>
      {source}
    </ReactMarkdown>
  );
}

/** A Markdown block as a reader sees it (spec 12 D-84): the rendered content and a copy button. */
export function MarkdownBlock({ source, url, showCopy = true }: {
  source: string;
  url: DocUrlGate;
  showCopy?: boolean;
}) {
  return (
    <div className="doc-markdown-block" data-markdown-block="">
      <MarkdownSource source={source} url={url} nested />
      {showCopy && <CopySourceButton source={source} label="Copy Markdown" className="doc-mermaid-copy" />}
    </div>
  );
}
