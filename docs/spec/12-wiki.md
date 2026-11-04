# 12 — Wiki (คลังความรู้) and Mermaid blocks

Knowledge that belongs to no project, shared per wiki, readable by people through a public link and by AI through a read-only MCP endpoint. Diagrams are Mermaid, in the Wiki and in project Docs alike.

Related: [01-domain](01-domain.md) · [05-permissions](05-permissions.md) · [08-operations](08-operations.md) · [10-docs](10-docs.md)

Visual rules come from [`../../DESIGN.md`](../../DESIGN.md). The Docs feature the Wiki reuses is [`10-docs.md`](10-docs.md) (`D-50`…`D-63`); this feature's own rules are `D-70` upward. The design record this was filed from is [`../superpowers/specs/2026-11-04-wiki-design.md`](../superpowers/specs/2026-11-04-wiki-design.md).

---

## 1. Why

Docs belong to one project (`pmt_docs.doc_project_id NOT NULL`). Some knowledge does not: hardware models, setup procedures, lessons from earlier jobs. It is reused across projects, and before this it had nowhere to live except copied into each project or left in a chat.

Success looks like this: someone imports an existing `.md` file with diagrams, it shows up as a readable wiki page with rendered diagrams, they share it with the right colleagues, and a colleague's Claude can then search and quote it through MCP. **Nobody who wasn't given access, whether a person or a token, can find out that it exists.**

### Non-goals

- AI writing to the wiki. MCP is read-only, with no exceptions.
- Any AI access path other than MCP: no REST API, export feed or sitemap for AI.
- Moving project Docs into the Wiki, or linking the two.
- Real-time co-editing (refused for Docs in `10-docs.md` §12, for the same reasons).
- Templates, comments and the version stamp from Docs. Every Wiki page is a single-body page bound to nothing.

### Failure even if everything else works

- A token, a public link or a non-member learns that a wiki **exists** when they were not given it.
- A token that can read more than its owner currently can.
- Mermaid code that disappears or is altered silently on save, import or export.
- A diagram that runs script or follows a `javascript:` link, above all on the public page.
- Wiki rows in `pmt_docs` / `pmt_doc_pages`.

---

## 2. Mermaid blocks (Docs and Wiki)

**D-70. A Mermaid block is a `codeBlock` whose `language` is `mermaid`.** Nothing new is stored. In rich content it passes `decodeRich` unchanged; in legacy Markdown it is the ```` ```mermaid ```` fence itself; `contentMarkdown()` already exports it as that fence. A dedicated node type was refused: a second way to represent the same thing, with its own allowlist entry, exporter branch and migration.

**D-71. The source is the truth, and it is never refused or rewritten.** At most 50,000 characters per block (`MERMAID_MAX_CHARS`, checked on save). Source that does not parse is kept exactly as typed; the editor shows Mermaid's error in ordinary ink under it (vermilion means only "out of closure"), and readers see the source as a code block, never an empty space. `.md` import turns fences whose info string is `mermaid` (case-insensitive, trimmed) into Mermaid blocks with the body unchanged byte for byte; import then export gives the same fence body back. Other formats export the source in a code block with the language noted; HTML uses `<pre class="mermaid">`.

**D-72. A diagram can never run anything.** `securityLevel: 'strict'`, `htmlLabels: false`, no `click`/`href` directive takes effect, and the SVG is sanitized (DOMPurify, SVG profile) before insertion. The theme is Mermaid's `base` mapped to `DESIGN.md` tokens: graphite ink, paper, square corners, no shadow, no gradient, no `tab-` hue, no vermilion; Thai labels never below 13px and never letter-spaced.

Editing shows the source with a live preview below it (re-rendered ~300 ms after typing stops). Reading shows only the diagram with a **Copy Mermaid** button. Read mode stays server-rendered without the editor bundle (`10-docs.md` §10): Mermaid loads only on pages that contain a block, as a client island over the server-rendered `<pre data-mermaid>`.

---

## 3. Shape

```
wiki         ← title, description, owner, members, optional public link
└── page     ← depth 1
    └── page ← depth 2
        └── page ← depth 3 (hard stop, as Docs)
