# 10 — Project documents

Prose that belongs to a project, kept beside the plan rather than in a chat window.

Visual rules come from [`../../DESIGN.md`](../../DESIGN.md). Domain rules referenced as `D-nn` come from [`01-domain.md`](01-domain.md); this feature's own rules are `D-50` upward. Roles come from [`05-permissions.md`](05-permissions.md). The tree this one deliberately does **not** reuse is [`02-data-model.md`](02-data-model.md).

---

## 1. What this is for

The plan says a module exists and when it is due. It cannot say that the NVR is a `DHI-NVR5216-EI`, that firmware 4 reads motorcycle plates and firmware 5 does not, or that a Megvii licence binds one camera to one feature. That knowledge decides the work, and today it lives in a ClickUp Doc that is separate from the plan and shared to the public web.

This feature brings it inside the wall, beside the tree it describes.

### 1a. Where the shape came from

Every decision below was taken against a real document — the ClickUp Doc *Bannayuu Next Doc Overview*, read on 2026-09-08. It is one workspace-level Doc holding nine modules, each written to the same five-part form:

> description → 👑 Want Feature → 🤔 ที่ต้องตัดสินใจก่อน → ✅ Current Scope → 🔥 Next Phase

and then, at the end, three blocks that fit **no** such form: **Hardware** (equipment models and datasheet links), **System Diagram** (one line: `Notification : firebase`), and **Presentation / UI** (bare Canva and Figma links).

That split — nine pages that share a form, three that cannot — is the single observation that produced §3.

Two other observations carried weight. The Doc uses **tables**, nested bullets four deep, external links, images, bold, and emoji; it uses **no nested pages at all**, though ClickUp offers them. And the string `V.1.0.0-2026-08-26` is typed **nine times by hand**, identically, once per module — a version stamp that wants to be one field and is instead nine copies waiting to disagree (`D-56`).

---

## 2. The shape of the thing

```
project
└── doc                    ← has a title, a version stamp, and pages
    └── page               ← depth 1
        └── page           ← depth 2
            └── page       ← depth 3   (hard stop)
```

A project may hold **many docs**. A doc holds a page tree **three levels deep and no deeper**.

> **Recorded against the recommendation, 2026-09-08.** The evidence said one doc, flat sections: the source document has nine peers and zero nesting. The owner chose the full shape anyway, and it is built as asked. What it costs is written here so nobody rediscovers it: a tree needs move, needs cycle prevention, needs an answer for what happens to children when a parent goes, and needs its own tests for all three. This project has paid that once already for `pmt_nodes` and the closure and subtree groups in `db/tests.sql` are what that cost looks like. The depth cap of 3 is the part of the price that was negotiated down — a fourth level is one number in one `CHECK`, and it is far easier to raise a cap than to lower one.

### 2a. Why it is not `pmt_nodes`

It was considered and refused. `pmt_nodes` is not a general tree — it is a tree in which every row carries four date columns that the product's central rule (D-10) holds apart, plus roll-up computed on read, plus a `jsonb` custom-value bag, plus snapping against the working-day calendar. A page has no start, no end, no plan, and no reality.

Filing pages there would mean every existing query — ledger, timeline, roster, roll-up — grows an `AND this is not a document page` clause, and the first place that forgets it renders a page as an undated bar in a Gantt chart. That is a cost paid forever to save a cost paid once.

So: separate tables, borrowed shape. `parent_id` with `ON DELETE RESTRICT`, `sort_order` as `double precision` so a reorder writes one row, an `archived_at` timestamp rather than deletion. The same ideas, none of the luggage.

---

## 3. Templates

**D-50. A page is written to one of two templates, fixed at creation.**

| Template | Body |
|---|---|
| **Module** | Five ordered slots — *description*, *Want Feature*, *Decisions*, *Current Scope*, *Next Phase* — each holding Markdown. May be bound to a node (§4). Carries that node's `tab-` hue (§8). |
| **Free** | One Markdown body. No node binding. No hue. |

