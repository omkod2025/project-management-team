# T-Timeline — working agreement

Project management for software delivery. Plan and reality are recorded separately and shown against each other.

**Phase A (specification) is complete. No application code exists yet.** Read the documents before writing any.

| Document | What it owns |
|---|---|
| [`PRODUCT.md`](PRODUCT.md) | Durable product truth — users, purpose, positioning, constraints |
| [`DESIGN.md`](DESIGN.md) | Visual system — tokens, colour law, type, component rules |
| [`docs/PRD.md`](docs/PRD.md) | Goals, non-goals, roles, success criteria |
| [`docs/spec/01-domain.md`](docs/spec/01-domain.md) | Vocabulary and business rules (`D-nn`) |
| [`docs/spec/02-data-model.md`](docs/spec/02-data-model.md) | Why the schema is shaped this way |
| [`docs/spec/03-list-view.md`](docs/spec/03-list-view.md) | List view behaviour |
| [`docs/spec/04-timeline.md`](docs/spec/04-timeline.md) | Timeline view behaviour |
| [`docs/spec/05-permissions.md`](docs/spec/05-permissions.md) | Auth and roles |
| [`docs/spec/06-clickup-migration.md`](docs/spec/06-clickup-migration.md) | Extraction and import |
| [`docs/spec/07-extraction-findings.md`](docs/spec/07-extraction-findings.md) | What the captured data actually contains |
| [`docs/spec/08-operations.md`](docs/spec/08-operations.md) | Backup, restore, deployment shape |
| [`docs/spec/09-roster.md`](docs/spec/09-roster.md) | All Timeline (the roster) — one lane per person, across projects |
| [`docs/spec/10-docs.md`](docs/spec/10-docs.md) | Project documents — pages, templates, Markdown, assets |
| [`docs/spec/11-notifications.md`](docs/spec/11-notifications.md) | The bell — being told when your name is put on a task |
| [`docs/spec/12-wiki.md`](docs/spec/12-wiki.md) | Wiki (คลังความรู้) and Mermaid blocks — sharing, public link, access tokens, the read-only MCP endpoint, deletion (`D-70`…) |
| [`db/schema.sql`](db/schema.sql) | Executable DDL — verified against PostgreSQL 18.4 |
| [`db/tests.sql`](db/tests.sql) | Schema test suite, 14 groups, runs in a rolled-back transaction |
| [`tests/node-rules.test.ts`](tests/node-rules.test.ts) | 46 domain rule tests, each naming the `D-nn` it defends |
| [`tests/e2e/api.test.ts`](tests/e2e/api.test.ts) | 29 end-to-end tests: auth, dates, capture, snapping, validation |
| [`tests/e2e/tree.test.ts`](tests/e2e/tree.test.ts) | 26 end-to-end tests: create, move, place, archive, restore |
| [`tests/e2e/admin.test.ts`](tests/e2e/admin.test.ts) | 29 end-to-end tests: columns, options, members, calendar, invitations, renaming |
| [`tests/e2e/password.test.ts`](tests/e2e/password.test.ts) | 13 end-to-end tests: admin-set passwords and the change they force |
| [`tests/e2e/roster.test.ts`](tests/e2e/roster.test.ts) | 12 end-to-end tests: assignment, the membership boundary, read-only |
| [`tests/e2e/profile.test.ts`](tests/e2e/profile.test.ts) | 11 end-to-end tests: renaming yourself, and admin-issued password resets |
| [`tests/roster-pack.test.ts`](tests/roster-pack.test.ts) | 23 tests: lane packing, occupancy, contention |
| [`tests/list-sort.test.ts`](tests/list-sort.test.ts) | 24 tests: the List's multi-column sort — empty cells, tie-breaks, direction per column, modules by name |
| [`tests/list-filter.test.ts`](tests/list-filter.test.ts) | 34 tests: the multi-select filter shared by List and Timeline — OR inside a column, AND between them, the empty cell, terms that outlive their field |
| [`tests/list-move.test.ts`](tests/list-move.test.ts) | 20 tests: where a dragged row lands — promote, demote, reorder, cross a module, and the two refusals |
| [`tests/list-columns.test.ts`](tests/list-columns.test.ts) | 18 tests: moving the List's columns — bands travel whole, nothing is ever lost |
| [`tests/notification-rules.test.ts`](tests/notification-rules.test.ts) | 18 tests: what counts as an assignment when there is no assignee column — added only, never yourself, per field |
| [`tests/e2e/notifications.test.ts`](tests/e2e/notifications.test.ts) | 21 end-to-end tests: the write on the one path that reaches it, and the read stopping at membership |
| [`tests/doc-publish.test.ts`](tests/doc-publish.test.ts) | 18 tests: the published read-only link — token shape, what a stranger may follow, which files a token may read |
| [`tests/file-columns.test.ts`](tests/file-columns.test.ts) | 5 tests: the file column — what an attachment must carry, the 20 MB ceiling, and every shape the cell refuses |
| [`tests/default-columns.test.ts`](tests/default-columns.test.ts) | 15 tests: the four columns every project starts with, and the List arrangement that opens Assign and Side beside Status |
| [`tests/e2e/default-columns.test.ts`](tests/e2e/default-columns.test.ts) | 6 end-to-end tests: the default columns, the designation, and the saved column order are really written |
| [`tests/wiki-rules.test.ts`](tests/wiki-rules.test.ts) | 70 tests: who sees and writes a wiki, who may delete one, what a token reads, token and page input, Thai-safe search terms, the rate limiter, the breadcrumb |
| [`tests/wiki-tree-order.test.ts`](tests/wiki-tree-order.test.ts) | 6 tests: the wiki page tree in reading order |
| [`tests/e2e/wiki.test.ts`](tests/e2e/wiki.test.ts) | 70 end-to-end tests: the wiki role table, strangers' 404s, pages, search, assets, the public link, access tokens, deleting a wiki |
| [`tests/e2e/wiki.browser.test.ts`](tests/e2e/wiki.browser.test.ts) | 1 browser test: create a wiki, write Thai and Mermaid, the read-only member, the stranger's 404, `.md` import, whole-wiki export in tree order |
| [`tests/e2e/wiki-mcp.test.ts`](tests/e2e/wiki-mcp.test.ts) | 24 end-to-end tests: the MCP endpoint — Bearer only, the four read-only tools, ids in any case, scope decided per request, revoked/expired/deactivated → 401, injection, the rate limit |
| [`tests/e2e/wiki-guide.test.ts`](tests/e2e/wiki-guide.test.ts) | 6 end-to-end tests: the in-app MCP guide names the real origin, is for signed-in people only, and its every example still parses and connects |
| [`tests/mermaid-rules.test.ts`](tests/mermaid-rules.test.ts) | 13 tests: what counts as a Mermaid block, where a parse error points, the 50,000-character ceiling, and the locked config — strict, no HTML labels, no shadow, and the keys no diagram directive may override |
| [`tests/markdown-block.test.ts`](tests/markdown-block.test.ts) | 5 tests: the Markdown block — `markdown`/`md` in any case, the export fence that outgrows the backticks inside, nested fences, Thai and hostile HTML round-tripping byte for byte |
| [`tests/doc-mermaid-render.test.ts`](tests/doc-mermaid-render.test.ts) | 5 tests: a Mermaid fence survives Markdown, rich JSON and back byte for byte, hostile source included |
| [`tests/e2e/doc-mermaid.browser.test.ts`](tests/e2e/doc-mermaid.browser.test.ts) | 1 browser test: diagrams draw in read mode and on the public link, a parse error is shown to the editor only, an `%%{init}%%` directive cannot override the house theme, live preview, HTML export and re-import |
| [`tests/house-style.test.ts`](tests/house-style.test.ts) | 27 tests: the static guard for the house style — the token values, the frozen meaning tokens, vermilion only on misclosure and failed-write classes (and a test that the guard itself has no hole), the List's airy rows, mixed chips and mixed leading marks, Thai restored to 13px inside the `.label` eyebrow, deactivation and money cautions in danger, the Timeline's bars and datum, the Calendar pinned, no retired token |
| [`tests/e2e/house-style.browser.test.ts`](tests/e2e/house-style.browser.test.ts) | 4 browser tests: every restyled page — no sideways scroll at 390px, a white header and a visible focus ring at 1440px; deletion draws in danger; List rows hold their height while edited |
| [`tests/e2e/calendar-look.browser.test.ts`](tests/e2e/calendar-look.browser.test.ts) | 1 browser test: the Calendar's computed look matches its pinned fixture — the scoped exception to the house style does not drift |
| [`docs/TASKS.md`](docs/TASKS.md) | Build plan T0–T9 with per-task checklists |
| [`docs/wireframes/index.html`](docs/wireframes/index.html) | Rendered wireframes for both views |
| [`docs/guides/wiki-mcp.md`](docs/guides/wiki-mcp.md) | Connecting AI clients to the Wiki over MCP |
| [`docs/guides/mermaid.md`](docs/guides/mermaid.md) | Writing Mermaid that renders — the in-app guide at `/wiki/mermaid-guide`, in Thai |
| [`docs/guides/wiki-mcp-internals.md`](docs/guides/wiki-mcp-internals.md) | How the MCP endpoint works inside — request path, token scope, tools, errors, testing, adding a tool |

