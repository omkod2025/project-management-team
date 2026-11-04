# Wiki (คลังความรู้) and Mermaid blocks — design

Date: 2026-11-04 · Status: approved by owner 2026-11-04 ("implement เลย")

Two features, built in this order:

1. **Mermaid blocks**, in project Docs *and* in the Wiki.
2. **Wiki**: a knowledge base that belongs to no project, with per-wiki sharing, a public link, and read-only access for AI through an MCP server authenticated by personal access tokens.

Visual rules come from `DESIGN.md`. The Docs feature this clones is specified in `docs/spec/10-docs.md` and implemented in `src/lib/docs.ts`, `src/lib/doc-*.ts`, `src/app/(signed-in)/p/[slug]/docs/` and `src/app/d/[token]/`. When this document becomes the spec, it should be filed as `docs/spec/12-wiki.md`, with its rules numbered `D-70` upward.

---

## 1. Why

Docs belong to one project (`pmt_docs.doc_project_id NOT NULL`). Some knowledge does not: hardware models, setup procedures, lessons from earlier jobs. It is reused across projects, and today it has nowhere to live except copied into each project or left in a chat. The owner wants:

- a separate menu, **คลังความรู้ (Wiki)**, holding knowledge that is not tied to any project;
- that knowledge **readable by AI tools** (Claude etc.) so they can answer questions from it, **only through MCP, and only to read**;
- diagrams written as **Mermaid**, because teams already have `.md` files with Mermaid in them and AI produces and reads Mermaid as text.

Success looks like this: someone imports an existing `.md` file with diagrams, it shows up as a readable wiki page with rendered diagrams, they share it with the right colleagues, and a colleague's Claude can then search and quote it through MCP. Nobody who wasn't given access, whether a person or a token, can find out that it exists.

## 2. Goals, non-goals, anti-goals

**Goals**
- Mermaid block in both editors (Docs and Wiki): paste Mermaid text, see the diagram.
- `.md` import turns ```` ```mermaid ```` fences into Mermaid blocks.
- Wiki as a top-level menu, with its own tables, sharing per wiki, a public link, and an MCP endpoint.
- Personal access tokens that each user scopes to particular wikis, and that the install administrator can see and revoke.

**Non-goals**
- AI writing to the wiki. MCP is read-only, with no exceptions.
- Any AI access path other than MCP. No REST API, export feed or sitemap for AI.
- Moving existing project Docs into the Wiki, or linking the two.
- Real-time co-editing (refused for Docs in `10-docs.md` §12, for the same reasons).

**Anti-goals: things that count as failure even if everything else works**
- A token, a public link or a non-member learns that a wiki **exists** when they were not given it. Every refusal is the same bare 404, the same rule as `05-permissions.md` §2.
- A token that can read more than its owner currently can.
- Mermaid code that disappears or gets altered silently on save, import or export.
- A diagram that runs script or follows `javascript:` links, especially on the public page.
- Wiki rows put into `pmt_docs` / `pmt_doc_pages`. The owner chose separate tables.

## 3. Mermaid blocks (Docs and Wiki)

### 3a. Storage

**A Mermaid block is a `codeBlock` node whose `language` attribute is `mermaid`.** Nothing new is stored.

- Rich content (`fieldbook-rich-v1:` JSON, `src/lib/doc-rich-content.ts`): `codeBlock` is already in the type allowlist, so it passes `decodeRich` unchanged.
- Legacy Markdown content: it is the ```` ```mermaid ```` fence itself.
- `contentMarkdown()` already exports a `codeBlock` with its language as a fenced block, so Markdown export and the MCP output give AI the Mermaid source as text without any new code.

The alternative was a dedicated `mermaid` node type. It was refused because it would add a type to the allowlist, a new branch in the Markdown exporter, a migration path for code blocks that were already tagged `mermaid`, and a second way to represent the same thing.

The Mermaid source text is limited to **50,000 characters** per block, enforced in the pure rules and checked on save. *(My call, so that rendering cost stays bounded.)*

### 3b. Editing

