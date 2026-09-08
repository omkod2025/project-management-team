# Build plan

Every task carries the domain rule (`D-nn`) or spec section it must satisfy, so an implementer never has to guess what "done" means.

**Legend** — `[x]` done · `[ ]` not started · `⚠` blocked or time-critical

---

## T0 · Specification

*Status: complete.*

- [x] Requirements interview — 24 decisions recorded
- [x] `PRODUCT.md` — product truth
- [x] `DESIGN.md` — visual system, tokens, colour law
- [x] `docs/PRD.md` — goals, non-goals, roles, success criteria
- [x] `docs/spec/01-domain.md` — vocabulary and rules D-1…D-43
- [x] `docs/spec/02-data-model.md` — schema rationale, ER diagram
- [x] `docs/spec/03-list-view.md`
- [x] `docs/spec/04-timeline.md`
- [x] `docs/spec/05-permissions.md`
- [x] `docs/spec/06-clickup-migration.md`
- [x] `db/schema.sql` — DDL with `pmt_`/`pmp_`/`pmf_` and per-table column prefixes
- [x] `docs/wireframes/index.html` — both views, rendered
- [x] `CLAUDE.md` — working agreement
- [x] Run `db/schema.sql` against a real PostgreSQL to prove it parses — done in T2, clean on the first attempt

---

## T1 · ⚠ Rescue the ClickUp data

*Time-critical. The Business trial expires 2026-09-09; the free plan drops the Timeline view and restricts custom fields.*

- [x] Obtain API token, store in `.env`, add `.env` to `.gitignore`
- [x] Write `scripts/clickup-extract.mjs` — throttled, retrying, writes each response before the next request, no transformation
- [x] Run the extraction (3 lists, 301 tasks)
- [x] **Verify the capture** — all checks passed, see `docs/spec/07-extraction-findings.md`:
  - [x] `_manifest.json` has zero non-200 entries (619 requests)
  - [x] 301 task files captured across 3 lists
  - [x] 280 of 301 tasks are parent-linked
  - [x] `Task Status` carries values on 128 tasks
  - [x] 177 tasks carry both `start_date` and `due_date`, zero inverted
  - [x] All 9 custom field definitions captured
- [ ] ⚠ Resolve the conflicts the data exposed (findings doc §6) — **blocks T3**:
  - [x] Depth: ceiling raised from 4 to 6 (D-1 and D-2 amended 2026-09-07)
  - [x] Status field: `Task Status` designated; stages assigned (spec 06 §3.2b)
  - [x] List→project mapping: one project from `Bannayuu Next`; the other two lists not imported
  - [x] `Activity Category` and `⏳ Plan Progress` — moot; they live only in `Bannayuu Task`, which is not imported
  - [x] `Completion Criteria` and `Next Steps` — not imported (zero values in 174 tasks)
- [x] Inspect every `Task Status` option and assign a `stage` (D-35)
- [x] Second capture taken 2026-09-07 (`data/clickup-raw/2026-09-07T09-40-46`) — 619 requests, zero failures, 301 tasks
- [x] `npm run clickup:diff` compares two captures: **identical**. No task added, removed or changed; no field or option set changed
- [x] Re-imported from the second capture and verified idempotent — the generated SQL was byte-identical and the project's digest was unchanged before and after

---

## T2 · Database

*Status: complete. `db/schema.sql` builds a clean database and `db/tests.sql` passes 13/13.*

- [x] Provision PostgreSQL — running against the local PostgreSQL 18.4 on port 5432, database `fieldbook`. `docker-compose.yml` is committed as the portable alternative (Docker Desktop was not running)
- [x] Execute `db/schema.sql` — **parsed and ran clean on the first attempt**, no fixes needed
- [x] Verify the naming convention holds: every column prefixed, no reserved words
- [x] Replace the placeholder Thai holidays with the published 2026 calendar (21 dates, including the 2 Jan Cabinet special and the in-lieu days for Visakha Bucha and 5 December)
  - [ ] Confirm the 2026 dates against the Royal Gazette, and seed 2027 once announced