The Module template is the observed form of the source document, made into a form. The Free template exists because Hardware, System Diagram and Presentation are **not** that form, and forcing them into it produces a page that is four-fifths empty headings. An empty slot that will never be filled is evidence the form is wrong, not that the author is lazy.

**D-51. Module → Free is permitted. Free → Module is not.**

Converting Module to Free concatenates the five slots, in order, under their headings, into one body — total information, no guessing. The reverse would require deciding which prose belongs in which slot, which cannot be done correctly and therefore will not be done at all. The conversion is one-way because only one direction has a right answer.

---

## 4. Binding a page to a node

**D-52. A Module page may name a node, and does not have to.**

`doc_page_node_id` is nullable and references `pmt_nodes(node_id)`.

Bound, the page takes its **title and its hue from the node**: renaming the module in the List renames it in the docs sidebar, because there is only one name. Unbound, it is titled and coloured on its own.

The binding is optional rather than mandatory for a reason visible in the source: the document is *mostly* about modules, but Hardware and System Diagram will never be nodes in a timeline. A mandatory binding would say that nothing may be written about unless it is already scheduled, which is backwards — things are written about in order to decide whether to schedule them.

**D-53. Archiving a node does not remove the page that names it.**

The page stays, marked *module archived*, still readable, still bound. A document records what was decided; deleting the record when the subject is retired destroys the evidence for the decision at exactly the moment somebody asks why it was made.

---

## 5. Content

**D-54. Markdown is the stored truth.**

Editing is WYSIWYG. What reaches the column is Markdown text.

> **Recorded against the recommendation, 2026-09-08.** A plain textarea was recommended: it adds no dependency, and a rich-text editor arrives with rounded bubble menus, floating cards and blurred shadows — three things `DESIGN.md` forbids outright, which means the work is mostly undoing what the library insists on. The owner chose WYSIWYG. The storage format is the half of that decision that was won back: the document survives this application. It can be grepped, diffed, read out of a `pg_dump` by a human, and rendered by anything — which is the assumption the whole of [`08-operations.md`](08-operations.md) rests on. ProseMirror JSON would be unreadable without the app that wrote it.

**D-55. The editor may express exactly what Markdown can express, and nothing else.**

The supported set is CommonMark plus two GFM additions:

| Allowed | Not allowed |
|---|---|
| headings, paragraphs | callouts |
| bullet and ordered lists, nested without limit | columns |
| **bold**, *italic*, `code` | merged table cells |
| links | coloured or highlighted text |
| images (§6) | footnotes |
| blockquote, code block, horizontal rule | comments, mentions |
| tables (GFM) | |
| task list items — `- [ ]` (GFM) | |

This list is a **safety constraint, not a feature list**. Under `D-54` every save round-trips through Markdown; anything the editor can build that Markdown cannot hold is silently eaten on the way to the database. Text that vanishes without an error is the worst defect this feature can ship, and the only defence is refusing to let it be typed.

Tables are in because the source uses them — the module matrix on the first screen, and the Megvii capability table. Nested bullets are uncapped because Markdown expresses nesting with indentation and a cap would be code written to permit less. Callouts are out because no Markdown standard has them: any convention invented here breaks the moment somebody types an ordinary `>`. The source already solves this with emoji in headings (👑 🤔 ✅ 🔥) and that keeps working, because emoji are just characters.

---

## 5b. Links leave for their own window

**Every link in a rendered page opens in a new window** (`target="_blank"`, always with `rel="noopener noreferrer"`). The one exception is a fragment — `#heading` points inside the page already open, so the table of contents and any in-page anchor navigate in place.

A document is read, not navigated through. The source Doc's whole last section is bare Canva, Figma and datasheet links, and following one used to replace the page mid-read: coming back cost a reload, the scroll position and, while editing, the reader's place in the draft. This holds for both render paths — rich content and the Markdown fallback — and for the label button block, so a link behaves the same wherever it was typed.

Links inside the **editor** are not navigation at all: a click there places the cursor, and only an attachment link acts, by downloading.

---