- The editor toolbar and slash menu get a **Mermaid diagram** item that inserts an empty `codeBlock{language:'mermaid'}`.
- In edit mode the block shows the source (monospace, editable, accepts plain-text paste) **with a live preview of the diagram below it**. The preview re-renders about 300 ms after typing stops. *(Layout is my call.)*
- If the source does not parse, the block keeps the source exactly as typed and shows Mermaid's error message, in ordinary ink, under the source. Vermilion is not used, because it means only "out of closure". Saving is still allowed: the user's text is never refused or rewritten.
- An existing code block whose language is changed to `mermaid` becomes a diagram block, and changing the language back reverses it.

### 3c. Reading (read mode, published `/d/<token>` page, public wiki link)

- Only the diagram is shown, with a small **Copy Mermaid** button that copies the source text.
- If the source does not parse, the source is shown as a code block. Readers never see an empty space.
- Read mode is server-rendered and must not load the editor bundle (`10-docs.md` §10). Mermaid is a browser library, so it is loaded **only on pages that contain a Mermaid block**, as a small client island that turns the server-rendered `<pre data-mermaid>` into SVG. *(Builder: choose between client island and server-side rendering; the island is the default.)*

### 3d. Safety

- `mermaid.initialize({ securityLevel: 'strict', startOnLoad: false, htmlLabels: false })`. Strict mode encodes HTML in labels and turns off click handlers.
- The generated SVG is sanitized (DOMPurify, SVG profile) before it is inserted.
- No `click`/`href` directive takes effect. External links in diagrams are not supported.
- Theme: Mermaid's `base` theme with variables mapped to `DESIGN.md` tokens (graphite ink, paper background, square corners, no shadows, no gradients). The `tab-` hues and vermilion are not used in diagrams. Thai labels are never set below 13px and never get letter-spacing.

### 3e. Other formats

*My call:* in Word (.docx), HTML, text and Fieldbook JSON export, a Mermaid block is exported as its **source in a code block**, with the language noted. HTML export uses `<pre class="mermaid">`. Rendering diagrams into Word images is out of scope. In .docx and HTML import, a code block tagged `mermaid` becomes a Mermaid block. Nothing is dropped.

### 3f. `.md` import

Wherever a `.md` file can be imported (Docs today, Wiki new), fenced blocks with the info string `mermaid` (case-insensitive, trimmed) become Mermaid blocks with their body unchanged byte for byte. Other fences stay ordinary code blocks. Importing and then exporting gives back the same fence body.

## 4. Wiki — shape

```
wiki (คลังความรู้ เล่มหนึ่ง)   ← title, description, owner, members, optional public link
└── page                   ← depth 1
    └── page               ← depth 2
        └── page           ← depth 3 (hard stop, same as Docs)
```

Clone the Docs page experience: the tree with move/reorder/archive/restore, slugs that are set once (`D-62`), the rich editor including Mermaid, optimistic save with 409 on a stale save (`D-60`), revision history (`D-59`), image and attachment upload with the authenticated asset registry and its cleanup rules (`D-56`, `D-57`), every import/export format Docs offers (`page-tools.tsx`), and a page outline. Search is **new work, not a clone**: Docs search was specified but never built. See §4b.

Do not clone the following:
- **Node binding and the Module template.** Wiki pages belong to no project, so there is no node to bind to and no module hue. Every Wiki page is a single-body (Free) page.
- **Project templates** (`pmt_doc_templates`). Out of scope for now. *(My call: it is easy to add later.)*
- **Comments.** Out of scope for now. *(My call, following the reasoning in `10-docs.md` §12 that settled knowledge, not discussion, is what gets stored.)*
- **Version stamp** (`doc_version`). Not carried over. *(My call.)*

### 4a. Tables (new; none shared with Docs)

All names follow `CLAUDE.md`: a `pmt_` prefix, an entity prefix on every column, and no reserved words. The columns are indicative, and the builder finalizes them in the migration (`db/migrations/021_wiki.sql`) and in `db/schema.sql`, with a new `db/tests.sql` group.