- [x] Unit-test the working-day functions (`db/tests.sql` A–D):
  - [x] `pmf_is_workday` — weekday, Saturday, Sunday, listed holiday, NULL
  - [x] `pmf_next_workday` — already a working day, Saturday, a weekend + Songkran run
  - [x] `pmf_duration_workdays` — single day, inverted range, all-weekend range (0), NULL
  - [x] `pmf_workdays_between` — positive, negative, zero, NULL operand
- [x] Unit-test the aggregates (E–H):
  - [x] `pmf_descendants` — multi-level, leaf, archived children excluded
  - [x] `pmf_rollup` — roll-up extent, NULL-tolerant actuals, overrun in working days
  - [x] `pmf_project_ledger` — one row per live node, agrees with `pmf_rollup` and `pmf_misclosure`
  - [x] `out_of_closure` true only when children exceed the baseline (D-22)
- [x] Test the CHECK constraints reject inverted ranges, parentless non-roots, and depth 7 (I)
- [x] Test `pmp_move_subtree` shifts every descendant depth correctly (J)
- [x] Test `pmp_archive_subtree` / `pmp_restore_subtree` round-trip, and that archived nodes leave the roll-up and the ledger (K)
- [x] Test jsonb containment and nested extraction (L)
- [x] **Test that writing an actual never disturbs an estimate, or a parent's baseline (M)** — the product's defining rule, now enforced by a test
- [x] Confirm the GIN index is used when filtering by a custom field — `Bitmap Index Scan on pmt_nodes_custom_gin`, 1.8 ms over 50,000 rows
- [→] Drizzle schema and migration workflow — **moved to T4**, since it needs the Node project that T4 creates

---

## T3 · Import

*Status: loaded. 175 nodes in the `fieldbook` database.*

- [x] Write `scripts/clickup-load.mjs` reading the captured JSON
- [x] Import `Bannayuu Next` only, as one project (spec 06 §3.1)
- [x] Map root tasks to module nodes — not synthesised from the Module field
- [x] Map field types; log every unmapped type rather than dropping it (none were unmapped)
- [x] Resolve dropdown values by `orderindex`, not option id
- [x] Map dates per spec 06 §3.3:
  - [x] `start_date` → `node_estimate_start` (51 tasks)
  - [x] `due_date` → `node_estimate_end` (52 tasks)
  - [x] `date_done` / `date_closed` → `node_actual_end`, source `auto` (2 tasks)
  - [x] `node_actual_start` left null — not fabricated
  - [x] Actual dates snapped by `pmf_next_workday()` **in the generated SQL**, so the holiday calendar stays the single source of truth; `*_raw` preserved (D-15)
- [x] Designate `Task Status` as `project_status_field_id` with the stages from spec 06 §3.2b; archive the built-in Status and the Module field
- [x] Write `_clickup_id` into `node_custom_values` and upsert on it — the load is re-runnable
- [x] Produce the import report (spec 06 §3.4)
- [x] Import tags as a `multi_select` field (118 tasks) — not in any spec; would have been lost silently
- [x] Import assignees as a `people` field (3 tasks) — `pmt_nodes` has no assignee column
- [x] Verify: depth distribution 1/17/19/70/57/11, zero nodes over depth 6, zero inverted ranges
- [x] Verify: `pmf_project_ledger` returns the whole project in 7 ms
- [ ] ⚠ Review with the owner — **the imported project has dates on only 52 of 174 nodes, and no module carries a baseline**, so both headline features start with almost no data (see below)

---

## T4 · Application skeleton

*Status: running. `npm run dev` serves the shelf at localhost:3000; typecheck is clean.*

