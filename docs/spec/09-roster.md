# 09 — Roster timeline

The shelf's own view. One lane per person, every project they are in, on one date scale.

Visual rules come from [`../../DESIGN.md`](../../DESIGN.md). Domain rules referenced as `D-nn` come from [`01-domain.md`](01-domain.md). The project Timeline it is a sibling to is [`04-timeline.md`](04-timeline.md).

---

## 1. Why it is not part of the project Timeline

The project Timeline answers *did this plan hold?* — one row per node, inside one project, where a node's dates only mean something beside its siblings'.

This view answers a question that one **cannot ask at all**: *who is holding what, and when do their runs collide?* A person's schedule collides mostly with their own work in a **different** project, so the answer does not exist inside any single project's ledger. That is the whole justification for the one read in the product that crosses a project boundary.

It is therefore filed at `/timeline`, beside `/` and `/people`, not under `/p/<slug>/`.

---

## 2. Anatomy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ‹ Field Book   Roster                        PROJECTS · ROSTER · PEOPLE      │
├──────────────────────────────────────────────────────────────────────────────┤
│ [TODAY] [EST|ACT|BOTH] [D|W|M]  ●Bannayuu ●Dev.JO ○RSU ●VMS      72 dated     │
├────────────────────┬─────────────────────────────────────────────────────────┤
│  PARTY             │ SEP 2026                  ┊today       OCT 2026          │
│════════════════════╪═════════════════════════════════════════════════════════│
│ Somchai            │   ▒▒▒▒▒▒▒▒▒    ▒▒▒▒▒▒▒    ┊  ▒▒▒▒▒▒▒▒▒▒▒▒               │
│ 8 +3 undated       │       ████     ▒▒▒▒▒▒▒▒▒▒▒┊▒▒                            │
│                    │                ▒▒▒▒▒▒▒    ┊                              │
│                    │             ▬▬▬▬▬▬▬▬▬▬▬▬▬▬┊  ← contended, graphite       │
├────────────────────┼─────────────────────────────────────────────────────────┤
│ Nid                │   3 assigned, none dated  ┊                              │
├────────────────────┼─────────────────────────────────────────────────────────┤
│ Unassigned    +50…│   ▒▒▒▒  ▒▒▒▒▒▒▒  ▒▒  ▒▒▒▒▒▒┊▒▒▒▒▒                          │
└────────────────────┴─────────────────────────────────────────────────────────┘
   the party column               the field (scrolls x)
