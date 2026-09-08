# PRD — T-Timeline

> Project management for software delivery, where the plan and what actually happened are recorded separately and shown against each other.

| | |
|---|---|
| Status | Phase A — specification. No application code exists. |
| Date | 2026-09-07 |
| Owner | Ouan (delivery lead, sole admin) |
| Replaces | ClickUp workspace `36753462` (`Ouan Ouan's Workspace`) |
| Stack | Next.js · PostgreSQL · Drizzle · TypeScript |
| Design system | [`../DESIGN.md`](../DESIGN.md) — The Surveyor's T-Timeline |
| Product truth | [`../PRODUCT.md`](../PRODUCT.md) |

---

## 1. Problem

Every mainstream project tracker — ClickUp, Jira, Asana, Monday, Linear — stores **one date range per task**. When a task slips, the user drags its bar and the original plan is gone. What was promised and what happened occupy the same two fields, so the second overwrites the first.

The consequence is that the single most valuable question in software delivery cannot be answered from the tool:

> *We estimated this module at three weeks. What did it actually take, and how wrong are we usually?*

The current workspace demonstrates the failure directly. Its Timeline view draws one bar per task. Its List view has no date columns at all. Estimation accuracy is not tracked, because there is nowhere to track it.

Three supporting problems, confirmed by the owner:

- **Cost.** The Business trial expires 2026-09-09; the paid tier is not worth it for a team of this size.
- **Data ownership.** Client budget figures and delivery commitments sit in a third-party SaaS.
- **Weight.** ClickUp is slower than the work requires.

## 2. Goals

| # | Goal | How we know it is met |
|---|---|---|
| G1 | Plan and reality are stored separately and never overwrite each other | Four date fields per node; editing `actual_*` cannot mutate `estimate_*`, and vice versa, at any level |
| G2 | Variance is visible without running a report | Timeline draws both ranges stacked by default; List carries a variance column |
| G3 | The same discipline applies to parents | A parent's hand-entered baseline and its children's computed roll-up are separate values, compared and flagged |
| G4 | Morning triage is faster than the tool being replaced | Twenty status changes with no page reload, no modal, keyboard-reachable |
| G5 | Existing work survives the migration | Every task, subtask, custom field value and date in the ClickUp workspace lands in the new system |
| G6 | The team's own columns are reproducible | The nine field types cover every column currently in use, defined once per project |

## 3. Non-goals (phase one)

Deliberately excluded. Each was considered and cut with a reason.

| Excluded | Reason |
|---|---|
| Task dependencies and auto-scheduling | Requires a dependency graph, cycle detection, and cascade rules that conflict with baseline flags. Unused in the current workspace. |
| Effort hours / time tracking / timesheets | Accurate actual hours require a timer discipline nobody has. Dates answer the stated question. |
| Formula and relationship field types | A formula engine needs a parser, dependency graph, and cycle guard — weeks of work for an unrequested feature. |
| Board and Form views | The requirement names List and Timeline. Board raises unanswered questions about where subtasks appear. |
| CSV / Excel export | Considered for client reporting (Q4) and rejected: it hands the work back to a spreadsheet, which is what this product replaces. The printed report answers the same need with a document the sender controls. |
| Guest/client access, public share links | Clients do not enter the system. Per-field visibility risks leaking `Budget Allocation`. |
| Saved filter sets, drag-to-reorder rows | Need a query builder and a concurrent-safe ordering key respectively. |
| Notifications | Nobody has asked for one, and an unread notification list is its own maintenance burden. |
| Comments and attachments | **Decided against, 2026-09-07.** Discussion happens where the team already talks; a second inbox nobody watches is worse than none. Attachments would add a file store, its backups, and its access rules to a product whose whole point is dates. |
| Dark theme | The design world is paper. See DESIGN.md. |
| Virtualized rendering | Under 200 rows per list. Table layer chosen to allow it later. |

## 4. Users and roles

| Role | Scope | Can |
|---|---|---|
| **Admin** | per project | Everything below, plus: manage project members, define and archive custom fields, edit the holiday calendar, delete nodes |
| **Member** | per project | Create and edit nodes, edit any field value, move nodes within the tree, drag timeline bars |
| **Viewer** | per project | Read everything in the project. No writes. |