---

## Running the database

Credentials live in `.env` (git-ignored). With `PGHOST`/`PGUSER`/`PGPASSWORD` exported from it:

```bash
npm run db:build     # psql -f db/schema.sql
npm run db:test      # psql -f db/tests.sql  — 14 groups, rolled back
npm run db:migrate   # apply db/migrations/*.sql once each
npm run db:seed -- <email> <password>
```

`tests.sql` runs inside a transaction and rolls back, so it is safe against any database. It asserts rather than reports: it either prints thirteen `PASS` lines or aborts naming the broken expectation.

`docker-compose.yml` brings up an isolated PostgreSQL 18 on port **5433** if you would rather not use a local server.

---

## Testing

```bash
npm run check      # typecheck + domain tests — the pre-commit bar
npm test           # 474 domain rule tests (nodes, admin, list, roster, notifications, docs, wiki, mermaid, markdown blocks), no database needed
npm run db:test    # 14 SQL groups, rolled back
npm run test:e2e   # 147 API tests — REQUIRES `npm run dev` in another terminal
npm run test:wiki  # 101 wiki tests: REST, browser, MCP, guide — same requirement (7 skip without E2E_INSTALL_ADMIN_PASSWORD)
npm run test:docs  # 15 Docs API tests — same requirement
npm run test:acceptance  # 15 acceptance criteria, same requirement
npm run test:calendar-look  # 1 browser test: the Calendar still renders as pinned — same requirement
```