## 6. Images

**D-56. Every uploaded file has a row.**

`pmt_doc_assets` records the project, the uploader, the time, the byte size, the MIME type and the original filename.

New uploads use `YY/MM/<asset-id>-<safe-original-filename>` beneath the asset directory. Year and month come from the saved upload timestamp in `Asia/Bangkok`; the asset ID prevents filename collisions. Download names and authenticated URLs remain unchanged. Reads also support the older flat `<asset-id>` layout, so existing files do not require a move.

> **Recorded against the recommendation, 2026-09-08.** External links only was recommended — the source document's diagrams and UI already live in Figma and Canva as links, and a file store means this system holds state in two places that must be backed up at the same instant or restore to a document pointing at an image that is not there. The owner chose upload to a server volume. The registry is what makes that survivable.

Without a registry, `/uploads/<uuid>.png` is a URL: anyone who can guess it can fetch it. This product's central access rule is that a non-member must not learn a project **exists** — a direct URL returns 404, not 403 ([`05-permissions.md`](05-permissions.md) §2). A customer's security-system diagram reachable by URL alone is the quietest possible breach of that. The registry is what lets the file be served through a route that authorises first.

It is also the only thing that makes *deletion* answerable. Files nobody can attribute are files nobody dares remove.

**Accepted:** `image/png`, `image/jpeg`, `image/webp`, `image/gif`. Maximum **50 MB** (52,428,800 bytes) per file.

**Extension requested 2026-09-08:** The editor also supports general file attachments, up to **50 MB** per file. Attachments are stored in the same authenticated asset registry as `application/octet-stream` and always served with `Content-Disposition: attachment` (never inline). Their filename and size appear in an ordinary Markdown download link. This extends image uploads without changing Markdown storage, project access, or the Done-editing deletion rule.

**SVG support (updated 2026-09-09).** SVG uploads are validated as XML and displayed through image elements, never inserted inline into the application DOM. CSS, HTML labels (`foreignObject`), animation, editor metadata and embedded images/fonts are accepted. Missing root namespaces are normalized; ordinary public/system SVG DTD declarations are removed without fetching them. Malformed XML, custom entity definitions, more than 20,000 nodes or nesting beyond 64 levels are refused. The authenticated asset response MUST carry the sandbox CSP defined in `src/lib/doc-svg.ts`, even on direct navigation: scripts, external resources, frames, forms and base URL changes are disabled; inline styles and data images/fonts are allowed. Validation is not sanitization: accepted SVG must never be served without that policy. Browser image mode determines rendering support; externally hosted resources and script-driven drawings do not execute.

An upload field that accepts anything becomes the company's free file store within a quarter, which is what the size and type limits are for.

**D-57. Removed files are deleted only after Done editing (updated 2026-09-09).**

Autosave records removal candidates and retains the file for Undo. Done editing submits a final save even when autosave already says Saved. After that save commits, removed files are deleted from local storage only if no current page (including archived pages), cover, template, task image value or another page's unfinished removal still references them. Removing one of several references keeps the file. Both dated and legacy flat storage layouts are supported. Revision history alone does not retain deleted files; restoring a deleted link requires re-uploading the file. A failed/conflicting save never deletes files. Durable deletion work survives filesystem errors and retries on the next Done editing, with a visible pending-cleanup message.

---

## 7. Versions, history, and collision

**D-58. A doc carries one version stamp.**

A free-text field on the doc — `V.1.0.0-2026-08-26` — displayed on every page in it, edited in one place.

This is not history. It is a human **declaration** of which release the scope described belongs to, and no system can observe it. The source document proves the need by hand-typing the identical string nine times: nine copies of one fact, each free to drift.

**D-59. Edits are kept as revisions, collapsed per editing session.**

Autosave overwrites the current row. A **new** revision is opened when the editor changes, or when the same editor returns after a quiet interval; continuous typing by one person extends the revision it is already in.

A revision per autosave would file forty rows for one paragraph. History nobody opens is not history — it is storage. Collapsing yields a log that reads *Ouan revised this on Tuesday afternoon*, which is the granularity anybody actually asks about.