Roles are held in `pmt_project_members(user_id, project_id, role)`. A user with no row for a project cannot see that project exists. There is no workspace-wide superuser in phase one.

## 5. Core concepts

### 5.1 The tree

Fixed at six levels:

```
project  →  module  →  task  →  subtask  →  subtask  →  subtask
   1          2          3         4            5            6
```

Depths 1–3 are named roles; every depth from 4 down is a subtask, and subtasks nest. Stored as a single self-referencing table with `node_parent_id` and a `node_depth` discriminator; the ceiling is the application constant `MAX_DEPTH = 6`.

> Originally specified as four levels with terminal subtasks. Amended 2026-09-07 after the ClickUp capture showed real parent chains five task levels deep, which with the project as depth 1 needs six. See [`spec/07-extraction-findings.md`](spec/07-extraction-findings.md) §2.

### 5.2 The four dates

Every node carries:

| Field | Meaning | Entered by |
|---|---|---|
| `estimate_start` | Planned start | Human |
| `estimate_end` | Planned finish | Human |
| `actual_start` | Observed start | System, overridable |
| `actual_end` | Observed finish | System, overridable |

Estimates are expressed and reasoned about in **working days**. Actuals are captured as calendar dates and then snapped forward (§5.5).

### 5.3 Baseline vs roll-up

A parent's own four dates are a **baseline** — what was committed, typically to a client, often before children existed. They are entered by hand and the system never rewrites them.

Separately, the system computes a **roll-up** from the parent's descendants:

```
rollup_estimate_start = MIN(estimate_start) over all descendants
rollup_estimate_end   = MAX(estimate_end)   over all descendants
```

…and likewise for actuals. Roll-up is computed on read; it is never stored on the parent row.

When `rollup_estimate_end > estimate_end` on a parent, the parent is **out of closure** and is flagged. The overhang — and only the overhang — is drawn in vermilion.

### 5.4 Automatic actual dates

Each option of a Select field marked as the project's status field carries a `stage`:

| `stage` | Effect on first transition into it |
|---|---|
| `notStarted` | none |
| `inProgress` | if `actual_start` is null, set it to today |
| `done` | if `actual_end` is null, set it to today; if `actual_start` is also null, set it to today as well |

"First transition" means the system writes the value only when the target field is null. Moving back and forth between statuses never rewrites an existing actual date.

A user may override either date by hand. The cell then renders in graphite instead of blue-black — the ink is the audit trail (see DESIGN.md § Colors, rule 2). The override is recorded in `actual_source`.

### 5.5 Working days and snapping

- Non-working days = Saturday, Sunday, and any date in `pmt_holidays` (editable per workspace, Thai public holidays seeded).
- An `actual_start` or `actual_end` landing on a non-working day is **snapped forward** to the next working day.
- The unsnapped value is preserved in `actual_start_raw` / `actual_end_raw` and is never modified. It is surfaced in the detail panel, not the grid.
- Durations and variance figures are computed in working days via `pmf_workdays_between`.

> **Known consequence, accepted by the owner:** forward-snapping both endpoints means a task worked entirely across a weekend collapses to a single Monday. The raw columns preserve what really happened, so this is a display and arithmetic convention, not data loss.

### 5.6 Custom fields

Defined **per project**, inherited by every list in that project.

Nine types: `text`, `long_text`, `number`, `money`, `date`, `select`, `multi_select`, `checkbox`, `people`.

Values live in a `jsonb` column on the node row, keyed by field id, with a GIN index. There are deliberately no foreign keys from values to definitions or to select options. The integrity rules that replace them:

1. Select options are **archived, never deleted**. An archived option still renders wherever it is stored; it is merely unavailable for new selection.
2. Deleting a field definition marks it `archived_at` and hides it; stored values remain in `jsonb` untouched.
3. Changing a field's type is not permitted. Create a new field.

## 6. Surfaces

Two views, sharing one selection. Switching between them does not change what is selected, scrolled to, or expanded (DESIGN.md § Overview, "carried object").

### 6.1 List view

