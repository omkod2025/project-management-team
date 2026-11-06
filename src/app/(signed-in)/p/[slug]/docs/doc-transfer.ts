import { createElement, Fragment } from "react";
import {
  pageMarkdown,
  pageSections,
  parsePageContent,
  type PageContent,
  type PageTemplate,
} from "@/lib/doc-rules";

/** The export and import halves of the Docs page tools that know nothing about
 * which document they came from. Project Docs and the Wiki both call these and
 * keep the save/post side — busy flags, notices, endpoints — to themselves. */

export type TransferPage = { id: string; title: string; template: PageTemplate; content: PageContent };
export type ImportItem = { title: string; template: PageTemplate; content: PageContent };

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

export async function exportPages(
  format: "md" | "json" | "html" | "print",
  pages: TransferPage[],
  title: string,
): Promise<{ source: string; mime: string }> {
  let source = "",
    mime = "text/plain;charset=utf-8";
  if (format === "md")
    source = pages
      .map((p) => `# ${p.title}\n\n${pageMarkdown(p.template, p.content)}`)
      .join("\n\n---\n\n");
  if (format === "json") {
    source = JSON.stringify(
      {
        format: "fieldbook-doc-v1",
        pages: pages.map(({ title, template, content }) => ({
          title,
          template,
          content,
        })),
      },
      null,
      2,
    );
    mime = "application/json";
  }
  if (format === "html" || format === "print") {
    const [{ renderToStaticMarkup }, { default: DocContent }] =
      await Promise.all([
        import("react-dom/server"),
        import("./doc-content"),
      ]);
    const exportBody = document.createElement("div");
    exportBody.innerHTML = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        pages.map((p) =>
          createElement(
            "section",
            { key: p.id },
            createElement("h1", null, p.title),
            pageSections(p.template).map(([key, label]) =>
              createElement(
                "section",
                { key },
                p.template === "module" && createElement("h2", null, label),
                createElement(DocContent, { value: p.content[key] ?? "" }),
              ),
            ),
          ),
        ),
      ),
    );
    exportBody
      .querySelectorAll<HTMLElement>("[href],[src]")
      .forEach((el) => {
        for (const attr of ["href", "src"]) {
          const value = el.getAttribute(attr);
          if (value?.startsWith("/") && !value.startsWith("//"))
            el.setAttribute(attr, new URL(value, location.origin).href);
        }
      });
    // A rendered Mermaid block leaves its interactive affordance (the
    // copy button) and its own class behind for the editor; an exported
    // document has no script to run that button, and `pre.mermaid` is
    // the shape other tools — and this app's own HTML import — read a
    // Mermaid source block back from.
    exportBody
      .querySelectorAll<HTMLElement>(".doc-mermaid-source")
      .forEach((pre) => {
        pre.classList.remove("doc-mermaid-source");
        pre.classList.add("mermaid");
      });
    exportBody
      .querySelectorAll<HTMLElement>(".doc-mermaid-copy")
      .forEach((button) => button.remove());
    source = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{max-width:760px;margin:48px auto;font:16px/1.5 system-ui}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px}th{background:#e7f1fb}img{max-width:100%}.doc-columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}.doc-banner{padding:12px;background:#e8f0ff}.tone-success{background:#d8f3e0}.tone-warning{background:#fff0b3}.tone-danger{background:#ffe2e2}.doc-embed{width:100%;height:360px;border:0}.doc-link-button{display:inline-block;background:#2b3a8f;color:white;padding:8px 16px;border-radius:6px}body>div>section{break-before:page}</style></head><body>${exportBody.innerHTML}</body></html>`;
    mime = "text/html";
  }
  return { source, mime };
}

/** Turn an uploaded file into validated pages. A .docx file's images are
 * uploaded to `uploadUrl` during conversion, so their links point at the
 * caller's own asset store. Throws with a reader-facing message. */
export async function readImportFile(
  file: File,
  uploadUrl: string,
): Promise<{ items: ImportItem[]; warnings: string[] }> {
  let text = await file.text();
  let warnings: string[] = [];
  if (/\.docx$/i.test(file.name)) {
    const { importDocx } = await import("./import-docx");
    const converted = await importDocx(file, uploadUrl);
    text = converted.html;
    warnings = converted.warnings;
  }
  let items: ImportItem[];
  if (file.name.endsWith(".json")) {
    const input = JSON.parse(text);
    if (
      input.format !== "fieldbook-doc-v1" ||
      !Array.isArray(input.pages) ||
      !input.pages.length ||
      input.pages.length > 100
    )
      throw new Error("Choose a Fieldbook JSON export with 1–100 pages.");
    items = input.pages;
  } else if (/\.(html?|docx)$/i.test(file.name)) {
    const [
      { generateJSON },
      { docEditorExtensions },
      { encodeRich },
      { MermaidCodeBlock },
    ] = await Promise.all([
      import("@tiptap/core"),
      import("@/lib/doc-editor-extensions"),
      import("@/lib/doc-rich-content"),
      import("@/lib/doc-mermaid-extension"),
    ]);
    items = [
      {
        title: file.name.replace(/\.[^.]+$/, "").slice(0, 200),
        template: "free",
        content: {
          body: encodeRich(
            generateJSON(
              text,
              docEditorExtensions(true, { codeBlock: MermaidCodeBlock }),
            ) as import("@/lib/doc-rich-content").RichNode,
          ),
        },
      },
    ];
  } else
    items = [
      {
        title: file.name.replace(/\.[^.]+$/, "").slice(0, 200),
        template: "free",
        content: { body: text },
      },
    ];
  for (const item of items) {
    if (
      !["free", "module"].includes(item.template) ||
      typeof item.title !== "string" ||
      !item.title.trim() ||
      item.title.length > 200
    )
      throw new Error("Invalid imported page.");
    parsePageContent(item.content, item.template);
  }
  return { items, warnings };
}
