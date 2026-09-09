import React, { type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  decodeRich,
  safeColor,
  safeDocUrl,
  safeEmbed,
  type RichNode,
} from "@/lib/doc-rich-content";

/** Explicit renderer: document JSON never becomes executable HTML. */
export default function DocContent({ value }: { value: string }) {
  const tree = decodeRich(value);
  if (!tree)
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
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
        if (m.type === "link" && safeDocUrl(m.attrs?.href))
          text = (
            <a key={i} href={m.attrs.href} rel="noopener noreferrer">
              {text}
            </a>
          );
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
    if (n.type === "image")
      return safeDocUrl(a.src) ? (
        <img key={key} src={a.src} alt={String(a.alt ?? "")} />
      ) : null;
    if (n.type === "linkButton")
      return safeDocUrl(a.href) ? (
        <a
          key={key}
          href={a.href}
          className="doc-link-button"
          data-doc-button=""
          rel="noopener noreferrer"
        >
          {String(a.label ?? "Open link")}
        </a>
      ) : null;
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