| Table | Purpose / key columns |
|---|---|
| `pmt_wikis` | `wiki_id`, `wiki_title`, `wiki_description`, `wiki_owner_id → pmt_users`, `wiki_public_token text UNIQUE NULL`, `wiki_archived_at`, `wiki_created_at`, `wiki_updated_at` |
| `pmt_wiki_members` | `(wiki_member_wiki_id, wiki_member_user_id)` PK, `wiki_member_access wiki_access_kind` (`'read' \| 'write'`), `wiki_member_granted_by`, `wiki_member_granted_at` |
| `pmt_wiki_pages` | same shape as `pmt_doc_pages` minus the template and node columns: `wiki_page_id`, `wiki_page_wiki_id`, `wiki_page_parent_id`, `wiki_page_depth CHECK 1..3`, `wiki_page_title`, `wiki_page_slug`, `wiki_page_body text`, `wiki_page_sort_order double precision`, `wiki_page_updated_by`, `wiki_page_updated_at`, `wiki_page_archived_at`, `wiki_page_search_text text` (plain text pulled from the body in TypeScript on every save; see §4b) |
| `pmt_wiki_page_revisions` | as `pmt_doc_page_revisions` |
| `pmt_wiki_assets` (+ removal and deletion queues as for Docs) | as `pmt_doc_assets`, keyed by wiki instead of project |
| `pmt_wiki_tokens` | `wiki_token_id`, `wiki_token_owner_id`, `wiki_token_label`, `wiki_token_hash text UNIQUE` (SHA-256 of the secret), `wiki_token_prefix` (first 8 characters, for display), `wiki_token_created_at`, `wiki_token_last_used_at`, `wiki_token_revoked_at`, `wiki_token_revoked_by` |
| `pmt_wiki_token_scopes` | `(wiki_token_scope_token_id, wiki_token_scope_wiki_id)` PK |

The owner is not stored in `pmt_wiki_members`. Ownership already means write access, and keeping it separate means the owner can never be removed by mistake. The storage format for the page body is the same as Docs: legacy Markdown or the `fieldbook-rich-v1:` string, in one `text` column (Wiki pages have one body, so the `jsonb {"body":…}` wrapper Docs uses is unnecessary).

### 4b. Search (Thai-safe)

*My call, after the builder check found that `websearch_to_tsquery('simple', …)` cannot find a Thai word in the middle of a sentence, because Thai has no spaces between words.*