```

The page experience is the Docs one, reused rather than copied: the tree with move/reorder/archive/restore, slugs set once (`D-62`), the rich editor with Mermaid, a stale save refused with 409 (`D-60`), revision history (`D-59`), the authenticated asset registry and its cleanup (`D-56`, `D-57`), every Docs import/export format, and the page outline. Write members manage page structure as well as content — there is no project admin above them.

Tables (`db/migrations/021_wiki.sql`, `db/schema.sql`, `db/tests.sql` group O), none shared with Docs: `pmt_wikis`, `pmt_wiki_members` (`wiki_access_kind` `'read' | 'write'`), `pmt_wiki_pages`, `pmt_wiki_page_revisions`, `pmt_wiki_assets` with its removal and deletion queues, `pmt_wiki_tokens`, `pmt_wiki_token_scopes`. The owner is never a row in `pmt_wiki_members`: ownership already means write, and keeping it apart means the owner cannot be removed by mistake. A page body is one `text` column, legacy Markdown or the `fieldbook-rich-v1:` string.

Rules live in the pure module `src/lib/wiki-rules.ts` (`tests/wiki-rules.test.ts`); `src/lib/wiki.ts`, `wiki-tokens.ts`, `wiki-publish.ts` and `wiki-mcp.ts` are the adapters. No triggers.

### Search

**D-73. Search is substring matching on extracted text, so Thai is found mid-sentence.** `websearch_to_tsquery` cannot find a Thai word inside a sentence, because Thai has no spaces between words. On every save TypeScript writes `wiki_page_search_text` — the title and the body as `contentMarkdown` renders it with Markdown syntax stripped and code (Mermaid included) kept; JSON keys are never indexed. A GIN `pg_trgm` index covers it and the title. Each whitespace-separated term must appear (`ILIKE`, terms ANDed), with `%`, `_` and `\` escaped in the **bound** value. Ranking: a title match, then `similarity()`, then recency. The snippet (~200 characters around the first match) is cut in TypeScript. At most 20 results.

---

## 4. Who sees what

| Capability | Install admin | Owner | Write member | Read member | Anyone else signed in |
|---|:--:|:--:|:--:|:--:|:--:|
| Create a wiki | ● | n/a | n/a | n/a | ● |
| See it, read pages, search it | ● | ● | ● | ● | 404 |
| Edit content, upload files | ● | ● | ● | | |
| Create, rename, move, archive, restore pages | ● | ● | ● | | |
| Rename or describe the wiki | ● | ● | | | |
| Grant, change or remove members | ● | ● | | | |
| Publish or withdraw the public link | ● | ● | | | |
| Archive the wiki, transfer ownership | ● | ● | | | |

**D-74. One function decides visibility, and everything is computed from it.** A wiki is visible to a user when they are active and are the install admin, its owner, or a member — and, for a member, it is not archived (archived wikis are seen only by the owner and the install admin). This is `canSeeWiki` / `canWriteWiki` / `canManageWiki` in `wiki-rules.ts`, with one equivalent SQL predicate in the adapter. Menus, search, token scoping and MCP all derive from it.

**D-75. Every refusal to a stranger is the same bare 404.** A non-member, an unknown id, a malformed id, a page or asset in a wiki the caller cannot see — all indistinguishable (`05-permissions.md` §2). Only someone who can already see a wiki learns that they lack a right on it (403).

The install admin is `PROTECTED_EMAIL` (`admin@cit.com`), the only global role; project admins get nothing extra here. Any active user may create a wiki and becomes its owner. When ownership is transferred, the previous owner becomes a write member. When an owner's account is deleted, ownership moves to the install admin in the same transaction; deactivating an account does not move it.

### Public link

**D-76. A wiki's public link is one secret, and it grants people read access to that wiki only.** The owner or install admin publishes the **whole** wiki at `/w/<token>`, each live page at `/w/<token>/<pageSlug>`, with the tree in the sidebar. The rules of `10-docs.md` §8b apply: the 32-byte base64url secret is the whole guard; withdrawing deletes it and publishing again mints a new one; archiving the wiki withdraws it and restoring does not bring it back; links back into the app are removed; assets are served only through `/w/<token>/assets/<id>` and only when a live page of that wiki references them; `noindex, nofollow`, `no-store`, no referrer; every refusal is the same 404. The page shows the wiki title, tree, page title, last-updated date and content — no members, authors or owner. **It grants nothing over MCP.**

---

## 5. Access tokens

**D-77. A token is a hash and a prefix; the secret exists once.** The secret is `pmw_` plus 32 random bytes in base64url, shown once at creation with a copy button and a config snippet. Only its SHA-256 and the first 8 characters after `pmw_` are stored. It is never logged, never put in a URL, never returned again — not to its owner, not to the install admin.

Tokens are managed at `/wiki/tokens`. A user names a token and ticks wikis **from those they can see now**; any other id is the same 404. A writer can also tick their own tokens from a wiki's settings ("Allow my token"). The owner of a token renames and rescopes it under the same rule. An optional expiry may be set at creation. At most 20 active tokens per user. A token's owner revokes it; the install admin can revoke any token. Revocation records who and when and cannot be undone. The install admin sees an **All tokens** table (label, prefix, owner name and email, created, last used, scoped wikis, status) and never the secret or the hash.

**D-78. What a token reads is decided on every request.** `effective wikis = token scopes ∩ wikis its owner can see right now`, and nothing at all if the token is revoked or expired or its owner is inactive or deleted. Losing membership stops the token reading that wiki on the next request, with nothing to clean up; scope rows stay, and come back into effect if access is granted again. `last_used_at` is written only for an accepted token, at most once a minute.

---

## 6. The MCP endpoint

**D-79. MCP is the only way AI reaches the wiki, it is read-only, and it accepts a Bearer token and nothing else.** `POST /api/mcp`, MCP Streamable HTTP through the official SDK (`WebStandardStreamableHTTPServerTransport`), stateless, JSON responses, inside the same Next.js app — no new process (`08-operations.md`). `Authorization: Bearer pmw_…` only: no cookies, no query-string tokens, no public link secret. A missing, unknown, revoked or expired token, or one whose owner is inactive, is `401 {"error":"invalid_token"}` with `WWW-Authenticate: Bearer`. The wiki REST routes accept session cookies only and refuse Bearer tokens. `GET` and `DELETE` are 405.

| Tool | Input | Returns |
|---|---|---|
| `list_wikis` | none | `[{id, title, description, pageCount}]` for each effective, non-archived wiki |
| `list_pages` | `wiki_id` | the tree, `[{id, slug, title, depth, parentId, updatedAt}]` |
| `read_page` | `page_id`, or `wiki_id` + `slug` | `{title, wikiTitle, breadcrumb, updatedAt, markdown}` — `markdown` is `contentMarkdown(body)`, Mermaid as fenced text, images and files as their Markdown links; `breadcrumb` is the ancestors' titles, top first |
| `search` | `query`, optional `wiki_id`, optional `limit` (clamped to 1..20) | `[{pageId, slug, title, wikiId, wikiTitle, snippet, rank}]` per `D-73` |

Every tool carries `readOnlyHint: true`, and none writes; an unknown tool name is an error. Each result is one text item holding the JSON payload.

**D-80. Outside scope is "Not found.", and errors say nothing more.** Every lookup is filtered to the effective wikis first, and archived wikis and pages are never returned. A page or wiki outside them, archived, unknown or malformed is a tool result with `isError: true` and the text `Not found.` — the same for all of these. An unexpected failure is logged on the server and reported with a fixed message: no stack trace or database text crosses the wire. Output never carries the public link secret or any email.

**D-81. 60 requests a minute per token.** A sliding window held in memory (one container), checked after authentication; the 61st is `429`. Entries for tokens idle for a window are swept, so the map cannot grow without bound.

---

## 7. Security requirements

- **SQL injection.** Every value from a user, the editor, an import, a token or an MCP argument reaches PostgreSQL as a bound parameter; no such value ever goes into `sql.raw`. A page and a Mermaid block containing `'`, `"`, `;`, `--`, `$$`, `\`, `'); DROP TABLE pmt_wikis; --` and Thai come back byte for byte; the same strings as MCP `search` queries and `read_page` slugs give `[]` and `Not found.`, never an error.
- **XSS.** `D-72`; the public page's CSP is that of `/d/<token>`.
- **Existence leaks.** `D-75`, `D-80`: a non-member, a token without scope, a revoked token on a known id and a bad public token get indistinguishable answers — 404 for app and public routes, `Not found.` for tools, 401 for any bad token.
- **Token handling.** `D-77`.

---

## 8. Where it is tested

| Suite | Covers |
|---|---|
| `tests/wiki-rules.test.ts` | the §4 matrix cell by cell; effective scope (`D-78`) — revoked, expired, inactive owner, lost and regained membership; token input; search terms, LIKE escape, snippet; the rate limiter; the breadcrumb |
| `tests/mermaid-rules.test.ts`, `tests/doc-mermaid-render.test.ts` | fence import, byte-identical round trip, the 50,000-character limit, safe rendering |
| `db/tests.sql` group O | depth cap, cycle refusal, cascades |
| `tests/e2e/wiki.test.ts` | the role table through the API, 404s for strangers, pages, search, assets, the public link, tokens |
| `tests/e2e/wiki-mcp.test.ts` | Bearer only (no header, garbage, session cookie, public link secret → 401), the four tools and their `readOnlyHint`, scope ∩ visible, Mermaid byte-identical in `read_page`, membership loss and regain, revoked / expired / deactivated → 401 with `last_used_at` untouched, the once-a-minute `last_used_at`, injection strings, 429 on the 61st call, no tool can write |

## 9. Open for the owner

1. **MCP clients.** Bearer token only, for Claude Code, Claude Desktop (through `mcp-remote`) and other clients that can send a header. claude.ai web Connectors need OAuth and are not supported; an OAuth layer over the same scopes could be added later.
2. **Public link scope.** The whole wiki, with one secret on `pmt_wikis`, rather than per page as Docs does.
