# 04 — Timeline view

The surface that makes this product different. Every competitor draws one bar per task; this one draws two, permanently separate, in the same row.

Visual rules come from [`../../DESIGN.md`](../../DESIGN.md). Domain rules referenced as `D-nn` come from [`01-domain.md`](01-domain.md).

---

## 1. Anatomy

```
┌──┬──────────────────────────────────────────────────────────────────────┐
│  │  BANNAYUU NEXT              LIST · TIMELINE     [EST|ACT|BOTH] D W M │
│T ├────────────────┬─────────────────────────────────────────────────────┤
│A │                │ SEP 2026                    ┊today      OCT 2026    │
│B │  NAME          │  1  2  3  4  5░░6░░7  8  9 10┊11 12 13░░14░░15 16   │
│  │════════════════╪═════════════════════════════════════════════════════│
│R │ ▾ Web Report   │      ⌐‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑¬  ┊                      │ baseline bracket
│A │                │      └───────────────────────┊──────┘   +4d         │ rollup, overhang red
│I │   ▸ Build API  │   ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒           ┊                      │ estimate (hatched)
│L │                │   ████████████████████      ┊         +2d          │ actual (solid)
│  │   ▸ Report UI  │              ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒┊▒▒▒                    │
│  │                │                  ███████████┊                       │
└──┴────────────────┴─────────────────────────────────────────────────────┘
     fore-edge         name column          the field (scrolls x)
```

**Left of the field** the name column repeats the List's name column at the same 320px width, with the same indentation, brackets, punched-hole selection, and expansion triangles. Switching views changes the instrument, not the subject.

**The field** is the ruled date area. It scrolls horizontally; the name column and date scale stay pinned.

---

## 2. The two bars

This is the core rendering rule. Both bars occupy one 34px row, sharing a 2px gap.

| | Estimate bar | Actual bar |
|---|---|---|
| Position in row | upper | lower |
| Height | 9px | 13px |
| Fill | hatch over the module hue at 22% into the page | the module hue at 62% into `ink-blue` |
| Outline | hue 50% into `ink-graphite-soft` | hue 40% into `ink-blue-soft` |
| Ends | square | square |
| Reads as | pencil — a plan, provisional | ink — a record, committed |
| Leading 3px | module tab hue, full strength | module tab hue, full strength |

**Both bars are keyed to their module's colour**, so a run of work reads as one thread down a field of two hundred rows. The hue says *whose* the work is. It never says how the work is going — that is the misclosure's job, and vermilion stays the only colour in the view that carries a verdict.

The hue is **mixed, never raw**. `tab-1` is a brick red that sits 54 units from vermilion in sRGB; drawn as a filled 13px bar it would be read as an overrun at a glance. Mixed toward the ink it sits at 70. Acceptance test A8 recomputes this from the tokens and the stylesheet and fails if the mix is ever removed or lowered.

**The distinction survives without color.** Different vertical position, different height, different fill treatment. A greyscale print, a colour-blind viewer, and a low-contrast screen all still read plan-versus-record. Module hue is a third axis laid over that distinction, **not** a replacement for it — if the two bars ever come to differ only by hue, the view has broken its one hard requirement.

**Milestones.** A node with `node_estimate_end` but no `node_estimate_start` (D-12) draws as a 9px hollow diamond at its end date rather than a bar. Same rule for actuals.

**Missing halves.** A node with an estimate and no actual draws only the hatched bar; nothing occupies the lower half, and the empty lower band is the signal that work has not been recorded. A node with an actual and no estimate draws only the solid bar, and its misclosure cell reads `—` rather than a figure.

---

## 3. Mode toggle

`EST · ACT · BOTH`, default `BOTH`, in label caps at the page head. It is a display filter only; it never writes.

| Mode | Shows | Row height |
|---|---|---|
| `BOTH` | both bars stacked | 34px |
| `EST` | estimate bar only, centred in the row | 28px |
| `ACT` | actual bar only, centred in the row | 28px |

Switching mode is a two-frame 90ms step, like everything else. The mode persists per user per project in local storage.

---

## 4. Baseline and roll-up on a parent

A parent row (project or module) carries no bars of its own in the usual sense. It carries two brackets:

