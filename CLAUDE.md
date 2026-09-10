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
| [`docs/spec/09-roster.md`](docs/spec/09-roster.md) | Roster timeline — one lane per person, across projects |
| [`docs/spec/10-docs.md`](docs/spec/10-docs.md) | Project documents — pages, templates, Markdown, assets |
| [`db/schema.sql`](db/schema.sql) | Executable DDL — verified against PostgreSQL 18.4 |
| [`db/tests.sql`](db/tests.sql) | Schema test suite, 13 groups, runs in a rolled-back transaction |
| [`tests/node-rules.test.ts`](tests/node-rules.test.ts) | 46 domain rule tests, each naming the `D-nn` it defends |
| [`tests/e2e/api.test.ts`](tests/e2e/api.test.ts) | 29 end-to-end tests: auth, dates, capture, snapping, validation |
| [`tests/e2e/tree.test.ts`](tests/e2e/tree.test.ts) | 20 end-to-end tests: create, move, archive, restore |
| [`tests/e2e/admin.test.ts`](tests/e2e/admin.test.ts) | 29 end-to-end tests: columns, options, members, calendar, invitations, renaming |
| [`tests/e2e/password.test.ts`](tests/e2e/password.test.ts) | 13 end-to-end tests: admin-set passwords and the change they force |
| [`tests/e2e/roster.test.ts`](tests/e2e/roster.test.ts) | 12 end-to-end tests: assignment, the membership boundary, read-only |
| [`tests/e2e/profile.test.ts`](tests/e2e/profile.test.ts) | 11 end-to-end tests: renaming yourself, and admin-issued password resets |
| [`tests/roster-pack.test.ts`](tests/roster-pack.test.ts) | 23 tests: lane packing, occupancy, contention |
| [`tests/list-sort.test.ts`](tests/list-sort.test.ts) | 19 tests: the List's multi-column sort — empty cells, tie-breaks, direction per column |
| [`tests/doc-publish.test.ts`](tests/doc-publish.test.ts) | 18 tests: the published read-only link — token shape, what a stranger may follow, which files a token may read |
| [`docs/TASKS.md`](docs/TASKS.md) | Build plan T0–T9 with per-task checklists |
| [`docs/wireframes/index.html`](docs/wireframes/index.html) | Rendered wireframes for both views |

---

## Running the database

Credentials live in `.env` (git-ignored). With `PGHOST`/`PGUSER`/`PGPASSWORD` exported from it:

```bash
npm run db:build     # psql -f db/schema.sql
npm run db:test      # psql -f db/tests.sql  — 13 groups, rolled back
npm run db:migrate   # apply db/migrations/*.sql once each
npm run db:seed -- <email> <password>
```

`tests.sql` runs inside a transaction and rolls back, so it is safe against any database. It asserts rather than reports: it either prints thirteen `PASS` lines or aborts naming the broken expectation.

`docker-compose.yml` brings up an isolated PostgreSQL 18 on port **5433** if you would rather not use a local server.

---

## Testing

```bash
npm run check      # typecheck + domain tests — the pre-commit bar
npm test           # 126 domain rule tests (nodes, admin, timeline sort), no database needed
npm run db:test    # 13 SQL groups, rolled back
npm run test:e2e   # 114 API tests — REQUIRES `npm run dev` in another terminal
npm run test:acceptance  # 15 acceptance criteria, same requirement
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

Vermilion (`#A82A17`) means **out of closure** and nothing else. It is not a brand colour, not a primary button, not a hover state. Graphite means a human entered the value; blue-black means the system derived it — the ink is the audit trail.

The six `tab-` hues say **whose** work it is — module identity — and never how it is going. They carry the fore-edge tabs, the module chip and indent hairline in the List, the option chips, and both Timeline bars. **Always mixed into the page or the ink, never used raw**: a raw `tab-1` fill lands close enough to vermilion to be misread, and acceptance test A8 computes that distance and fails if the mix is removed.

No cards, no rounded corners, no blurred shadows, no dark theme, no zebra striping. Status draws as a square-cornered chip washed into the paper — **not** a pastel pill with a radius and a shadow. See `DESIGN.md` § Colors rules 3 and 3b before adding any UI.

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