- [x] Next 16 + React 19 + TypeScript, App Router — hand-scaffolded, since `create-next-app` refuses a directory that already holds `.gitignore` and `docs/`
- [x] Drizzle client with a pool cached on `globalThis`, so dev reloads do not exhaust connections
- [x] Drizzle schema mirroring `pmt_*` (`src/db/schema.ts`) — `db/schema.sql` stays authoritative
- [x] Migration workflow: numbered SQL in `db/migrations/`, applied once each by `scripts/migrate.mjs`, recorded in `pmt_migrations`. No down-migrations, by design
- [x] `001_user_password.sql` — `pmt_users` had nowhere to store a credential
- [x] Auth.js v5 Credentials provider over `pmt_users`, scrypt hashing, JWT sessions
- [x] `user_is_active` re-checked on every token refresh, so deactivation takes effect without waiting out the session
- [x] Seed script: user, password, admin membership on every project
- [x] `requireProjectRole()` choke point + the static `can(role, action)` capability table (spec 05 §3)
- [x] 404-not-403 for reads on projects with no membership row
- [x] Fonts: Bai Jamjuree, Anuphan, Martian Mono via `next/font`, self-hosted at build time
- [x] **Design tokens generated from the `DESIGN.md` frontmatter** by `scripts/tokens.mjs` — 18 colours, 5 type roles, 9 component classes. `tokens.css` is never hand-edited, so the document and the build cannot drift
- [x] Verified: correct password accepted, wrong password rejected, membership resolves to `admin`
- [ ] `date-fns` for `Asia/Bangkok` — installed, not yet wired (nothing formats a date until T6)
- [ ] 4 moderate npm advisories from `npm install` — triage before any deploy
- [ ] Read `node_modules/next/dist/docs/` before T6 — Next 16 warns that its APIs differ from older conventions

---

## T5 · Domain layer

*Status: rules extracted, `npm test` passes 38/38.*

The decisions live in `src/lib/node-rules.ts` as pure functions with no database and no `server-only`, and `src/lib/nodes.ts` is the adapter that loads a row, calls them, and persists the answer. That split is what makes the rules testable at all: `tests/node-rules.test.ts` exercises the same code the API runs, not a parallel copy of it.

- [x] Depth validation (`MAX_DEPTH = 6`, `E_MAX_DEPTH` beyond it)
- [x] Move validation, refusing a move that would push a descendant past the ceiling
- [x] Estimate date writes, with `start <= end` (`E_RANGE_INVERTED`)
- [x] Actual date writes: raw capture → forward snap in SQL → `source = manual` (D-14, D-15)
- [x] Snap-induced inversion collapsed to one working day (D-16)
- [x] Automatic actual capture on status transition (D-13):
  - [x] `inProgress` sets `actual_start` only when null
  - [x] `done` sets `actual_end`, and `actual_start` too when still null
  - [x] returning from `done` to `inProgress` does **not** clear `actual_end`
  - [x] a field already `manual` is never touched again, even once cleared to null
  - [x] a manual edit in the same request beats capture
  - [x] a NULL stage captures nothing (D-34b) — what makes *cancelled* safe
