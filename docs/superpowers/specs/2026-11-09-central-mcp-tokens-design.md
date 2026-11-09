# Central MCP tokens: one token, per-module permissions

Date: 2026-11-09
Status: Approved by user on 2026-11-09

Builds on: [Wiki MCP write permissions design](2026-11-09-wiki-mcp-write-permissions-design.md), [SRS 13](../../spec/13-wiki-mcp-write-srs.md), [`12-wiki.md`](../../spec/12-wiki.md) §5–6 (`D-77`…`D-81`).

## Intent

Today an access token can only reach wikis. The last token the team issued could read wikis and nothing else, and they then needed it to create, edit and read in other parts of the system as well. The owner wants Tokens / MCP lifted out of the Wiki and made a system-wide facility. One token says which modules it reaches, what it may do in each module, and which projects or wikis it covers. Modules added later must plug into the same token without reshaping it.

## Goals

- One token and one MCP endpoint (`POST /api/mcp`) serve List, Docs and Wiki together.
- The token page becomes a stepper:
  1. **Modules**: pick any of List, Docs, Wiki.
  2. **Permissions**: per chosen module, pick from that module's permissions.
  3. **Where**: pick projects for List and Docs, and wikis for Wiki.
  4. **Name and confirm**: label, optional expiry, a summary of what the token can do and where, then Create. The secret is shown once, as today.
