# Wiki MCP Write Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Native execution authorized by the user on 2026-11-09.

**Goal:** Add optional create/update permissions to Wiki MCP tokens without any destructive MCP operations.

**Architecture:** Keep baseline reads and the stateless MCP endpoint. Store independent permissions per token, intersect scope with live user access on every request, and reuse domain write rules through narrowly constrained adapters. Make wiki creation and automatic token scoping atomic.

**Tech Stack:** Next.js, TypeScript, Drizzle, PostgreSQL, existing MCP SDK, Node test runner and browser tests.

**Spec:** [SRS](../../spec/13-wiki-mcp-write-srs.md) and [approved design](../specs/2026-11-09-wiki-mcp-write-permissions-design.md).

## Global Constraints

- Permissions: `create_wiki`, `create_page`, `write_wiki`; no optional `read_wiki`.
- Baseline tools: `list_wikis`, `list_pages`, `read_page`, `search`.
- No delete, archive, restore, member management, transfer, publication, move or upload tools.
- Token permissions never elevate user read/write/manage access; archived targets are excluded.
- Preserve Bearer-only `POST /api/mcp`, 60 requests per minute per token, legacy secrets and baseline read contracts.
- Existing tokens get no optional permissions; omitted permissions on edit preserve existing permissions.
- Follow `CLAUDE.md`, `DESIGN.md` and `ouan-react-best-practice` before implementation. Read installed Next.js documentation before API/UI changes.
- Database identifiers use existing entity prefixes; no triggers. No new dependencies are required.

## Review Focus

- Mixed rich/Markdown pages must not silently lose content when read then saved through MCP: Task 3 round-trip test.
- Clearing a description must differ from omitting it: Task 2 metadata patch test.
- A client retaining an old tools list must not retain removed permissions: Task 3 cached-client test.
- A read-only scoped wiki must remain readable when the token also has write permissions: Task 3 mixed-role test.
- Editing a token from an older client must not reset its permissions: Task 1 legacy PATCH test.

## File responsibilities

| Files | Responsibility |
|---|---|
| `db/migrations/025_wiki_token_permissions.sql`, `db/schema.sql`, `src/db/schema.ts` | Three non-null boolean permission columns with false defaults; fresh-install and migration parity |
| `src/lib/wiki-rules.ts`, `tests/wiki-rules.test.ts` | Pure permission type, parsing and checks |
| `src/lib/wiki-tokens.ts`, token API routes | Permission persistence, token responses and live authorization context |
| `src/lib/wiki-mcp-writes.ts` (new), `src/lib/wiki.ts` | Narrow authorized write adapters and reusable transaction-aware domain operations |
| `src/lib/wiki-mcp.ts` | Capability advertisement, schemas, execution guards and safe MCP results |
| `src/app/(signed-in)/wiki/tokens/tokens-view.tsx`, `page.tsx` | Permission controls, token display and explanatory text |
| `tests/e2e/wiki.test.ts`, `wiki-mcp.test.ts`, `wiki.browser.test.ts`, `wiki-guide.test.ts` | Real API/MCP, token UI and guide regression coverage |
| `docs/spec/12-wiki.md`, `docs/guides/wiki-mcp.md`, `wiki-mcp-internals.md` | Replace read-only assumptions and document new contracts |

Verify the next migration number is still free before creating it. Changes to existing API routes are needed only if their current forwarding/response shapes require them.

### Task 1: Persist and resolve optional permissions

**Interfaces:** Export `type WikiTokenPermission = 'create_wiki' | 'create_page' | 'write_wiki'` and `parseTokenPermissions(input: unknown): WikiTokenPermission[]` from `wiki-rules.ts`. Add `permissions: WikiTokenPermission[]` to `TokenRow` and the `resolveBearer` result; retain `tokenId`, `ownerId`, `wikiIds`. Token API payload field is `permissions` (array). Use database columns `wiki_token_can_create_wiki`, `wiki_token_can_create_page`, `wiki_token_can_write_wiki` and Drizzle properties `canCreateWiki`, `canCreatePage`, `canWriteWiki`.

