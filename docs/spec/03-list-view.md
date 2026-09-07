# 03 — List view

The primary surface. It must survive morning triage: twenty status changes, fast, keyboard-reachable, no reloads.

Visual rules come from [`../../DESIGN.md`](../../DESIGN.md). This document covers structure, interaction, and states.

---

## 1. Anatomy

```
┌──┬──────────────────────────────────────────────────────────────────────┐
│  │  BANNAYUU NEXT                          LIST · TIMELINE      ⌗ ⚙︎    │  page head
│T ├──────────────────────────────────────────────────────────────────────┤
│A │  NAME              STATUS    EST START  EST END  ACT START  ACT END  │  column head
│B │══════════════════════════════════════════════════════════════════════│  double rule
│  │  ▾ Web Report                                                        │  group head
│R │  ○  ▸ Web Report      RUNNING   01 Sep    30 Sep    03 Sep    —   +2d│  row (level 3)
│A │  ○     Build API      CLOSED    01 Sep    10 Sep    01 Sep  14 Sep +2d│  row (level 4)
│I │  ○     Report UI      RUNNING   11 Sep    22 Sep    15 Sep    —      │
│L │     + Add task                                                       │
│  │                                                                      │
└──┴──────────────────────────────────────────────────────────────────────┘
```

**Fore-edge rail (left, 30px).** One stepped tab per module, height proportional to its node count, hue from the tab wheel. The current module's tab is page-coloured and extends 4px — it is continuous with the page. Clicking a tab scrolls its group into view; it does not filter.

**Page head.** Project name in `headline`. View switch (`LIST · TIMELINE`) as label caps, current one in graphite, other in graphite-soft. Switching preserves selection, expansion, and scroll anchor.

**Column head.** 26px, label caps, closed by the signature double rule. Sticky to the top of the run.

**The run.** 34px rows, continuous 1px rules, no zebra striping, no card. Name column sticky-left at 320px; everything right of it scrolls horizontally beneath it.

**Module colour reaches into the run.** A module row carries a 3px chip of its hue before its name; every row beneath it carries the same hue as a 2px hairline in the gutter its indent already reserves. The hue is assigned by the module's filed position and is **the same number the Timeline uses**, so a module keeps its colour across both views — otherwise it is decoration rather than an index.

**A chosen option draws as a chip**, not as plain text with a swatch beside it: the option's hue mixed 17% into the page, a 2px bar of the full hue on the leading edge, square corners, and a label darkened toward graphite until it clears 4.5:1 on its own ground. Every option in the imported workspace was measured; the worst is 5.25:1. See DESIGN.md § Colors rule 3b for why this is not the pastel pill it superficially resembles.

---

## 2. Columns

### 2.1 Built-in columns

| Column | Width | Ink | Editable |
|---|---|---|---|
| Name | 320px sticky | graphite | yes — `F2`, or Rename from the row menu |
| Est start | 96px | graphite | yes, date picker |
| Est end | 96px | graphite | yes, date picker |
| Act start | 96px | blue-black if `auto`, graphite if `manual` | yes |
| Act end | 96px | blue-black if `auto`, graphite if `manual` | yes |
| Est days | 64px | blue-black, right | no — computed |
| Act days | 64px | blue-black, right | no — computed |
| Closed | 74px | blue-black, right | no — counted from the status column (D-24b). `12 / 41` on a parent, an en dash on a leaf |
| **Misclosure** | 84px | vermilion slip when non-zero | no — computed |
| ~~Assignee~~ | | | **not built-in** — see below |

Est/act day counts and misclosure are always in working days. The misclosure column sits behind a 20px gutter — the one generous space in the layout — so the number that matters is isolated.

> **Correction, 2026-09-07.** This table originally listed Assignee as a built-in column, but `pmt_nodes` has no assignee column and never did. Assignee is a `people` custom field, created by the importer. Nothing else changes: it renders and edits exactly like any other `people` column.

### 2.2 Custom columns

Every non-archived field definition of the project, in `position` order, appended after the built-ins. Column widths default by type (text 160, long_text 220, number/money 100, date 96, select 130, multi_select 180, checkbox 60, people 120) and are resizable by dragging the vertical rule. Widths persist per user per project in local storage — not in the database, since they are not shared state.

### 2.3 Column visibility

A `⌗` control opens a hinged leaf listing every column with a checkbox. Hiding is per user, stored locally. There is no column reordering in phase one; order is `position` on the definition, which an Admin can change in field settings.

---

## 3. Cell editing by type

Every editable cell follows the same interaction contract:

- **Enter edit:** single click on a selected row's cell, or `Enter` on a focused cell, or start typing.
- **Commit:** `Enter`, `Tab`, or clicking outside. Writes immediately; no save button.
- **Cancel:** `Escape` restores the previous value.
- **Editing look:** `cell-editing` ground, 1px graphite box. The row does not lift or shadow — a clear leaf is laid over the one cell (DESIGN.md § Elevation).

