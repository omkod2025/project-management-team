# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary user — the delivery lead (currently one person, the product owner).**
Runs several client software projects at once (Pokpong, Bannayuu Next, BNext Guard, Web Property, Web Admin, Web Report). Their day has two distinct scenes:

- **Morning triage, minutes long.** Open the list, change status on ten to twenty items, glance at what slipped. This is keyboard-and-grid work, done fast, often before a standup.
- **Planning and review, longer sittings.** Set delivery dates a client has been promised, break a module into tasks, and answer the question that motivates this whole product: *where did the plan and reality diverge, and by how much?*

**Secondary users — team members (Member role).** Work inside one or more projects, update their own tasks, do not administer field definitions.

Clients and outside guests **do not** have accounts. They receive a printed report (`/p/<slug>/report`), produced and sent by a member — a document rather than a link, so access cannot outlive the sending.

## Product Purpose

A self-hosted project tracker that records **both the planned schedule and the schedule that actually happened**, and shows them against each other on one timeline.

Success is a single question answered without spreadsheet work: *for this module, this task, this project — how far off was the estimate, and is the current plan still credible?*

Secondary success: the tool must be fast enough to survive morning triage. If changing twenty statuses is slower here than in ClickUp, it has failed regardless of its other merits.

## Positioning

ClickUp, Jira, Asana, Linear and Monday all draw **one bar per task**. The bar means "the dates on this task" — and when reality moves, the bar moves with it and the original plan is silently overwritten. Estimate history, where it exists at all, is buried in an audit log nobody reads.

This product treats **estimate and actual as two first-class, permanently separate date ranges**, drawn on top of each other in the same row. Variance is not a report you run; it is the default rendering.

The same discipline repeats one level up: a parent's dates are a **baseline the user committed to a client**, and the roll-up of its children is computed separately and compared against it. Plan and reality never overwrite each other at any level of the tree.

Supporting reasons this is built rather than bought, confirmed by the user: subscription cost, data ownership / on-premise control, and ClickUp being heavier and slower than the work requires.

## Operating Context