```

**The party column** is 260px, sticky-left, one block per person: their name, then a tally line reading `8 +3 undated`. Clicking it is the filter (§5).

**The field** is the same ruled date area the project Timeline uses, with the same non-working-day bands, the same `datum` rule at today, and the same month/day scale — including the month rules run down the field (`04-timeline.md` §5), which matter more here than there: this page opens at week zoom, where the day numbers are gone and the month rule is the only scale left. Zoom opens at **week**, not day: the scene here is several weeks of allocation, not several days of triage.

**The bars hold more of their project's hue than the project Timeline's hold of their module's** — 36% against 26% on the plan bar. Both fields mix against the same white ground since 2026-09-08, so the whole of the difference is what the hue is doing: a secondary read inside one project, the primary read across five. The chips in the toolbar promise that colour, and a bar that does not match its own chip is worse than no colour at all.

---

## 3. The lane, and the one claim this view makes

A lane packs its items into sub-rows: an item joins the first sub-row whose occupied extent ends before it begins, taking items earliest-first. The number of sub-rows produced therefore equals the **maximum number of items overlapping on any single day**.

> **A lane's height is how much work overlaps in it.** Load is read from the shape of the page before any figure is read.

That claim is the reason `pack.ts` is a separate pure module and `tests/roster-pack.test.ts` exists. A packer that is subtly wrong does not render as an error — it renders as a person who looks less busy than they are, and nothing downstream catches it.

**What an item reserves** is the **union of its estimate and its actual** (`span`). A task planned for a week that ran three held its owner for three; reserving only the estimate would report them free for the fortnight they were not. This is not a breach of the plan/record separation — plan and record are still two columns, two bars, never written from each other (D-10). Occupancy is a third thing computed *from* both, on read, and stored nowhere.

**Depth cap.** Four sub-rows, then the lane truncates and the party column shows `+n more`. Past four the lane stops being a readable shape and becomes a wall. The remainder is reached by soloing, never lost.

**Contention.** Days where a person holds `3` or more items at once are marked by a 3px graphite rule along the foot of the lane. **This is deliberately not vermilion.** Three overlapping tasks is a fact about a schedule, not a measurement that failed its check; vermilion belongs to misclosure and nothing else (`DESIGN.md` § Colors rule 1), and spending it here would make the page cry wolf on the one hue the product cannot afford to spend.

---

## 4. Bars

Identical grammar to the project Timeline — **estimate above in hatched pencil, actual below in solid ink** — at compressed heights, because a packed sub-row is 20px rather than 34px.

| | Packed lane | Soloed lane |
|---|---|---|
| Sub-row height | 20px | 26px |
| Estimate bar | 6px, hatched | 9px, hatched |
| Actual bar | 8px, solid | 13px, solid |

**The two never merge to save room.** When a lane is tight the bars get shorter; they do not become one bar. Position, height and fill treatment carry the plan/record distinction without colour, exactly as in `04-timeline.md` §2, and that is what has to survive compression.

**Misclosure** shows as a 3px vermilion inset on the trailing edge of an actual bar that ran past its estimate, and — when soloed — as a `+Nd` slip beside the name. Milestones (an end with no start, D-12) draw as diamonds, hollow for a plan and filled for a record.

---

## 5. Filtering by assignee — the roster *is* the filter

There is no assignee dropdown. The party column is both the label and the control.

| Action | Result |
|---|---|
| Click a name | Solo that lane |
| Shift-click | Add a second person to the solo |
| Click a soloed name | Remove it |
| `Esc`, or `Whole party ⎋` | Back to everyone |

A reader filters from the thing they are already looking at. A separate control listing the same names again would be a second index of the same set.

**Soloing unpacks the lane.** One item per row, earliest first, with the task name and its `project · module` written beside the bar. Packing exists to make height mean occupancy; soloing asks the opposite question — *what exactly is in here* — and there the packing is in the way, because two bars sharing a sub-row leave nowhere to write the second one's name.

**The Unassigned lane is soloable like anyone's.** It routinely holds more than every person's lane combined (§8), and it is the only route to its own `+n more`.

**Project chips** in the toolbar are the second filter and double as the hue key. An excluded project keeps its name and loses its fill, so the row stays a legible key whether or not it is filtering. Filtering happens **before** packing: a hidden project must not reserve a sub-row it no longer draws into.

State — mode, zoom, hidden projects — persists in local storage under `fieldbook:_shelf:roster`. The solo selection does not: it is a question being asked right now, not a preference.

---

## 6. This view does not write

No drag, no resize, no keyboard date nudge — the project Timeline's whole editing surface is absent, and `tests/e2e/roster.test.ts` asserts that no drag handle is ever rendered.

Moving a date here would rewrite a plan without its module, its siblings or its parent's baseline anywhere on screen. That context is exactly what `/p/<slug>/timeline` exists to supply. Clicking a bar goes there, carrying the node in the URL (`/p/<slug>?node=<id>`), which is the same carried-object staging the List and Timeline already share.

---

## 7. Assignment, and why it is read the way it is

**A node is on a person's lane when their user id appears in the value of *any* `people`-kind field in that node's project.**

There is no built-in assignee column and there must not be one. Custom fields are defined per project (`02-data-model.md`), so no single field id exists across the shelf; a project may name its people field `ผู้รับผิดชอบ`, `Owner`, or nothing at all, and may have several. Hardcoding a field name, or taking only the first people field, would silently empty the roster of every project that named its field differently — which is why `tests/e2e/roster.test.ts` assigns its two nodes through two differently-named people fields.

Consequences:

- A node with two people on it appears on **both** lanes. It is one node drawn twice, not two nodes; the lane tally counts appearances, which is the correct figure for "how much is this person holding".
- A project with **no** people field at all contributes everything to Unassigned. Its chip says so on hover.
- Depth-1 nodes — the project root — are never items. The project is not work inside itself.
- An id in a people field with no matching user reads as `Unknown person` rather than being dropped. Imported data contains such ids, and losing the work they hold would be worse than naming the gap.

---

## 8. Hue at the shelf

`DESIGN.md` § Colors rule 3 lets `tab-1…6` to **modules**. At the shelf they are re-let to the **project**.

Two projects' modules would otherwise collide on the same six hues with nothing to separate them, and across a project boundary *which project* is the identity a reader needs first. Inside a project the original meaning is untouched. The rule that survives both readings — and the one that actually binds — is that **hue says whose work it is, never how it is going**.

Confirmed with the user on 2026-09-08, as the decision the brief flagged as the one a builder must not invent.

---

## 9. States, and the shape of the real data

`52` of the `174` imported tasks carry dates, and **none carry an assignee** — ClickUp's export had no people field in use. On day one this page is therefore almost entirely one lane. That is a finding about the data, recorded in `07-extraction-findings.md`, and the design states it rather than hiding it.

| State | Rendering |
|---|---|
| Person with assigned but undated work | Lane draws empty with `3 assigned, none dated` pinned to the left edge of the field |
| Person with nothing at all | **No lane.** A lane exists because somebody is named on a node, not because they are a member (changed 2026-09-08; previously the lane was kept to answer "who is free?"). Idleness is now read from the access board, not from this page |
| Nobody has dated work anywhere | The scale still draws. One line: *Nobody has dated work yet…* |
| Lane deeper than four sub-rows | Truncated, `+n more` in the party column, full depth on solo |
| Reader is in no project | The page renders empty. An empty roster is a state, not an error |

Lanes are ordered **busiest first**, then alphabetically, with **Unassigned pinned last** regardless of size — work nobody holds is a finding to read after the roster, not a competitor for the top of it.

Every lane clears 42px however little it holds, so its two-line name block is never clipped.

---

## 10. Responsive

The party column narrows to 172px below 900px and the project chips are dropped, since a wrapping key costs more rows than it explains. Below 700px the page does not reflow the field to vertical — it scrolls, with the scale pinned, exactly as `04-timeline.md` §10 requires.

---

## 11. What this view is not

- Not a capacity planner. There are no hours and no effort field anywhere in the product; lane depth counts items, and calling it a workload percentage would be inventing a measure nothing checks.
- Not a report. Variance belongs to the project Timeline and the printed report, where a node has its siblings and its baseline beside it.
- Not a place work is created, moved, or re-assigned.

---

## 12. Where it lives

| File | What it holds |
|---|---|
| `src/app/timeline/page.tsx` | The route; membership check via `loadRoster` |
| `src/lib/roster.ts` | The cross-project read, assignment rule, lane ordering |
| `src/app/timeline/pack.ts` | Packing, span, occupancy — pure, no React, no database |
| `src/app/timeline/roster-view.tsx` | The view |
| `src/app/timeline/roster.css` | Lane styles; chrome from `list.css`, field from `timeline.css` |
| `tests/roster-pack.test.ts` | 23 tests defending §3 |
| `tests/e2e/roster.test.ts` | 12 tests defending §5–§7, including the membership boundary |