Three layers, each covering what the one below cannot:

| Suite | Covers | Needs |
|---|---|---|
| `tests/node-rules.test.ts`, `tests/admin-rules.test.ts`, `tests/roster-pack.test.ts` | the decisions: D-1 to D-3, D-10 to D-17, D-31 to D-35, and the roster's claim that lane height is occupancy | nothing |
| `db/tests.sql` | working-day arithmetic, roll-up, closure, subtree procedures | a database |
| `tests/e2e/*.test.ts` | sign-in, roles, the JSON boundary, snapping against the real calendar, and every tree operation | a database **and** a running dev server |

The e2e suite creates its own project and its own throwaway accounts, signs in through the real Auth.js endpoints, and deletes everything afterwards. It never touches the imported ClickUp data. If sign-in breaks for users, that suite fails too — which is the point of not stubbing it.

The rules live in `src/lib/node-rules.ts` and `src/lib/admin-rules.ts` as pure functions — no database, no `server-only` — with `src/lib/nodes.ts` and `src/lib/admin.ts` as the adapters around them. Keep it that way. The moment a rule moves into the adapter it stops being testable without a connection, and the rule that matters most (D-10) stops being defended.

Node runs the TypeScript tests directly by stripping types, so there is no build step. Two consequences: imports inside tested modules need explicit `.ts` extensions, and constructor parameter properties cannot be used (they need code generation, not erasure).

---

## Stack

Next.js · PostgreSQL · Drizzle · TypeScript end to end. TanStack Table for the grid. `date-fns` with `Asia/Bangkok`. Auth.js for sessions.

### Implementation skill

**Always invoke the `ouan-react-best-practice` skill before implementing any work in this project** — new features, components, pages, hooks, API routes, refactors, and bug fixes alike — and follow its rules (S1–S11, R1–R14, X1–X8) while writing the code. Use it again when reviewing changes. Where it conflicts with a rule in this file (naming, colour law, the plan/actual separation, no triggers), this file wins.

---

## Conventions that are not negotiable

### Database naming

```
pmt_   tables          pmp_   procedures       pmf_   functions
p_     parameters      v_     plpgsql locals
```