**Migrating from ClickUp.** The user's live workspace (`Ouan Ouan's Workspace`, workspace id `36753462`) holds the real data this product must accept on day one. Observed structure:

- Three folderless lists: `Bannayuu Next` (174 tasks), `Bannayuu Task` (126), `Bannayuu Module` (1) — **301 tasks in total**. The view seen during the interview was filtered and showed roughly a dozen. Only `Bannayuu Next` is real work: `Bannayuu Task` is ClickUp's onboarding template (personal goals dated 2023) and is archived, and `Bannayuu Module` holds one junk task.
- `Bannayuu Next` is grouped by a **Module** custom field — the user had already simulated a hierarchy level ClickUp does not provide.
- Nine custom fields. `Completion Criteria` and `Next Steps` hold **zero** values across 174 tasks.
- ClickUp's built-in Status is used as a **module tag**, not a lifecycle: ten of its thirteen values are module or team names.
- 280 of 301 tasks are parent-linked, with real chains **five task levels deep**.
- 177 tasks carry both `start_date` and `due_date`; only **3** carry `date_done`. There is no actual-start data at all.
- A Timeline view: floating bars, day granularity, packed rows, colored by module, no dependency lines in use.
- Task titles are Thai; column names are English.

The full capture and its consequences are recorded in `docs/spec/07-extraction-findings.md`.

**Time pressure.** The ClickUp Business trial expires 2026-09-09; the user will fall back to ClickUp's free plan, which drops the Timeline view. A full API capture was taken on 2026-09-07; a second is due on the trial's last day.

**Language.** Content is Thai. Interface chrome is English (the user's own choice, evidenced by their English column names in a workspace where Thai was available).

**Time.** `Asia/Bangkok`. Working-day calendar: Saturday and Sunday off, plus an editable Thai public-holiday table.

## Capabilities and Constraints

Confirmed by a 24-question requirements interview; each is a decision, not an assumption.

**Hierarchy** — six levels: project → module → task → subtask, with subtasks nesting to depth 6. Stored as self-referencing `node_parent_id`, ceiling enforced in validation (`MAX_DEPTH = 6`). A node can be moved anywhere in its project, subtree and all, so the depth names are positions rather than kinds. Originally scoped at four fixed levels with no re-depthing; both were relaxed on 2026-09-07 after the ClickUp capture showed real parent chains five levels deep.

**Scheduling** — four date fields per node: `estimate_start`, `estimate_end`, `actual_start`, `actual_end`. Dates only; no effort hours, no timesheet.

- Parent dates are entered by hand and stand as a **baseline**. Children roll up into a separate computed range. When children exceed the parent's baseline, the parent is flagged.
- `actual_start` / `actual_end` are set automatically the first time a task's status crosses into an `inProgress` or `done` stage, and can be overridden by hand.
- Estimates are measured in **working days**. An actual date landing on a non-working day is snapped **forward** to the next working day; the untouched value is preserved in `actual_start_raw` / `actual_end_raw`.

**Custom fields** — defined per project, inherited by every list in that project. Nine types: Text, Long text, Number, Money, Date, Select, Multi-select, Checkbox, People. Select options carry a `stage` marker (`notStarted` / `inProgress` / `done`) that drives automatic actual dates. Options are archived, never deleted. Values are stored in a `jsonb` column on the task row with a GIN index — deliberately no foreign keys on field values.

**Views** — two, and only two: List and Timeline. No board, no form view.

- **List:** inline cell editing, group by one column, expandable subtasks. No saved filters, no drag-to-reorder rows in phase one.
- **Timeline:** estimate and actual bars stacked in one row by default, with an `Estimate / Actual / Both` toggle. Day / week / month zoom. **Both** bars are draggable to change dates. No dependency arrows.

**Access** — email login. Roles are per project via `project_members`: Admin, Member, Viewer. No guest role, no public share links, no per-field visibility rules.

**Scale** — 301 tasks captured from ClickUp; largest list 174. Under 1,000 overall and under 200 per list, but with less headroom than assumed when the no-virtualization decision was made. Lists load whole; no virtualization in phase one, though the table layer is chosen to allow it later.

**Stack** — Next.js, PostgreSQL, Drizzle, TypeScript end to end. Business rules live in TypeScript; aggregate computation (roll-up, working-day math) lives in read-only PostgreSQL functions. **No triggers.**

**Naming convention (binding).** PostgreSQL objects are prefixed: `pmt_` tables, `pmp_` procedures, `pmf_` functions.

**Progress is counted, not entered.** The ledger reports how many descendants sit at a `done` stage (`12 / 41`); there is no `%` field to fill in. A typed percentage is a claim nothing checks, and this workspace already showed what happens to unenforced manual fields — two of them held zero values across 174 tasks.

**Explicitly out of scope:** task dependencies and auto-scheduling, formula fields, relationship fields, time tracking / timesheets, board and form views, guest access, public links, saved filter sets, row reordering, per-field permissions, notifications. **Comments and file attachments are declined outright**, not deferred — discussion belongs where the team already talks, and a file store would bring its own backups and access rules to a product about dates.

**Open / undecided:** nothing blocking. Comments and attachments were declined on 2026-09-07; client reporting is answered by a printed report rather than by giving clients accounts; the product is called Field Book. A `%` progress field is no longer hypothetical — ClickUp's `automatic_progress` field is in active use on 126 tasks, and nothing in the nine field kinds replaces it.

## Brand Commitments

**The product is called Field Book.** Confirmed 2026-09-07, and no longer just the design north star — it is the name on the client report, so it leaves the building.

It was chosen over the alternatives for two practical reasons rather than a poetic one: it was already consistent across the code, the database and every document, so it costs nothing to keep; and on a report handed to a client it reads as a considered name rather than a placeholder. `Misclosure`, the other real candidate, is the sharper word for what the product does but is hard for a Thai speaker to say and means nothing to a client.

No logo or mark beyond the name set in Bai Jamjuree caps in the report footer.

Binding constraints the user set: interface chrome in English; Thai content must render well, so the type stack must include a properly hinted Thai face; dates displayed in `Asia/Bangkok`.

## Evidence on Hand

- **Real:** the complete ClickUp workspace, captured 2026-09-07 to `data/clickup-raw/2026-09-07T04-31-17/` — 619 requests, zero failures, 301 task files with full custom-field values and subtask relationships. This is the only real data. A second capture is due before the trial lapses on 2026-09-09.
- **Only 52 of the 174 real tasks carry dates.** No larger set exists elsewhere in the workspace — that was checked and disproved. Estimate-versus-actual history therefore begins when the team starts using this product, not before.

**Not real, must not be fabricated as fact:** any performance benchmark, any customer or user count beyond the one owner, any pricing or licensing claim, any delivery date for the product itself.
- Demonstration data in specs and wireframes is derived from the real workspace and is labeled synthetic where a reader could mistake it for a record.

## Product Principles

1. **Plan and reality never overwrite each other.** Estimate versus actual, and parent baseline versus child roll-up, are the same principle applied at two scales. Any feature that collapses one into the other is wrong by definition.
2. **Variance is the default view, not a report.** If a user has to ask for the comparison, the product has failed at its one job.
3. **Recorded facts stay recorded.** Automatic dates are a convenience, never a rewrite: every derived or snapped value keeps its raw source alongside it.
4. **Morning triage sets the speed floor.** Twenty status changes must be faster than the tool being replaced. Expression that costs interaction speed loses.
5. **Cost the second level, not the first.** A bounded tree beats infinite nesting; two views beat five; three roles beat a permission matrix. Scope bought back here is what makes the two hard features — overlaid timelines and per-project custom fields — actually ship.

## Accessibility & Inclusion

- Thai and English must both render with correct line height and no clipped tone marks; Thai text is taller than Latin at the same size.
- The estimate/actual distinction must survive without color: the two bars differ in position, height, and fill treatment, not hue alone. The same applies to the baseline-exceeded flag.
- Grid work is keyboard work: cell navigation, edit, and commit must be reachable without a mouse.
- No established WCAG conformance target has been set by the user; contrast is held to a legibility bar rather than a certified one.
