# Wiki MCP create and update permissions

Date: 2026-11-09
Status: Approved by user on 2026-11-09; SRS requested before implementation

Requirements baseline: [Wiki MCP Write Permissions SRS](../../spec/13-wiki-mcp-write-srs.md).

## Intent and agreed behavior

Allow AI clients to create wikis and create or update their pages through the existing `t-timeline-wiki` MCP server. Token owners choose optional permissions first, then the wikis the token can access. No MCP operation may delete or archive a wiki or page.

Permissions are one shared set per token, applied to every scoped wiki:

- `create_wiki`: create a wiki owned by the token owner. Atomically add the new wiki to the creating token's scope. Does not grant page creation or editing implicitly.
- `create_page`: create a page, including its initial title and content, in a scoped wiki where the owner currently has write access.
- `write_wiki`: update existing wiki title/description and existing page title/content. Wiki metadata still requires the owner's existing manage access; page updates require their existing write access.

The four existing tools (`list_wikis`, `list_pages`, `read_page`, `search`) remain available by default. Reads require both token scope and the owner's current read access. There is no optional `read_wiki` permission. A token with no selected wikis reads nothing, but may create a wiki if granted `create_wiki`.

## Approaches

1. **Chosen by user: permissions per token, then wiki selection.** Extends the existing token scope model, keeps configuration simple, and applies the same permission set to all selected wikis.
2. **Considered: permissions per wiki.** Supports different create/edit rights for each wiki but requires a permission matrix and more complex enforcement. Not selected.

## Current system and constraints

`src/lib/wiki-mcp.ts` registers four read-only tools and builds a stateless server for each authenticated POST to `/api/mcp`. `resolveBearer` resolves the active owner and intersects stored wiki scopes with current user visibility on every request. Tokens can be created or edited through the Tokens / MCP screen and can also have wiki scope assigned from wiki settings.

Wiki domain functions already implement user permissions, validation, tree depth, revisions, search indexing, asset handling and optimistic page-save conflicts. Wiki metadata changes require manage access (owner or install admin), while page creation/editing permits write members. Reuse these rules; token permission never elevates user permission.

Retain Bearer authentication, token expiry/revocation/deactivation behavior, the existing rate limit, non-disclosure of inaccessible wiki/page identities, and the current read response contracts. Archived wikis/pages remain inaccessible through MCP.

## Token storage and configuration

Persist three independent optional permissions with a database migration. Existing tokens and create requests that omit permissions default to no optional permissions. Expose permissions in token response models and both personal/admin token listings.

In create and edit forms, show optional permission controls before the existing wiki selection. English labels follow the app convention: Create wiki, Create page, Write wiki. Explain that Write wiki includes wiki details and existing page content, subject to user rights. Selection of a wiki grants baseline reading; it does not grant user access or bypass a missing operation permission. Wiki choices continue to include readable wikis; some may be readable only even when the token has write permissions.

Editing permissions takes effect on subsequent MCP requests without replacing the secret. Preserve permissions if an existing API client edits a token without sending that field; explicitly sending an empty set removes all optional permissions. Existing wiki-settings token assignment changes scope only and never grants or changes operation permissions.

## MCP tools and contracts

Keep the existing four read tools and add:

| Tool | Token permission | Input and result |
|---|---|---|
| `create_wiki` | `create_wiki` | Title and optional description; returns wiki identity/details and adds scope atomically. |
| `create_page` | `create_page` | `wiki_id`, title, Markdown content, optional parent page and slug; returns page identity, slug and `updatedAt`. |
| `update_wiki` | `write_wiki` | `wiki_id` and supplied title/description; updates only those fields and returns current details. |
| `update_page` | `write_wiki` | `page_id`, Markdown content, optional title and required `updatedAt` from the latest read; returns saved title and new `updatedAt`. |

Contract choices above are proposed implementation decisions, not additional user requirements. Exact property spelling is left to the plan, consistent with existing snake_case MCP identifiers. Provide useful input schemas and tool descriptions. Optional write tools are advertised only when the current token grants their permission; execution also enforces permissions independently. Treat writes as non-read-only operations in MCP annotations.

Create-page accepts initial content with `create_page` alone. Updating that page later requires `write_wiki`. New wiki creation scopes only the creating token, not all of the owner's tokens. A transaction must roll back wiki creation if adding token scope fails. Use the token owner as the domain actor and revision author.

Before writes, resolve the target's wiki from authoritative database data and verify token scope plus current user access; never trust a supplied wiki ID to authorize an unrelated page or parent. Require a non-archived target. Expose narrowly defined updates: do not pass arbitrary domain action objects into `updateWiki`, which also supports archive, transfer and publication actions.

Preserve existing page conflict handling: reject stale `updatedAt` and return a recognizable conflict with instructions to reread before retrying. Keep permission, validation and conflict failures actionable without exposing database errors or out-of-scope data. Read results already include `updatedAt`.

Implementation review clarification: portable Markdown exports are lossy for rich content. Preserve canonical rich body on unchanged Markdown submissions; reject changed Markdown on an existing rich page instead of silently flattening it. Opt-in `read_page(include_rich_content: true)` returns the canonical `rich_content` string (null on plain pages), and `update_page` accepts exactly one of `markdown` or `rich_content`. Baseline read responses stay unchanged. Canonical edits use the existing rich validation, history, asset and conflict rules.

## Explicit exclusions

No delete, archive, restore, member management, ownership transfer, public-link changes, page moves/reordering, file-upload tools, revision-restore tools, REST token access, OAuth changes, or per-wiki permission matrix. Existing human UI capabilities are unaffected. Markdown content may reference assets under existing validation rules; this change does not add asset upload or finalization operations.

## Validation and delivery

Cover migration defaults, independent permissions, create versus later update, scope assignment, settings assignment preserving permissions, legacy token edits preserving permissions, user read/write/manage differences, revoked/expired/deactivated tokens, changing user permissions, archived and out-of-scope targets, cross-wiki page/parent attempts, no destructive actions, page conflicts/revisions/search, and atomic wiki-plus-scope creation. Verify the token UI order and saved state, baseline read tools, and capability discovery after permission changes.

Update the wiki specification and MCP guides to replace the read-only limitation and document all permissions/tools. Run appropriate domain checks and database-backed MCP/token tests plus a focused UI check. Actual required commands and implementation sequencing belong in the implementation plan.

## Decisions left to the builder

Choose permission column representation, shared parsing helpers, transaction plumbing for existing domain services, precise safe error envelopes, and component decomposition using existing project conventions. Do not weaken current domain authorization or page validation to reuse a function.

This is a cross-layer feature (database, authorization, MCP and token UI), so use a full design and implementation plan. No product implementation begins until this design is approved.