**D-60. A save carrying a stale `updated_at` is refused.**

Every save sends the `updated_at` it was opened with. If the row has moved on, the write is rejected — `409` — naming who changed it and when. There is no merge.

Autosave makes this mandatory rather than nice. Under last-write-wins, a tab left open in another window destroys somebody's work **with nobody pressing anything**; at least a save button gives a person a moment they can later remember. Refusing is annoying — the loser copies their text out and reloads. Annoying and visible beats silent and lost.

**D-61. Deletion is archival.**

`doc_archived_at` / `doc_page_archived_at`. Nothing is removed. This matches `pmt_nodes` (`node_archived_at`) and `pmt_users` (`user_is_active`); documents being the one thing in the product that can be destroyed for good would be an inconsistency, and the right to delete belongs to Admins, who mis-click like everyone else.

---

## 8. Permissions

Roles are the project roles already defined in [`05-permissions.md`](05-permissions.md) §2. Nothing new is introduced.

| Capability | Admin | Member | Viewer |
|---|:--:|:--:|:--:|
| Read docs and pages | ● | ● | ● |
| Search within the project's docs | ● | ● | ● |
| Edit page content | ● | ● | |
| Set the doc version stamp | ● | ● | |
| Create / rename / move / archive a doc or page | ● | | |
| Upload images | ● | ● | |

The line is the one the product already draws everywhere: **content is a Member's, structure is an Admin's**. A Member edits field values but cannot archive a node, add an option, or change who is on the project; a Member writes a page but does not decide the document's shape.

Admin-only *writing* was considered and refused. The person who knows that firmware 4 reads motorcycle plates is the person doing the work, not the person running the project. If they cannot record it, it goes back into the chat window this feature exists to empty.

~~**There is no share-to-web.**~~ **Superseded 2026-09-10 — see §11.**

> The source Doc is public today. This one is not, and that is deliberate. It is not a button: it needs an unauthenticated render path, a secret token, a way to stop internal links leaking out with it, images served without an authorisation check — which directly breaks `D-56` — and a revocation story. Every page of this product currently sits behind sign-in, and the whole model rests on that. Where the aim is to let an outsider read, the product already answers: invite them as a **Viewer**, scoped to one project, named, and revocable.

> **Reversed by the owner, 2026-09-10.** A read-only publish link was asked for and built. The paragraph above is kept rather than deleted because it is still the correct list of what the feature costs — and §11 is written as five answers to it, one per clause. Nothing in it was wrong; it was a price, and the owner chose to pay it. The Viewer invitation remains the right answer whenever the outsider is a person you can name.

---

## 8b. Published links — read-only, to anyone holding the link

Added 2026-09-10, reversing §8's refusal. An **Admin** may publish one page as a read-only link and withdraw it again. `doc.create` is the capability, so a Member who writes the page cannot let it out of the product.

The refused-then-built paragraph in §8 lists five costs. These are the five answers, and each is a rule, not an implementation note:

1. **One page, never a subtree.** A token publishes the page it was minted for. Subpages are separate pages and stay private until each is published in its own right, so "publish this" can never mean more than what is on screen.
2. **The secret is the whole guard**, so it is 32 random bytes in base64url — not the page id, not the slug, neither of which is unguessable and both of which appear in every export.
3. **No link on a published page points back into the product.** Anything addressed to this app renders as its own words with the link removed: a `/p/…` URL names a project, and an outsider following it would land on sign-in anyway. External `https:`, `mailto:` and `tel:` survive; a `#fragment` survives, because it points inside the page already open. A link *button* with nowhere to go is not drawn at all.
4. **Images and attachments are served through the token, and only if the published page references them.** There is no public asset endpoint: `/d/<token>/assets/<id>` refuses any id that does not appear in that page's own content, and `/api/doc-assets/:id` is untouched and still demands a session. The registry `D-56` requires still records every file; what changed is that a *page* can serve its own pictures, not that files became public.
5. **Revocation deletes the secret.** Unpublishing clears the token; re-publishing mints a different one. A link that was let out never comes back to life. Publishing an already-published page returns the link it has rather than minting a second, so there is only ever one secret per page in the wild.