Detailed in [`spec/03-list-view.md`](spec/03-list-view.md).

- Grouped by one column (default: module).
- Inline cell editing for every editable type.
- Expandable rows down to subtask.
- Sticky name column; other columns scroll horizontally.
- Variance column showing signed working-day figures.

### 6.2 Timeline view

Detailed in [`spec/04-timeline.md`](spec/04-timeline.md).

- Estimate bar and actual bar stacked in one row.
- Mode toggle: `Estimate` / `Actual` / `Both` (default `Both`).
- Zoom: day / week / month.
- **Both bars draggable** to change their respective dates. Dragging the actual bar sets `actual_source = 'manual'`.
- Non-working days banded behind the run.
- Today drawn as a datum rule.
- No dependency arrows.

## 7. Migration

Detailed in [`spec/06-clickup-migration.md`](spec/06-clickup-migration.md).

**This is the first thing built, and it is time-critical.** The ClickUp Business trial expires 2026-09-09; the free plan removes the Timeline view and restricts custom fields, so date and field data becomes hard to reach after that.

A standalone Node script pulls the entire workspace through the ClickUp API v2 to raw JSON on disk. It performs no transformation. The transform into `pmt_*` rows is written later, against that captured JSON, and can be re-run as the schema settles.

Requires a personal API token from the owner, stored in `.env` as `CLICKUP_TOKEN` and never committed.

## 8. Success criteria for phase B (prototype)

The prototype is done when all of the following hold against the real migrated data:

1. The full tree of the `Bannayuu Next` project renders in List view with every current ClickUp column reproduced.
2. A status change to a `done`-stage option sets `actual_end` without a page reload.
3. Timeline shows a task whose actual overran its estimate, with the variance figure matching a hand calculation in working days.
4. A module whose children exceed its baseline shows the vermilion overhang.
5. Twenty consecutive status changes complete without a modal, a reload, or a mouse.
6. A new `select` field added at project level appears in every list of that project.

## 9. Open questions

*All five are closed. Kept here with their answers, because a decision without its reasoning becomes a rule nobody can question.*

| # | Question | Blocks |
|---|---|---|
| Q1 | ClickUp API token — not yet issued | Migration, and it expires with the trial |
| ~~Q5~~ | ~~The product's real name.~~ **Decided 2026-09-07: Field Book.** Already consistent across code, database and documents, and it is signed on the client report | — |
| ~~Q4~~ | ~~How is status reported to clients now that ClickUp is gone?~~ **Decided 2026-09-07: a printed report.** `/p/<slug>/report` renders a client-facing document from the same data, printed or saved as PDF. No share link and no guest account — what leaves is a file the sender chose | — |
| ~~Q3~~ | ~~Computed or manual `%` progress?~~ **Decided 2026-09-07: counted, not claimed.** The ledger reports `closed / total` descendants from the status column; there is no progress field and no tenth field kind (D-24b) | — |
| ~~Q2~~ | ~~Are comments and attachments needed at all?~~ **Decided 2026-09-07: no.** Neither is built. The captured comments stay in `data/clickup-raw/` should that ever be reconsidered | — |




## 10. Document map

| File | Contents |
|---|---|
| [`../PRODUCT.md`](../PRODUCT.md) | Durable product truth |
| [`../DESIGN.md`](../DESIGN.md) | Visual system, tokens, component rules |
| [`spec/01-domain.md`](spec/01-domain.md) | Vocabulary and business rules |
| [`spec/02-data-model.md`](spec/02-data-model.md) | Tables, functions, ER diagram |
| [`spec/03-list-view.md`](spec/03-list-view.md) | List view behavior |
| [`spec/04-timeline.md`](spec/04-timeline.md) | Timeline view behavior |
| [`spec/05-permissions.md`](spec/05-permissions.md) | Auth and roles |
| [`spec/06-clickup-migration.md`](spec/06-clickup-migration.md) | Extraction and import |
| [`spec/07-extraction-findings.md`](spec/07-extraction-findings.md) | What the captured data actually contains |
| [`../db/schema.sql`](../db/schema.sql) | Executable DDL |
| [`wireframes/index.html`](wireframes/index.html) | Rendered wireframes |