- [x] Custom value shaping and validation per kind; `E_UNKNOWN_FIELD` on an unknown column, option, or malformed value
- [x] Underscore-prefixed keys refused from clients (`E_RESERVED_KEY`)
- [x] Archived options and archived fields refused (`E_OPTION_ARCHIVED`, `E_UNKNOWN_FIELD`)
- [x] **Regression test: `crossesAxes()` asserts no write touches both axes (D-10)**
- [x] Ledger endpoint returning the tree with definitions and options resolved
- [x] Every write returns the node's recomputed ledger row, so the client never refetches
- [x] `POST /api/nodes` — create, with `node.create` authorisation and float sort ordering (D-5)
- [x] `PATCH /api/nodes/:id { parentId }` — move, with `node.move` authorisation, a cycle guard, and the depth-ceiling check
- [x] **Indent and outdent** — D-3 relaxed 2026-09-07 so a move may change depth; `Alt+→` / `Alt+←` in the List view
- [x] `GET /api/projects/:id/ledger` — the one refetch the client needs, since a move re-depths a whole subtree
- [x] `DELETE /api/nodes/:id` — archive the subtree, admin only, returns how many rows went with it
- [x] `POST /api/nodes/:id/restore` — undo it
- [x] Indent and outdent are reachable from the keyboard
- [x] **Rename** — a drawn pencil on the row, or `F2`. The name cell had no editor at all before this, so renaming was API-only
- [x] **Archive** — a drawn bin on the row, or `Delete`. Admin only, arms once when there is a subtree, offers a real undo afterwards
- [x] Add a child from `Shift+N` or the `+ Add task` row; no third icon on every row
- [ ] Cross-parent move still needs drag or a picker; indent/outdent covers the common case
- [ ] No screen lists archived nodes — restoring after the undo bar is dismissed is API-only
- [ ] `E_FIELD_TYPE_IMMUTABLE` — no field-editing endpoint exists to enforce it against (T8)
- [x] An end-to-end test through the HTTP API with a real session (`tests/e2e/api.test.ts`, 25 tests):
  - [x] unauthenticated write → 401; viewer write → 403 and nothing changes
  - [x] D-13 capture through the API, including that returning from `done` keeps the end
  - [x] D-34b — a stageless option captures nothing
  - [x] D-15 — a Saturday snaps to Monday; **11 Apr 2026 snaps past the weekend and Songkran to the 16th**, against the real holiday table
  - [x] D-16 — a weekend-only range collapses to one working day instead of failing
  - [x] D-17 — an estimate on a weekend is stored untouched
  - [x] D-10 and D-21 — neither axis disturbs the other, and no child rewrites a parent baseline
  - [x] D-14 — a `done` transition does not overwrite a hand-set date
  - [x] the JSON boundary returns the right code for every refusal
  - [x] money keeps the field's currency, not one a client sends

---

## T6 · List view

*Status: built and typechecking; visual review pending a signed-in session.*

- [x] Page shell: fore-edge tab rail, page head, view switch
- [x] Ruled grid — 34px rows, continuous rules, **no zebra striping, no cards**
- [x] Sticky name column; horizontal scroll for the rest
- [x] Column heads closed by the double rule
- [x] Built-in columns incl. computed durations and the misclosure slip
- [x] Custom columns from field definitions, in `field_position` order; archived fields hidden
- [x] Hierarchy: 20px indent per depth, graphite bracket, expansion triangles
- [x] Punched-hole selection marker (not a row highlight)
- [x] Cell editors for all nine kinds (spec 03 §3)
- [x] Empty renders as an en dash; archived options render struck with an `ARCH` suffix
- [x] Ink rule: graphite for `manual`, blue-black for `auto` and computed values
- [x] Optimistic write, revert-and-errata on failure
- [→] **Not TanStack Table.** Hand-rolled: the grid is a tree with fixed columns, bespoke editors and a very particular DOM, so a row model was overhead without leverage. `@tanstack/react-table` removed from dependencies
- [x] Keyboard in full (spec 03 §4): arrows, `Enter`, `Escape`, `Space`, `Tab`/`Shift+Tab`, `E` detail, `N` sibling, `Shift+N` child, `/` search, `G` then `T` to the Timeline
- [x] Expansion state persisted per project in localStorage
- [ ] Grouping by a column other than the tree — the tree is the grouping for now
- [x] `+ Add task` row closing every module block, backed by `POST /api/nodes`
- [x] Detail panel as the facing page — not a modal; the only surface that shows the pre-snap `*_raw` dates and says why a date moved
- [ ] Column visibility control; widths persisted locally
- [ ] Responsive down to a card-free one-record-per-screen layout — the facing page goes full-height over the grid below 900px, but the grid itself does not yet reflow
- [x] Empty states: an empty project and a search with no matches both draw the ruled page with its columns and one line of instruction
- [x] Search (`/`) walks the tree so a deep match keeps its ancestors
- [ ] Loading state — the page is server-rendered, so there is nothing to show yet; needed once the ledger is fetched client-side