- On save, TypeScript pulls plain text out of the body (rich JSON or Markdown, with Mermaid source included) and writes it to `wiki_page_search_text`. JSON keys are never indexed.
- Enable `pg_trgm` (it ships in the contrib package of `postgres:18-alpine` and of standard installs; add `CREATE EXTENSION IF NOT EXISTS pg_trgm` next to `pgcrypto`) and put a GIN trigram index on `wiki_page_search_text` and `wiki_page_title`.
- Matching is `ILIKE '%' || $1 || '%'` on each whitespace-separated term, with `%`, `_` and `\` escaped in the bound value, and terms combined with AND. Ranking: a title match first, then `similarity()`, then `updated_at`.
- The snippet is cut in TypeScript, about 200 characters around the first match.
- Docs search stays out of scope here. The same approach can be applied to Docs later.

No triggers. Rules live in a new pure module `src/lib/wiki-rules.ts` with `tests/wiki-rules.test.ts`, and `src/lib/wiki.ts` is the adapter around it, following the same split as `node-rules.ts` / `nodes.ts`.

## 5. Wiki — who sees what

### 5a. People

| Capability | Install admin (`admin@cit.com`) | Owner | Write member | Read member | Anyone else signed in |
|---|:--:|:--:|:--:|:--:|:--:|
| Create a wiki | ● | n/a | n/a | n/a | ● |
| See the wiki in the menu, read pages, search it | ● | ● | ● | ● | 404 |
| Edit page content, upload files | ● | ● | ● | | |
| Create, rename, move, archive or restore pages | ● | ● | ● | | |
| Rename or describe the wiki | ● | ● | | | |
| Grant, change or remove members | ● | ● | | | |
| Turn the public link on or off | ● | ● | | | |
| Archive the wiki | ● | ● | | | |
| Transfer ownership | ● | ● | | | |

- **Any active signed-in user may create a wiki** and becomes its owner. *(My call. The owner said the creator decides who gets access, which implies anyone can create one.)*
- The owner chooses members from the active users and gives each one **read** or **read + write**.
- **The install admin sees every wiki** (the owner's decision, 2026-11-04). That account is `PROTECTED_EMAIL` in `admin-rules.ts`, the only global role. Project admins get nothing extra here. Giving the install admin edit and member-management rights as well is my call: it covers the case the owner raised, a creator who has left or forgotten to share. Without those rights, "sees everything" could not actually fix that case.
- When ownership is transferred, **the previous owner becomes a write member**, so they keep their access and their tokens keep working. *(My call.)*
- If the owner's account is deleted, ownership moves to the install admin in the same transaction, the same pattern `05-permissions.md` §2b uses for a project's last admin. Deactivating an account (`user_is_active = false`) does not move ownership. The owner simply cannot sign in, and the install admin can transfer ownership by hand.
- Content versus structure: Docs keep page structure for Admins only. In the Wiki, write members also manage pages, because there is no project admin above them, and the owner already chose to trust them with write access. *(My call.)*

### 5b. Public link

- Owner or install admin can publish **the whole wiki** as a read-only link `/w/<token>`, where any non-archived page can be reached at `/w/<token>/<pageSlug>` with the page tree in the sidebar. *(The owner asked for a public link per wiki. Whether it should cover the whole wiki or one page at a time, as Docs does, is confirmed in §9.)*
- Every rule from `10-docs.md` §8b applies, adapted for a wiki: the 32-byte base64url secret is the whole guard; revoking deletes the secret, and publishing again mints a new one; archiving the wiki withdraws the link; links back into the app are removed; assets are served only through `/w/<token>/assets/<id>` and only if a non-archived page of that wiki references them; `noindex, nofollow`, `Cache-Control: no-store`; every refusal is the same 404.
- The public page shows wiki title, page tree, page title, last-updated date and content. It shows **no** member list, authors or owner.
- The public link is for people only. **It grants nothing over MCP.**

### 5c. Rule that ties it together

> **A wiki is visible to a user when they are the install admin, its owner, or a member, and it is not archived (archived wikis are visible only to the owner and install admin, in an Archived section).** Everything else, including menus, search, token scoping and MCP, is computed from this one function. It lives in `wiki-rules.ts` as `canSeeWiki` / `canWriteWiki`, with a matching SQL predicate in the adapter.

## 6. Access tokens

### 6a. Life cycle

- **Where:** `/wiki/tokens` (a "Tokens / MCP" tab inside the Wiki menu), for every signed-in user.
- **Create:** the user enters a label and ticks wikis **from the list of wikis they can currently see**. The server rejects any wiki outside that list with 404, so it never confirms that a wiki exists. The secret is `pmw_` followed by 32 random bytes in base64url. It is **shown once** with a copy button and an example MCP config snippet. Only its SHA-256 hash and an 8-character display prefix are stored.
- **Add a wiki to my token from the wiki itself:** anyone who can **write** a wiki (owner, write member, install admin) sees an "Allow my token" action in the wiki's settings, which lists *their own* active tokens to tick. (Read-only members can still add the wiki from the token page, because §6a's scoping rule allows any wiki they can see. The shortcut on the wiki page is only for writers, as the owner described it.)
- **Edit:** the owner of a token can rename it and add or remove wikis, under the same visibility rule.
- **Revoke:** the token's owner can revoke their own tokens. The install admin can revoke **any** token. Revoking sets `wiki_token_revoked_at` and `wiki_token_revoked_by` and cannot be undone. A revoked token gets 401 straight away.
- **No expiry by default.** A token may have an optional expiry date. *(My call. Revocation and the admin view are the main controls.)*
- Each user can have at most 20 active tokens. *(My call.)*

### 6b. What a token can read: decided on every request

`effective wikis = token scopes ∩ wikis the token's owner can see right now`, and the token gets nothing at all if it is revoked, expired, or its owner is inactive or deleted.

So if someone loses membership, their token stops reading that wiki immediately, and nothing has to be cleaned up. Scope rows are left in place, and they come back into effect if access is granted again. *(My call. The alternative is to delete scope rows when membership is removed.)*

### 6c. Admin view

The install admin gets an **All tokens** table: label, prefix, **created by** (name and email), created, last used, scoped wiki titles, status (active / revoked / expired), and a Revoke action. The secret and the hash are never shown to anyone after creation.

## 7. MCP server

- **Transport:** MCP Streamable HTTP at `POST /api/mcp`, inside the same Next.js app. There is no new process, which keeps the one-container deployment from `08-operations.md`. Use the official `@modelcontextprotocol/sdk`. Stateless mode, with no server-side session, is enough because every tool is read-only.
- **Auth:** `Authorization: Bearer pmw_…` only. No cookies, no query-string tokens. Hash the token, look it up through a parameterized query, and compare in constant time. Update `last_used_at` at most once a minute.
- **This is the only way AI reaches the wiki.** Wiki REST routes accept session cookies only and refuse bearer tokens. The MCP endpoint accepts bearer tokens only and refuses sessions.
- **Tools (all read-only, MCP `readOnlyHint: true`):**

