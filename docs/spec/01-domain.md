# 01 — Domain

Vocabulary and business rules. Every term here has exactly one meaning across code, database, UI copy, and conversation. Where the surveying metaphor supplies a better word than the project-management default, the surveying word wins — it is more precise and it is the reason the design world was chosen.

---

## 1. Vocabulary

| Term | Meaning | Not to be confused with |
|---|---|---|
| **Node** | Any item in the tree, at any level. The unit stored in `pmt_nodes`. | "Task", which is one specific level |
| **Project** | Level 1. A client engagement. Owns field definitions and members. | Workspace |
| **Module** | Level 2. A deliverable area within a project (`Web Report`, `Web Admin`). | ClickUp's Module *custom field*, which this replaces |
| **Task** | Level 3. A unit of work with an owner. | Node |
| **Subtask** | Depth 4, 5 or 6. A step within a task, or within another subtask. Depth 6 is terminal. | Checklist item (does not exist) |
| **Estimate** | The planned date range. Human-entered at every level. | Baseline (a subset — see below) |
| **Actual** | The observed date range. System-captured, human-overridable. | Estimate |
| **Baseline** | A **parent's own** estimate range, standing as a commitment made before its children existed. | The children's roll-up |
| **Roll-up** | The computed extent of a node's descendants. Never stored. | Baseline |
| **Misclosure** | The signed difference between two ranges that ought to agree. Rendered in vermilion. | Delay (unsigned, and not a domain term here) |
| **Variance** | Synonym for misclosure used in UI copy where "misclosure" would confuse. Prefer misclosure in code. | — |
| **Out of closure** | State of a node whose misclosure exceeds tolerance. | Overdue |
| **Stage** | The lifecycle meaning of a select option: `notStarted` / `inProgress` / `done`. | Status (the user-facing option label) |
| **Status field** | The one select field per project designated to drive automatic actual dates. | Any other select field |
| **Working day** | A date that is neither Saturday, Sunday, nor in `pmt_holidays`. | Calendar day |
| **Snapping** | Moving an actual date landing on a non-working day forward to the next working day. | Rounding |
| **Raw actual** | The unsnapped, as-recorded date. Preserved permanently. | Actual |
| **Field definition** | A custom column, defined once per project. | Field value |
| **Run** | The visible sequence of rows on a page. UI term only. | — |

**Banned words in code and UI:** *deadline* (ambiguous between estimate_end and baseline), *due date* (same), *progress* (undefined until Q3 resolves), *sprint*, *epic*, *story* (no agile ceremony is modeled).

---

## 2. Tree rules

**D-1. Six levels, fixed.**
`project(1) → module(2) → task(3) → subtask(4…6)`. A node's `node_depth` must equal `parent.node_depth + 1`. A project has `node_parent_id = NULL` and `node_depth = 1`.

Depths 1–3 are named roles. **Every depth from 4 down is a subtask**, and subtasks nest — the name does not change with depth, only the indent does.

> Amended 2026-09-07. The original model fixed the tree at four levels with terminal subtasks. The ClickUp capture showed real parent chains five task levels deep (11 nodes at depth 5, 57 at depth 4). With the project itself as depth 1, that needs six. The complexity the four-level ceiling was meant to avoid already exists in the owner's work, so the ceiling moved rather than the data. See [`07-extraction-findings.md`](07-extraction-findings.md) §2.

**D-2. Depth 6 is terminal.**
Creating a child of a depth-6 node is rejected with `E_MAX_DEPTH`. This is application validation against the constant `MAX_DEPTH = 6`; the schema `CHECK` mirrors the same range. Raising it further requires a schema change, which is deliberate — an unbounded tree makes roll-up cost and UI indentation unbounded with it.

**D-3. A node may move anywhere in its project, subtree and all.**
Re-parenting sets the node's depth from its new parent, and every descendant shifts by the same amount. Moving a task between modules, promoting a subtask to a task, or demoting a module into one are all the same operation.

Two moves are refused, because they break the tree rather than reshape it:

- one that would put any descendant deeper than `MAX_DEPTH` (`E_MAX_DEPTH`);
- one into the node's own subtree, or under itself (`E_LEVEL_MISMATCH`). That would make a cycle: the node vanishes from every view, the recursive roll-up never terminates, and only a manual `UPDATE` recovers it.

Moving across projects is also refused — field definitions belong to a project (D-30), so the node's values would stop resolving.

> **Amended 2026-09-07.** The rule originally required the new parent to sit exactly one level above, which forbade any depth change and so made indent and outdent impossible: reorganising meant creating a node and moving children one at a time. Relaxed after the import showed real work five levels deep, much of it filed below where it belonged.
>
> **The cost, stated so nobody rediscovers it as a surprise: the names of depths 1–3 are positions, not kinds.** A *module* is whatever sits at depth 2. Promote a task and it becomes a module; demote a module and it becomes a task. Nothing about the row changes except where it sits — which is also why a module and a task share one table and one set of columns (see `02-data-model.md` §2.1).

