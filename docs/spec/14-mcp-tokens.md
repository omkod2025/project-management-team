# 14 — MCP tokens, system-wide

One personal access token, one `POST /api/mcp` endpoint, reaching List, Docs and the Wiki together under per-module grants. Built because a token the team issued could only read the Wiki, and they then needed it to create and edit in other parts of the system too.

Related: [05-permissions](05-permissions.md) · [10-docs](10-docs.md) · [12-wiki](12-wiki.md) §5–§7 (`D-77`…`D-81`, now specialised by this file). The design record this was filed from is [`../superpowers/specs/2026-11-09-central-mcp-tokens-design.md`](../superpowers/specs/2026-11-09-central-mcp-tokens-design.md).

### Non-goals

- Delete, archive or restore through MCP, in any module (carried over from the Wiki's own `13-wiki-mcp-write-srs.md` §8). This includes archiving a List task, even though List Write covers every field.
- Publish, member changes or uploads through MCP.
- Per-item permissions: one permission set per module applies to every project or wiki in scope.
- OAuth. Bearer only.
- A new process or service. MCP stays inside the Next.js app (`08-operations.md`).

### Failure even if everything else works

- A token doing more than its owner can right now.
- An AI writing `node_estimate_*` from `node_actual_*` or the other way round, through any MCP call (CLAUDE.md, "The rule the product exists for").
- Existence leaks: anything outside effective scope answers the same `Not found.`, in every module.
- An old token breaking, or silently gaining rights, when it migrates to this shape.

---

## 1. The registry

**D-90. Every module the token system knows about is one entry in a single declaration, and nothing else may add one.** `TOKEN_MODULES` in `src/lib/token-modules.ts` lists, per module: its key, its label, the hint text for its always-on Read, its scope kind (`'project'` or a module-owned kind such as `'wiki'`), and its own Create/Write permissions. The Tokens / MCP stepper, grant validation, storage (`access-tokens.ts`) and MCP tool registration (`src/lib/mcp/server.ts`) all read this one list. Adding a module to the product means adding one entry here and one `register<Module>Tools` function (§6) — never a migration that adds columns, and never a second place that lists what a token can do.

Today's three modules:

| Module | Scope kind | Create/Write permissions |
|---|---|---|
| List | `project` | `create_task`, `write_task` |
| Docs | `project` | `create_doc`, `create_page`, `write_page` |
| Wiki | `wiki` | `create_wiki`, `create_page`, `write_wiki` |

**D-91. Read is implicit, and cannot be revoked on its own.** Choosing a module for a token grants Read on it; there is no `read` row to tick or untick. In storage, Read is the fact that a `(token, module, 'read')` grant row exists at all — `hasModule()` checks for the module's presence, not for a specific permission key. In the stepper (§3) Read is drawn as a ticked checkbox that cannot be unticked (design doc). A token with a module and no other permission reads that module and does nothing else in it.

**D-92. Create and Write are independent per-module grants, off by default.** `hasGrant(grants, module, permission)` checks one specific permission inside a module the token already reads. A module may declare more than one Create grant (Docs and Wiki each split "Create doc"/"Create page" and "Create wiki"/"Create page"); List has only one Create (`create_task`, there being one kind of thing to create). Every module has exactly one Write permission, named for what it edits (`write_task`, `write_page`, `write_wiki`).

A grant never outranks the owner's own access: every write re-checks the owner's current role or membership before writing (`authorize()` for List, `docs.ts`'s own checks for Docs, `canWriteWiki`/`canManageWiki` for Wiki) — the same anti-goal `12-wiki.md` already states for the Wiki alone, now true of every module.

---

## 2. Scope

**D-93. A project in scope covers its List tasks and its Docs together; a wiki is scoped on its own.** Picking a project for a token that reads List, Docs or both reaches every task and every doc of that project — there is no way to grant one and not the other inside the same project (user decision, design doc "Scope"). Wikis have their own scope kind and are picked one by one, as before `D-78`. `scopeKindsInUse(grants)` names the scope kinds some granted module actually uses; a scope row of a kind nothing reads is never kept (`normalizeScope`) and is dropped on an edit that drops the last module using it, even for rows the owner can no longer see.

**D-94. Effective scope, computed on every request, extends unchanged to every scope kind.** `effective scope = stored scope ∩ what the owner can see right now`, for each kind independently: `visibleProjectIds(ownerId)` for projects (`project-access.ts`, mirroring `visibleWikiIds`) and `visibleWikiIds(ownerId)` for wikis. Losing membership in a project, or write access to a wiki's visibility, stops a token reaching it on the next request; scope rows stay and come back into effect if access is regranted — the same behaviour `D-78` already gave the Wiki alone, computed once per kind by `effectiveScope()`.

**D-95. Select all is a snapshot of what is offered right now, never a standing "everything".** The stepper's Select all ticks every project or wiki the owner can currently see; scope is stored as that concrete list of ids, not as an "all" flag. A project or wiki created afterwards, or one the owner gains access to later, is not added automatically — the owner opens Edit and ticks it, same as adding one item by hand (design doc, "Scope"). This is a property of the stored scope, not of `effectiveScope`'s intersection: a flag would have had to re-expand on every request and could not express "everything I could see on November 9th."

**D-96. No Defects through MCP.** A project's Defects list (`pmt_defect_nodes`, `WorkKind` `defect`) is not reachable by any tool in this release. Picking a project for List or Docs covers its tasks and documents only. The node adapter behind `list_tasks`/`read_task`/`create_task`/`update_task` is for `WorkKind` `task`: the ledger it reads never includes a defect row, and a defect id reaches `scopedNode`'s depth/archived check and nothing that names it a defect, so it answers `Not found.` exactly as an id in a different project would. A Defects module can be added later through the registry (`D-90`) without touching this behaviour.

---

## 3. The stepper

**D-97. A token is made or edited in four steps, each able to go back without losing a later choice.** Modules (pick any of List, Docs, Wiki) → Permissions (per chosen module: Read ticked and locked, Create/Write chosen freely) → Where (projects for List/Docs, wikis for Wiki, each with its own Select all) → Name and confirm (label, optional expiry — creation only — and a summary of every module's access and scope count before the secret is minted). Unticking a module in step 1 drops its permissions and, if no remaining module uses that scope kind, clears that scope too, so nothing unreachable is ever sent to the server. Editing reopens the same stepper on an existing token and can change modules, grants and scope without replacing its secret; expiry cannot be changed after creation.

An item the owner's own role or membership allows less than the token's grants shows that role beside it in step 3 (e.g. "Viewer: this token can only read here"), computed from the project/wiki role already loaded for the page — informational only, since `authorize()`/`canWriteWiki` enforce the real ceiling at write time regardless.

---

## 4. Storage

**D-98. Grants are rows, not columns, and the same is true of scope.** `pmt_access_token_grants` holds one row per `(token, module, permission)` the token holds, `'read'` included — so a module with no Create/Write still has exactly one row, its presence being what `hasModule` tests. `pmt_access_token_scopes` holds one row per project or wiki a token reaches, with exactly one of `token_scope_project_id`/`token_scope_wiki_id` set (`CHECK (num_nonnulls(...) = 1)`), each with its own unique index and an ordinary index for the cascade from the project or wiki side. Deleting a project or a wiki removes its scope rows by the foreign key's cascade alone — the token itself survives, scoped to what is left, exactly as `D-82` already specified for a deleted wiki.

An update to a token's grants (`PATCH /api/tokens/<id>`) replaces them wholesale when `grants` is present in the body, and keeps them unchanged when it is omitted. An update to `scope` works the same way **per kind it is present for**: an omitted `scope` keeps the current scope entirely; a present `scope` object replaces each kind only within what the owner can currently see, and **a kind whose key is missing from the `scope` object is cleared**, not kept — so a client that means "leave wikis alone" must still send the token's current `wikiIds` back, not omit the key. This is sharper than "an omitted field is unchanged" and API clients must read it that way. Whatever the body, a scope kind no remaining granted module uses is always removed, visible or not.

---

## 5. Migration

**D-99. Every token made before this change becomes a Wiki-only token with the same secret, scope and optional grants, automatically, in one migration.** `db/migrations/026_access_tokens.sql` renames `pmt_wiki_tokens` to `pmt_access_tokens` column by column (keeping its id, hash, prefix, timestamps and revocation — a held secret keeps authenticating unchanged), moves `pmt_wiki_token_scopes` rows into `pmt_access_token_scopes` as wiki-kind scope rows, and turns each token's three `wiki_token_can_*` booleans into grant rows: `(wiki, read)` for every token, plus `(wiki, create_wiki)`, `(wiki, create_page)` or `(wiki, write_wiki)` wherever the matching boolean was true. The boolean columns and the old scope table are then dropped. The migration runs once: a second run finds no `pmt_wiki_tokens` to rename and fails loudly rather than silently doing nothing. `tests/e2e/access-token-migration.test.ts` rebuilds the legacy shape on a disposable database, runs the migration, and checks the result against a fresh `db:build` byte for byte in constraint and index names, so a migrated installation and a new one cannot be told apart.

Holders of an old token do nothing: the secret, whatever `pmw_`-prefixed string they hold, keeps working, now reaching exactly what it reached before — the Wiki, with its previous optional grants and scope — until its owner opens Tokens / MCP and adds List or Docs.

---

## 6. The Docs asset rule, carried into MCP

**D-100. An MCP write can never cause a project file to be queued for deletion.** `update_doc_page`'s content rule (`docPageContent` in `mcp-rules.ts`) compares the page's asset references before and after the edit (`removedDocAssetIds`) and refuses any edit that would drop one, the same refusal the editor itself would show — MCP has no upload path, so a dropped reference would orphan a file with no way for the same caller to put it back. This mirrors the rich-content rule Docs and the Wiki already share (`mcpPageContent` in `wiki-mcp-content.ts`): unchanged Markdown on a rich page keeps the rich body; changed Markdown on a rich page is rejected rather than silently flattened, with the caller told to reread with `include_rich_content: true` and send back an edited `rich_content` string instead — the refusal names no specific tool, since the same function serves `update_doc_page` and `update_page` alike.

---

## 7. Notifications

**D-101. A List write through MCP notifies exactly as the same write made in the app would.** `update_task` writes through the same `updateNode()` the app's own `PATCH /api/nodes/[id]` calls, with the token's owner as the acting user. Adding someone as an assignee notifies them under the rules of [`11-notifications.md`](11-notifications.md); the owner is never notified about their own change. There is no second write path for MCP and no MCP-specific suppression of the bell — a token is the owner acting at a distance, not a different actor.

---

## 8. Where it is tested

| Suite | Covers |
|---|---|
| `tests/token-rules.test.ts` | the registry and its re-exports; grant/scope parsing and normalisation; `hasModule`/`hasGrant`/`scopeKindsInUse`; `effectiveScope` per kind; secret, status, rate limiter |
| `tests/mcp-rules.test.ts` | `scopedId`; `taskPatch` (an estimate never fills an actual, nor the reverse); `docPageContent` (section validation, the asset rule, `D-100`) |
| `tests/e2e/tokens.test.ts` | `/api/tokens` and `/api/tokens/[id]` through the session API: grants and scope per module, the PATCH omission rules (`D-98`), scope dropped for an unused kind, the 20-token ceiling, "Allow my token" adding Wiki read |
| `tests/e2e/tokens.browser.test.ts` | the four-step stepper in a real browser: Read locked and ticked, Select all as a snapshot, editing a token away from a module, the old `/wiki/tokens` address redirecting |
| `tests/e2e/mcp-list.test.ts` | List tools over MCP: a grant never outranks a role, out-of-scope and a defect id both answer `Not found.`, membership loss and regain, an assignment notifying (`D-101`) |
| `tests/e2e/mcp-docs.test.ts` | Docs tools over MCP: Create needing project Admin, a stale `updatedAt`, the asset rule (`D-100`), a protected page refusing edits |
| `tests/e2e/access-token-migration.test.ts` | migration 026 end to end (`D-99`), against a disposable loopback database |
| `tests/e2e/wiki-mcp.test.ts`, `tests/e2e/wiki-mcp-write.test.ts` | Wiki tools over MCP, unchanged in behaviour and tool names |
| `tests/e2e/wiki-guide.test.ts` | the in-app guide at `/tokens/guide`, and that every connection example in `docs/guides/mcp.md` still parses and connects |