- Per-module permissions (user decision):

  | Module | Read | Create | Write |
  |---|---|---|---|
  | List | always on: read tasks | Create task | Write task: every field, including estimate and actual dates and status |
  | Docs | always on: read docs and pages | **Create doc** and **Create page**, two separate grants | Write: edit page content |
  | Wiki | always on: read and search | **Create wiki** and **Create page**, two separate grants (as today) | Write: wiki details and page content (today's `write_wiki`) |

  Read is drawn as a ticked checkbox that cannot be unticked. Choosing a module grants read on it. Create and Write grants are independent and off by default.
- **Scope**:
  - Picking a project covers every List task and every Doc in that project (user decision).
  - Wikis are picked one by one.
  - Each group has a **Select all** that ticks every item visible *at that moment*. Projects or wikis that appear later are **not** added automatically (user decision). Scope stays a stored list of concrete ids, never a "everything" flag.
  - Only items the owner can currently see are offered. An item where the owner's role allows less than the token's grants shows that role beside it, e.g. "Viewer: this token can only read here".
- **Editing** reopens the same stepper on an existing token and can change modules, grants and scope without replacing the secret. Expiry is set at creation only, as today.
- **Existing tokens migrate automatically** (user decision). Each becomes a token with the Wiki module, keeping its current wiki scope and its current `create_wiki` / `create_page` / `write_wiki` grants. Its secret keeps working unchanged. Holders do nothing.
- **Extensible by declaration** (my call). Each module declares its key, its label, its permission list (any number of Create grants plus Write) and its scope kind (`project` or a module-owned item such as `wiki`). The stepper, token validation, storage and MCP tool registration read that declaration. Adding a module means adding a declaration and its tools, not a migration that adds columns.

## Non-goals

- No delete or archive through MCP in any module (carried over from SRS 13 §8). This includes archiving a List task, even though "Write" covers every field (my call; the user's answer was about creating and editing).
- No publish, member changes or uploads through MCP.
- **No Defects** (user decision). A project's Defects list (`pmt_defect_nodes`, `WorkKind` `defect`) is not reachable through MCP in this release. Picking a project covers its List tasks and Docs only. The node MCP adapter is for `WorkKind` `task` and must refuse defect ids with `Not found.`. A Defects module can be added later through the module declaration.
- No per-item permissions. One permission set per module applies to every project or wiki in scope (same reasoning as TOK-04).
- No OAuth. Bearer only, as `D-79`.
- No new process or service. MCP stays inside the Next.js app (`08-operations.md`).

## Anti-goals: failing even if it works

- **A token doing more than its owner can.** Every write re-checks the owner's current project role (`permissions.ts` `ACTIONS`) or wiki access. For example, Create doc and Create page in Docs both need project Admin (`doc.create`). A Member owner's token with those grants still cannot create docs.
- **An AI writing estimate from actual, or actual from estimate.** List Write may set any field, but each tool call writes only the fields it was given. No MCP code path derives one of `node_estimate_*` / `node_actual_*` from another, and a parent's own dates are never recomputed from its children (CLAUDE.md, the rule the product exists for).
- **Existence leaks.** Anything outside effective scope (an unknown, archived or malformed id, or one in a project or wiki the token or owner cannot reach) answers `Not found.`, the same in every module (`D-80`).
- **Old tokens breaking or silently gaining rights** during migration.

## Constraints carried over unchanged

- **Secrets** (`D-77`): hash plus prefix only; the secret is shown once; at most 20 active tokens per user; the owner or install admin can revoke.
- **Effective scope** (`D-78`): computed on every request as stored scope ∩ what the owner can see now. For projects that means active membership in a non-archived project. When the owner leaves a project, its scope rows stay. They stop counting at once and count again if the owner rejoins, the same as wikis today. For wikis it is `visibleWikiIds`. Revoked or expired tokens and inactive owners give 401.
- **Endpoint** (`D-79`): Bearer only, stateless Streamable HTTP, `GET`/`DELETE` give 405. The app's REST routes keep refusing Bearer.
- **Rate limit** (`D-81`): 60 requests a minute per token, shared across all modules, writes included (SEC-06).
- **Grant enforcement** (MCP-03): write tools are advertised only when granted, and enforced again on execution.
- **Wiki write behaviour**: everything in the wiki write design stays: atomic scoping of a newly created wiki to the creating token, `updatedAt` conflict handling, preservation of rich content, and a token with no scope may still create a wiki (TOK-10).
- **"Allow my token" in wiki settings** still works. It changes Wiki scope only and never grants (TOK-09). If the token does not yet have the Wiki module, adding scope this way adds the module with read only (my call).
- **Admin view**: the install admin's "All tokens" table and revoke action stay.
- **Database conventions**: `pmt_` tables, entity-prefixed columns, no reserved words, no triggers. Rules stay in pure TypeScript modules with adapters around them, so they are testable without a database.

## Decided "how"

- **Page location**: Tokens / MCP leaves the Wiki menu and becomes a top-level, signed-in page reachable from the main header (e.g. near the user menu). The old `/wiki/tokens` redirects to it. The MCP guide moves with it and covers all modules.
- **Storage** (my call): replace the wiki-only shape (`pmt_wiki_tokens` with three boolean grant columns, and `pmt_wiki_token_scopes` pointing only at wikis) with module-neutral tables:
  - a token table;
  - a grant table of (token, module, permission key) rows, where the presence of a module row means read on that module;
  - a scope table of (token, scope kind, target id) rows.

  Exact names and keys are the builder's, within the naming rules. Removing a project or wiki must remove its scope rows, as `D-82` does for wikis today, while the token itself survives.
- **Migration**: one SQL migration copies every existing token, grant and scope into the new shape, keeping hash, prefix, timestamps, revocation and expiry, and is verified by tests. Existing `pmw_…` secrets must keep authenticating. Whether new secrets keep the `pmw_` prefix or take a neutral one is the builder's choice, as long as both forms are accepted.
- **List and Docs need a user-checked layer before MCP can use them.** Node store functions trust their caller (the routes call `authorize` first), and "projects this user can see" exists only as SQL inside a page. Add a "visible projects for user" library function, and an MCP adapter for nodes that calls `authorize` with the same actions the routes use (`node.create`, `node.rename`, `node.editDates`, `node.editValues`, `node.move`). Docs functions in `src/lib/docs.ts` already check permissions and can be called directly.

## Proposed MCP tools (contracts left to the builder)

The tools live together on one server; the server name `t-timeline-wiki` becomes a neutral one. Tool names are prefixed or namespaced by module so later modules cannot collide. The existing wiki tool names must keep working for already-configured clients, or the migration must say plainly that clients need reconfiguring. The builder decides which, and the guide documents it.

- **List**
  - Read: list projects in scope; list or read tasks in a project, with estimate and actual dates and field values as separate fields.
  - Create task: needs Create.
  - Update task: needs Write. Covers name, dates, field values, status, and moving within the same project (my call: moving is part of editing; moving across projects is out).
- **Docs**
  - Read: list docs in a project, list pages, read a page.
  - Create doc: needs Create doc.
  - Create page: needs Create page.
  - Update page: needs Write. Conflicts use the Docs page's own `version` check (what `saveDocPage` uses), so the client must send the version from its latest read.
  - **Page format follows the wiki's rule** (my call):
    - Pages are read and written as Markdown by default, and canonical rich content is available on request.
    - Unchanged Markdown keeps the rich body.
    - Changed Markdown on a rich page is rejected rather than silently flattened.
    - Any update that would drop an asset or task reference the page currently holds is **rejected**. MCP must never cause project files to be queued for deletion.
    - Asset upload stays out (non-goal).

**Notifications** (my call): a List write through MCP that adds an assignee goes through the same store path as the app. The assignee is notified as if the token owner made the change, and the owner is not notified about themselves (spec 11). There is no second write path and no MCP-specific suppression.
- **Wiki**: today's eight tools, unchanged in behaviour.

## Left to the builder

Exact table and column names, permission key spelling, tool names and schemas, the neutral server name and secret prefix, stepper component structure, and how the guide is reorganised. All of it must stay within `DESIGN.md` (Notion house style, one blue for action, no vermilion) and the rules above.

## Verification expected

- **Pure-rule tests**: grant × owner-role matrix per module, effective scope per scope kind, Select all as a snapshot, migration mapping.
- **End-to-end tests**: an old token still works after migration; a List-only token gets `Not found.` from wiki tools; a Viewer owner's Write grant cannot write; a project the owner leaves stops answering on the next request; estimate and actual stay independent through MCP writes.
- **Browser test**: the stepper with all three modules, Read locked and ticked, Select all, edit and reopen.
