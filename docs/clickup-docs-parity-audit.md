# ClickUp Docs parity audit — in progress

Reference: https://app.clickup.com/36753462/v/dc/131m1p-36/131m1p-116

Inspected in connected Edge on 2026-09-08. This is the blank **Untitled** page inside **Bannayuu Next Doc Overview**. The UI explicitly says the Doc is shared to the web. After the user approved an isolated test page, created **Fieldbook UX test** at https://app.clickup.com/36753462/v/dc/131m1p-36/131m1p-136. Only synthetic content was entered on this new page. Original pages and sharing permissions were not changed; the test page remains available.

This is a coverage register, **not a claim of 100% parity**. An observed menu is not a successful end-to-end test.

| Area | Observed ClickUp functions | Fieldbook gap / required verification |
|---|---|---|
| Empty page | Inline Untitled title; Start writing; Blank wiki; Write with AI; Table; Column; ClickUp List; Subpage | One-click Add page and inline title implemented and Edge-tested; contextual empty-page actions, columns, wiki and embedded lists missing |
| Formatting | Prior reference inspection: floating/top toolbar, lists, heading 1–4, code, quote, bold, italic, underline, strike, colors, alignment, links, clear formatting, Undo/Redo | Basic toolbar implemented; unsupported marks/layout currently excluded by Markdown constraints |
| Insert | Slash checklist, Heading 2 and 3×3 table successfully inserted on isolated page | Only Markdown-safe blocks and attachments implemented; remaining commands not write-tested |
| Pages | Page index, Add page, current-page state; prior context-menu inspection includes rename, duplicate, template, history, protection and archive/delete | Tree and creation exist; structural and protection features incomplete |
| Typography | System / Serif / Mono; Small / Default / Large; Default / Full width; Apply typography to all pages | Current styles are local view state, not persisted per page/all pages |
| Header | Cover image; Page icon & title; Owners; Contributors; Subtitle; Last modified | Most header metadata and toggles missing |
| Sections | Subpages presentation; Relationships presentation; Page outline | Outline exists; relationship and subpage presentation incomplete |
| Focus & stats | Block / Page focus; word count; characters; reading time; show stats | Missing |
| Comments | Open / Assigned to me / Resolved; text-selection discussions; comment field; slash commands; task mentions; Talk to Text | Missing; sending/resolving comments not tested |
| Relationships | This page / Entire Doc; page links; search | Current module binding is not equivalent |
| Templates | All / My workspace; search; update existing template; save as template | Free/Module are not equivalent to the ClickUp template library |
| Export | This page / Entire Doc; PDF / HTML / Markdown / Print | Only Markdown copy exists |
| Import | Confluence; Notion; document files; HTML; HTML with page splitting; Markdown | Missing |
| Sharing & AI | Public-share indicator, sharing controls, Brain/AI entry points | Missing; account permissions, subscriptions, integrations and consequential actions require separate setup/approval |
| Files | Fieldbook now has authenticated attachments and editor download action | Browser download-completion verification remains unresolved; API bytes/access tests passed |

## Measured visual evidence

On the isolated writing page: body 16px / 24px with ui-sans-serif platform stack; H2 24px / 30px, weight 590. Table cell border RGB(206,206,206), cell editor padding 4px 10px 3px. Applied these body/H2/table measurements to Fieldbook; this does not establish whole-layout pixel parity.

At the current 1912px-wide reference viewport, `Start writing` is 732px wide and 28px high, at x=903/y=421. Computed font is the platform stack `-apple-system, BlinkMacSystemFont, Segoe UI, roboto, Helvetica Neue, helvetica, arial, sans-serif`, 13.3333px/400; text RGB(32,32,32); padding 4px 0; transparent background; zero border radius on the button itself. The highlighted row/background belongs to its surrounding container. Do not confuse button styles with parent-row styles.

The visual reference has the global ClickUp shell, a separate document page sidebar, a white writing canvas, metadata beneath the title, and a right-side tool rail. Global ClickUp navigation is not automatically a functional Fieldbook feature.

## Required sequencing

1. Obtain an isolated ClickUp test surface; record each successful operation and result, separately from menu discovery.
2. Finish the function/style coverage inventory, including nested menus and state/error behavior.
3. Revise the document storage contract before enabling marks, layout or blocks that Markdown cannot preserve. Preserve existing documents and revisions during migration.
4. Implement and validate the editor, page management, metadata, import/export and collaboration modules against recorded cases.
5. Resolve external integrations/AI and sharing/security decisions; test authorized flows without publishing or deleting real data.
6. Compare matching viewport/state screenshots and run persistence, permissions, accessibility and download tests. Report remaining gaps rather than declaring unverified 100% equivalence.