- [x] Add pure tests `token permissions reject unknown or malformed values`, `token permissions are independent`, and `duplicate permissions normalize`: assert empty array accepted, each of three keys accepted, duplicates collapse, unknown/null/string rejected. Handle missing fields at create/edit callers rather than as malformed explicit values.
- [x] Run `node --test tests/wiki-rules.test.ts`; expect new tests fail before implementation.
- [x] Add migration/schema columns with false defaults and implement parser, create defaults, response conversion and edit-preserves-omission behavior. Edit changes permissions in the same transaction as label/scope. Keep Wiki settings scope-only.
- [x] Add integration cases in `tests/e2e/wiki.test.ts`: `legacy token PATCH preserves permissions`, `empty permissions clears grants`, `wiki settings assignment preserves permissions`, and `token migration defaults deny optional writes`. Assert no privilege added by omitted create fields and all token response/list views include permissions.
- [x] Run `node --test tests/wiki-rules.test.ts` and `node --env-file=.env --test tests/e2e/wiki.test.ts` with a running test server/database; expect passing tests. Validate migration on a disposable pre-migration database and compare fresh schema defaults; do not silently migrate a shared database to run tests.
- [x] Commit only Task 1 files with `feat: persist optional wiki token permissions`.

### Task 2: Domain write adapters and atomic Wiki scoping

**Interfaces:** New `wiki-mcp-writes.ts` exports `type McpWriteContext = {tokenId: string; ownerId: string; wikiIds: readonly string[]; permissions: readonly WikiTokenPermission[]}` and `createMcpWiki(ctx, input)`, `createMcpPage(ctx, input)`, `updateMcpWiki(ctx, input)`, `updateMcpPage(ctx, input)` (all async). Inputs match Task 3. Return only the minimal public fields below. Use existing domain error codes and map out-of-scope targets to the established generic not-found result.

- [x] Add integration tests (in `wiki-mcp.test.ts`, initially through planned tools) for atomic Wiki+scope creation, token-owner attribution, independent create-page permission, parent from a different Wiki, metadata manage access, description empty versus omitted, and atomic title/description failure. Expect failure before write tools exist.
- [x] Refactor only necessary domain operations in `wiki.ts` to accept shared transaction plumbing; preserve public human-UI service signatures. Wiki creation and scope insertion share one transaction. Metadata patch validates every supplied field before writing both together; accepts only title/description. Reuse page creation/save, revision and content validation.
- [x] Implement write adapters with explicit permission guards and authoritative page-to-Wiki resolution, then scope and live user authorization checks; reject archived targets. No generic action forwarding. Use user write access for pages and manage access for Wiki metadata.
- [x] Add a database fault-injection test that fails scope insertion and verifies no new Wiki remains. Use a disposable database/transaction harness without production-only test hooks. Test missing token scope even when owner has manage access.
- [x] Run `npm run check` and relevant Wiki API tests; expect no regression. Full new MCP cases become green after Task 3.
- [x] Commit Task 2 files with `feat: add authorized wiki MCP write adapters`.

### Task 3: Register and enforce MCP write tools

**Interfaces:** Pass the full resolved context into server construction. New tool inputs/results:

| Tool | Input | Result |
|---|---|---|
| `create_wiki` | `{title: string, description?: string}` | `{id, title, description}` |
| `create_page` | `{wiki_id: string, title: string, markdown: string, parent_id?: string, slug?: string}` | `{id, wikiId, slug, title, updatedAt}` |
| `update_wiki` | `{wiki_id: string, title?: string, description?: string}` (at least one field) | `{id, title, description}` |
| `update_page` | `{page_id: string, markdown?: string, rich_content?: string, updatedAt: string, title?: string}`; exactly one content field | `{id, title, updatedAt}` |