| Type | Editor |
|---|---|
| `text` | Inline single-line input, full cell width |
| `long_text` | Hinged leaf below the cell, 3 rows, `Cmd/Ctrl+Enter` commits, `Enter` newlines |
| `number` | Inline input, right-aligned, tabular figures, numeric keypad on touch |
| `money` | Inline input, right-aligned, currency shown as a graphite-soft suffix from `config.currency` |
| `date` | Hinged calendar leaf. Non-working days rendered on `page-edge`. Typing accepts `d/m`, `d/m/yy`, and `31 Dec` |
| `select` | Hinged leaf of ruled option rows, each with a 6px hue square. Type-ahead filters. `Backspace` clears |
| `multi_select` | Same leaf, checkboxes, stays open until `Escape` |
| `checkbox` | `Space` or click toggles in place. No editor |
| `people` | Hinged leaf listing project members, type-ahead by name |

**Empty is an en dash** in graphite-soft, matching the field-book convention that a blank booking is struck rather than left void.

**Archived option** already stored on a row renders with its label struck through and a graphite-soft `ARCH` suffix. It cannot be re-selected.

---

## 4. Keyboard model

This is the feature that decides whether the product beats the tool it replaces.

| Key | Action |
|---|---|
| `↑` `↓` | Move the focused cell between rows |
| `←` `→` | Move between columns |
| `Enter` | Enter edit; if editing, commit and move down |
| `Tab` / `Shift+Tab` | Commit and move right / left |
| `Escape` | Cancel edit; if not editing, clear selection |
| `Space` | Toggle checkbox; on a name cell, expand/collapse |
| `F2` | Rename the focused row |
| `Delete` | Archive the row and its subtree (Admin). A row with children asks once first |
| `E` | Open the detail panel for the focused row |
| `N` | New sibling below the focused row |
| `Shift+N` | New child of the focused row (rejected at depth 6) |
| `Alt+→` | Indent — become a child of the row above at the same level (D-3) |
| `Alt+←` | Outdent — become a sibling of the parent |
| `Cmd/Ctrl+↑ ↓` | Jump to first / last row of the group |
| `/` | Focus search |
| `G` then `T` | Switch to Timeline, carrying the selection |

Focus is a 2px square graphite outline offset 1px. It is always visible — no focus-invisible-until-keyboard behaviour, because this grid is primarily keyboard-operated.

The triage path, measured against the goal: `↓ ↓ Enter r Enter` changes a status. Five keystrokes, no pointer, no modal, no reload.

---

## 5. Hierarchy and expansion

- Level is expressed by a 20px indent per level in the name column, with a graphite bracket drawn at the indent. **Never by background tint.**
- A node with children shows a graphite triangle before its name. Collapsed by default at first load below level 3; expansion state persists per user per project in local storage.
- Selected row shows the punched hole — a 9px circle at 30% graphite in the name column's left margin — instead of a highlighted background.
- Hovering a row raises its rule from `rule` to `rule-major`. The background never changes.

---

## 6. Grouping