| Tool | Input | Returns |
|---|---|---|
| `list_wikis` | none | id, title, description, page count for each effective wiki |
| `list_pages` | `wiki_id` | the page tree: id, slug, title, depth, parent, updated_at |
| `read_page` | `page_id` (or `wiki_id` + `slug`) | title, wiki title, breadcrumb, updated_at, **body as Markdown** produced by `contentMarkdown()`, with Mermaid as fenced text |
| `search` | `query`, optional `wiki_id`, `limit ≤ 20` | page id, title, wiki title, snippet and rank as described in §4b |

  Pages can also be offered as MCP resources (`wiki://<wiki_id>/<page_id>`). *(Builder's call.)*
- Every lookup filters on effective wikis first, and a page outside them is reported as "not found". Archived wikis and pages are never returned.
- Images and attachments come back as their Markdown links. MCP does not stream file bytes in v1.
- **Rate limit:** 60 requests per minute per token, in memory. *(My call. It is a single container, so in-memory works.)*

## 8. Security requirements (the builder must test these)

- **SQL injection:** every value from a user, the editor, an import, a token or an MCP argument reaches PostgreSQL as a bound parameter (Drizzle `sql\`${v}\``, query builder). **No user or MCP value ever goes into `sql.raw`.** Search binds each term as a parameter, with `ILIKE` wildcards escaped in the bound value (§4b). Terms are never concatenated into SQL text. A test saves and reads back a page and a Mermaid block containing `'`, `"`, `;`, `--`, `$$`, `\`, `'); DROP TABLE pmt_wikis; --` and Thai text, and requires them back byte for byte. The same strings are sent as MCP `search` queries and `slug` arguments and must not cause an error.
- **XSS:** §3d. The public page CSP is the same as for `/d/<token>`.
- **Existence leaks:** a non-member, a token without scope, a revoked token on a known id, and a bad public token all get indistinguishable responses (404 for app and public routes; MCP "not found" for tools, and 401 for any bad token).
- **Token handling:** never logged, never put in URLs, shown once, stored as a hash.

## 9. Open for the owner

Both were asked after the builder check. The owner went straight to implementation without answering, so the defaults below are **my calls** and can be revisited:

1. **MCP clients:** Bearer token only, for Claude Code, Claude Desktop and other clients that can send a header. claude.ai web Connectors (which need OAuth and internet reachability) are **not** supported in v1. An OAuth layer over the same token scopes could be added later.
2. **Public link:** covers the **whole wiki** (§5b), with one secret on `pmt_wikis`.

## 10. Tests

- `tests/wiki-rules.test.ts`: the visibility and write matrix of §5a, cell by cell; effective-token computation (§6b), covering revoked, expired, inactive owner, lost membership and regained membership; tokens cannot be scoped to wikis the owner cannot see; ownership transfer when the owner is deleted.
- `tests/mermaid.test.ts`: `.md` import turns mermaid fences into `codeBlock{language:'mermaid'}` and leaves other fences alone; the import → export round trip is byte-identical; the 50,000-character limit.
- `db/tests.sql`: a new group for wiki depth cap, cycle refusal and cascade behaviour.
- `tests/e2e/wiki.test.ts`: the full role table; 404s for non-members; public link publish, read, revoke and archive; asset reads through the public link.
- `tests/e2e/mcp.test.ts`: bearer auth, all four tools, scope filtering, revocation taking effect immediately, a session cookie refused at `/api/mcp`, a bearer token refused at the wiki REST routes, and the injection strings from §8.

## 11. Build order

1. Mermaid in Docs: render island, editor block, import of fences, tests. It ships on its own.
2. Wiki schema migration and the `db/tests.sql` group.
3. `wiki-rules.ts` with its tests.
4. Wiki read path, menu entry, and the page tree.
5. Membership, sharing UI, and the e2e role table.
6. Editor, assets, revisions, search, and import/export (reusing the Docs components, parameterized by a storage adapter rather than copied, *builder's call on how*).
7. Public link.
8. Tokens UI and the admin token table.
9. MCP endpoint and its e2e suite.