**D-4. Deletion is soft and cascading.**
Deleting a node sets `node_archived_at` on it and every descendant. Archived nodes are excluded from lists, timelines, and all roll-up computation. Only an Admin may archive.

**D-5. Ordering.**
Siblings are ordered by `node_sort_order` (a float, so an insert between two siblings needs no rewrite), then by `node_created_at`. Phase one exposes no UI to change `node_sort_order`; it exists so the migration can preserve ClickUp's order.

---

## 3. Date rules

**D-10. Four independent fields.**
`node_estimate_start`, `node_estimate_end`, `node_actual_start`, `node_actual_end`. All nullable. No write to one pair may modify the other pair, at any level, by any code path. This is the product's defining rule.

**D-11. Range validity.**
Where both ends of a pair are present, `start <= end`. A violation is rejected with `E_RANGE_INVERTED`. A range of one day has `start == end`.

**D-12. Partial ranges are legal.**
A node may have `estimate_end` without `estimate_start` (a promised delivery date with no committed start). Such a node draws as a milestone tick rather than a bar.

**D-13. Automatic actual capture.**
On a write that changes a node's status-field value, let `stage` be the stage of the new option:

```
if stage == 'inProgress' and actual_start is null:
    actual_start := today();  actual_source_start := 'auto'

if stage == 'done':
    if actual_start is null:
        actual_start := today();  actual_source_start := 'auto'
    if actual_end is null:
        actual_end   := today();  actual_source_end   := 'auto'
```

Never overwrite a non-null value. Moving from `done` back to `inProgress` does **not** clear `actual_end` — the work did finish once, and that is a fact. Clearing requires an explicit manual edit.

**D-14. Manual override.**
Any hand edit of an actual date sets that field's `actual_source_*` to `'manual'`. Dragging the actual bar on the timeline counts as a hand edit. Once `manual`, automatic capture never touches that field again, even if it is later cleared to null.

**D-15. Snapping.**
Immediately before persisting either actual date:

```
raw   := the value as supplied
value := next_working_day_on_or_after(raw)
```

`actual_start_raw` / `actual_end_raw` store `raw` and are never subsequently modified. Snapping applies to both automatic and manual writes.

> Both endpoints snap **forward**. A task recorded as starting and ending on a Saturday therefore reads as a one-day task on the following Monday. The raw columns retain the truth.

**D-16. Snapping may invert a range.**
If forward-snapping produces `actual_start > actual_end`, set `actual_end := actual_start`. The node is a one-working-day node. No error is raised, because the raw values remain available.

**D-17. Estimates are not snapped.**
Estimate dates are entered deliberately and are stored exactly as given, even on a weekend. Duration arithmetic still counts working days only.

---

## 4. Roll-up and closure

**D-20. Roll-up is derived, never stored.**

```
rollup_estimate_start(n) = MIN(estimate_start) over non-archived descendants of n
rollup_estimate_end(n)   = MAX(estimate_end)   over non-archived descendants of n
rollup_actual_start(n)   = MIN(actual_start)   over non-archived descendants of n
rollup_actual_end(n)     = MAX(actual_end)     over non-archived descendants of n
```

Descendants means all levels below, not only direct children. Nulls are ignored. A node with no dated descendants has a null roll-up.

**D-21. A parent's own dates are its baseline.**
They are never recomputed from children. A parent with children may have any dates at all, including dates entirely outside its children's extent.

**D-22. Closure check.**
A node is **out of closure** when it has a roll-up and:

```
rollup_estimate_end > estimate_end   (schedule overrun against commitment)
OR
rollup_estimate_start < estimate_start   (work planned to begin before commitment)
```

The two conditions are reported separately: `overrun_days` and `early_start_days`, both in working days, both non-negative.

**D-23. Misclosure of a leaf.**
For any node with both an estimate and an actual:

```
start_misclosure = workdays_between(estimate_start, actual_start)   -- signed
end_misclosure   = workdays_between(estimate_end,   actual_end)     -- signed
```

Positive means late. Negative means early. `workdays_between(a, b)` counts working days from `a` to `b`, exclusive of `a`, inclusive of `b`, and is negative when `b < a`.

**D-24. Tolerance.**
A misclosure of `0` is closed. Anything non-zero is shown. There is no configurable tolerance band in phase one — vermilion appears for any non-zero end misclosure. If this proves noisy in practice, a per-project tolerance is the first thing to add.

**D-24b. Progress is counted, never claimed.**
For every node, the ledger reports `descendant_count` and `closed_count`: how many non-archived descendants exist, and how many sit on a status option whose stage is `done`. Both are 0 for a leaf, which is how a caller tells "no children" from "no children finished".

