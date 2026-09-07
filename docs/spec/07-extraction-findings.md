# 07 — What the real data actually contains

Findings from the capture at `data/clickup-raw/2026-09-07T04-31-17`. Several of these contradict assumptions written into the earlier specs. Where they do, the data wins and the spec is wrong until amended.

---

## 1. The capture is complete

| Check | Result |
|---|---|
| Requests | 619, **zero non-200** |
| Spaces / Lists / Tasks | 1 / 3 / **301** |
| Individual task files | 301 |
| Custom field definitions | 9, all present with values |
| Tasks with `start_date` **and** `due_date` | 177 |
| Inverted ranges (`due < start`) | 0 |

Three lists, all folderless:

| List id | Name | Tasks |
|---|---|---|
| `901616609521` | Bannayuu Next | 174 |
| `901616678566` | Bannayuu Task | 126 |
| `901616664872` | Bannayuu Module | 1 |

The workspace visible during the requirements interview showed roughly a dozen tasks. The real total is **301** — an order of magnitude more, because the ClickUp view was filtered.

---

## 2. ⚠ The tree is five levels deep, not four

Parent-chain depth across the 301 captured tasks:

| Depth | Tasks |
|---|---|
| 1 | 21 |
| 2 | 142 |
| 3 | 70 |
| 4 | 57 |
| **5** | **11** |

280 of 301 tasks have a parent. **This is task nesting alone** — before the module level that spec 06 §3.1 synthesises from the Module custom field. Adding that gives **six** levels of real structure.

The agreed model is fixed at four: `project → module → task → subtask`, with subtasks terminal (D-1, D-2). **Eleven tasks cannot be represented, and 57 more only fit if the module level is dropped.**

**Resolved 2026-09-07: the ceiling was raised to six.** D-1 and D-2 are amended, `MAX_DEPTH = 6`, and depths 4–6 are all called subtask. The alternative — collapsing depths 5 and 6 into their parents — was rejected because it would distort the owner's own structure on day one.

The schema already permits it: `pmt_nodes.node_depth CHECK (1..6)`. Only the application constant enforces four.

---

## 3. ⚠ ClickUp's built-in Status is not a lifecycle

Distribution of the built-in status across 301 tasks:

```
to do 126 · pokpong 47 · bannayuu_next 28 · web_property 24 · web_admin 21
tester 20 · bnext_guard 19 · web_report 5 · web_alert 4 · web_portal 3
closeed 2 · complete 1 · web_financial 1
```

Ten of the thirteen values are **module or team names**, not lifecycle states. Only `to do`, `complete` and `closeed` (a typo in the source) describe progress, and just three tasks sit in the two terminal ones.

Spec 06 §3.2 says the built-in Status becomes the project's status field. **That is wrong.** Driving automatic actual dates from it (D-13) would capture nothing, because almost nothing ever reaches a `done` stage.

**Resolved 2026-09-07.** `Task Status` is the status field. Its options and usage:

| idx | Label | Used | Stage |
|---|---|---|---|
| 0 | `BACKLOG` | 48 | `notStarted` |
| 1 | `ONPROCESS` | 29 | `inProgress` |
| 2 | `WAIT_TEST` | 51 | **`done`** |
| 3 | `COMPLETED` | 0 | `done` |
| 4 | `CANCLE` | 0 | none (NULL) |

`WAIT_TEST` carries `done` because `COMPLETED` has never once been used. See spec 06 §3.2b for the full reasoning and its consequence for what `node_actual_end` means.

---

## 4. ⚠ There is almost no actual-date history

| Field | Tasks carrying it |
|---|---|
| `start_date` | 177 |
| `due_date` | 178 |
| `date_done` | **3** |
| `date_closed` | **3** |

`node_actual_end` can be populated for **three tasks**. `node_actual_start` has no source at all (spec 06 §3.3).

So the imported dataset is effectively **estimates only**. The estimate-versus-actual comparison — the entire point of the product — starts accumulating data from the day the new system goes live, and has essentially no history behind it.

This is not a reason to fabricate actuals. It is a reason to say plainly that the first useful variance figures arrive weeks after launch.

---

## 5. Field sets differ between lists

| Field | Type | Definitions seen | With a value |
|---|---|---|---|
| 🫀 Module | `drop_down` | 175 | 102 |
| Budget Allocation | `currency` | 174 | **12** |
| Client Feedback | `text` | 174 | **16** |
| Completion Criteria | `text` | 174 | **0** |
| Next Steps | `text` | 174 | **0** |
| Task Category | `drop_down` | 174 | 165 |
| Task Status | `drop_down` | 174 | 128 |
| Activity Category | `drop_down` | **126** | 123 |
| ⏳ Plan Progress | `automatic_progress` | **126** | 126 |

The first seven belong to `Bannayuu Next`; the last two only to `Bannayuu Task`. If all three lists become one project, spec's "fields are defined per project and inherited by every list" (D-30) means `Activity Category` and `Plan Progress` would appear on every node in the project, most of which have no use for them.

Two consequences worth noting:

- **`Completion Criteria` and `Next Steps` hold zero values across 174 tasks.** Manual fields that nobody is required to fill stay empty. This is the evidence behind choosing automatic actual capture (D-13) over hand entry. **Decided 2026-09-07: neither field is imported** (spec 06 §3.2).
- **`⏳ Plan Progress` is `automatic_progress`**, a ClickUp-computed type with no equivalent in our nine field kinds. Open question Q3 asked whether a `%` progress field is needed; the answer from the data is that one is in active use on 126 tasks.

---

## 6. Amendments required

| Spec | Says | Should say |
|---|---|---|
| 06 §3.1 | modules synthesised from the Module field | **amended** — the 17 root tasks of `Bannayuu Next` already are the modules; only that list is imported |
| 06 §3.2 | built-in Status becomes the status field | **amended** — it is a module tag; `Task Status` is the status field, stages assigned in §3.2b |
| 06 §3.3 | `date_done` → `actual_end` | correct, but applies to 3 tasks |
| 01 D-1 | four levels, fixed | **amended** — six levels, subtasks nest |
| 01 D-30 | fields per project, inherited by all lists | **no conflict** — only `Bannayuu Next` is imported, so its seven fields are the project's field set |
| PRD §9 Q3 | is a `%` progress field needed? | in use on 126 tasks |

None of these are amended yet. They are decisions for the owner.

---

## 6b. Nine of the seventeen "modules" are loose tasks

Confirmed after the import, from the loaded data:

| Depth-2 nodes | Count | Dates |
|---|---|---|
| Real modules, with children | 8 | **none carries a baseline** |
| Loose ClickUp root tasks, no children | 9 | 3 carry estimate dates |

`Present Demo POKPONG…`, `Web Financial เริ่มทำ [PH2]`, `setup proxy`, `ci/cd` and five others were top-level tasks in ClickUp, so the import placed them at module depth. They will appear in the fore-edge tab rail alongside the real modules.

This is faithful to the source and not worth fixing automatically — a rule that guessed which roots are "really" modules would be wrong sooner or later. Moving them under a real module is a normal move operation, at the owner's discretion.

## 7. Still to do before the trial lapses (2026-09-09)

- [ ] Take a second capture on the last day, so edits made in the interim are not lost
- [x] Inspect `Task Status` options and assign a `stage` to each
- [x] Decide the list→project mapping against this data — one project from `Bannayuu Next`
- [x] Depth ceiling raised to six
