# Mermaid Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render ```` ```mermaid ```` code blocks as diagrams in Docs (read mode, editor, published `/d/<token>` page). This plan is Part 1 of 2. Part 2 (`2026-11-04-wiki.md`) reuses everything here.

**Architecture:** A Mermaid block is a `codeBlock` whose `language` is `mermaid`. Nothing new is stored. Pure rules (detect, limit, sanitize-config) live in `src/lib/mermaid-rules.ts`. One client component, `MermaidDiagram`, lazy-loads `mermaid` and renders sanitized SVG. Both renderers (`DocContent` for rich JSON, ReactMarkdown for legacy Markdown) and a TipTap node view in the editor delegate to it.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching routes or client components), TipTap 3, `mermaid` (new dependency), `dompurify` (new dependency), node:test.

**Spec:** `docs/superpowers/specs/2026-11-04-wiki-design.md` §3

## Global Constraints

- Storage stays `codeBlock{language:'mermaid'}` / a ```` ```mermaid ```` fence. Never a new rich node type, and never an addition to the `types` allowlist in `src/lib/doc-rich-content.ts`.
- The Mermaid source is limited to 50,000 characters per block. Refuse on save with `E_INVALID_DOC`, and the message is "Keep each Mermaid diagram within 50,000 characters."
- `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'base', themeVariables: <tokens> })`. The SVG passes DOMPurify (`USE_PROFILES: { svg: true, svgFilters: true }`) before it is inserted. Click and href directives never take effect.
- Read mode is server-rendered. `mermaid` must be loaded only through a dynamic `import()` inside a client component, and only when a page has a Mermaid block. The editor bundle must never be pulled into read mode.
- DESIGN.md: square corners, no shadows, no gradients. Graphite ink on paper. No vermilion and no raw `tab-` hues in diagrams. Errors are shown in ordinary ink. Thai is never below 13px and never gets letter-spacing.
- Imports inside tested modules use explicit `.ts` extensions (Node strips types, so there is no build step).
- The user's source is never altered or dropped, including source that does not parse.

## Review Focus

1. **Source that does not parse in read mode.** The reader must see the source as a code block, never an empty space. Covered in Task 2 (`MermaidDiagram` error branch) and checked in the browser test in Task 4.
2. **Info string variants** `Mermaid`, ` mermaid `, `mermaid title`. Treat them as Mermaid using a trimmed, case-insensitive first word. Pinned in the Task 1 test `isMermaidLanguage`.
3. **A `<script>` or `javascript:` link inside a label on the published page.** It must not run. Covered in the Task 2 config test and the Task 4 browser test.
4. **A Mermaid block inside a toggle, column or table cell.** It must render the same way. Covered by the Task 3 renderer test, which places a block inside `toggle`.
5. **A legacy Markdown page opened in the editor.** The fence must become a Mermaid node view and save back byte-identical. Pinned in the Task 3 round-trip test.

---

### Task 1: Pure Mermaid rules

**Files:**
- Create: `src/lib/mermaid-rules.ts`
- Modify: `src/lib/doc-rules.ts` (`parsePageContent`: call `assertMermaidLimits` on each slot)
- Test: `tests/mermaid-rules.test.ts`

**Interfaces:**
- Produces:
  - `MERMAID_MAX_CHARS = 50_000`
  - `isMermaidLanguage(lang: unknown): boolean` returns true when `String(lang).trim().split(/\s+/)[0].toLowerCase() === 'mermaid'`
  - `mermaidSources(value: string): string[]` returns every Mermaid source in a slot, whether it is rich JSON (walk `codeBlock` nodes at any depth) or legacy Markdown (fences)
  - `assertMermaidLimits(value: string): void` throws `domainError('E_INVALID_DOC', 'Keep each Mermaid diagram within 50,000 characters.')`
  - `MERMAID_CONFIG`: the frozen initialize object from Global Constraints, with `themeVariables` taken from the `tokens.css` paper and ink values (look them up and write the hex values in)

- [ ] **Step 1: Write the failing tests.** In `tests/mermaid-rules.test.ts`:
  - `isMermaidLanguage`: `'mermaid'`, `'Mermaid'`, `' mermaid '`, `'mermaid title'` → true. `'js'`, `''`, `null`, `'mermaidx'` → false.
  - `mermaidSources` on Markdown ```` "a\n\n```mermaid\nflowchart LR\n A-->B\n```\n" ```` → `['flowchart LR\n A-->B']`. On `encodeRich` of a doc containing `toggle > codeBlock{language:'mermaid'}` with text `graph TD; ก-->ข` → `['graph TD; ก-->ข']`. A `js` fence → `[]`.
  - `assertMermaidLimits` passes at exactly 50,000 characters and throws `E_INVALID_DOC` at 50,001.
  - `parsePageContent({body: <md with 50,001-char mermaid>}, 'free')` throws `E_INVALID_DOC`.
  - `MERMAID_CONFIG.securityLevel === 'strict'`, `htmlLabels === false`, `startOnLoad === false`, and `Object.isFrozen(MERMAID_CONFIG)`.
- [ ] **Step 2: Run the tests.** Run `node --test tests/mermaid-rules.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement** `src/lib/mermaid-rules.ts`. Fence detection is a line scan for ```` ``` ```` or `~~~` openers whose info string passes `isMermaidLanguage`, collecting lines until the matching closer.
- [ ] **Step 4: Run the tests.** Run `node --test tests/mermaid-rules.test.ts && npm run check`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: mermaid block rules"`