- **Baseline bracket** — the parent's own hand-entered estimate range (D-21), drawn as two 6px vertical ticks joined by a hairline, in graphite, on the row's upper band.
- **Roll-up bracket** — the computed extent of its descendants (D-20), drawn lighter, on the lower band.

Where the roll-up bracket extends beyond the baseline bracket, **that overhang segment alone is drawn in vermilion**, with the `overrun_days` figure in Martian Mono at its end. Not the whole bracket. Not the row. The overhang is the misclosure, and only the misclosure is red.

A parent with no dated descendants shows only its baseline bracket. A parent with no baseline of its own shows only the roll-up bracket, in graphite, with no closure check possible.

---

## 5. The date scale

**Zoom levels.**

| Level | Column width | Header | Scale rows |
|---|---|---|---|
| Day | 26px | month name, then day number | 2 |
| Week | 34px | month name, then ISO week start date | 2 |
| Month | 72px | year, then month abbreviation | 2 |

Zoom is `D · W · M` in label caps beside the mode toggle, plus `Cmd/Ctrl + scroll` over the field. Zoom anchors on the pointer position, or on the selected node when driven from the keyboard.

**Non-working days** (D-40) are drawn as `page-edge` vertical bands running the full height of the run, behind every bar. Bars **cross them visibly and unbroken** — the product stores calendar dates and treats working days as a lens for arithmetic (D-15, D-43), so a bar that broke into segments would misrepresent the stored data. At week and month zoom the bands are omitted, since they are no longer resolvable.

**Today** is a 1px `datum` vertical rule spanning the full run height, with the date in label caps at its head. It is the only green in the view.

**The window** always spans **a year either side of today**, widened further if the project itself reaches past that. A fixed year of runway means a date can always be dragged forward without the field ending, and a year of history keeps finished work visible instead of falling off the left edge.

The cost is a wide field: 745 days is about 19,000px at day zoom, 3,000px at month zoom.

**Initial scroll.** On open, the field scrolls so that today sits at 40% from the left. Without it the view would open a year in the past on empty ruling. It runs when the window or the zoom changes and **not on every render** — re-centring while somebody is scrolling would take the view away from them.

---

## 5b. Sorting

**Every sort except `tree` flattens the project into one run.**

> **Amended 2026-09-07, after use.** The first version reordered siblings within their parent so the hierarchy survived, on the argument that a module bracket only means something beside its own children. That was wrong in practice: a task due in January still sat below every task of the module filed above it, so a page "sorted by date" was not in date order — which is the only reason to ask for it. The hierarchy now lives in `tree`, and every other sort is a flat chronological run.

| Sort | Ranks by |
|---|---|
| **Est date** *(default)* | the estimate start, or the estimate end when there is no start |
| Order | the order the work is filed in (`node_sort_order`) |
| Starts | estimate start only; an end-only task has no rank |
| Due | estimate end |
| Finished | actual end |
| Late by | end misclosure in working days |
| Name | alphabetical, case-insensitive |

**Est date is the default** because a timeline is read left to right. A task may carry an end with no start (D-12) and draws as a milestone; ranking by start alone would drop every milestone to the bottom beside the genuinely undated ones, so the end stands in for a missing start.

**What flattening costs, and what pays it back.** The indent and the expansion triangles go, because there is no hierarchy left to indent; collapse has nothing to collapse and is ignored. In exchange each row carries **the name of the module it belongs to** on the right of the name column — without it a task name would stand alone with no indication of what it is part of. Module rows stay in the run and sort by their own dates, which in practice sends them to the bottom, since no imported module carries a baseline (§07 §6b).

The project row is never drawn in either mode. It is the page, not a row.

Two rules apply to every sort:

- **A row with nothing to rank on goes last whichever way the direction is set.** Reversing it would put every undated task at the top of a list ordered by date, and *no date* is not *earliest*. Note that `0` is a measurement — a task that finished exactly on time ranks, it is not missing.
- **Ties fall back to the filed order**, so the list is stable and rows do not swap places between renders.

Both the comparator and the ordering live in `sort.ts` as pure functions (`makeComparator`, `orderRows`), covered by `tests/timeline-sort.test.ts` — including a test named for the bug above, so the flattening cannot quietly revert.

Sort, direction, mode and zoom persist per project in local storage.

## 6. Dragging

**Both bars are draggable.** This was decided explicitly after the alternative — actual bars read-only — was proposed and rejected.