---

## T7 · Timeline view

*Status: built and typechecking; visual review pending a signed-in session.*

- [x] Date scale with day / week / month zoom, windowed to the project's own extent
- [x] Non-working-day bands from `pmt_holidays`; today as the datum rule
- [x] **Estimate bar above in pencil hatch, actual bar below in ink, in one row** — distinguished by position, height and fill before colour
- [x] Milestone diamonds for end-only nodes (D-12)
- [x] Parent baseline bracket and roll-up bracket, with **only the overhang in vermilion**
- [x] `Estimate / Actual / Both` toggle, default `Both`
- [x] One node per row, aligned to the name column; no packed rows
- [x] Dragging:
  - [x] body drag moves both endpoints, preserving duration
  - [x] edge drags move one endpoint, refusing to invert the range
  - [x] 1:1 pointer tracking, ghost outline at the origin, live dates above the bar
  - [x] estimate drag writes exactly as dropped (no snapping, D-17)
  - [x] actual drag writes raw, server snaps forward, `manual` recorded (D-14, D-15)
  - [x] keyboard `[` `]`, `Shift` for a week, `Alt` for the actual bar
  - [x] no drag affordance for Viewers
- [x] **Selection carried across views in the URL**, expansion persisted per view — the "carried object" staging is real: the view links carry `?node=`, and switching changes the instrument, not the subject
- [x] Live parent overhang while dragging — the roll-up recomputes from the in-flight drag, so a move that breaks a commitment shows before you release
- [x] Dragging disabled below 700px, with the toolbar saying why
- [x] Sorting: **Est date (default)**, filed order, starts, due, finished, late by, name, with a direction toggle. Every sort but the filed order **flattens the project into one chronological run** — within-parent sorting was tried first and did not actually produce a page in date order (spec 04 §5b)
- [x] The window spans a year either side of today, widened further if the project reaches past it
- [x] The view opens scrolled to today at 40% from the left — spec 04 §5 said so from the start and nothing did it
- [x] Sort, direction, mode and zoom persist per project
- [ ] Render as one SVG layer rather than a DOM node per bar — fine at 175 rows, revisit if it grows
- [x] Empty state — the scale still draws; a timeline with no bars is a blank ruled page, not an empty screen

---

## T8 · Administration

*Status: complete. `/p/<slug>/settings`, admin only. 17 rules tested, 24 e2e tests.*

- [x] Field manager: create, rename, archive, restore. **No delete** — a stored value has no foreign key protecting it (D-34)
- [x] `E_FIELD_TYPE_IMMUTABLE` enforced: a column keeps the type it was created with (D-31)
- [x] Option manager: label, colour, `stage`, archive, restore (D-33)
- [x] Status field designation, with the `E_STATUS_FIELD_TYPE` guard (D-35)
- [x] **The status column cannot be archived while it holds the designation**, and must keep an option marked `done` — otherwise automatic capture silently stops recording finished work
- [x] Members: add, remove, change role — **the last admin cannot demote or remove themselves**, so a project cannot be locked away from everyone
- [x] Holiday calendar editor, with the note that it changes every duration in the project
- [x] User creation returning a one-time token; the admin never sees the password
- [x] `/set-password` claims the token — an unclaimed account has no password hash and therefore cannot be signed into at all
- [ ] Column reordering has an API (`field.position`) but no drag affordance
- [ ] Project creation and renaming — still a seeding operation, not a UI

---

## T9 · Acceptance

*Status: `npm run test:acceptance` — 15 tests, all passing.*

Each criterion is a test in `tests/e2e/acceptance.test.ts`, named for the criterion it checks. Where a criterion can be measured against the real imported project it is, read-only.