### Task 2: `MermaidDiagram` client component and dependencies

**Files:**
- Modify: `package.json`. Run `npm install mermaid dompurify`. Install `@types/dompurify` only if the installed `dompurify` ships no types.
- Create: `src/app/(signed-in)/p/[slug]/docs/mermaid-diagram.tsx` (`'use client'`)
- Modify: `src/app/(signed-in)/p/[slug]/docs/editor.css` (`.doc-mermaid`, `.doc-mermaid-error`, `.doc-mermaid-copy`)

**Interfaces:**
- Consumes: `MERMAID_CONFIG` from Task 1.
- Produces: `export default function MermaidDiagram({ source, showSource = false }: { source: string; showSource?: boolean })`
  - The server render and first paint show `<pre className="doc-mermaid-source"><code>{source}</code></pre>`, so readers without JavaScript still see the source.
  - `useEffect`: `const { default: mermaid } = await import('mermaid')`, call `initialize(MERMAID_CONFIG)` once per module, then `render(uniqueId, source)` → `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })` → set `innerHTML` of a `div.doc-mermaid`. Debounce 300 ms when `source` changes.
  - On a parse or render error, keep the `<pre>` and add `<p className="doc-mermaid-error">{message}</p>` in ordinary ink.
  - When rendered (`showSource=false`), show a **Copy Mermaid** button that calls `navigator.clipboard.writeText(source)` and changes its label to "Copied" for 2 seconds.
  - When `showSource=true` (editor preview), show only the diagram or the error, with no copy button.

- [ ] **Step 1: Install the dependencies.** Run `npm install mermaid dompurify`, then `npm run typecheck`. Expected: exit 0.
- [ ] **Step 2: Implement the component and CSS.** CSS: `border-radius:0; box-shadow:none;`. The diagram container uses `overflow-x:auto` so wide diagrams scroll inside the page, never the page itself.
- [ ] **Step 3: Run `npm run check`.** Expected: PASS.
- [ ] **Step 4: Commit.** `git commit -am "feat: mermaid diagram renderer"`

### Task 3: Render in read mode, in the editor, and on the published page

**Files:**
- Modify: `src/app/(signed-in)/p/[slug]/docs/doc-content.tsx:227-232`. In the `codeBlock` branch, when `isMermaidLanguage(n.attrs?.language)` return `<MermaidDiagram key={key} source={…} />`.
- Modify: the ReactMarkdown path in the same file. Add a `components.code` (or `pre`) override that renders `MermaidDiagram` for `language-mermaid` (use `isMermaidLanguage` on the class suffix).
- Create: `src/lib/doc-mermaid-extension.ts`. `MermaidCodeBlock = CodeBlock.extend({ addNodeView })` uses `ReactNodeViewRenderer(MermaidNodeView)` **only** when `node.attrs.language` is Mermaid, and otherwise the default code-block DOM. The node view component lives in `src/app/(signed-in)/p/[slug]/docs/mermaid-node-view.tsx`: an editable `NodeViewContent as="code"` source area, with `<MermaidDiagram source={node.textContent} showSource />` beneath it.
- Modify: `src/lib/doc-editor-extensions.ts`. `docEditorExtensions(rich = false, opts: { codeBlock?: AnyExtension } = {})`. When `opts.codeBlock` is set, use `StarterKit.configure({ codeBlock: false, … })` and add `opts.codeBlock`. The server, import and test callers stay unchanged.
- Modify: `src/app/(signed-in)/p/[slug]/docs/rich-editor.tsx`. Pass `{ codeBlock: MermaidCodeBlock }`. Add the insert-menu item `{ label: 'Mermaid diagram', hint: 'Paste Mermaid text to draw a diagram', apply: c => c.setCodeBlock({ language: 'mermaid' }) }` next to "Code block" (line ~93). Add the same item to `editor-toolbar.tsx:50`.
- Test: `tests/doc-mermaid-render.test.ts`