| Gesture | Effect |
|---|---|
| Drag bar body | Moves both endpoints, preserving duration in calendar days |
| Drag left edge | Moves the start only |
| Drag right edge | Moves the end only |
| Drag with `Shift` | Snaps to week boundaries at week zoom, month at month zoom |

**Tracking.** The bar follows the pointer at 1:1 with no smoothing and no easing — the one place in the system where continuous motion exists. On release it steps to its snapped day in a single two-frame 90ms transition.

**While dragging:**
- A graphite ghost outline stays at the original position until release, so the size of the change is visible.
- The bar's start and end dates render in Martian Mono above it.
- If the drag would put the node out of closure against its parent's baseline, the parent's overhang segment appears live in vermilion as you drag.

**On release:**
- Dragging an **estimate** bar writes `node_estimate_start` / `node_estimate_end` exactly as dropped. Estimates are never snapped to working days (D-17).
- Dragging an **actual** bar writes the raw value, then forward-snaps to a working day (D-15), and sets `node_actual_source_*` to `manual` (D-14). **The bar may therefore land a day or two right of where it was dropped** — the snap is visible as a second step, and the raw date appears in the detail panel.

> This is the friction point of the design. The user drops a bar on a Saturday and it moves itself to Monday. Making the snap a separate, visible step rather than an invisible correction is what keeps that honest rather than buggy-feeling. If it proves irritating in phase B, the remedy is to show non-working days as undroppable, not to remove the snap.

**Permissions.** Viewers cannot drag; bars take no drag affordance for them.

**Keyboard equivalent.** With a row focused: `[` / `]` move the estimate start / end by one day; `Shift` with either moves by a week. `Alt` with either operates on the actual bar. Every drag is reachable without a pointer.

---

## 7. Row layout and grouping

**One node, one row.** Unlike ClickUp's Timeline, which packs unrelated bars onto shared rows to save vertical space, this view keeps a strict one-to-one correspondence between the name column and the field. Two stacked bars per row make packing unreadable, and the name column has to line up for the carried-object staging to hold.

Rows follow the List view's grouping and expansion state exactly. Collapsing a module in List collapses it here. A collapsed parent shows its brackets; its children's bars are hidden.

---

## 8. States

| State | Rendering |
|---|---|
| **No dates in project** | The ruled field with its date scale drawn and no bars, and one line of instruction in graphite-soft. The scale is never hidden. |
| **Node with no dates** | Its row is present and empty. It is not filtered out — an undated task is information. |
| **Loading** | Scale and name column render immediately; bars arrive as a block. No shimmer. |
| **Drag in flight** | Ghost outline at origin, live dates above the bar, live parent overhang. |
| **Write failed** | The bar returns to its original position in one step and an errata slip appears in the row's left margin with the error code. |
| **Out of closure** | Only the overhang segment and its figure are vermilion. |
| **Read-only** | No drag affordance, no edge handles. |

---

## 9. Performance contract

- The field is a single SVG layer per visible range, not one DOM node per bar.
- Horizontal scroll never refetches. The full project ledger is already in memory (under 1,000 nodes).
- Dragging updates transform only; no layout, no re-render of unaffected rows.
- Zoom recomputes the scale and bar geometry from the same in-memory ledger.

---

## 10. Responsive

| Width | Behaviour |
|---|---|
| ≥ 900px | Full layout |
| 700–900px | Name column narrows to 200px; fore-edge rail collapses to a hue strip |
| < 700px | The Timeline **does not reflow to vertical**. It scrolls horizontally with the name column narrowed to 120px, showing name only. Dragging is disabled below 700px — precision is not achievable and an accidental write is worse than a missing feature. |

---

## 11. Explicitly not built

| Absent | Reason |
|---|---|
| Dependency arrows and auto-scheduling | Out of scope. Would need a graph, cycle detection, cascade rules, and an unanswerable interaction with baseline flags. Unused in the current ClickUp workspace. |
| Critical path | Requires dependencies. |
| Resource / capacity lanes | No effort hours are stored. |
| Packed multi-bar rows | Incompatible with two bars per node. |
| Baseline history (more than one saved plan) | One baseline per node. Multiple baselines are a real future feature and would be a new table, touching nothing in this view's geometry. |