Group by exactly one column. Default: module (the node's level-2 ancestor).

- Group head is a 26px row: `▾` triangle, group label in `title`, count in graphite-soft figures. No background fill; a `rule-major` sits above it.
- Groups collapse. Collapsed state persists locally.
- Grouping by a `select` field creates one group per option in `position` order, plus a trailing `—` group for empty. Archived options group only if rows still hold them.
- Grouping by `multi_select`, `long_text`, or `people` is not offered — the first two have no sensible grouping and the third would duplicate rows.
- Each group ends with an `+ Add task` row in graphite-soft. Clicking it inserts a row inline at the correct parent and level and puts the name cell straight into edit.

---

## 6b. Row actions

Two controls sit at the right of the name cell, on the same line as the task: a **pencil** to rename and a **bin** to archive. They appear on hover or when the row is selected, and are hidden otherwise — two controls repeated down 174 rows is clutter, and `F2` and `Delete` reach the same actions without them.

| Action | Icon | Who | Notes |
|---|---|---|---|
| Rename | pencil | Member | Also `F2`. Edits in place in the name cell |
| Archive | bin | **Admin** | Also `Delete`. Takes the whole subtree (D-4) |

Adding a child is not an icon: `Shift+N` and the `+ Add task` row at the foot of each module already cover it, and a third control on every row would cost more than it returns.

**The icons are drawn, not imported.** 1px strokes, square ends, mitred joins, no fill and no rounded corners — the same hand as the rules on the page. An icon set from anywhere else would be the single borrowed voice in the interface, which DESIGN.md rules out.

### Archiving asks once, then offers to undo

**The bin icon opens a dialog**, and so does the `Delete` key. Both routes to archiving lead through the same question, so there is one place to describe and one place to get right.

The dialog names the row, then states the size of what is about to happen — *"This will archive **58** tasks — this one and the **57** beneath it"* — and says that archived work leaves every view and stops counting towards roll-up, but is not deleted. The count is the point: archiving `หุ่นยนต์ปกป้อง` quietly taking 57 tasks with it is exactly what a person needs told before it happens, not after.

**The safe answer holds focus.** "Keep it" is focused on open, Escape cancels, Tab is trapped inside the dialog, and clicking the backdrop cancels. A stray Return archives nothing.

**Neither icon is red.** Vermilion means out of tolerance and nothing else (DESIGN.md § Colors, rule 1). Archiving is a deliberate act, not a mistake, and colouring it red would dilute the one signal that matters. The confirmation step is the safeguard; colour is not. The acceptance suite asserts this and caught it when an earlier version got it wrong.

> **Amended 2026-09-07, at the user's request.** The first version put the question in the row itself — the icons swapped for a tick and a cross — and argued that a dialog is a dialog people learn to click through.
>
> The rule it cited refuses a modal for work that needs **neither** interruption nor protected focus. Archiving a module needs both. The in-row form put the confirm one pixel from the control that had just been clicked, which is the shape a double-click defeats, and it could be dismissed by clicking anywhere — including on the next row's bin. Taking 58 tasks out of every view earns the interruption.
>
> The dialog is still built to this system's rules: page ground, one 1px graphite rule, square corners, the hard 2px offset rather than a blurred drop shadow, and a flat wash of the board colour behind it instead of a frosted blur.

**Neither button is red**, for the same reason the icons are not. The primary action inverts to graphite instead.

**Afterwards an undo bar appears**, naming what went and how many went with it, and the undo is real: it calls `POST /api/nodes/:id/restore`, not a delayed delete. Archiving is reversible in the data model (D-4), so the interface should be honest about that rather than pretending the row is gone forever.

The bar can be dismissed. Once dismissed the subtree is still restorable through the API, but not through the interface — a restore-from-archive screen is not built.

## 7. Detail panel

`E`, or clicking the row's name twice, opens the facing page — a right-hand panel, **not a modal**. It slides in as a hinged leaf with a `rule-major` at its spine, and the grid remains visible and scrollable beside it.

Contents, in order:

1. Name (editable, `headline`)
2. Breadcrumb of ancestors, in label caps
3. The four dates as a small ruled block, each showing source (`auto`/`manual`) and, for actuals, the raw pre-snap date in graphite-soft when it differs
4. Misclosure figures, signed, on a vermilion slip when non-zero
5. Roll-up block for nodes with children: children's extent versus this node's baseline, with the overhang in vermilion
6. Every custom field, one per ruled row
7. Children as a compact ruled list

---

## 8. States

| State | Rendering |
|---|---|
| **Empty project** | A ruled page with columns drawn and no rows, one line of instruction in graphite-soft set on the first row's baseline. Never an illustration. |
| **Empty group** | The group head with its count at `0` and only the `+ Add task` row. |
| **Loading** | The ruled page renders immediately with column heads; rows arrive as a block. No skeleton shimmer — the rules themselves are the placeholder. |
| **Save in flight** | The committed cell shows its new value immediately (optimistic). A 2px graphite tick appears in the cell's right margin until the write confirms. |
| **Save failed** | The cell reverts, takes a vermilion box, and an errata slip appears in the row's margin carrying the error code. It stays until dismissed or retried. |
| **Read-only (Viewer)** | Every editor is unreachable; cells take no editing affordance and the `+ Add task` rows are absent. No lock icons — absence is the signal. |
| **Out of closure** | Only the misclosure cell carries vermilion. The row is not tinted. |
| **Archived option in a cell** | Struck label plus `ARCH` suffix. |

---

## 9. Performance contract

At the stated scale (under 200 rows per list) the whole list renders without virtualization. The table is built on TanStack Table with its row model separated from rendering, so enabling `@tanstack/react-virtual` later is a rendering change, not a rewrite.

Hard requirements:

- A cell commit updates the grid from the write response. No refetch of the ledger.
- A status change that captures an actual date updates the date cells, the duration cells, the misclosure cell, and every ancestor's roll-up **in the same paint**, from the same response.
- Group and sort run client-side over the already-loaded ledger.

---

## 10. Responsive

| Width | Behaviour |
|---|---|
| ≥ 1440px | `board` margin appears around the page |
| 900–1440px | Full layout, fore-edge rail at 30px |
| 700–900px | Rail collapses to a 26px hue strip with the module name rotated |
| < 700px | One record per screen: name as `headline`, then a two-column ruled label/value run. Still ruled, still no cards. Row navigation by swipe or `↑`/`↓` |