**Every column carries its own table's entity prefix.** `pmt_users.user_id`, `pmt_nodes.node_name`, `pmt_field_options.option_label`.

**No identifier may be an SQL reserved word.** Bare `id`, `name`, `type`, `level`, `position`, `role`, `label`, `date`, `end`, `start`, `user`, `order`, `config` appear nowhere. Where a prefix alone did not resolve it, the word itself changed: `level` → `node_depth`, `type` → `field_kind`, `config` → `field_settings`. Enum types take a `_kind` suffix.

Set-returning functions prefix their output columns (`led_*`, `rollup_*`, `descendant_*`) so nothing in a function body collides with a table column.

### The rule the product exists for

`node_estimate_*` and `node_actual_*` are four independent columns. **No code path, on either side of the wire, may write one from the other.** The same holds one level up: a parent's own dates are a baseline and are never recomputed from its children.

If a change would make plan and reality share a field, the change is wrong regardless of how convenient it is.

### No triggers

Business rules live in TypeScript. PostgreSQL supplies aggregate computation only, through read-only `pmf_` functions. Roll-up is computed on read and never stored.

### Colour law

Vermilion (`#A82A17`) means **out of closure** and nothing else. A misclosure is out of closure; so is a write that did not land — a failed save in the List, profile or `/people` is an errata, and it is vermilion. It is not a brand colour, not a primary button, not a hover state, not deletion and not a validation hint: those take danger red (`#C4362F`). In CSS, a rule that uses `--color-vermilion` must have every selector in its list name a misclosure or failed-write state as a class — a class ending in `slip`, `failed`, `errata` or `late` (`.slip`, `td.failed`, `.people-errata`, `.rs-late`), or the Timeline's `.brk.over` and `.over-fig` (a bare `over` would let `:hover` through); `tests/house-style.test.ts` enforces it. A deactivated account, a money column in a report and every other caution are states, not misclosures: danger red. Graphite means a human entered the value; blue-black means the system derived it — the ink is the audit trail.

The six `tab-` hues say **whose** work it is — module identity — and never how it is going. They carry the fore-edge tabs, the module chip and indent hairline in the List, the option chips, and both Timeline bars. **Always mixed into the page or the ink, never used raw**: a raw `tab-1` fill lands close enough to vermilion to be misread, and acceptance test A8 computes that distance and fails if the mix is removed.

**The house style is Notion's, on every surface** (decided 2026-11-05): warm paper (`#F6F5F4`) behind white panels and fields, near-black Inter with Anuphan for Thai, one blue (`#0075DE`) for action, links, focus and "you are here", hairlines and layered near-transparent shadows, radii of 4 / 5 / 8 / 12 / 16px and a full pill for the primary action. `DESIGN.md` is the one source: its frontmatter generates `src/app/tokens.css` (`node scripts/tokens.mjs` — never edit the CSS by hand), and its body says how each surface draws. The meaning laws above are drawn inside that style, not instead of it: Timeline bars keep the hatched estimate above the solid actual, option chips are hue-mixed 17% with a 2px leading mark of the hue mixed 70% into the blue-black ink (never raw), and figures are Inter with `tabular-nums`.

**One exception: the Calendar view** (`src/app/(signed-in)/p/[slug]/calendar/`) keeps its Google-Calendar look, by the owner's decision on 2026-11-05. `calendar.css` may only gain pins inside `.cal-page`, and `npm run test:calendar-look` fails if its rendering moves. The bell and the task modal it opens follow the house style.

No dark theme, no zebra striping, no status tint on rows. See `DESIGN.md` § 2 and § 9 before adding any UI.

### Language

Interface chrome in English. Content is Thai. Never apply `letter-spacing` or `text-transform: uppercase` to Thai text; never set Thai below 13px.

---

## Build order

1. **`scripts/clickup-extract.mjs`** — time-critical, see `docs/spec/06-clickup-migration.md`. Needs `CLICKUP_TOKEN` in `.env` (git-ignored, never committed).
2. Schema migration from `db/schema.sql`.
3. Transform + load from the captured JSON.
4. Ledger read (`pmf_project_ledger`) and the API boundary.
5. List view.
6. Timeline view.

---

## Open questions

Tracked in `docs/PRD.md` §9. The blocking one is Q1: the ClickUp API token has not been issued, and the source data becomes hard to reach once the trial lapses.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
