import React, { type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FilterableTable from './filterable-table';
import {
  decodeRich,
  safeColor,
  safeDocUrl,
  safeEmbed,
  type RichNode,
} from "@/lib/doc-rich-content";
import { publishedLink } from "@/lib/doc-publish-rules";

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
const linkTarget = (href: unknown): "_blank" | undefined =>
  typeof href === "string" && href.startsWith("#") ? undefined : "_blank";

/**
 * How a page is being read.
 *
 * Absent, the reader is signed in and every link in the document works as
 * written. Present, the page is being read through a published link (spec 10
 * §8b) by somebody with no account, and every URL on the page has to be asked
 * about: an asset becomes the token's own path, an app-internal link stops
 * being a link at all, and only external schemes survive untouched.
 */
export type PublishContext = { token: string; assets: ReadonlySet<string> };

/** Explicit renderer: document JSON never becomes executable HTML. */
export default function DocContent({
  value,
  publish,
}: {
  value: string;
  publish?: PublishContext;
}) {
  /**
   * The one gate every href and src on the page passes through. `null` means
   * "there is no address here a reader may follow" — the caller then renders
   * the words without a link, or drops the image.
   */
  const url = (raw: unknown): string | null =>
    publish
      ? publishedLink(raw, publish.token, publish.assets)
      : safeDocUrl(raw)
        ? raw
        : null;
  const tree = decodeRich(value);
  if (!tree)
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        /* A page still held as Markdown reads the same way as one held as
           rich content, so its links leave for their own window too. */
        components={{
          a: ({ href, children, ...rest }) => {
            const to = url(href);
            // A link with nowhere to go keeps its words and loses its href —
            // deleting the text would silently edit the document.
            if (!to) return <>{children}</>;
            return (
              <a
                {...rest}
                href={to}
                target={linkTarget(to)}
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt, ...rest }) => {
            const to = url(src);
            return to ? <img {...rest} src={to} alt={alt ?? ""} /> : null;
          },
        }}
      >
        {value}
      </ReactMarkdown>
    );
  const headings: RichNode[] = [];
  const walk = (n: RichNode) => {
    if (n.type === "heading") headings.push(n);
    n.content?.forEach(walk);
  };
  walk(tree);
  let hash = 0;
  for (let i = 0; i < value.length; i++)
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  const headingId = (n: RichNode) =>
    `heading-${Math.abs(hash)}-${headings.indexOf(n)}`;
  const textOf = (n: RichNode): string =>
    n.text ?? (n.content ?? []).map(textOf).join("");
  const node = (n: RichNode, key: number): React.ReactNode => {
    const a = n.attrs ?? {};
    const children = n.content?.map(node);
    if (n.type === "text") {
      let text: React.ReactNode = n.text;
      for (const [i, m] of (n.marks ?? []).entries()) {
        const tag = (
          {
            bold: "strong",
            italic: "em",
            underline: "u",
            strike: "s",
            code: "code",
          } as Record<string, string>
        )[m.type];
        if (tag) text = React.createElement(tag, { key: i }, text);
        if (m.type === "link") {
          const to = url(m.attrs?.href);
          if (to)
            text = (
              <a
                key={i}
                href={to}
                target={linkTarget(to)}
                rel="noopener noreferrer"
              >
                {text}
              </a>
            );
        }
        if (m.type === "textColor" && safeColor(m.attrs?.color))
          text = (
            <span key={i} style={{ color: m.attrs.color }}>
              {text}
            </span>
          );
        if (m.type === "highlight" && safeColor(m.attrs?.color))
          text = (
            <mark key={i} style={{ backgroundColor: m.attrs.color }}>
              {text}
            </mark>
          );
      }
      return <React.Fragment key={key}>{text}</React.Fragment>;
    }
    const style: CSSProperties = {
      textAlign: ["left", "center", "right", "justify"].includes(
        String(a.textAlign),
      )
        ? (a.textAlign as CSSProperties["textAlign"])
        : undefined,
    };
    if (n.type === "doc")
      return <React.Fragment key={key}>{children}</React.Fragment>;
    if (n.type === "paragraph")
      return (
        <p key={key} style={style}>
          {children ?? <br />}
        </p>
      );
    if (n.type === "heading")
      return React.createElement(
        `h${a.level ?? 1}`,
        { key, style, id: headingId(n) },
        children,
      );
    if (n.type === "hardBreak") return <br key={key} />;
    if (n.type === "horizontalRule") return <hr key={key} />;
    if (n.type === "image") {
      const src = url(a.src);
      return src ? <img key={key} src={src} alt={String(a.alt ?? "")} /> : null;
    }
    if (n.type === "linkButton") {
      const to = url(a.href);
      // A button that cannot be pressed is not drawn: unlike an inline link it
      // has no sentence around it to keep, so an inert one is pure furniture.
      return to ? (
        <a
          key={key}
          href={to}
          className="doc-link-button"
          data-doc-button=""
          target={linkTarget(to)}
          rel="noopener noreferrer"
        >
          {String(a.label ?? "Open link")}
        </a>
      ) : null;
    }
    if (n.type === "embed")
      return safeEmbed(a.src) ? (
        <iframe
          key={key}
          src={a.src}
          title="Embedded content"
          className="doc-embed"
          data-doc-embed=""
          sandbox="allow-scripts allow-same-origin allow-presentation"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : null;
    if (n.type === "tableOfContents")
      return (
        <nav key={key} className="doc-toc" data-doc-toc="" aria-label="Table of contents">
          {headings.length
            ? headings.map((h) => (
                <a
                  key={headingId(h)}
                  href={`#${headingId(h)}`}
                  style={{
                    paddingLeft: (Number(h.attrs?.level ?? 1) - 1) * 12,
                  }}
                >
                  {textOf(h)}
                </a>
              ))
            : "Add headings to build the table of contents."}
        </nav>
      );
    if (n.type === "codeBlock")
      return (
        <pre key={key}>
          <code>{n.content?.map((c) => c.text ?? "").join("")}</code>
        </pre>
      );
    if (n.type === 'table' && n.content?.[0]?.content?.length && n.content[0].content.every(cell => cell.type === 'tableHeader' && Number(cell.attrs?.rowspan ?? 1) === 1))
      return <FilterableTable key={key} table={n} header={node(n.content[0], 0)} rows={n.content.slice(1).map(node)} />;
    if (n.type === "table")
      return (
        <table key={key}>
          <tbody>{children}</tbody>
        </table>
      );
    if (n.type === "tableRow") return <tr key={key}>{children}</tr>;
    if (n.type === "tableCell" || n.type === "tableHeader")
      return React.createElement(
        n.type === "tableCell" ? "td" : "th",
        {
          key,
          colSpan: Number(a.colspan ?? 1),
          rowSpan: Number(a.rowspan ?? 1),
          style: safeColor(a.backgroundColor) ? { backgroundColor: a.backgroundColor } : undefined,
        },
        children,
      );
    if (n.type === "taskList")
      return (
        <ul key={key} data-type="taskList">
          {children}
        </ul>
      );
    if (n.type === "taskItem")
      return (
        <li key={key} data-type="taskItem" data-checked={!!a.checked}>
          <input
            type="checkbox"
            checked={!!a.checked}
            readOnly
            aria-label={a.checked ? "Completed" : "Not completed"}
          />
          <div>{children}</div>
        </li>
      );
    if (n.type === "banner")
      return (
        <aside key={key} data-banner="" data-tone={String(a.tone??'info')} className={`doc-banner tone-${a.tone ?? "info"}`}>
          {children}
        </aside>
      );
    if (n.type === "toggle")
      return (
        <details key={key} data-toggle="">
          <summary>{String(a.label ?? 'Toggle')}</summary>
          <div>{children}</div>
        </details>
      );
    if (n.type === "columns")
      return (
        <div key={key} data-columns="" className="doc-columns">
          {children}
        </div>
      );
    if (n.type === "column") return <div key={key} data-column="">{children}</div>;
    const tag = (
      {
        bulletList: "ul",
        orderedList: "ol",
        listItem: "li",
        blockquote: "blockquote",
      } as Record<string, string>
    )[n.type];
    return tag
      ? React.createElement(
          tag,
          {
            key,
            ...(n.type === "orderedList"
              ? { start: Number(a.start ?? 1) }
              : {}),
          },
          children,
        )
      : null;
  };
  return node(tree, 0);
}