There is **no `%` progress field**. A number somebody types is a claim about reality that nothing checks — the field that reads 90% for three months. This project has its own evidence: `Completion Criteria` and `Next Steps` held zero values across 174 tasks. Counting from the status column the team already changes makes progress a by-product of work rather than a second thing to maintain.

It is reported as a count (`12 / 41`) rather than a percentage. A percentage reads more precise than it is, and cannot be checked against anything.

**D-25. Roll-up ignores level.**
The same computation applies to a project rolling up its modules and a task rolling up its subtasks. There is no special case.

---

## 5. Custom field rules

**D-30. Definitions are per project.**
A field belongs to exactly one project (`field_project_id`) and applies to every node in it, at every level. There is no per-level field set in phase one.

**D-31. Types are immutable.**
A field's `field_kind` cannot change after creation. Changing meaning means creating a new field and archiving the old one.

**D-32. Values live in `pmt_nodes.node_custom_values` (`jsonb`).**
Keyed by `pmt_field_definitions.field_id`. Storage shape per type:

| Type | JSON shape | Example |
|---|---|---|
| `text` | string | `"Handheld v2"` |
| `long_text` | string | `"มาดุลย์เข้า 7 ก.ย. 69"` |
| `number` | number | `12` |
| `money` | `{ "amount": number, "currency": string }` | `{"amount":2.5,"currency":"M฿"}` |
| `date` | ISO date string | `"2026-09-30"` |
| `select` | option id string | `"opt_onprocess"` |
| `multi_select` | array of option id strings | `["opt_phase1","opt_qr"]` |
| `checkbox` | boolean | `true` |
| `people` | array of user id strings | `["usr_ouan"]` |

An absent key and a `null` value both mean empty and must render identically.

**D-33. Options are archived, never deleted.**
An archived option still resolves for display wherever it is already stored, marked as archived, and is absent from pickers.

**D-34. Archived definitions retain their values.**
Archiving a field (`field_archived_at`) hides its column. The `jsonb` keys remain. Un-archiving restores the column with its data intact.

**D-34b. A NULL stage has no effect.**
An option whose `option_stage` is NULL never triggers automatic date capture. This is the correct setting for terminal-but-unfinished states such as *cancelled*: the work stopped, but it did not finish, and recording an end date for it would corrupt every estimate-accuracy figure computed from that node.

**D-35. One status field per project.**
`pmt_projects.project_status_field_id` points at a `select` field in the same project. Only that field's option stages drive D-13. A project may have other select fields; their stages are ignored. Clearing `project_status_field_id` disables automatic actual capture for the project.

**D-36. Money has one unit per field, and `currency` is a display unit rather than an ISO code.**
Set at definition time, default `THB`. A field may record millions of baht (`M฿`), thousands of dollars, or anything else its numbers are actually in.

**The amount is always the number a person would type into the cell.** Storing 2,500,000 and rendering "2.5 M฿" was considered and rejected: somebody entering `3` while meaning three million would silently store three baht, and the mistake would look exactly like a correct entry.

Values do not carry a per-row unit in phase one, though the stored shape allows it. Two consequences to keep in mind: amounts from fields with different units must never be summed together, and changing a field's unit relabels its existing values without converting them — which is right, because the numbers were always in that unit and only their description was wrong.

---

## 6. Working-day calendar

**D-40. Non-working days.**
Saturday, Sunday, and every date present in `pmt_holidays` for the workspace.

**D-41. Holidays are data, not code.**
Seeded with Thai public holidays and editable by an Admin. Thai holidays are announced and amended during the year, so a code-embedded list would be wrong by design.

**D-42. Calendar changes are not retroactive.**
Adding a holiday does not re-snap actual dates already stored. Snapping happens once, at write time. Roll-up and misclosure figures, being computed on read, *do* change — which is correct, because they are arithmetic over the current calendar.

**D-43. Duration.**

```
duration_workdays(start, end) = count of working days in [start, end] inclusive
```

A single working day has duration 1. A range containing no working days has duration 0.

---

## 7. Error codes

| Code | Raised when |
|---|---|
| `E_MAX_DEPTH` | Creating a child of a depth-6 node, or a move that would push a descendant past depth 6 |
| `E_LEVEL_MISMATCH` | Re-parenting to a node that is not `node_depth - 1`, into the node's own subtree, across projects, or archiving the project root |
| `E_RANGE_INVERTED` | `start > end` on an estimate pair, or a manual actual pair pre-snap |
| `E_FIELD_TYPE_IMMUTABLE` | Attempting to change a field definition's `field_kind` |
| `E_OPTION_ARCHIVED` | Selecting an archived option |
| `E_UNKNOWN_FIELD` | Writing a `node_custom_values` key with no matching definition in the project |
| `E_STATUS_FIELD_TYPE` | Pointing `project_status_field_id` at a non-select field |
| `E_FORBIDDEN` | Role does not permit the action (see `05-permissions.md`) |
