"use client";
import { MAX_UPLOAD_BYTES } from '@/lib/upload-limits';
import DocIcon from "./doc-icon";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { publishedHref } from "@/lib/doc-publish-rules";
import {
  pageMarkdown,
  pageSections,
  parsePageContent,
  type DocPage,
} from "@/lib/doc-rules";
type ToolsData = {
  comments: {
    id: string;
    body: string;
    quote: string;
    resolved: boolean;
    createdAt: string;
    author: string | null;
    parentId: string | null;
    assigneeId: string | null;
  }[];
  templates: { id: string; title: string; kind: string }[];
  archived: { id: string; title: string }[];
  people: { id: string; name: string }[];
  tasks: { id: string; name: string }[];
  currentUserId?: string;
};
export default function PageTools({
  page,
  pages,
  base,
  projectId,
  canCreate,
  canEdit,
  editing,
  container,
}: {
  page: DocPage;
  pages: DocPage[];
  base: string;
  projectId: string;
  canCreate: boolean;
  canEdit: boolean;
  editing: boolean;
  container: React.RefObject<HTMLDivElement | null>;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<
    | "Comments"
    | "Export & Import"
    | "Templates"
    | "Relationships"
    | "Page settings"
    | "Page actions"
    | null
  >(null);
  const [data, setData] = useState<ToolsData>({
    comments: [],
    templates: [],
    archived: [],
    people: [],
    tasks: [],
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [comment, setComment] = useState(""),
    [quote, setQuote] = useState(""),
    [resolved, setResolved] = useState(false),
    [templateTitle, setTemplateTitle] = useState("");
  const [scope, setScope] = useState("page"),
    [confirmArchive, setConfirmArchive] = useState(false);
  const [settings, setSettings] = useState(page.settings ?? {});
  const [filter, setFilter] = useState("");
  const [parentId, setParentId] = useState(page.parentId ?? "");
  const [replyTo, setReplyTo] = useState<string | null>(null),
    [assigneeId, setAssigneeId] = useState(""),
    [assignedOnly, setAssignedOnly] = useState(false);
  const importFile = useRef<HTMLInputElement>(null),
    coverFile = useRef<HTMLInputElement>(null);
  useEffect(() => setSettings(page.settings ?? {}), [page.settings]);
  async function load() {
    const res = await fetch(`/api/doc-pages/${page.id}/tools`);
    if (!res.ok) throw new Error("Could not load page tools.");
    setData(await res.json());
  }
  useEffect(() => {
    if (panel) void load().catch((e) => setError(e.message));
  }, [panel, page.id]);
  async function action(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/doc-pages/${page.id}/tools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, updatedAt: page.updatedAt }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message ?? "Action failed.");
      if (result.slug) {
        window.location.assign(`${base}/${result.slug}`);
        return;
      }
      if (result.archived) {
        window.location.assign(`${base}?doc=${page.docId}`);
        return;
      }
      setNotice("Saved");
      if (body.action === "comment") {
        setComment("");
        setQuote("");
        setReplyTo(null);
      }
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function download(format: "md" | "json" | "html" | "print") {
    setBusy(true);
    setError("");
    try {
      const selected = scope === "doc" ? pages : [page];
      let source = "",
        mime = "text/plain;charset=utf-8";
      if (format === "md")
        source = selected
          .map((p) => `# ${p.title}\n\n${pageMarkdown(p.template, p.content)}`)
          .join("\n\n---\n\n");
      if (format === "json") {
        source = JSON.stringify(
          {
            format: "fieldbook-doc-v1",
            pages: selected.map(({ title, template, content }) => ({
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
          <>
            {selected.map((p) => (
              <section key={p.id}>
                <h1>{p.title}</h1>
                {pageSections(p.template).map(([key, label]) => (
                  <section key={key}>
                    {p.template === "module" && <h2>{label}</h2>}
                    <DocContent value={p.content[key] ?? ""} />
                  </section>
                ))}
              </section>
            ))}
          </>,
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
        const escape = (s: string) =>
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
        source = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(page.title)}</title><style>body{max-width:760px;margin:48px auto;font:16px/1.5 system-ui}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px}img{max-width:100%}.doc-columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}.doc-banner{padding:12px;background:#e8f0ff}.tone-success{background:#d8f3e0}.tone-warning{background:#fff0b3}.tone-danger{background:#ffe2e2}.doc-embed{width:100%;height:360px;border:0}.doc-link-button{display:inline-block;background:#2b3a8f;color:white;padding:8px 16px;border-radius:6px}body>div>section{break-before:page}</style></head><body>${exportBody.innerHTML}</body></html>`;
        mime = "text/html";
      }
      if (format === "print") {
        const frame = document.createElement("iframe");
        frame.style.position = "fixed";
        frame.style.width = "0";
        frame.style.height = "0";
        frame.style.border = "0";
        frame.title = "Print document";
        frame.onload = () => {
          frame.contentWindow?.addEventListener(
            "afterprint",
            () => frame.remove(),
            { once: true },
          );
          frame.contentWindow?.print();
        };
        frame.srcdoc = source;
        document.body.append(frame);
        return;
      }
      const blob = URL.createObjectURL(new Blob([source], { type: mime }));
      const a = document.createElement("a");
      a.href = blob;
      a.download = `${page.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100)}.${format}`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blob), 1000);
      setNotice("Export prepared. Check your browser downloads.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function importDoc(file: File) {
    if (!file.size || file.size > 5 * 1024 * 1024) {
      setError("Choose a non-empty file up to 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    let created = 0;
    try {
      let text = await file.text();
      let conversionWarnings: string[] = [];
      if (/\.docx$/i.test(file.name)) {
        const { importDocx } = await import("./import-docx");
        const converted = await importDocx(file, projectId);
        text = converted.html;
        conversionWarnings = converted.warnings;
      }
      let items: {
        title: string;
        template: "free" | "module";
        content: Record<string, string>;
      }[];
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
        const [{ generateJSON }, { docEditorExtensions }, { encodeRich }] =
          await Promise.all([
            import("@tiptap/core"),
            import("@/lib/doc-editor-extensions"),
            import("@/lib/doc-rich-content"),
          ]);
        items = [
          {
            title: file.name.replace(/\.[^.]+$/, "").slice(0, 200),
            template: "free",
            content: {
              body: encodeRich(
                generateJSON(
                  text,
                  docEditorExtensions(true),
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
      for (const item of items) {
        const res = await fetch(`/api/docs/${page.docId}/pages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Import failed.");
        created++;
      }
      setNotice(
        `Imported ${created} page(s). Existing pages were not replaced.${conversionWarnings.length ? " Conversion notes: " + conversionWarnings.join(" ") : ""}`,
      );
      router.refresh();
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Import failed."}${created ? ` ${created} page(s) already imported; do not import them again.` : ""}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function cover(file: File) {
    if (!file.size || file.size > MAX_UPLOAD_BYTES) {
      setError("Choose an image up to 50 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("kind", "image");
      const res = await fetch(`/api/projects/${projectId}/doc-assets`, {
        method: "POST",
        body,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      setSettings((s) => ({ ...s, cover: result.url }));
      setNotice("Cover uploaded. Save page settings to apply.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || editing;
  const relationField = (
    key: "relatedPages" | "relatedTasks" | "owners",
    label: string,
    items: { id: string; name: string }[],
  ) => (
    <fieldset disabled={locked || !canEdit || page.protected}>
      <legend>{label}</legend>
      {items.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            checked={String(settings[key] ?? "")
              .split(",")
              .includes(item.id)}
            onChange={(e) => {
              const ids = String(settings[key] ?? "")
                .split(",")
                .filter(Boolean);
              setSettings({
                ...settings,
                [key]: (e.target.checked
                  ? [...ids, item.id]
                  : ids.filter((id) => id !== item.id)
                ).join(","),
              });
            }}
          />
          {item.name}
        </label>
      ))}
    </fieldset>
  );
  return (
    <>
      <div className="doc-extra-rail" role="group" aria-label="Document tools">
        {(
          [
            "Comments",
            "Export & Import",
            "Templates",
            "Relationships",
            "Page settings",
            "Page actions",
          ] as const
        ).map((name) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            title={name}
            aria-expanded={panel === name}
            onClick={() => {
              setPanel(panel === name ? null : name);
              setError("");
              setNotice("");
              if (name === "Comments")
                setQuote(
                  window.getSelection()?.toString().slice(0, 2000) ?? "",
                );
            }}
          >
            <DocIcon name={name} />
          </button>
        ))}
      </div>
      {panel && (
        <aside
          className="doc-style-panel doc-tools-panel"
          aria-label={panel}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPanel(null);
          }}
        >
          <header>
            <h2>{panel}</h2>
            <button
              type="button"
              aria-label="Close document tools"
              onClick={() => setPanel(null)}
            ><DocIcon name="close" /></button>
          </header>
          {error && (
            <p role="alert" className="editor-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {panel === "Comments" && (
            <>
              <div className="doc-style-choices">
                <button
                  aria-pressed={!resolved}
                  onClick={() => setResolved(false)}
                ><DocIcon name="comment" />
                  Open
                </button>
                <button
                  aria-pressed={resolved}
                  onClick={() => setResolved(true)}
                ><DocIcon name="check" />
                  Resolved
                </button>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={assignedOnly}
                  onChange={(e) => setAssignedOnly(e.target.checked)}
                />
                Assigned to me
              </label>
              {data.comments
                .filter(
                  (c) =>
                    c.resolved === resolved &&
                    (!assignedOnly || c.assigneeId === data.currentUserId),
                )
                .map((c) => (
                  <article className="doc-comment" key={c.id}>
                    <strong>{c.author ?? "Former member"}</strong>
                    <time>{new Date(c.createdAt).toLocaleString()}</time>
                    {c.quote && <blockquote>{c.quote}</blockquote>}
                    {c.parentId && (
                      <blockquote>
                        Reply to:{" "}
                        {data.comments.find((p) => p.id === c.parentId)?.body ??
                          "Earlier comment"}
                      </blockquote>
                    )}
                    <p>{c.body}</p>
                    {c.assigneeId && (
                      <p>
                        Assigned to{" "}
                        {data.people.find((p) => p.id === c.assigneeId)?.name ??
                          "Former member"}
                      </p>
                    )}
                    {canEdit && (
                      <button disabled={busy} onClick={() => setReplyTo(c.id)}><DocIcon name="reply" />
                        Reply
                      </button>
                    )}
                    {canEdit && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action({
                            action: "resolve",
                            commentId: c.id,
                            resolved: !c.resolved,
                          })
                        }
                      ><DocIcon name={c.resolved ? "history" : "check"} />
                        {c.resolved ? "Reopen" : "Resolve"}
                      </button>
                    )}
                  </article>
                ))}
              {!data.comments.some((c) => c.resolved === resolved) && (
                <p className="docs-muted">
                  No {resolved ? "resolved" : "open"} comments.
                </p>
              )}
              {canEdit && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action({
                      action: "comment",
                      body: comment,
                      quote,
                      parentId: replyTo,
                      assigneeId: assigneeId || null,
                    });
                  }}
                >
                  {replyTo && (
                    <p>
                      Replying to{" "}
                      {data.comments.find((c) => c.id === replyTo)?.author}
                      <button type="button" onClick={() => setReplyTo(null)}><DocIcon name="close" />
                        Cancel reply
                      </button>
                    </p>
                  )}
                  <label>
                    Assign to
                    <select
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {data.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quoted text
                    <textarea
                      value={quote}
                      maxLength={2000}
                      onChange={(e) => setQuote(e.target.value)}
                    />
                  </label>
                  <label>
                    Comment
                    <textarea
                      required
                      maxLength={10000}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </label>
                  <button disabled={busy || !comment.trim()}><DocIcon name="send" />
                    Send comment
                  </button>
                </form>
              )}
            </>
          )}
          {panel === "Export & Import" && (
            <>
              <label>
                Export scope
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="page">This page</option>
                  <option value="doc">Entire Doc</option>
                </select>
              </label>
              <p className="docs-muted">
                Exports use saved content. Markdown omits colors and advanced
                layout; JSON preserves them. HTML references attached files on
                this server.
              </p>
              <button disabled={editing} onClick={() => void download("md")}><DocIcon name="download" />
                Markdown
              </button>
              <button disabled={editing} onClick={() => void download("json")}><DocIcon name="download" />
                Fieldbook JSON
              </button>
              <button disabled={editing} onClick={() => void download("html")}><DocIcon name="download" />
                HTML
              </button>
              <button disabled={editing} onClick={() => void download("print")}><DocIcon name="print" />
                Print / Save as PDF
              </button>
              {canCreate && (
                <>
                  <h3>Import as new pages</h3>
                  <p className="docs-muted">
                    Word (.docx), Markdown, text, HTML or Fieldbook JSON. HTML
                    imports preserve supported editor blocks and formatting.
                    Existing content is never replaced.
                  </p>
                  <input
                    ref={importFile}
                    type="file"
                    accept=".md,.markdown,.txt,.docx,.html,.htm,.json"
                    disabled={locked}
                    aria-label="Import document file"
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void importDoc(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
            </>
          )}
          {panel === "Templates" && (
            <>
              <label>
                Find a template
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              {data.templates
                .filter((t) =>
                  t.title.toLowerCase().includes(filter.toLowerCase()),
                )
                .map((t) => (
                  <div className="doc-comment" key={t.id}>
                    <strong>{t.title}</strong>
                    <p className="docs-muted">{t.kind}</p>
                    {canCreate && (
                      <button
                        disabled={locked || t.kind !== page.template}
                        onClick={() =>
                          void action({
                            action: "applyTemplate",
                            templateId: t.id,
                          })
                        }
                      ><DocIcon name="template" />
                        Create page from template
                      </button>
                    )}
                  </div>
                ))}
              {!data.templates.length && (
                <p className="docs-muted">No project templates yet.</p>
              )}
              {canCreate && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action({ action: "template", title: templateTitle });
                  }}
                >
                  <label>
                    Template name
                    <input
                      required
                      maxLength={200}
                      value={templateTitle}
                      onChange={(e) => setTemplateTitle(e.target.value)}
                    />
                  </label>
                  <button disabled={locked}><DocIcon name="save" />Save this page as template</button>
                </form>
              )}
            </>
          )}
          {panel === "Page settings" && (
            <>
              <p className="docs-muted">
                Settings are saved with this page for all project members.
              </p>
              <fieldset disabled={locked || !canEdit || page.protected}>
                <label>
                  Page icon
                  <input
                    maxLength={16}
                    value={String(settings.icon ?? "")}
                    onChange={(e) =>
                      setSettings({ ...settings, icon: e.target.value })
                    }
                  />
                </label>
                <label>
                  Subtitle
                  <input
                    maxLength={300}
                    value={String(settings.subtitle ?? "")}
                    onChange={(e) =>
                      setSettings({ ...settings, subtitle: e.target.value })
                    }
                  />
                </label>
                <label>
                  Font
                  <select
                    value={String(settings.font ?? "system")}
                    onChange={(e) =>
                      setSettings({ ...settings, font: e.target.value })
                    }
                  >
                    {["system", "serif", "mono"].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Size
                  <select
                    value={String(settings.size ?? "default")}
                    onChange={(e) =>
                      setSettings({ ...settings, size: e.target.value })
                    }
                  >
                    {["small", "default", "large"].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                {(["wide", "showStats", "showModified"] as const).map((k) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={Boolean(settings[k] ?? k === "showModified")}
                      onChange={(e) =>
                        setSettings({ ...settings, [k]: e.target.checked })
                      }
                    />
                    {
                      {
                        wide: "Full width",
                        showStats: "Show stats",
                        showModified: "Last modified",
                      }[k]
                    }
                  </label>
                ))}
                <input
                  ref={coverFile}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
                  aria-label="Upload cover image"
                  onChange={(e) => {
                    if (e.target.files?.[0]) void cover(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
                {settings.cover && (
                  <button
                    onClick={() => setSettings({ ...settings, cover: "" })}
                  ><DocIcon name="move" />
                    Remove cover
                  </button>
                )}
                <button
                  onClick={() => void action({ action: "settings", settings })}
                ><DocIcon name="save" />
                  Save page settings
                </button>
              </fieldset>
            </>
          )}
          {panel === "Page actions" && (
            <>
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(`${location.origin}${base}/${page.slug}`)
                    .then(() => setNotice("Link copied"))
                    .catch(() =>
                      setError(
                        "Could not copy link. Copy it from the address bar.",
                      ),
                    )
                }
              ><DocIcon name="link" />
                Copy page link
              </button>
              {canCreate && (
                <>
                  {/* Publishing (spec 10 §8b). The link is the secret, so the
                      panel shows the state plainly rather than hiding it
                      behind a toggle: a page that is out there says so every
                      time anybody opens this menu. */}
                  {page.publishToken ? (
                    <>
                      <p className="doc-published">
                        Published — anyone with this link can read this page.
                      </p>
                      <button
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(`${location.origin}${publishedHref(page.publishToken!)}`)
                            .then(() => setNotice("Public link copied"))
                            .catch(() =>
                              setError("Could not copy the link. Open it and copy from the address bar."),
                            )
                        }
                      ><DocIcon name="link" />
                        Copy public link
                      </button>
                      <a
                        className="doc-published-open"
                        href={publishedHref(page.publishToken)}
                        target="_blank"
                        rel="noopener noreferrer"
                      ><DocIcon name="file" />
                        Open public page
                      </a>
                      <button
                        disabled={busy}
                        onClick={() => void action({ action: "unpublish" })}
                      ><DocIcon name="lock" />
                        Unpublish (revokes the link)
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => void action({ action: "publish" })}
                    ><DocIcon name="link" />
                      Publish as read-only link…
                    </button>
                  )}
                  <button
                    disabled={locked}
                    onClick={() => void action({ action: "duplicate" })}
                  ><DocIcon name="copy" />
                    Duplicate page
                  </button>
                  <button
                    disabled={locked}
                    onClick={() =>
                      void action({
                        action: "protect",
                        protected: !page.protected,
                      })
                    }
                  ><DocIcon name={page.protected ? "unlock" : "lock"} />
                    {page.protected ? "Unprotect page" : "Protect page"}
                  </button>
                  <button
                    disabled={locked || page.protected}
                    onClick={() => setConfirmArchive(!confirmArchive)}
                  ><DocIcon name="archive" />
                    Archive page…
                  </button>
                  {confirmArchive && (
                    <>
                      <p>
                        Archive “{page.title}”? Content is retained. Subpages
                        must be archived first.
                      </p>
                      <button
                        disabled={locked}
                        onClick={() => void action({ action: "archive" })}
                      ><DocIcon name="archive" />
                        Confirm archive
                      </button>
                      <button onClick={() => setConfirmArchive(false)}><DocIcon name="close" />
                        Cancel
                      </button>
                    </>
                  )}
                </>
              )}
              {editing && (
                <p className="docs-muted">
                  Finish editing before changing page structure or exporting.
                </p>
              )}
            </>
          )}
          {panel === "Relationships" && (
            <>
              <h3>Linked pages</h3>
              {pages
                .filter((p) =>
                  String(page.settings?.relatedPages ?? "")
                    .split(",")
                    .includes(p.id),
                )
                .map((p) => (
                  <a
                    className="doc-related-link"
                    key={p.id}
                    href={`${base}/${p.slug}`}
                  >
                    {p.title}
                  </a>
                ))}
              <h3>Linked tasks</h3>
              {data.tasks
                .filter((t) =>
                  String(page.settings?.relatedTasks ?? "")
                    .split(",")
                    .includes(t.id),
                )
                .map((t) => (
                  <a
                    className="doc-related-link"
                    key={t.id}
                    href={`/p/${base.split("/")[2]}?node=${t.id}`}
                  >
                    {t.name}
                  </a>
                ))}
              {relationField(
                "relatedPages",
                "Pages in this Doc",
                pages
                  .filter((p) => p.id !== page.id)
                  .map((p) => ({ id: p.id, name: p.title })),
              )}
              {relationField("relatedTasks", "Project tasks", data.tasks)}
              {canEdit && (
                <button
                  disabled={locked || page.protected}
                  onClick={() => void action({ action: "settings", settings })}
                ><DocIcon name="save" />
                  Save relationships
                </button>
              )}
            </>
          )}
          {panel === "Page settings" && (
            <>
              {relationField("owners", "Owners", data.people)}
              {canEdit && (
                <>
                  <button
                    disabled={locked || page.protected}
                    onClick={() =>
                      void action({ action: "settings", settings })
                    }
                  ><DocIcon name="save" />
                    Save owners
                  </button>
                  <button
                    disabled={locked || page.protected}
                    onClick={() =>
                      void action({
                        action: "settings",
                        settings,
                        allPages: true,
                      })
                    }
                  ><DocIcon name="save" />
                    Apply typography to all pages
                  </button>
                </>
              )}
            </>
          )}
          {panel === "Page actions" && canCreate && (
            <>
              <h3>Move page</h3>
              <label>
                Parent page
                <select
                  disabled={locked || page.protected}
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">Top level</option>
                  {pages
                    .filter((p) => p.id !== page.id && p.depth < 3)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={locked || page.protected}
                onClick={() =>
                  void action({ action: "move", parentId: parentId || null })
                }
              ><DocIcon name="move" />
                Move page
              </button>
            </>
          )}
          {panel === "Page actions" && canCreate && !!data.archived.length && (
            <>
              <h3>Archived pages</h3>
              {data.archived.map((p) => (
                <div className="doc-comment" key={p.id}>
                  <span>{p.title}</span>
                  <button
                    disabled={locked}
                    onClick={() =>
                      void action({ action: "restore", pageId: p.id })
                    }
                  ><DocIcon name="history" />
                    Restore
                  </button>
                </div>
              ))}
            </>
          )}
        </aside>
      )}
    </>
  );
}
