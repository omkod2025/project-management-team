import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import {safeDocUrl,safeEmbed} from './doc-rich-content.ts';
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
export function normalizedColor(value: string, fallback: string) {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const rgb =
    /^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)(?:\s*[,/]\s*1)?\s*\)$/.exec(
      value,
    );
  return rgb
    ? "#" +
        rgb
          .slice(1, 4)
          .map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0"))
          .join("")
    : fallback;
}
export const TextColor = Mark.create({
  name: "textColor",
  addAttributes: () => ({
    color: {
      default: "#202020",
      parseHTML: (e) =>
        normalizedColor(
          e.getAttribute("data-color") || e.style.color,
          "#202020",
        ),
    },
  }),
  parseHTML: () => [{ tag: "span[data-color]" }, { style: "color" }],
  renderHTML: ({ HTMLAttributes }) => [
    "span",
    {
      "data-color": HTMLAttributes.color,
      style: `color:${HTMLAttributes.color}`,
    },
    0,
  ],
});
export const Highlight = Mark.create({
  name: "highlight",
  addAttributes: () => ({
    color: {
      default: "#fff0b3",
      parseHTML: (e) =>
        normalizedColor(
          e.getAttribute("data-color") || e.style.backgroundColor,
          "#fff0b3",
        ),
    },
  }),
  parseHTML: () => [{ tag: "mark" }, { style: "background-color" }],
  renderHTML: ({ HTMLAttributes }) => [
    "mark",
    {
      "data-color": HTMLAttributes.color,
      style: `background-color:${HTMLAttributes.color}`,
    },
    0,
  ],
});
export const Alignment = Extension.create({
  name: "alignment",
  addGlobalAttributes: () => [
    {
      types: ["heading", "paragraph"],
      attributes: {
        textAlign: {
          default: "left",
          parseHTML: (e) => e.style.textAlign || "left",
          renderHTML: (attrs) => ({ style: `text-align:${attrs.textAlign}` }),
        },
      },
    },
  ],
});
export const Banner = Node.create({
  name: "banner",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => ({ tone: { default: "info",parseHTML:e=>e.getAttribute('data-tone')||e.getAttribute('tone')||'info' } }),
  parseHTML: () => [{ tag: "aside[data-banner]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "aside",
    mergeAttributes(HTMLAttributes, {
      "data-banner": "",
      class: `doc-banner tone-${HTMLAttributes.tone}`,
    }),
    0,
  ],
});
export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes:()=>({label:{default:'Toggle',parseHTML:e=>e.querySelector('summary')?.textContent ?? 'Toggle'}}),
  parseHTML: () => [{ tag: "details[data-toggle]",contentElement:'div' }],
  renderHTML: ({HTMLAttributes}) => [
    "details",
    { "data-toggle": "", open: true },
    ["summary", { contenteditable: "false" }, String(HTMLAttributes.label)],
    ["div", 0],
  ],
  addNodeView(){return({node,getPos,editor})=>{
    let current=node;const dom=document.createElement('details');dom.open=true;dom.dataset.toggle='';
    const summary=document.createElement('summary'),input=document.createElement('input'),contentDOM=document.createElement('div');input.value=String(node.attrs.label??'Toggle');input.maxLength=200;input.setAttribute('aria-label','Toggle title');input.className='doc-toggle-title';
    input.addEventListener('input',()=>{const pos=getPos();if(typeof pos==='number')editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,label:input.value}));});
    summary.append(input);dom.append(summary,contentDOM);
    return{dom,contentDOM,update(next){if(next.type!==node.type)return false;current=next;if(input.value!==String(next.attrs.label))input.value=String(next.attrs.label);return true;},stopEvent:event=>event.target===input,ignoreMutation:mutation=>mutation.type!=='selection'&&(mutation.target===input||mutation.target===dom)};
  };},
});
export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,3}",
  defining: true,
  parseHTML: () => [{ tag: "div[data-columns]" }],
  renderHTML: () => ["div", { "data-columns": "", class: "doc-columns" }, 0],
});
export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  parseHTML: () => [{ tag: "div[data-column]" }],
  renderHTML: () => ["div", { "data-column": "" }, 0],
});
export const LinkButton = Node.create({
  name: "linkButton",
  group: "block",
  atom: true,
  addAttributes: () => ({
    href: { default: "" },
    label: { default: "Open link",parseHTML:e=>e.textContent||'Open link' },
  }),
  parseHTML: () => [{ tag: "a[data-doc-button]",getAttrs:e=>safeDocUrl(e.getAttribute('href'))?null:false }],
  renderHTML: ({ HTMLAttributes }) => safeDocUrl(HTMLAttributes.href)?[
    "a",
    {
      "data-doc-button": "",
      href: HTMLAttributes.href,
      class: "doc-link-button",
    },
    String(HTMLAttributes.label),
  ]:['span',{},'Unsupported link'],
});
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  addAttributes: () => ({ src: { default: "" } }),
  parseHTML: () => [{ tag: "iframe[data-doc-embed]",getAttrs:e=>safeEmbed(e.getAttribute('src'))?null:false }],
  renderHTML: ({ HTMLAttributes }) => safeEmbed(HTMLAttributes.src)?[
    "iframe",
    {
      "data-doc-embed": "",
      src: HTMLAttributes.src,
      title: "Embedded content",
      sandbox: "allow-scripts allow-same-origin allow-presentation",
      referrerpolicy: "no-referrer",
      loading: "lazy",
      class: "doc-embed",
    },
  ]:['div',{},'Unsupported embed'],
});
export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  parseHTML: () => [{ tag: "nav[data-doc-toc]" }],
  renderHTML: () => [
    "nav",
    { "data-doc-toc": "", class: "doc-toc" },
    "Table of contents — generated from headings in reading mode",
  ],
});
export const FocusBlock = Extension.create({
  name: "focusBlock",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const from = state.selection.$from;
            if (from.depth < 1) return DecorationSet.empty;
            const start = from.before(1),
              node = from.node(1);
            return DecorationSet.create(state.doc, [
              Decoration.node(start, start + node.nodeSize, {
                class: "doc-current-block",
              }),
            ]);
          },
        },
      }),
    ];
  },
});
