/** Versioned rich content inside existing string slots. Legacy Markdown is untouched. */
export const RICH_PREFIX = "fieldbook-rich-v1:";
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: RichNode[];
  content?: RichNode[];
};
const types = new Set([
  "doc",
  "text",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "image",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "banner",
  "toggle",
  "columns",
  "column",
  "linkButton",
  "embed",
  "tableOfContents",
]);
const marks = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "textColor",
  "highlight",
]);
export const safeDocUrl = (url: unknown): url is string =>
  typeof url === "string" &&
  !!url &&
  !/[\u0000-\u0020\\]/.test(url) &&
  !url.startsWith("//") &&
  (!/^[a-z][a-z\d+.-]*:/i.test(url) ||
    /^(https?:\/\/|mailto:|tel:)/i.test(url));
export const safeColor = (color: unknown): color is string =>
  typeof color === "string" && /^#[\da-f]{6}$/i.test(color);
export function safeEmbed(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      [
        "www.youtube.com",
        "www.youtube-nocookie.com",
        "player.vimeo.com",
        "www.figma.com",
        "docs.google.com",
        "www.loom.com",
        "miro.com",
      ].includes(u.hostname) &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}

export function decodeRich(value: string): RichNode | null {
  if (!value.startsWith(RICH_PREFIX)) return null;
  const tree: unknown = JSON.parse(value.slice(RICH_PREFIX.length));
  let count = 0;
  const check = (
    raw: unknown,
    depth: number,
    mark = false,
  ): raw is RichNode => {
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      depth > 32 ||
      ++count > 20000
    )
      return false;
    const n = raw as RichNode;
    if (
      !(mark ? marks : types).has(n.type) ||
      (n.text !== undefined && typeof n.text !== "string")
    )
      return false;
    if (mark && (n.content || n.marks || n.text)) return false;
    if (n.type === "text" && (!n.text || n.content)) return false;
    if (!mark && n.type !== "text" && n.text !== undefined) return false;
    const children = n.content ?? [];
    if (!Array.isArray(children)) return false;
    const childTypes: Record<string, string[]> = {
      paragraph: ["text", "hardBreak"],
      heading: ["text", "hardBreak"],
      codeBlock: ["text"],
      bulletList: ["listItem"],
      orderedList: ["listItem"],
      taskList: ["taskItem"],
      table: ["tableRow"],
      tableRow: ["tableCell", "tableHeader"],
      columns: ["column"],
    };
    const allowedChildren = childTypes[n.type];
    if (
      allowedChildren &&
      children.some((c) => !c || !allowedChildren.includes(c.type))
    )
      return false;
    if (
      [
        "hardBreak",
        "horizontalRule",
        "image",
        "linkButton",
        "embed",
        "tableOfContents",
      ].includes(n.type) &&
      children.length
    )
      return false;
    if (n.type === "embed" && !safeEmbed(n.attrs?.src)) return false;
    if (n.type === "columns" && (children.length < 2 || children.length > 3))
      return false;
    if (
      [
        "doc",
        "blockquote",
        "banner",
        "toggle",
        "column",
        "listItem",
        "taskItem",
        "tableCell",
        "tableHeader",
      ].includes(n.type) &&
      children.some(
        (c) =>
          !c ||
          [
            "text",
            "hardBreak",
            "doc",
            "tableRow",
            "tableCell",
            "tableHeader",
            "column",
            "listItem",
            "taskItem",
          ].includes(c.type),
      )
    )
      return false;
    if (
      Object.keys(n).some(
        (k) => !["type", "text", "attrs", "marks", "content"].includes(k),
      )
    )
      return false;
    if (n.attrs !== undefined) {
      if (!n.attrs || typeof n.attrs !== "object" || Array.isArray(n.attrs))
        return false;
      for (const [key, val] of Object.entries(n.attrs)) {
        if (
          ![
            "level",
            "start",
            "checked",
            "language",
            "href",
            "target",
            "rel",
            "class",
            "src",
            "alt",
            "title",
            "label",
            "width",
            "height",
            "colspan",
            "rowspan",
            "colwidth",
            "textAlign",
            "align",
            "type",
            "color",
            "backgroundColor",
            "tone",
            "open",
          ].includes(key)
        )
          return false;
        if (val === null) continue;
        if (key === "align" && (!['tableCell','tableHeader'].includes(n.type) || !['left','center','right','justify'].includes(String(val)))) return false;
        if (key === "type" && (n.type !== 'orderedList' || !['1','a','A','i','I'].includes(String(val)))) return false;
        if (["href", "src"].includes(key) && !safeDocUrl(val)) return false;
        if (["color", "backgroundColor"].includes(key) && !safeColor(val))
          return false;
        if (
          key === "textAlign" &&
          !["left", "center", "right", "justify"].includes(String(val))
        )
          return false;
        if (
          key === "tone" &&
          !["info", "success", "warning", "danger"].includes(String(val))
        )
          return false;
        if (
          key === "level" &&
          !(Number.isInteger(val) && Number(val) >= 1 && Number(val) <= 6)
        )
          return false;
        if (
          ["colspan", "rowspan"].includes(key) &&
          !(Number.isInteger(val) && Number(val) >= 1 && Number(val) <= 100)
        )
          return false;
        if (
          key === "colwidth" &&
          !(
            Array.isArray(val) &&
            val.length <= 100 &&
            val.every((v) => Number.isInteger(v) && v > 0 && v <= 10000)
          )
        )
          return false;
        if (
          key !== "colwidth" &&
          typeof val !== "string" &&
          typeof val !== "boolean" &&
          typeof val !== "number"
        )
          return false;
      }
    }
    return (
      (!n.marks ||
        (Array.isArray(n.marks) &&
          n.marks.length <= 10 &&
          n.marks.every((m) => check(m, depth + 1, true)))) &&
      (!n.content ||
        (Array.isArray(n.content) &&
          n.content.every((c) => check(c, depth + 1))))
    );
  };
  if (!check(tree, 0) || tree.type !== "doc")
    throw new Error("Unsupported or invalid rich document.");
  return tree;
}
export function encodeRich(tree: RichNode) {
  const value = RICH_PREFIX + JSON.stringify(tree);
  decodeRich(value);
  return value;
}