Review-driven content preservation: implement `mcpPageContent(current, input)` in pure `src/lib/wiki-mcp-content.ts`. An unchanged Markdown export preserves original rich storage; changed Markdown cannot replace rich storage. `read_page` adds optional `include_rich_content` and returns `rich_content` only when requested. Rich edits submit the canonical encoded string, validated through existing domain rules. Test DB-level canonical equality, visible toggle labels and marks in addition to Markdown comparisons. This fixes the final review's Important finding without changing permission scope.

Adapters translate snake_case identifiers to domain fields. Preserve existing `updatedAt` casing for read/edit compatibility. Successful results remain one JSON text content item. Domain validation/permission/conflict errors use `isError: true` and a JSON text object `{error: {code, message}}`; conflict message instructs rereading and does not expose the other editor's identity. Out-of-scope results remain exactly `Not found.`; unexpected errors retain the existing fixed generic message.

- [x] Extend `wiki-mcp.test.ts` to assert all eight optional permission combinations yield the exact expected tools list, and calling a hidden/ungranted tool cannot write. Add stale-page conflict assertions: latest data unchanged, recognizable conflict code, retry with fresh timestamp succeeds.
- [x] Run `node --env-file=.env --test tests/e2e/wiki-mcp.test.ts`; expect new cases fail.
- [x] Register schemas and permission-dependent tools with non-read-only annotations, reject unsupported input keys on write schemas, and implement error mapping. Add description stating create tools may create duplicates on retry; do not promise idempotency. Keep existing read errors/results stable.
- [x] Add tests `removed grant blocks cached client`, `mixed read/write memberships preserve baseline reads`, `rich and Markdown read-update-read preserves content`, `no destructive action even for admin`, and `revoke or role downgrade blocks next write`. Include archived, malformed, out-of-scope and foreign-parent targets; verify search and revision attribution after writes.
- [x] Run `npm run check`, `npm run test:wiki` with server/database; expect all applicable tests pass. Report admin-only skips explicitly. Keep rate-limit budgets separate per test token.
- [x] Commit Task 3 files with `feat: expose permission controlled wiki MCP writes`.

### Task 4: Token UI, documentation and final acceptance

**Interfaces:** Create/edit forms send `permissions: WikiTokenPermission[]`; both lists consume `TokenRow.permissions`. UI sequence: existing label/expiry fields, optional permissions, Wiki choices, submit. Wiki settings continues scope-only API use.

- [x] Add focused browser assertions in `wiki.browser.test.ts`: permission controls precede Wiki choices, default unchecked, save/reopen preserves selections, explicit clear persists, read-only Wiki remains selectable, permissions appear in own/admin lists. Expect failures before UI changes.
- [x] Implement controls and labels Create wiki / Create page / Write wiki. Explain that baseline reads need selected Wikis/current user rights, Write wiki edits Wiki details and existing pages subject to role, and new Wikis join only this token. Update page introduction and remove unconditional read-only copy. Keep secret shown once and config snippets unchanged.
- [x] Update Wiki specification and guides with optional permissions, new tool contracts, independent create/edit semantics, automatic scope, conflict retry instructions and explicit destructive-operation exclusions. Update guide tests and legacy MCP tests that assert all tokens can never write to apply that claim only to baseline tokens.
- [x] Run `npm run check`, `npm run lint`, `npm run test:wiki`, and fresh/migrated disposable database verification. Check every AC-01–15 in the SRS against actual evidence; record skipped/blocked checks without claiming they passed.
- [x] Review the final diff for accidental permissions on old tokens, arbitrary action forwarding, wrong user attribution and content loss. Use the project's review standards before completion.
- [x] Commit Task 4 files with `feat: configure wiki MCP write permissions in token UI`.

## Execution notes

The approved design is the functional baseline; the SRS was produced at the user's request before implementation. This plan adds implementation choices, including wire field names and schema columns, rather than changing the agreed capabilities. Review these artifacts before implementation under the writing-plans workflow. No application code, migrations or permissions have been changed by producing this plan.

Completion evidence: [implementation verification](../specs/2026-11-09-wiki-mcp-write-verification.md). All tasks implemented and verified on the feature branch; deployment is separate.