## Verified write cases — 2026-09-08

- ClickUp Add page created `131m1p-136`; renamed inline to Fieldbook UX test; Enter focused writing area.
- Typed synthetic text, inserted checklist through `/`, Heading 2 through `/`, and Table through `/` (3 rows × 3 columns).
- Switched System → Serif; computed body family changed to Source Serif Pro / IBM Plex Serif / serif stack; returned to System. Did not apply typography to other pages.
- Opened the test page in a fresh Edge tab: title, synthetic text, heading and table persisted.
- Inspected slash inventory: headings 1–4, lists, toggle, banners, code/quotes, person/task/page mentions, embedded ClickUp views, website/video/design/Drive embeds, attachments, formatting, columns, TOC, templates, AI, colors/highlights/badges. Menu discovery is not successful feature testing.
- Fieldbook Edge: one-click Add page created `2dc684c4-973c-4a37-8bea-d5d02ae752b8`, focused Untitled title; Enter focused content. Saved `[QA] Fieldbook inline title` and Thai content atomically; sidebar and read mode updated. Clicking title re-entered editor focused on title. This labelled QA page is retained.
- Fieldbook 390px viewport: responsive sidebar collapsed and document scrollWidth matched viewport (390px); restored viewport afterward.
- `npm run typecheck` passed; `npm run test:docs`: 9 passed, including title validation, role denial, stale-save rejection, unchanged slug/content and linked-task rename protection.
- Independent Impeccable finish check identified IME Enter handling, missing title in conflict recovery, and linked-page title regression after saving; all corrected. Linked pages continue to use the current module/task name.

## Implementation follow-up — 2026-09-08

The table above records the initial inspection, not the current implementation status. Subsequent work adds:

- Versioned rich-content strings alongside untouched legacy Markdown: underline, strike, text/highlight colors, alignment, merged table cells, banners, editable-title toggles, columns, buttons, allowlisted embeds and a reading-mode table of contents. Markdown export is intentionally lossy; JSON preserves supported rich content.
- Block movement controls and a drag handle; image/attachment paste and drop. Browser drag behavior still needs dedicated verification.
- Persisted page typography, icon, subtitle, cover, owners, last-modified and statistics preferences; page/block focus; subpage links.
- Project-scoped comments, quoted text, replies, assignment and resolve/reopen; page/task relationships. Replies use references in a flat list rather than ClickUp's complete thread UI.
- Admin duplicate, move, protect, archive and restore, including recovery after archiving the final page. Moves maintain archived descendants' depths. Project templates can be saved and used to create new pages.
- Current-page/whole-document Markdown, rich JSON and HTML exports; print/PDF through the browser print dialog. File imports for Markdown, text, HTML, JSON and Word DOCX create new pages. DOCX processing uses a bounded worker, validates actual expanded ZIP sizes and rejects external file access. Imports preserve supported formats, not arbitrary source styling.
- History restore with a forced revision, optimistic conflict handling and full JSON draft recovery.

Edge verification on the isolated Fieldbook QA page confirmed that Thai text with underline and blue text color, and an info banner, survived reopening. A synthetic comment was saved and resolved. HTML export reached the browser handoff message; actual download completion remains unverified. The isolated ClickUp page also received a toggle through the slash menu.

Independent finish reviews identified and led to fixes for relative-link serialization, pasted RGB colors, last-page archive recovery, live unsafe embed rendering, forged DOCX ZIP size metadata and archived-descendant movement.

Final automated check for this increment: TypeScript passed; 23 focused pure tests passed; all 12 Docs API/integration tests passed (including archived-descendant movement and restoration); production build passed. These checks do not replace the browser verification gaps below.

## Remaining scope and explicit exclusions

**AI is excluded by the user's explicit instruction on 2026-09-08.** Do not add AI controls, providers, API keys or placeholders as part of this work.

Public sharing awaits a user decision; existing project-membership restrictions remain unchanged. No real ClickUp document was published, deleted or migrated.

This is not all-function or pixel-perfect parity. Remaining differences include real-time co-editing/synced content, wiki behavior, complete mentions/thread interactions, workspace-wide template catalogs, authenticated Confluence/Notion imports, embedded live ClickUp task views and task creation from selected text. Header presentation and every nested menu/state have not been certified against the reference. DOCX file-picker import, block dragging, print output and actual Edge download completion still require browser end-to-end verification.

Exports are document-content exports, not complete backups: they do not bundle attachment bytes, permissions, revisions or the complete page hierarchy/settings. Back up PostgreSQL and the asset volume together.