/** Portable export is intentionally lossy for color, layout and merged cells. */
export function contentMarkdown(value: string): string {
  let tree: RichNode | null;
  try {
    tree = decodeRich(value);
  } catch {
    return value;
  }
  if (!tree) return value;
  const escape = (s: string) => s.replace(/([\\`*_[\]<>])/g, "\\$1");
  const render = (n: RichNode): string => {
    const children = () => (n.content ?? []).map(render).join("");
    if (n.type === "text") {
      let s = escape(n.text ?? "");
      for (const m of n.marks ?? []) {
        if (m.type === "bold") s = `**${s}**`;
        if (m.type === "italic") s = `*${s}*`;
        if (m.type === "strike") s = `~~${s}~~`;
        if (m.type === "code")
          s = "`" + (n.text ?? "").replace(/`/g, "\\`") + "`";
        if (m.type === "link")
          s = `[${s}](${String(m.attrs?.href ?? "").replace(/[()]/g, (c) => encodeURIComponent(c))})`;
      }
      return s;
    }
    if (n.type === "heading")
      return (
        "#".repeat(Number(n.attrs?.level ?? 1)) + " " + children() + "\n\n"
      );
    if (n.type === "paragraph") return children() + "\n\n";
    if (n.type === "hardBreak") return "  \n";
    if (n.type === "horizontalRule") return "\n---\n\n";
    if (n.type === "image")
      return `![${escape(String(n.attrs?.alt ?? ""))}](${n.attrs?.src})\n\n`;
    if (n.type === "linkButton")
      return `[${escape(String(n.attrs?.label ?? "Open link"))}](${n.attrs?.href})\n\n`;
    if (n.type === "embed") return `[Embedded content](${n.attrs?.src})\n\n`;
    if (n.type === "codeBlock")
      return (
        "```" +
        String(n.attrs?.language ?? "").replace(/[\r\n`]/g, "") +
        "\n" +
        (n.content ?? []).map((x) => x.text ?? "").join("") +
        "\n```\n\n"
      );
    if (["bulletList", "orderedList", "taskList"].includes(n.type))
      return (
        (n.content ?? [])
          .map(
            (x, i) =>
              `${n.type === "orderedList" ? `${Number(n.attrs?.start ?? 1) + i}.` : "-"} ${n.type === "taskList" ? `[${x.attrs?.checked ? "x" : " "}] ` : ""}${render(x).trim().replace(/\n/g, "\n  ")}\n`,
          )
          .join("") + "\n"
      );
    if (n.type === "blockquote" || n.type === "banner")
      return (
        children()
          .trim()
          .split("\n")
          .map((x) => "> " + x)
          .join("\n") + "\n\n"
      );
    if (n.type === "table") {
      const rows = (n.content ?? []).map((r) =>
        (r.content ?? []).map((c) =>
          render(c).trim().replace(/\n+/g, " ").replace(/\|/g, "\\|"),
        ),
      );
      if (!rows.length) return "";
      return (
        rows
          .map(
            (r, i) =>
              "| " +
              r.join(" | ") +
              " |\n" +
              (i === 0 ? "| " + r.map(() => "---").join(" | ") + " |\n" : ""),
          )
          .join("") + "\n"
      );
    }
    return children();
  };
  return render(tree).trimEnd();
}