**Interfaces:**
- Consumes: Task 1 `isMermaidLanguage`, Task 2 `MermaidDiagram`.
- Produces: `docEditorExtensions(rich, { codeBlock })`, and `MermaidCodeBlock`, which Part 2 reuses unchanged.

- [ ] **Step 1: Write the failing tests** in `tests/doc-mermaid-render.test.ts`, using `renderToStaticMarkup`. If importing TSX is not possible under Node type-stripping, test through `contentMarkdown` and `generateJSON` instead, and leave the TSX rendering to Task 4:
  - The rich doc with `toggle > codeBlock{language:'mermaid'}` renders markup containing `doc-mermaid-source` and the escaped source. A `js` code block renders a plain `<pre><code>` without `doc-mermaid`.
  - Round trip: Markdown ```` "```mermaid\nflowchart LR\n  A[\"กล้อง\"] --> B\n```" ```` → `generateJSON`/markdown parse with `docEditorExtensions(true)` → `codeBlock{language:'mermaid'}` → `contentMarkdown(encodeRich(json))` contains the identical fence body byte for byte.
  - A source containing `'); DROP TABLE pmt_docs; --` and `<script>alert(1)</script>` survives `encodeRich`/`decodeRich`/`contentMarkdown` unchanged.
- [ ] **Step 2: Run `node --test tests/doc-mermaid-render.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement the file changes listed above.**
- [ ] **Step 4: Run `npm run check`.** Expected: PASS, with the existing `tests/doc-editor-schema.test.ts` and `doc-markdown.test.ts` still green.
- [ ] **Step 5: Commit.** `git commit -am "feat: mermaid blocks in docs read mode, editor and published page"`

### Task 4: Import, other export formats, and browser verification

**Files:**
- Modify: `src/app/(signed-in)/p/[slug]/docs/page-tools.tsx` `download()`. Markdown already works through `contentMarkdown`. HTML and print: after `renderToStaticMarkup`, replace each `.doc-mermaid-source` with `<pre class="mermaid"><code>source</code></pre>` and remove `.doc-mermaid-copy`. JSON is unchanged.
- Modify: the .docx export worker path (find it with `grep -rn "docx" src/lib/doc-tools.ts src/app/**/import-docx*`). A Mermaid code block is exported as a code paragraph with a first line of `mermaid`. In .docx/HTML import, `generateJSON` already yields `codeBlock` with `language` from `class="language-mermaid"`. Check that HTML export → import keeps `language:'mermaid'`. If it does not, set `language` from a `pre.mermaid` parent in a `parseHTML` rule on `MermaidCodeBlock`.
- Create: `tests/e2e/doc-mermaid.browser.test.ts`, modelled on `tests/e2e/doc-svg.browser.test.ts`. Add it to the `test:docs-browser` script.

- [ ] **Step 1: Write the browser test.** Seed a page whose body is Markdown with a valid flowchart (`A["กล้อง"] --> B[NVR]`), an invalid block `flowchart LR\n A-->`, and `graph TD; A["<img src=x onerror=alert(1)>"]-->B; click A "javascript:alert(2)"`. Assert:
  - in read mode, the valid block yields one `svg` inside `.doc-mermaid` with text `กล้อง`;
  - the invalid block still shows its source and `.doc-mermaid-error`;
  - no `img[onerror]`, no `a[href^="javascript:"]`, and no dialog event fired;
  - the published `/d/<token>` link of the same page shows the same SVG;
  - in edit mode, typing into the Mermaid source re-renders the preview, and Done editing saves a body whose fence text is identical.
- [ ] **Step 2: Run** `npm run dev` in another terminal, then `node --env-file=.env --test tests/e2e/doc-mermaid.browser.test.ts`. Expected: FAIL before the export changes and any fixes, PASS after.
- [ ] **Step 3: Implement the export changes.**
- [ ] **Step 4: Run** `npm run check && npm run test:docs && npm run test:docs-browser`. Expected: all PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat: mermaid in import/export, browser coverage"`
