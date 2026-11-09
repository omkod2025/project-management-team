# Wiki MCP permissions — implementation verification

Date: 2026-11-09
Branch: `feature/wiki-mcp-write`
Baseline: `af5c0f7` on `feature/wiki-row-link`
Requirements: [SRS](../../spec/13-wiki-mcp-write-srs.md)

## Delivered

- Independent token permissions `create_wiki`, `create_page`, `write_wiki`, selected before wiki scope in create/edit forms and visible in personal/admin token tables.
- Four baseline read tools, plus permission-dependent create/update tools. Every request still checks token lifecycle, scope and current user access. No destructive tools or arbitrary action forwarding.
- Atomic wiki creation plus creating-token scope assignment, owner attribution, page validation/history/search/conflict handling and backwards-compatible token edits/defaults.
- Lossless rich editing: unchanged Markdown preserves canonical rich content; changed Markdown cannot silently flatten rich pages. Optional rich reads and canonical updates preserve toggle headings, marks and layout.
- Migration 025 and fresh schema defaults, user/internal guides, specification and implementation plan updated.

## Verification evidence

All results below were obtained after the final application code changes. Integration tests used a dedicated PostgreSQL 18 Docker container on loopback port 55439 and the production build on localhost:3011. The configured remote database was not migrated or used for fixture writes.

| Check | Result |
|---|---|
| `npm run check` (TypeScript + all domain tests) | Passed; 498 tests, 0 failures, 0 skipped |
| `npm run lint -- --max-warnings=0` | Exit 0 |
| `npm audit --audit-level=high --omit=dev` | Exit 0; 0 vulnerabilities |
| `npm run build` | Exit 0; optimized production build and TypeScript succeeded |
| Real Wiki API/browser/MCP/guide tests plus disposable migration verification | Passed; 117 tests, 0 failures, 0 skipped |

Integration invocation (test-only environment overrides the repository `.env`):

```powershell
node --env-file=.env --env-file=.work/wiki-mcp-test.env --test --test-concurrency=1 tests/e2e/wiki.test.ts tests/e2e/wiki.browser.test.ts tests/e2e/wiki-mcp.test.ts tests/e2e/wiki-mcp-write.test.ts tests/e2e/wiki-guide.test.ts tests/e2e/wiki-token-migration.test.ts
```

The temporary environment file and test container are execution artifacts, not deployment configuration. Recreate an isolated local test environment before reproducing this command. Schema fault injection skips non-loopback hosts; migration verification refuses them. The `test:wiki` script includes new MCP tests and serializes files to avoid the shared protected-admin fixture racing between suites.

## Acceptance coverage

| Criteria | Evidence |
|---|---|
| AC-01–04 | Pure permission parsing, eight exact tool sets, baseline read tests, empty-scope creation, creating-token-only scope, database rollback fault, independent page create/update |
| AC-05–09 | Read/write/member/owner/admin authorization, forbidden action and scope tests, legacy edit/clear grants, settings scope-only assignment, user downgrade, token expiry/revoke/inactive owner |
| AC-10–12 | Stale-save rejection, revision attribution, search indexing, Thai/Mermaid and canonical rich-content equality, depth/size validation, no archive/delete even for install admin |
| AC-13 | Real browser create/edit/clear, permission-before-wiki order, persisted checkboxes, permission summary and 390px overflow check; admin API permissions and shared table rendering path |
| AC-14–15 | Atomic metadata patch validation, empty/omitted description, Bearer-only authentication, rate limit, legacy read contracts and all connection-guide examples |

## Review and corrections

A fresh `gpt-6-astra` reviewer found one Important issue and no Critical/Minor issues: portable Markdown could replace canonical rich storage and silently drop content. A regression was observed failing against the original implementation; the final fix preserves no-op rich storage and supports explicit canonical rich edits. Pure and real MCP tests verify stored rich content, not just two already-lossy Markdown exports. The final full suite passed after the fix.

Browser verification also exposed a refresh race when reopening token Edit immediately after Save. Token controls now stay busy for the server refresh transition; the original failing persisted-checkbox scenario passes in the final full suite. A legacy Wiki browser locator was narrowed to the first of two existing Wiki headings.

No deferred minor findings. No dependency changes, push, merge, deployment or migration of the configured application database was performed.

## Release requirement

Apply `db/migrations/025_wiki_token_permissions.sql` through the existing `npm run db:migrate` process before starting the updated application against an existing database. Old token rows default to all optional permissions disabled. Fresh installations use the updated `db/schema.sql`. Deployment remains a separate operation.
