# Central MCP Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wiki-only access token with one system-wide token that grants read, create and write per module (List, Docs, Wiki) over chosen projects and wikis. A four-step stepper on a top-level Tokens / MCP page sets these, and one MCP endpoint serves every module.

**Architecture:**
- A pure module registry (`token-rules.ts`) declares each module's permissions and the kind of scope it uses. Storage, input parsing, the stepper and MCP tool registration all read from it.
- Tokens move to module-neutral tables: grant rows and scope rows instead of boolean columns. An in-place migration keeps every existing hash.
- `POST /api/mcp` builds one server per request and registers each module's tools only when the token holds that module. Each module's tools live in their own file under `src/lib/mcp/`.

**Tech Stack:** Next.js (App Router, the repo's own version: read `node_modules/next/dist/docs/` before touching routes), PostgreSQL 18, Drizzle, TypeScript, `@modelcontextprotocol/sdk`, zod, `node --test`.

**Spec:** [`docs/superpowers/specs/2026-11-09-central-mcp-tokens-design.md`](../specs/2026-11-09-central-mcp-tokens-design.md). Read it with this plan.

## Global Constraints

- **Skills.** Invoke `ouan-react-best-practice` before writing any code (CLAUDE.md). Load `impeccable` for UI work (user memory). `CLAUDE.md` and `DESIGN.md` win any conflict.
- **DB naming.** `pmt_` tables. Every column carries its table's entity prefix. No reserved word as a bare identifier. No triggers.
- **Pure rules.** Rules live in pure modules with explicit `.ts` imports, no `server-only`, and no constructor parameter properties. Adapters wrap them.
- **Plan and reality stay apart.** No code path writes `node_estimate_*` from `node_actual_*` or the other way round. A parent's own dates are never recomputed from its children.
- **No destructive MCP tools.** No delete, archive, publish, member change or upload through MCP in any module.
- **No Defects.** MCP reaches `pmt_nodes` (WorkKind `task`) only. A defect id is `Not found.`
- **Carried-over token rules:**
  - Secrets are `pmw_` plus 32 random bytes, base64url. The prefix is unchanged (the builder's call, so every old secret keeps matching `BEARER_RE`). Only SHA-256 and an 8-character prefix are stored.
  - At most 20 active tokens per user.
  - 60 MCP requests per minute per token, shared across modules.
  - Effective scope is recomputed on every request.
  - Every refusal is `Not found.` Unexpected failures are logged and reported with fixed text.
- **One permission set per module.** Read is implicit: a module is held exactly when the token has its `read` grant row. Create and Write grants are independent and default off.
- **Select all is a snapshot.** Scope is always a list of concrete ids, never an "all" flag.
- **Owner's rights are the ceiling.** Every write re-checks the owner's current role:
  - List: `authorize` with `node.create`, `node.rename`, `node.editDates`, `node.editValues` or `node.move`.
  - Docs: `doc.create` for docs and pages, `doc.edit` for content.
  - Wiki: `requireWiki` write or manage.
- **Doc page edits through MCP never remove an asset reference.** Conflicts use the page's `updatedAt`. That is what `saveDocPage` compares; the spec's mention of `version` was mistaken.
- **Assignments made through MCP go through `updateNode`.** The bell rings as if the owner made the change (spec 11).
- **Language.** Interface chrome is English, content is Thai. No `letter-spacing` or `text-transform: uppercase` on Thai. Thai is never below 13px. One blue (`#0075DE`) for action. No vermilion.

## Review Focus

1. **A holder of an old `pmw_…` secret after migration.** The same secret authenticates, `tools/list` shows the same wiki tool names, and its writes are unchanged. Owner: Task 4.
2. **The owner loses project membership while a token is in use.** The next List or Docs call answers `Not found.`, and the project comes back if they rejoin. Owner: Task 5.
3. **A token edited after its owner lost sight of a project or wiki.** Scope rows for items they cannot see now survive the PATCH. Owner: Task 3.
4. **A module removed in an edit.** Its grants go, and scope of a kind no remaining module uses is cleared. Owner: Tasks 1 and 3.
5. **A defect id, a task in an unscoped project, or a move under a parent in another project.** Each answers `Not found.`, and nothing is written. Owner: Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/token-rules.ts` (new, pure) | Module registry, grant and scope parsing, effective scope, secret helpers, status, rate slot. Shared by every module. |
| `src/lib/mcp-rules.ts` (new, pure) | Map MCP arguments to domain inputs: `taskPatch`, `docPageContent`, `scopedId`. |
| `src/lib/wiki-mcp-content.ts` (keep) | `mcpPageContent`, reused per Docs section. |
| `db/migrations/026_access_tokens.sql` (new) | Rename the token table, add grant and scope tables, copy legacy data. |
| `db/schema.sql`, `src/db/schema.ts`, `db/tests.sql` | The final shape. |
| `src/lib/project-access.ts` (new, server-only) | `visibleProjects`, `visibleProjectIds`. |
| `src/lib/access-tokens.ts` (new, replaces `wiki-tokens.ts`) | Token CRUD, "Allow my token", `resolveBearer`. |
| `src/app/api/tokens/route.ts`, `src/app/api/tokens/[id]/route.ts` (new; delete `api/wiki-tokens/*`) | Session-only token API. |
| `src/lib/mcp/server.ts` (new; replaces `wiki-mcp.ts`) | `handleMcp`, rate limit, server assembly. |
| `src/lib/mcp/tool-kit.ts` (new) | `answer`, `OutOfScope`, `NOT_FOUND`, annotations, `McpContext`. |
| `src/lib/mcp/wiki-tools.ts`, `src/lib/mcp/wiki-writes.ts` (moved from `wiki-mcp.ts`, `wiki-mcp-writes.ts`) | Wiki tools, unchanged behaviour. |
| `src/lib/mcp/list-tools.ts` (new) | List tools. |
| `src/lib/mcp/docs-tools.ts` (new) | Docs tools. |
| `src/app/(signed-in)/tokens/{page.tsx,tokens-view.tsx,token-stepper.tsx,tokens.css,token-api.ts}` (new) | The page and the stepper. |
| `src/app/(signed-in)/tokens/guide/page.tsx` (new) | Renders `docs/guides/mcp.md`. |
| `src/app/(signed-in)/wiki/tokens/page.tsx`, `.../guide/page.tsx` | Become redirects. `tokens-view.tsx` there is deleted. |

---

### Task 1: Module registry and pure token rules

**Files:**
- Create: `src/lib/token-rules.ts`
- Modify: `src/lib/wiki-rules.ts`. Remove `TOKEN_PREFIX`, `MAX_ACTIVE_TOKENS`, `newTokenSecret`, `hashTokenSecret`, `bearerSecret`, `TokenFacts`, `effectiveTokenWikis`, `TokenStatus`, `tokenStatus`, `LAST_USED_GRANULARITY_MS`, `shouldTouchLastUsed`, `parseTokenIds`, `parseTokenInput`, `takeRateSlot`, `WIKI_TOKEN_PERMISSIONS`, `WikiTokenPermission` and `parseTokenPermissions`. Keep `isInstallAdmin`, `isUuid` and `pageBreadcrumb`.
- Create: `tests/token-rules.test.ts`. Move the token, secret, rate-limiter and status cases from `tests/wiki-rules.test.ts` here, re-pointed at the new names.

**Interfaces:**
- Produces:
  ```ts
  export type ModuleKey = 'list' | 'docs' | 'wiki';
  export type ScopeKind = 'project' | 'wiki';
  export type TokenPermission = { key: string; label: string; hint: string };
  export type TokenModule = { key: ModuleKey; label: string; hint: string; scope: ScopeKind; permissions: readonly TokenPermission[] };
  export const TOKEN_MODULES: readonly TokenModule[];
  export type TokenGrants = Partial<Record<ModuleKey, string[]>>; // key present ⇔ read; array = optional grants
  export type TokenScope = { projectIds: string[]; wikiIds: string[] };
  export type Visible = { project: ReadonlySet<string>; wiki: ReadonlySet<string> };
  export function parseTokenGrants(input: unknown): TokenGrants;
  export function hasModule(g: TokenGrants, m: ModuleKey): boolean;
  export function hasGrant(g: TokenGrants, m: ModuleKey, permission: string): boolean;
  export function grantRows(g: TokenGrants): Array<{ module: ModuleKey; permission: string }>; // includes {module,'read'}
  export function grantsFromRows(rows: ReadonlyArray<{ module: string; permission: string }>): TokenGrants; // ignores unknown module/permission
  export function parseTokenScope(input: unknown, visible: Visible): TokenScope;
  export function normalizeScope(g: TokenGrants, s: TokenScope): TokenScope;
  export function parseTokenBasics(input: unknown): { label: string; expiresAt: Date | null };
  export type TokenFacts = { revokedAt: Date | null; expiresAt: Date | null; ownerActive: boolean };
  export function effectiveScope(t: TokenFacts, stored: TokenScope, visible: Visible, now: Date): TokenScope;
  // moved unchanged from wiki-rules: TOKEN_PREFIX, MAX_ACTIVE_TOKENS, newTokenSecret, hashTokenSecret,
  // bearerSecret, TokenStatus, tokenStatus, LAST_USED_GRANULARITY_MS, shouldTouchLastUsed, parseTokenIds, takeRateSlot
  ```
- The registry values, in this order (labels are exact UI copy):

  | module | label | scope | permissions (key → label) |
  |---|---|---|---|
  | `list` | List | project | `create_task` → Create task; `write_task` → Write |
  | `docs` | Docs | project | `create_doc` → Create doc; `create_page` → Create page; `write_page` → Write |
  | `wiki` | Wiki | wiki | `create_wiki` → Create wiki; `create_page` → Create page; `write_wiki` → Write |

  Each `hint` comes from the approved mockup. For example, `write_task` is "Edit any field of a task, including dates and status".

- [ ] **Step 1: Write the failing tests** in `tests/token-rules.test.ts`:
  - `parseTokenGrants`:
    - `{list:['create_task'], wiki:[]}` gives `{list:['create_task'], wiki:[]}`.
    - Duplicates collapse.
    - An unknown module, an unknown permission, or `'read'` in a list throws `E_INVALID_DOC`.
    - A non-object throws `E_INVALID_DOC`.
    - `{}` is allowed and gives `{}`.
  - `hasGrant` and `hasModule`:
    - `{docs:[]}` gives `hasModule(…,'docs') === true` and `hasGrant(…,'docs','create_doc') === false`.
  - `grantRows` and `grantsFromRows` round-trip:
    - `grantRows({wiki:['create_page']})` deep-equals `[{module:'wiki',permission:'read'},{module:'wiki',permission:'create_page'}]`.
    - `grantsFromRows` ignores `{module:'defects',permission:'read'}`.
  - `parseTokenScope`:
    - An uppercase visible uuid is lowercased and kept.
    - A malformed id, or one not in `visible`, throws `E_NOT_FOUND`. The two are indistinguishable.
    - A missing key gives `[]`.
  - `normalizeScope({wiki:[]}, {projectIds:[p], wikiIds:[w]})` gives `{projectIds:[], wikiIds:[w]}`. With `{list:[]}`, project ids are kept and wiki ids dropped.
  - `effectiveScope`:
    - Revoked, expired or inactive gives `{projectIds:[], wikiIds:[]}`.
    - Otherwise each list is intersected with `visible`, deduplicated and order-preserving.
  - `parseTokenBasics`:
    - A blank label throws `E_INVALID_DOC`.
    - 101 characters throws.
    - A Thai label of 100 characters passes.
    - `expiresAt` parsing behaves exactly as the old `parseTokenInput` did. Port its existing cases.
  - `TOKEN_MODULES`:
    - Keys are `['list','docs','wiki']`.
    - Every permission key matches `/^[a-z][a-z0-9_]{0,31}$/` and is unique within its module.
    - No permission is named `read`.

- [ ] **Step 2: Run** `node --test tests/token-rules.test.ts`. Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement `src/lib/token-rules.ts`.** Move the helpers out of `wiki-rules.ts` and update every importer (`grep -rn "from '@/lib/wiki-rules'" src`). The `wiki-tokens.ts` imports may stay broken until Task 3 only if `npm run typecheck` is not part of this commit. Prefer to update them to the new module now.

- [ ] **Step 4: Run** `npm test`. Expected: PASS, with the moved cases passing under their new names.

- [ ] **Step 5: Commit** with `feat: add module registry and shared token rules`.

---

### Task 2: Module-neutral token storage and migration

**Files:**
- Create: `db/migrations/026_access_tokens.sql`
- Modify: `db/schema.sql` (the token section, final shape)
- Modify: `src/db/schema.ts`. Replace `wikiTokens` and `wikiTokenScopes` with `accessTokens`, `accessTokenGrants` and `accessTokenScopes`.
- Modify: `db/tests.sql` (the token group around line 432)
- Modify: `tests/e2e/wiki-token-migration.test.ts`. Rename it to `tests/e2e/access-token-migration.test.ts` and rewrite it.

**Interfaces:**
- Produces this DDL. It is fixed, because later tasks query these names:
  ```sql
  pmt_access_tokens(
    access_token_id, access_token_owner_id, access_token_label, access_token_hash UNIQUE,
    access_token_prefix, access_token_created_at, access_token_last_used_at,
    access_token_expires_at, access_token_revoked_at, access_token_revoked_by)
    -- same types and constraints as pmt_wiki_tokens; index pmt_access_tokens_owner_idx

  pmt_access_token_grants(
    token_grant_token_id   uuid NOT NULL REFERENCES pmt_access_tokens(access_token_id) ON DELETE CASCADE,
    token_grant_module     text NOT NULL CHECK (token_grant_module ~ '^[a-z][a-z0-9_]{0,31}$'),
    token_grant_permission text NOT NULL CHECK (token_grant_permission ~ '^[a-z][a-z0-9_]{0,31}$'),
    PRIMARY KEY (token_grant_token_id, token_grant_module, token_grant_permission))

  pmt_access_token_scopes(
    token_scope_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_scope_token_id   uuid NOT NULL REFERENCES pmt_access_tokens(access_token_id) ON DELETE CASCADE,
    token_scope_project_id uuid REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
    token_scope_wiki_id    uuid REFERENCES pmt_wikis(wiki_id) ON DELETE CASCADE,
    CHECK (num_nonnulls(token_scope_project_id, token_scope_wiki_id) = 1))
    -- partial unique indexes on (token_id, project_id) and (token_id, wiki_id) where non-null
  ```
- The scope table uses one nullable foreign key per scope kind. This departs from the spec's single target-id column (the builder's call). The spec requires that deleting a project or wiki removes its scope rows, and only a foreign-key cascade does that without a trigger. A future module scoped by project needs no new column.
- Drizzle exports: `accessTokens` (fields `id, ownerId, label, hash, prefix, createdAt, lastUsedAt, expiresAt, revokedAt, revokedBy`), `accessTokenGrants` (`tokenId, module, permission`), `accessTokenScopes` (`id, tokenId, projectId, wikiId`).

- [ ] **Step 1: Write the failing migration test**, `access-token-migration.test.ts`. It uses the same disposable-database pattern as the old test, on a loopback host only.
  1. Load `db/schema.sql`.
  2. Drop the three new tables.
  3. Recreate the legacy `pmt_wiki_tokens` (with the three `wiki_token_can_*` columns) and `pmt_wiki_token_scopes`, using the DDL copied from `migrations/021_wiki.sql` and `025`.
  4. Insert two tokens: A, with `can_create_page = true` and scope on wiki W1; B, revoked, with no grants and no scope.
  5. Run `026_access_tokens.sql`.

  Then assert:
  - A's `access_token_hash` and `access_token_revoked_at` are unchanged.
  - The grant rows for A are exactly `{(wiki,read),(wiki,create_page)}`. For B they are `{(wiki,read)}`.
  - A has exactly one scope row, with `token_scope_wiki_id = W1`.
  - `pmt_wiki_tokens` and `pmt_wiki_token_scopes` no longer exist.
  - Running `026` a second time fails loudly. Migrations run once, and the test documents this.

- [ ] **Step 2: Add a SQL test group** to `db/tests.sql` in place of the old token group. It asserts:
  - Inserting a scope row with both foreign keys set raises a check violation.
  - Deleting a wiki deletes its scope rows but not the token.
  - Deleting a token cascades its grants and scopes.
  - `token_grant_module = 'Bad-Name'` is refused.

- [ ] **Step 3: Run** `npm run db:test` and `node --env-file=.env --test tests/e2e/access-token-migration.test.ts`. Expected: FAIL.

- [ ] **Step 4: Write `026_access_tokens.sql`.**
  - `ALTER TABLE … RENAME` the table, every column, the index and the primary key and unique constraints to the `access_token_` names.
  - Create the two tables.
  - Insert `(id,'wiki','read')` for every token, plus one row per true `wiki_token_can_*` column, mapped to `create_wiki`, `create_page` and `write_wiki`.
  - Copy the scopes.
  - Drop `pmt_wiki_token_scopes` and the three boolean columns.
  - Bring `db/schema.sql` and `src/db/schema.ts` to the same final shape.

- [ ] **Step 5: Run** `npm run db:build` against a scratch database, then `npm run db:test` and the migration test. Expected: PASS. Run `npm run db:migrate` on the dev database.

- [ ] **Step 6: Commit** with `feat: store tokens as module grants and scopes`. Code that still imports `wikiTokens` breaks here. Commit Tasks 2 and 3 together if `npm run check` must stay green per commit.

---

### Task 3: Token library, project visibility and the session API

**Files:**
- Create: `src/lib/project-access.ts`
- Create: `src/lib/access-tokens.ts`. Delete `src/lib/wiki-tokens.ts`.
- Modify: `src/lib/wiki.ts:185-200`. `createWikiRecord` inserts into `accessTokenScopes` with `{ tokenId, wikiId }`.
- Create: `src/app/api/tokens/route.ts` and `src/app/api/tokens/[id]/route.ts`. Delete `src/app/api/wiki-tokens/`.
- Modify: `src/app/api/wikis/[id]/tokens/route.ts`. Import from `access-tokens`.
- Create: `tests/e2e/tokens.test.ts`
- Modify: `tests/e2e/wiki.test.ts`, `wiki-mcp.test.ts`, `wiki-mcp-write.test.ts` and `wiki-guide.test.ts`. Point every `'/api/wiki-tokens'` call at `'/api/tokens'` with the new body shape: `{label, grants:{wiki:[…]}, scope:{wikiIds:[…]}}`.

**Interfaces:**
- Consumes: Task 1 (`parseTokenGrants`, `parseTokenScope`, `normalizeScope`, `parseTokenBasics`, `grantRows`, `grantsFromRows`, `effectiveScope`, `hasModule`) and Task 2 (the Drizzle tables).
- Produces:
  ```ts
  // project-access.ts
  export type VisibleProject = { id: string; name: string; slug: string; role: Role };
  export async function visibleProjects(userId: string): Promise<VisibleProject[]>; // member, project not archived, by name
  export async function visibleProjectIds(userId: string): Promise<Set<string>>;
  // access-tokens.ts
  export type TokenRow = {
    id: string; label: string; prefix: string; ownerId: string; ownerName: string; ownerEmail: string;
    grants: TokenGrants; projects: Array<{ id: string; name: string }>; wikis: Array<{ id: string; title: string }>;
    createdAt: string; lastUsedAt: string | null; expiresAt: string | null; status: TokenStatus;
  };
  export type McpAuth = { tokenId: string; ownerId: string; grants: TokenGrants; scope: TokenScope };
  export async function listMyTokens(userId: string): Promise<TokenRow[]>;
  export async function listAllTokens(userId: string): Promise<TokenRow[]>;          // install admin only, else E_NOT_FOUND
  export async function createToken(userId: string, input: unknown): Promise<{ token: TokenRow; secret: string }>;
  export async function updateToken(userId: string, tokenId: string, input: unknown): Promise<TokenRow>;
  export async function allowWikiOnMyTokens(userId: string, wikiId: string, tokenIds: string[]): Promise<void>;
  export async function revokeToken(userId: string, tokenId: string): Promise<void>;
  export async function resolveBearer(header: string | null): Promise<McpAuth | null>;
  ```
- API bodies:
  - `POST /api/tokens` takes `{ label, expiresAt?, grants, scope: { projectIds?, wikiIds? } }`.
  - `PATCH /api/tokens/[id]` takes `{ label, grants?, scope? }`. An omitted `grants` keeps the current grants. An omitted `scope` keeps the current scope. `expiresAt` is ignored.
  - `GET /api/tokens` and `GET /api/tokens?all=1` behave as before.
  - All of these are session-only. A Bearer token is refused, as before.
- Semantics:
  - **Create and update** store `normalizeScope(grants, scope)`.
  - **Update replaces grants** by deleting every grant row and inserting `grantRows`.
  - **Update replaces scope only within the visible set.** For each kind, delete the rows the owner can see now that are not in the new list, then insert the new rows with `onConflictDoNothing`. Rows the owner cannot see stay, as in today's `updateToken`.
  - **Removing a module** in an update also deletes every scope row of a kind no remaining module uses, visible or not (Review Focus 4).
  - **`allowWikiOnMyTokens`** keeps today's scope behaviour. It also inserts `(token,'wiki','read')` with `onConflictDoNothing` for each ticked token, so a token without Wiki gains read-only Wiki (spec call 4).
  - **`TokenRow.projects` and `.wikis`** list only scoped items the viewer can see now.

- [ ] **Step 1: Write the failing e2e tests** in `tests/e2e/tokens.test.ts`. Use `setup()` and `signIn` from `tests/helpers/harness.ts`, plus a wiki made through `POST /api/wikis`:
  - `create returns the secret once and the row with grants and scope`: POST `{label:'โทเค็นทีม', grants:{list:['create_task','write_task'], wiki:[]}, scope:{projectIds:[fx.projectId], wikiIds:[w]}}` returns 200, with `secret` matching `/^pmw_/` and `token.grants` deep-equal to the input grants. The GET list never contains `secret`.
  - `scope of a kind no module uses is dropped`: `grants:{wiki:[]}` with `projectIds:[fx.projectId]` stores `projects: []`.
  - `an invisible or malformed project id is 404`: a project the caller is not a member of, and `'nope'`, both give 404.
  - `PATCH without grants keeps them; with {} removes every module`.
  - `PATCH keeps scope the owner can no longer see`:
    1. Make the token with a project scope.
    2. Remove the owner's membership through SQL.
    3. PATCH the label only, with `scope: {projectIds: []}`.
    4. Restore the membership.
  
    Then GET shows the project again (Review Focus 3).
  - `removing the list and docs modules clears project scope even when invisible`.
  - `Allow my token adds wiki read to a list-only token`: PUT `/api/wikis/<w>/tokens` gives that token `grants.wiki` deep-equal to `[]`, and the wiki in `wikis`.
  - `20 active tokens is the ceiling`: port the existing case.

- [ ] **Step 2: Run** `node --env-file=.env --test tests/e2e/tokens.test.ts` with `npm run dev` running. Expected: FAIL (404 on `/api/tokens`).

- [ ] **Step 3: Implement** `project-access.ts`, `access-tokens.ts` and the routes. Port the comments from `wiki-tokens.ts`, generalised. In `resolveBearer`:
  1. Run one query by hash.
  2. Load the grants and scope rows.
  3. Build `Visible` from `visibleProjectIds` and `visibleWikiIds` in parallel.
  4. Return `effectiveScope(...)`.
  
  The `last_used_at` touch logic is unchanged.

- [ ] **Step 4: Run** `npm run check` and the tokens e2e suite, then `npm run test:wiki`. Expected: PASS, with the wiki suites on the new endpoint and body.

- [ ] **Step 5: Commit** with `feat: system-wide token library and /api/tokens`.

---

### Task 4: MCP server split, with the Wiki tools moved unchanged

**Files:**
- Create: `src/lib/mcp/tool-kit.ts`, `src/lib/mcp/server.ts`, `src/lib/mcp/wiki-tools.ts`, `src/lib/mcp/wiki-writes.ts`
- Delete: `src/lib/wiki-mcp.ts`, `src/lib/wiki-mcp-writes.ts`
- Modify: `src/app/api/mcp/route.ts`. Import `handleMcp` from `@/lib/mcp/server`.
- Modify: `tests/e2e/wiki-mcp.test.ts`. Add cases.

**Interfaces:**
- Consumes: `McpAuth` and `resolveBearer` (Task 3), `hasModule` and `hasGrant` (Task 1).
- Produces:
  ```ts
  // tool-kit.ts
  export type McpContext = McpAuth;
  export const NOT_FOUND = 'Not found.';
  export class OutOfScope extends Error {}
  export const outOfScope: () => OutOfScope;
  export type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
  export function answer(name: string, run: () => Promise<unknown>): Promise<ToolResult>;
  export const readOnly: { readOnlyHint: true };
  export const writes: { readOnlyHint: false; destructiveHint: false; idempotentHint: false };
  // wiki-tools.ts
  export function registerWikiTools(server: McpServer, ctx: McpContext): void;
  // server.ts
  export async function handleMcp(req: Request): Promise<Response>;
  ```
- `answer`'s fixed failure text becomes `'The server could not answer this request.'`. `E_DOC_CONFLICT` keeps its reread message. The server name becomes `'t-timeline'`.
- `buildServer` calls `registerWikiTools` only if `hasModule(ctx.grants,'wiki')`, and Tasks 5 and 6 add the List and Docs calls. Wiki tool names stay exactly `list_wikis`, `list_pages`, `read_page`, `search`, `create_wiki`, `create_page`, `update_wiki` and `update_page`, so configured clients keep working. Inside the wiki writes, `grant(ctx, p)` becomes `hasGrant(ctx.grants, 'wiki', p)`, and `ctx.wikiIds` becomes `ctx.scope.wikiIds`.

- [ ] **Step 1: Write the failing tests** in `wiki-mcp.test.ts`:
  - `a token without the wiki module lists no wiki tools`: a token with `grants:{list:[]}` gets a `tools/list` that contains none of the eight wiki names.
  - `a token migrated from the legacy shape keeps its tools` (Review Focus 1):
    1. Insert a token through SQL as the migration leaves it: grants `(wiki,read)` and `(wiki,create_page)`, plus a wiki scope, with a known hash of a known secret.
    2. Its `tools/list` holds the four reads plus `create_page`.
    3. `create_page` succeeds.

- [ ] **Step 2: Run** `npm run test:wiki`. Expected: the new cases FAIL.

- [ ] **Step 3: Move the code.** Pure moves plus the context rename. No behaviour change beyond module gating, the server name and the generic failure text.

- [ ] **Step 4: Run** `npm run check` and `npm run test:wiki`. Expected: PASS, with every existing wiki MCP test unchanged apart from the endpoint helper.

- [ ] **Step 5: Commit** with `refactor: one MCP server with per-module tool registration`.

---

### Task 5: List tools

**Files:**
- Create: `src/lib/mcp-rules.ts` (pure)
- Create: `src/lib/mcp/list-tools.ts`
- Modify: `src/lib/mcp/server.ts`. Register the List tools when `hasModule(ctx.grants,'list')`. Register `list_projects` when the token has List or Docs.
- Create: `tests/mcp-rules.test.ts` and `tests/e2e/mcp-list.test.ts`

**Interfaces:**
- Consumes: `McpContext`, `answer`, `outOfScope`, `readOnly` and `writes` (Task 4); `visibleProjects` (Task 3); `authorize` (`src/lib/permissions.ts`); `createNode`, `updateNode`, `moveNode` and `NodePatch` (`src/lib/nodes.ts`); `loadLedger` (`src/lib/ledger.ts`).
- Produces:
  ```ts
  // mcp-rules.ts
  export function scopedId(ids: readonly string[], raw: unknown): string | null; // uuid-shaped, lowercased, in ids — else null
  export type TaskArgs = { name?: string; estimate_start?: string | null; estimate_end?: string | null;
    actual_start?: string | null; actual_end?: string | null; values?: Record<string, unknown> };
  export function taskPatch(args: TaskArgs): NodePatch; // only keys present in args; snake→camel; nothing derived
  // list-tools.ts
  export function registerProjectTools(server: McpServer, ctx: McpContext): void; // list_projects
  export function registerListTools(server: McpServer, ctx: McpContext): void;
  ```
- Tools (snake_case arguments, zod `.strict()` schemas):

  | Tool | Needs | Arguments → result |
  |---|---|---|
  | `list_projects` | list or docs | none → `[{id,name,slug,role}]` for projects in `ctx.scope.projectIds` |
  | `list_tasks` | list | `project_id` → `[{id,parentId,depth,name,estimateStart,estimateEnd,actualStart,actualEnd,values}]`, mapped from `loadLedger(ownerId, slug).rows` (`led_*`), depth ≥ 2 |
  | `read_task` | list | `task_id` → the same shape for one task, plus `projectId` |
  | `create_task` | `list.create_task` | `parent_id`, `name`, `after_id?` → the created task. `authorize(owner, project, 'node.create')` |
  | `update_task` | `list.write_task` | `task_id` plus any of `name, estimate_start, estimate_end, actual_start, actual_end, values`, **or** `parent_id`/`after_id` for a move → the updated task |

- Rules:
  - **Task ids resolve against `pmt_nodes` only.** Find the node's project, then `scopedId(ctx.scope.projectIds, projectId)`. A miss is `outOfScope()`. Defect ids never resolve (Review Focus 5).
  - **Move or edit, not both.** Mixing move keys with field keys in one `update_task` is `E_INVALID_DOC` "Move and edit a task in separate calls."
  - **Moves stay in one project.** A move needs `node.move`, and the new parent must be a `pmt_nodes` row in the same project. Otherwise `outOfScope()`.
  - **Edits are authorised by what they touch, as the PATCH route does.** Dates need `node.editDates`, `values` needs `node.editValues`, and `name` needs `node.rename`. Then `updateNode(id, taskPatch(args), ownerId)`, so assignments notify (spec 11).

- [ ] **Step 1: Write the failing pure tests** in `tests/mcp-rules.test.ts`:
  - `taskPatch({estimate_end:'2026-12-01'})` deep-equals `{estimateEnd:'2026-12-01'}`. It has no `actualEnd` key.
  - `taskPatch({actual_start:null})` deep-equals `{actualStart:null}`.
  - `taskPatch({})` deep-equals `{}`.
  - `scopedId([a], A.toUpperCase())` is `a`. `scopedId([a],'x')` is `null`. `scopedId([a], b)` is `null`.

- [ ] **Step 2: Write the failing e2e tests** in `tests/e2e/mcp-list.test.ts`. Mint tokens through `/api/tokens` as `fx.admin`, and use the JSON-RPC `rpc`/`call` helpers copied from `wiki-mcp-write.test.ts`:
  - `list_tasks returns estimate and actual as separate fields` for `fx.nodes.task`.
  - `create_task needs the grant`: without `create_task` the tool is absent from `tools/list`. With it, the new node exists in `pmt_nodes` under `fx.nodes.module`.
  - `update_task writes only what it is given`:
    1. Set `estimate_end`.
    2. SQL shows `node_actual_end` unchanged.
    3. Set `actual_start`.
    4. SQL shows `node_estimate_start` unchanged.
  - `a viewer owner's write grant cannot write`: a token minted by `fx.viewer` with `write_task` returns an error result, and the database is unchanged.
  - `out of scope is Not found.`:
    - A task in a project the token does not scope.
    - A defect node id. Insert one through SQL into `pmt_defect_nodes` for `fx.projectId`.
    - A move under a parent in another project the owner belongs to and the token scopes.
    
    Each returns `Not found.`, and nothing changes (Review Focus 5).
  - `losing membership stops the token, rejoining restores it` (Review Focus 2).
  - `assigning a person through update_task notifies them`: set the people field to `fx.viewer` and assert the viewer has one notification row.

- [ ] **Step 3: Run** `npm test` and the e2e suite. Expected: FAIL.

- [ ] **Step 4: Implement** `mcp-rules.ts` and `list-tools.ts`, and register them in `server.ts`.

- [ ] **Step 5: Run** `npm run check` and `node --env-file=.env --test tests/e2e/mcp-list.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit** with `feat: List tools over MCP`.

---

### Task 6: Docs tools

**Files:**
- Modify: `src/lib/mcp-rules.ts`. Add `docPageContent`.
- Create: `src/lib/mcp/docs-tools.ts`
- Modify: `src/lib/mcp/server.ts`. Register when `hasModule(ctx.grants,'docs')`.
- Modify: `tests/mcp-rules.test.ts`
- Create: `tests/e2e/mcp-docs.test.ts`

**Interfaces:**
- Consumes: `mcpPageContent` (`src/lib/wiki-mcp-content.ts`), `removedDocAssetIds` (`src/lib/doc-asset-references.ts`), `pageSections` and `PageContent` (`src/lib/doc-rules.ts`), `contentMarkdown` and `decodeRich` (`src/lib/doc-rich-content.ts`), `listDocs`, `createDoc`, `loadDoc`, `requirePage`, `createDocPage` and `saveDocPage` (`src/lib/docs.ts`), and `scopedId` (Task 5).
- Produces:
  ```ts
  export function docPageContent(current: PageContent, template: PageTemplate,
    input: { section?: string; markdown?: string; rich_content?: string }): PageContent;
  export function registerDocsTools(server: McpServer, ctx: McpContext): void;
  ```
- What `docPageContent` does:
  - `section` defaults to `'body'` and must be one of `pageSections(template)`. Otherwise it throws `E_INVALID_DOC` "This section does not belong to the page template."
  - The new section text is `mcpPageContent(current[section], input)`. That keeps rich content when the Markdown is unchanged and refuses changed Markdown on a rich section.
  - If `removedDocAssetIds(current, next).length > 0`, it throws `E_INVALID_DOC` "This edit would remove a file from the page. Keep every file link, or remove files in the app."
- Tools:

  | Tool | Needs | Arguments → result |
  |---|---|---|
  | `list_docs` | docs | `project_id` → `listDocs` |
  | `list_doc_pages` | docs | `doc_id` → `[{id,title,slug,depth,parentId,template,protected,updatedAt}]` from `loadDoc` |
  | `read_doc_page` | docs | `page_id`, `include_rich_content?` → `{title, docTitle, template, updatedAt, sections: {key: markdown}}`, plus `rich_content: {key: string \| null}` when asked |
  | `create_doc` | `docs.create_doc` | `project_id`, `title` → `createDoc` |
  | `create_doc_page` | `docs.create_page` | `doc_id`, `title`, `markdown?`, `parent_id?` → `createDocPage(owner, doc, {template:'free', title, parentId, content: markdown === undefined ? undefined : {body: markdown}})`. MCP creates Free pages only (the builder's call) |
  | `update_doc_page` | `docs.write_page` | `page_id`, `section?`, exactly one of `markdown`/`rich_content`, `title?`, `updatedAt` → `saveDocPage(owner, id, {content, title, updatedAt})`. Never `finalizeAssets`, never `uploadedAssets` |

  Every id is resolved to its project first and checked with `scopedId(ctx.scope.projectIds, …)`. A miss is `outOfScope()`. The functions in `docs.ts` then enforce the role (`doc.create`, `doc.edit`) and the existing protected-page and linked-title rules.

- [ ] **Step 1: Write the failing pure tests:**
  - On a Free page with plain `body:'เดิม'`, `{markdown:'ใหม่'}` gives `{body:'ใหม่'}`.
  - On a Module page, an unknown section throws. A known section changes only that key, and the other keys deep-equal the original.
  - Content that holds `/api/doc-assets/<uuid>`, edited with Markdown that omits the link, throws the file-removal message. Edited Markdown that keeps the link passes.
  - Rich content with unchanged Markdown returns the original rich string byte for byte.

- [ ] **Step 2: Write the failing e2e tests** in `tests/e2e/mcp-docs.test.ts`:
  - `a member owner's create_doc grant cannot create a doc`. Use `makeUser` from the harness, added as a member. The result is an error.
  - `admin owner creates a doc and a page, reads it back as Markdown`, with a Thai title and body.
  - `update_doc_page with a stale updatedAt returns the reread message`.
  - `an edit that drops an asset link is refused and pmt_doc_asset_removals stays empty`. Seed the page with an asset through the existing Docs API, as in `docs.test.ts`.
  - `a protected page cannot be edited`.
  - `a doc in an unscoped project is Not found.`

- [ ] **Step 3: Run.** Expected: FAIL.

- [ ] **Step 4: Implement**, then register the tools.

- [ ] **Step 5: Run** `npm run check` and `node --env-file=.env --test tests/e2e/mcp-docs.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit** with `feat: Docs tools over MCP`.

---

### Task 7: Tokens / MCP page and stepper

**Files:**
- Create in `src/app/(signed-in)/tokens/`:
  - `page.tsx`, a server component that loads `listMyTokens`, `listAllTokens` (when admin), `visibleProjects` and `listWikis`;
  - `tokens-view.tsx`: the token tables, revoke, and the "Make a token" button;
  - `token-stepper.tsx`: create and edit;
  - `token-api.ts`: fetch helpers for `/api/tokens`;
  - `tokens.css`.
- Modify: `src/app/(signed-in)/app-header.tsx`. `crossViews` gains `{ label: 'Tokens / MCP', href: '/tokens' }` and its `current` union gains `'Tokens / MCP'`. `wikiViews` drops its Tokens entry.
- Modify: `src/app/(signed-in)/wiki/tokens/page.tsx`, which becomes `redirect('/tokens')`. Delete `tokens-view.tsx` there, and move any token CSS out of `wiki/wiki.css` into `tokens.css`.
- Modify: `src/app/(signed-in)/wiki/[wikiId]/settings/wiki-settings.tsx:213`. The link points at `/tokens`.
- Create: `tests/e2e/tokens.browser.test.ts`. Follow the pattern of `wiki.browser.test.ts`.

**Interfaces:**
- Consumes: `TOKEN_MODULES`, `TokenGrants` and `TokenScope` (Task 1); `TokenRow`, `VisibleProject` and the `/api/tokens` bodies (Task 3); `WikiSummary.role` (`src/lib/wiki.ts`).
- Produces `export default function TokenStepper(props: { projects: VisibleProject[]; wikis: Array<{ id: string; title: string; role: WikiRole }>; token?: TokenRow; onDone: (created?: { token: TokenRow; secret: string }) => void })`.
- Behaviour. The approved mockup is in `.superpowers/brainstorm/*/content/token-stepper-v2.html`.
  1. **Modules.** One card per `TOKEN_MODULES` entry, multi-select. Next is disabled until at least one is chosen.
  2. **Permissions.**
     - There is one group per chosen module, in registry order.
     - The first row is **Read**, rendered as `<input type="checkbox" checked disabled>`.
     - Then one checkbox per registry permission, showing its label and hint.
  3. **Where.**
     - There is one group per scope kind the chosen modules use. The Projects group shows "for List and Docs", naming the modules that use it. The Wikis group is "for Wiki".
     - Each group starts with **Select all** and a "n of m selected" count. It is checked when every item is chosen, `indeterminate` when some are, and clicking it chooses every listed item or clears them all.
     - Each item shows its role badge. A note is shown when the role caps the grants:
       - project `viewer` with any List or Docs grant: "This token can only read here";
       - project `member` with `create_doc` or `create_page`: "Creating docs needs project Admin";
       - a wiki the owner can only read, with any Wiki grant: "This token can only read here".
  4. **Name and confirm.**
     - Label is required, at most 100 characters.
     - Expiry is offered on create only, sent as `${date}T23:59:59+07:00` as today.
     - A summary lists each module, its grants and its scope count.
     - The button reads **Create token** on create and **Save** on edit.
     - After a create, the secret panel shows the secret once, with the JSON config and the `claude mcp add` command. The server key is `t-timeline` in both.
  - **Back** keeps every choice. Edit opens the stepper prefilled from `TokenRow` at step 1.
  - Unticking a module in step 1 drops its grants. Step 3 then hides any scope kind no remaining module uses, and its choices are cleared.
  - Styling follows `DESIGN.md`: white panel on paper, `#0075DE` for the selected card and primary button, the pill primary, `--radius-badge` badges, no vermilion. A failed save uses the existing failed-write class.

- [ ] **Step 1: Write the failing browser test.** Signed in as `fx.admin`, with one project and one wiki:
  1. Open `/tokens`.
  2. Choose all three modules.
  3. Assert that each Read checkbox `isChecked() && isDisabled()`.
  4. Tick List Write and Wiki Create page.
  5. In Where, click Projects **Select all** and assert the count text "1 of 1 selected".
  6. Name the token with a Thai label.
  7. Create.
  
  Then assert the secret appears once and the row shows the modules. Also assert:
  - `/wiki/tokens` redirects to `/tokens`;
  - the page has no sideways scroll at a 390px width.
  - Edit, untick Wiki, and Save; the row no longer lists the wiki.

- [ ] **Step 2: Run** `node --env-file=.env --test tests/e2e/tokens.browser.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the page, the stepper, the redirect and the header changes.

- [ ] **Step 4: Run** the browser test, `npm run check`, `npm run lint`, and `node --env-file=.env --test tests/e2e/house-style.browser.test.ts`, then `npm test`, because `house-style.test.ts` scans the CSS. Expected: PASS.

- [ ] **Step 5: Commit** with `feat: Tokens / MCP stepper as a system-wide page`.

---

### Task 8: Guide, specs and test wiring

**Files:**
- Rename `docs/guides/wiki-mcp.md` to `docs/guides/mcp.md` and rewrite it to cover all three modules, the stepper, the tool list per module, and the server name `t-timeline`. State that existing wiki tool names are unchanged. Update `docs/guides/wiki-mcp-internals.md` for the `src/lib/mcp/` layout, including how to add a module: one registry entry and one `register<Module>Tools`.
- Create: `src/app/(signed-in)/tokens/guide/page.tsx`, which renders `docs/guides/mcp.md` the way `wiki/tokens/guide/page.tsx` does today. The old guide route becomes `redirect('/tokens/guide')`.
- Modify: `tests/e2e/wiki-guide.test.ts`, re-pointed at `/tokens/guide` and the new file.
- Create: `docs/spec/14-mcp-tokens.md`, holding the decisions as `D-90` onward:
  - the registry;
  - implicit read;
  - grants per module;
  - project scope covers List and Docs;
  - Select all is a snapshot;
  - migration;
  - no Defects;
  - the Docs asset rule;
  - notifications.
- Modify: `docs/spec/12-wiki.md`. `D-77` to `D-81` and §6 point to `14-mcp-tokens.md` for tokens, and the rules they state carry over unchanged.
- Modify: `package.json`. Add `"test:mcp": "node --env-file=.env --test --test-concurrency=1 tests/e2e/tokens.test.ts tests/e2e/tokens.browser.test.ts tests/e2e/mcp-list.test.ts tests/e2e/mcp-docs.test.ts tests/e2e/access-token-migration.test.ts"`.
- Modify: `CLAUDE.md`. Update the documents table and the test table: add the new spec, the new test files with their real counts, and `test:mcp`. Update the `npm test` count.

- [ ] **Step 1: Run** `node --env-file=.env --test tests/e2e/wiki-guide.test.ts` after re-pointing it. Expected: FAIL until the guide route exists.

- [ ] **Step 2: Implement** the guide route and the redirect, and write the documents.

- [ ] **Step 3: Run** everything: `npm run check`, `npm run lint`, `npm run db:test`, then `npm run test:e2e`, `npm run test:wiki`, `npm run test:docs` and `npm run test:mcp` against `npm run dev`. Expected: all PASS. Record the counts in `CLAUDE.md`.

- [ ] **Step 4: Commit** with `docs: central MCP tokens guide, spec and test wiring`.