- [x] **A1** — the full `Bannayuu Next` tree is present (175 nodes, depths 1/17/19/70/57/11) and every ClickUp column is reproduced. The test reads the capture's own `fields.json` rather than a list written from memory, so it also catches a column silently dropped by a future import change
- [x] **A2** — a status change returns the recomputed row, with the captured end date, duration and variance in the same response. Nothing is refetched
- [x] **A3** — variance matches a hand calculation: estimated to Thursday 10 Sep, ended Monday 14 Sep, reported `+2` working days. Finishing early reports `−2`, not an absolute value
- [x] **A4** — a module whose child runs past its baseline reports `out_of_closure`, and the baseline itself does not move (D-21)
- [x] **A5** — twenty consecutive status changes, every one a 200 carrying its own fresh row
- [x] **A6** — a select column added at project level is accepted on nodes at every depth (D-30)
- [x] **A7** — a Viewer is refused by **all sixteen** writing endpoints, and the project is byte-identical afterwards (checked with a digest, not by trusting the 403)
- [x] **A8** — the two bars differ in position, height and fill, asserted against the stylesheet, so a future edit that makes them differ only by colour fails the suite. Vermilion is asserted to appear only on out-of-tolerance selectors
- [x] Deployment and backup written up in [`spec/08-operations.md`](spec/08-operations.md)
- [x] **Backup taken and verified, 2026-09-07** — ClickUp archive (`diff -r` clean) and database dump (restored, `db/tests.sql` passed against the restored copy), local plus Google Drive
- [ ] A recurring database dump — the archive is a fixed artefact, but live work needs a scheduled job, not a one-off
- [ ] Thai tone marks at 34px — verified by eye in the browser, not automatically. Worth a visual regression test if the type stack ever changes
- [ ] Deployment itself — documented, not performed

### Two criteria the real data cannot demonstrate yet

Both are recorded as passing tests that assert **why**, so the gap is visible rather than quietly skipped:

- **A3 against real data:** the import carried **2** actual end dates across 174 tasks. ClickUp had no actual-start concept and none was invented (spec 06 §3.3), so variance history begins at launch.
- **A4 against real data:** of the 17 depth-2 nodes, **8 are real modules with children and not one carries a baseline** — ClickUp had no module level, so no module dates existed to import. The other 9 are loose ClickUp root tasks that the import promoted to module depth; three of those do carry dates.

Neither is a defect. Both are the owner's data to enter, and until they are, the two headline features have little to show.

---

## Open questions — all closed

- [x] `Bannayuu Task` imported and then archived (2026-09-07) — it turned out to be ClickUp's onboarding template: personal-goal tasks dated 2023, three identical roots of 41 children. **`Bannayuu Next`'s 52 dated tasks are all the schedule data that exists**
- [x] `Budget Allocation` — the amounts are **millions of baht**, not USD and not baht. Corrected in migrations 002 and 003, and in the loader's override so a re-import keeps it. Total across the project: 13 M฿
- [x] Q2 — comments and attachments: **no**. Declined 2026-09-07, not deferred
- [x] Q3 — progress is **counted, not claimed**: the ledger reports `closed / total` descendants from the status column (D-24b, migration 004). No progress field, no tenth field kind.
- [x] Q4 — **a printed report**, `/p/<slug>/report`. Same session, same membership check, no share link
  - [x] Choose depth (modules / tasks / subtasks) and which columns appear
  - [x] **Every `money` column is off by default**, decided from the field's kind rather than its name, so the next one is safe too
  - [x] A warning when a money column is switched on
  - [x] Variance is opt-in; closed counts and dates are always shown
  - [x] Print styles drop the buff ground to white — on paper the page *is* paper — and keep modules off page breaks
- [x] Q5 — **T-Timeline**. Decided 2026-09-07 and signed on the client report

## Deferred by decision — do not start without reopening the decision

Dependencies and auto-scheduling · formula fields · relationship fields · time tracking · board and form views · guest access and public links · saved filters · row reordering · per-field permissions · notifications · **comments** · **file attachments** · dark theme · virtualization · multiple baselines