Two more rules the list did not ask for:

- **Archiving withdraws the link.** A published page inside an archived page, document or project stops answering. Otherwise "archive it" would quietly leave a public copy standing.
- **A link is not a search result.** The published page is `noindex, nofollow` and never cached by a shared cache — the URL *is* the credential, and a cached copy would outlive the revocation meant to end it.

Every refusal on the public path is the same bare 404: a malformed token, a revoked one, an archived page and a page that never existed must be indistinguishable from outside.

The published page carries the page title, the document's title and version stamp, the date it was last updated, and the content. It does **not** carry the project name, the sibling pages, the authors, the comments, or any way back into the application.

| | Route |
|---|---|
| The page | `/d/<token>` |
| Its files | `/d/<token>/assets/<asset id>` |

Reached from **Page actions → Publish as read-only link**, which then shows the state plainly, offers the link for copying, opens it, and revokes it.

---

## 9. Placement and URLs

```
/p/<slug>/docs                  the docs in this project
/p/<slug>/docs/<pageSlug>       one page
```

A fifth tab beside List, Timeline, Report and Settings.

**D-62. A page slug is set once and does not follow its title.**

Chosen at creation, or auto-assigned as `page-<short id>` when left blank. Renaming a page never moves it.

Titles are Thai (`หุ่นยนต์ปกป้อง`) and no attempt is made to romanise them — the output would be unreadable in both languages.

The URL deliberately does **not** encode the hierarchy. `/docs/overview/pokpong/megvii` reads beautifully and breaks every link anyone ever pasted the moment the page is moved — and §2 guarantees pages will be moved. The hierarchy belongs in the sidebar, where it helps. The URL's job is to stay still.

---

## 10. The screen

Two columns. A sticky page tree on the left; content on the right. No right-hand table of contents yet — no page is long enough to need one.

**Reading and editing are separate modes.** A page opens read-only; editing is entered deliberately.

Three things follow from that, all of them wanted. Fewer people sit in edit mode, so `D-60` fires less often. Read mode is the same for everyone, which is what Viewers get. And read mode is Markdown rendered on the server — **the editor bundle is never loaded for the people who only read**, who are most people.

### Colour

Rules come from `DESIGN.md`; the only new statement is where the hue attaches.

A page bound to a node wears that node's module `tab-` hue — the left hairline and the sidebar entry — the same hue the module already wears in the List and on the Timeline. Always mixed into the page or the ink, **never raw**: a raw `tab-1` fill sits close enough to vermilion to be misread, and acceptance test A8 measures that distance.

A Free page has no hue. It belongs to no module, so there is nothing for the colour to say.

**D-63. Document colour never encodes document state.**

No hue for *draft*, *reviewed*, or *stale*. The `tab-` hues say **whose** work it is and never how it is going, and vermilion means out of closure and nothing else. A user-chosen page colour would become a status field within a week — red for unfinished — and take vermilion's only meaning with it. This is also why per-page colour choice is not offered.

---

## 11. Search

Postgres full-text over the stored Markdown, scoped to projects the caller is a member of.

Search is in scope for the first phase precisely **because** §2 chose a three-level tree: a hierarchy that deep needs a way in that is not navigation. It is cheap here only because `D-54` kept the content as text — under JSON storage this section would have been an argument rather than a paragraph.

---

## 12. Deliberately absent

| | Why |
|---|---|
| Comments | Discussion belongs where discussion happens; the point is to move settled knowledge out of chat, not to move chat in. |
| `@mentions` | Needs notifications to mean anything. |
| Links to nodes and tasks | Plain URLs first. Typed cross-references are worth building once it is known which ones get used. |
| PDF / Markdown export | The content is already Markdown. A copy button is the whole feature. |
| User-defined templates | Two templates, both drawn from a real document. A third is a schema change, and should be. |
| Change notifications | No notification system exists to hang it on. |
| Real-time co-editing | Needs a websocket server, changes the deployment shape in [`08-operations.md`](08-operations.md) from one restartable container, and is incompatible with `D-54` — CRDTs need a mergeable document model, not Markdown text. Choosing it means reopening `D-54`. |

---

## 13. Migrating the existing document

The ClickUp Doc is **retyped by hand**, not imported.

It is nine pages. A script would need a widened API token — still an open question per [`../PRD.md`](../PRD.md) §9 Q1 — a study of ClickUp's block format, a converter for tables, nested lists and emoji, and a manual proof-read at the end regardless; all for one run.

The better reason is that retyping is the **test of everything above**. If Hardware feels wrong in a Free page, or the five Module slots fight the content, that is found on day one, by a person. An importer would hide it by making everything fit.

When the content is across, the ClickUp Doc is made read-only and given a link here. Two live copies of one document disagree within a month.

---

## 14. What has to be tested

Pure rules, no database, in `tests/doc-rules.test.ts`, each naming the `D-nn` it defends:

- `D-51` — Module → Free concatenates all five slots in order and loses nothing; Free → Module is rejected.
- `D-55` — the round-trip is lossless for every allowed construct, and every disallowed construct is refused at input rather than dropped at save.
- `D-59` — session collapse: same editor continuing extends; a different editor opens a new revision; the same editor after the quiet interval opens a new revision.
- `D-63` — no state ever selects a hue; a Free page resolves to no hue; a bound page resolves to its node's hue, mixed, never raw.
- `D-62` — a slug is stable across a rename; a blank slug generates rather than romanises.

Against a database, in `db/tests.sql`:

- depth is capped at 3 and the constraint is what stops the fourth level, not the application.
- a page cannot become its own ancestor.
- archiving a doc archives nothing else, and archived rows stay readable.
- removed assets survive autosave and are deleted only after Done editing and a last-reference check (`D-57`).

End to end, in `tests/e2e/docs.test.ts`:

- the role table in §8, every cell.
- a non-member gets 404 for a doc URL, and 404 for an asset URL.
- a stale `updated_at` is refused with 409 and the current holder is named (`D-60`).
- valid SVG uploads are accepted with sandbox CSP; malformed SVG and a PNG larger than 50 MB are refused (`D-56`).
- search returns nothing from a project the caller is not a member of.

---

## 15. Build order

1. This document, agreed.
2. Schema — `pmt_docs`, `pmt_doc_pages`, `pmt_doc_page_revisions`, `pmt_doc_assets` — as a migration, with its `db/tests.sql` group.
3. `src/lib/doc-rules.ts` as pure functions, with `tests/doc-rules.test.ts`. The adapter stays out of it, for the reason given in `CLAUDE.md`: a rule that moves into the adapter stops being testable without a connection.
4. Read path — the API boundary, the page tree, server-rendered Markdown. No editor yet.
5. Permissions and the e2e suite.
6. The editor, and the asset route behind it.
7. Search.
8. Retype the ClickUp document; close the original.

## 16. Scope amendment — 2026-09-08

The user's subsequent request to implement ClickUp-like Docs expands the original
Markdown-only and fixed-template scope. D-54/D-55 now retain legacy Markdown while
allowing validated `fieldbook-rich-v1:` JSON in the same page slots. Rich editing,
page metadata/protection, comments/replies/assignment, project templates,
relationships, archive/restore and file import/export are included. Existing role,
project-isolation, asset-retention and optimistic-save requirements remain.

The user explicitly excluded AI: no AI implementation is required. Public sharing
requires a separate choice and is not enabled. Real-time collaboration and direct
authenticated third-party imports are not implied by file import support.

This amendment does not authorize closing, publishing or editing original ClickUp
documents. Only the separately approved synthetic test page is used for reference
write tests. See [the parity audit](../clickup-docs-parity-audit.md) for implemented,
verified and outstanding functionality; no 100% parity claim is made.
