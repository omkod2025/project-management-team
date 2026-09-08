---
name: T-Timeline
description: A project tracker built as a surveyor's timeline — plan and reality booked side by side, and the misclosure shown in red.
colors:
  page: "#EDE5D2"
  page-edge: "#DED2B6"
  board: "#3B3A33"
  rule: "#C58C7C"
  rule-major: "#B0503C"
  ink-graphite: "#2A2622"
  ink-graphite-soft: "#6B6357"
  ink-blue: "#24384F"
  ink-blue-soft: "#5C7186"
  vermilion: "#A82A17"
  vermilion-wash: "#EED9CE"
  datum: "#1F4A3D"
  tab-1: "#B0503C"
  tab-2: "#C08A2E"
  tab-3: "#5B7A3A"
  tab-4: "#2E6E74"
  tab-5: "#3A5A94"
  tab-6: "#6B4A87"
typography:
  headline:
    fontFamily: "Bai Jamjuree, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.01em"
  title:
    fontFamily: "Bai Jamjuree, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
  label:
    fontFamily: "Bai Jamjuree, sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.13em"
  body:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  figure:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
rounded:
  none: "0px"
  hole: "50%"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "32px"
  row: "34px"
components:
  cell:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink-graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "{spacing.row}"
  cell-computed:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink-blue}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "{spacing.row}"
  cell-editing:
    backgroundColor: "#F6F1E4"
    textColor: "{colors.ink-graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "{spacing.row}"
  column-head:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink-graphite-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "26px"
  tab:
    backgroundColor: "{colors.page-edge}"
    textColor: "{colors.ink-graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 6px"
    width: "26px"
  tab-current:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink-graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 6px"
    width: "30px"
  bar-estimate:
    backgroundColor: "transparent"
    textColor: "{colors.ink-graphite-soft}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "9px"
  bar-actual:
    backgroundColor: "{colors.ink-blue}"
    textColor: "{colors.page}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "13px"
  misclosure-slip:
    backgroundColor: "{colors.vermilion-wash}"
    textColor: "{colors.vermilion}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "2px 6px"
    height: "18px"
---

# Design

## Overview

**Creative North Star: The Surveyor's T-Timeline.**

The product took the name on 2026-09-07, so this is no longer only a metaphor guiding the design — it is what the thing is called, and what a client reads at the foot of a report.

A levelling field book is the one everyday artifact that already solves this product's exact problem. A surveyor walks a line, books each measured value into a pre-ruled column, and carries a running reduced level forward. At the end of the run they arrive at a point whose height is already known — and the difference between what they computed and what is true is called the **misclosure**. It is written in red. It is never erased, and the run is never quietly adjusted to hide it.

That is this product. `estimate` is the booked plan. `actual` is the observed measurement. The difference is a misclosure, and the whole interface exists to show it rather than absorb it. The parent baseline versus its children's roll-up is the same check one level up.

This world is committed to for concrete reasons, not atmosphere:

- **A ruled book is already a table.** The List view is the artifact, not a skin over it. Rows are close-set, rules are continuous, and there are no cards to break the run.
- **Two inks is already the estimate/actual grammar.** Field books distinguish *booked* from *reduced* — what you wrote down versus what you computed. Graphite for entered values, blue-black for derived ones, red for the check that failed.
- **Density is the aesthetic.** The user's speed floor is twenty status changes before a standup. A field book page is unapologetically dense, and that is the point rather than a compromise.

**What this world refuses:** the category default of rounded white cards floating on light gray, a violet or blue brand accent, pastel status pills, and a Gantt drawn in flat corporate hues. It equally refuses that default's predictable opposite — the near-black IDE surface with one neon accent.

**Staging: the carried object.** The selected node stays fixed and identical while the surrounding toolset changes. Moving from List to Timeline does not navigate away from the task; it changes the instrument pointed at it. Selection, scroll anchor, and expansion state survive the switch.

## Colors

The palette is a paper stock and three inks. Everything else is a tab hue.

| Role | Token | Value | Use |
|---|---|---|---|
| Page | `page` | `#EDE5D2` | The one ground. Every reading surface. |
| Page edge | `page-edge` | `#DED2B6` | Leaves beneath the current one; unselected tabs; the fore-edge stack. |
| Board | `board` | `#3B3A33` | The desk the book lies on. Frames the page at large viewports only. |
| Rule | `rule` | `#C58C7C` | Ordinary horizontal and vertical column rules. |
| Major rule | `rule-major` | `#B0503C` | The double rule under column heads, and section closes. |
| Graphite | `ink-graphite` | `#2A2622` | Values a human entered. The default text color. |
| Graphite soft | `ink-graphite-soft` | `#6B6357` | Column captions, units, empty-cell dashes, estimate outlines. |
| Blue-black | `ink-blue` | `#24384F` | Values the system computed or observed: roll-ups, actual dates, derived durations. |
| Blue-black soft | `ink-blue-soft` | `#5C7186` | Secondary computed text and the actual bar's hairline. |
| Vermilion | `vermilion` | `#A82A17` | **Reserved by law for misclosure.** Variance beyond tolerance, baseline exceeded, validation failure. Nothing else. |
| Vermilion wash | `vermilion-wash` | `#EED9CE` | The errata slip behind a misclosure figure. |
| Datum | `datum` | `#1F4A3D` | Today's line on the timeline, and confirmed-closed runs. |
| Tab 1–6 | `tab-1`…`tab-6` | see frontmatter | Module identity, assigned in order around the wheel. |

**Rules that bind.**

1. **Vermilion is never decoration.** It is not a brand color, not a primary button, not a hover state. If red appears where nothing is out of tolerance, the interface is lying.
2. **Two inks carry meaning.** Graphite means a person put it there. Blue-black means the system derived it. A user overriding an automatic actual date turns that cell from blue-black to graphite — the color change *is* the audit trail.
3. **Tab hues say *whose*, never *how it is going*.** A module's color identifies the run of work it belongs to and carries no verdict. It appears on the fore-edge tab, a 3px chip at the head of the module's row, a 2px hairline down the indent of every row beneath it, and both Timeline bars. It still never tints a whole row background and never fills a table cell edge to edge.

   > **Amended 2026-09-07, at the user's request**, after the ClickUp reference screenshots. The original rule kept hue out of the field entirely, on the argument that colour in a table becomes noise. Two hundred rows in, the opposite was true: a task scrolled far from its module heading was unattributable, and the fore-edge rail could not answer it because the rail is an index, not a label.
   >
   > **What the amendment does not relax.** Hue is mixed *into* the page ground, never laid over it as an opaque tag, so a chip reads as a stamp on the paper rather than a sticker above it. Corners stay square. Both bar fills are mixed toward the ink before drawing, which keeps `tab-1` — a brick red — measurably clear of vermilion; `tests/e2e/acceptance.test.ts` A8 does that arithmetic and fails if the raw hue is ever used.

3b. **A chosen option is stated in its own color.** A `select` or `multi_select` value draws as a square-cornered chip: its option hue mixed 17% into the page, a 2px bar of the full hue on the leading edge, and a label darkened toward graphite until it clears 4.5:1 against its own ground. It is not a pastel pill — it has no radius, no shadow, and no opaque fill. The leading edge is what still separates two options in a greyscale print.
4. **Light only.** The physical scene is a desk in a Bangkok office in daylight, and the artifact is paper. There is no dark mode; a dark field book does not exist. Screens used at night reduce page luminance via a paper-warmth control, not an inversion.
5. **Color is never the sole carrier.** Estimate and actual differ by *position and height* before they differ by ink — module hue is a third axis laid over that distinction, never a replacement for it. A chip is legible by its label alone. Misclosure carries a `+`/`−` sign and a figure, not only red.

## Typography

Three faces, each with a job that no other could do.

- **Bai Jamjuree** — structural lettering. Column heads, tab labels, view names, section captions. Always uppercase at label size with `0.13em` tracking, standing in for the hand-lettered condensed caps of a printed field-book header. Chosen for a squared, drafted skeleton and a properly drawn Thai companion from the same foundry.
- **Anuphan** — the reading and writing face. Every task name, note, and Thai string. A humanist Thai/Latin superfamily with even color at small sizes and Thai tone marks that survive a 34px row.
- **Martian Mono** — figures and identifiers. Dates, durations, misclosure values, record ids. Narrow, tabular, and unmistakably instrumental, so numbers column-align by construction.

**Thai/Latin discipline.** Thai sets optically smaller than Latin at the same em, and its tone marks need headroom. Body Thai runs at `1.05em` relative to Latin with `line-height: 1.55` minimum. Never set Thai below 13px, never in all-caps, and never apply letter-spacing to Thai runs — tracking breaks the mark stacking.

**Scale.** `label 10.5` → `figure 12` → `body 14` → `title 14/600` → `headline 20`. That is the whole scale. A field book has no display type; a headline in this product is the run's name, nothing larger.

## Layout

**The page is the container.** One page, edge to edge, with a `board` margin appearing only above 1440px. There is no centered max-width content column — a field book page is filled to its rules.

**Two zones, fixed.**
- **Fore-edge rail (left, 30px):** the stepped module tab rail. One tab per module, height proportional to how many tasks it holds, hue from the wheel. The current module's tab extends 4px further and is the page color, continuous with the page — it *is* the page.
- **Page (remainder):** column heads, then the run of rows.

**The run.** Rows are `34px`, close-set, with a continuous 1px `rule` between them. Every fifth row's rule is not emphasized — this is a book, not a spreadsheet with zebra striping. **There are no alternating row backgrounds.** Depth in the hierarchy is expressed by indenting the name column by `20px` per level and by a graphite bracket at the indent, never by background tint.

**Columns.** Fixed grid, vertical `rule` lines running the full height of the run, continuing past the last row to the bottom of the page exactly as pre-printed rules do. The name column is sticky-left; the rest scroll horizontally under it.

**Rhythm.** More space above a section head than below it: `20px` above, `8px` below. The only generous space in the layout is the top margin of the page (`32px`) and the gutter before the misclosure column (`20px`), which isolates the number that matters.

**The chrome holds the viewport; only the run scrolls.** `.book` is `100dvh` and the scrolling region is the run itself, so the project name, the search box, the view tabs, the column heads and the keys strip all stay on their edges at row 174. This was not true until 2026-09-07: the whole document scrolled, `overflow: auto` on the run only ever did horizontal work, and by row ninety every control had left the screen — on the surface whose primary scene is timed morning triage.

**The grid is banded, not flat.** Two header rows: an upper band naming `Estimate`, `Actual` and `Variance`, and beneath it the column labels, with the signature double rule closing the pair rather than each row. The band's ink is the ink law doing structural work — the estimate reads graphite because a person entered it, the actual blue-black because the system captured it. The groups are parted by 14px seams of bare page and nothing else: the band already names them, and a rule there would state the same fact twice.

**Responsive.** The fore-edge rail is a hue strip at rest and opens to a 200px index on hover or keyboard focus; below 900px it stops opening, because there is no hover on a touch screen and an index that covers a quarter of the run with no way back is worse than none — every module is also a row in the run. Module names are set horizontally at every width. They were once printed vertically, which failed the Thai half of them outright: rotated 90° the script's tone marks stop resolving, and this system already refuses caps and letter-spacing on Thai for the same reason. Below 700px the List becomes one card-free record per screen with its columns as a two-column label/value run — still ruled, still no cards. The Timeline never reflows to vertical; it scrolls, with the date scale pinned.

## Elevation & Depth

**This world is paper, so depth is ply, not blur.** There is exactly one shadow in the entire system: a `2px 0 0` hard offset along the fore edge where the current leaf sits above the leaves beneath. It has no blur radius and no alpha ramp.

Everything else that another system would elevate is expressed by ply:

- A row being edited does not lift; its cell takes the `cell-editing` ground and a 1px `ink-graphite` box, as if a clear overlay leaf were laid over that one cell.
- Menus and pickers are leaves hinged from their trigger edge. They have a 1px `ink-graphite` rule on all sides and sit flat on the page.
- The task detail panel is the facing page, not a modal. It slides in from the right with a hard vertical `rule-major` at its spine.
- **No blurs, no glassmorphism, no glow, no drop shadows under cards** — there are no cards.

**Motion.** Nothing eases and nothing fades. Every state change is a two-frame step at 90ms (`steps(2)`), hinged at whichever edge the element is bound to. The one exception is dragging a timeline bar, which tracks the pointer at 1:1 with no smoothing, then steps to its snapped day on release. `prefers-reduced-motion` removes the step and applies the end state immediately.

## Shapes

- **Radius is `0` everywhere.** Buttons, inputs, panels, bars, tabs, menus. A ruled book has no rounded corners.
- **The single curve in the system** is the punched hole: a 9px circle, `ink-graphite` at 30%, marking a selected row in the name column's left margin. It is the selection affordance, replacing the highlighted row background.
- **Bars have square ends.** An estimate bar is a 9px-tall rectangle with a 1px `ink-graphite-soft` outline and a 45° hatch fill at 12% — pencil, not ink. An actual bar is a 13px-tall solid `ink-blue` rectangle. Estimate sits above, actual below, in the same row, sharing a common baseline gap of 2px.
- **Borders do the work of surfaces.** A component is defined by its rules, never by a filled panel of a different color from the page.
- Focus is a 2px `ink-graphite` outline offset by 1px — square, high contrast, and never a soft ring.

## Components

**Row.** 34px, name column sticky, punched hole in the left margin when selected. Expansion chevron is a graphite triangle, not an icon-font glyph. Hover raises the row's rule from `rule` to `rule-major`; it does not change the row's background.

**Cell (entered).** Graphite text, left-aligned for text, right-aligned for figures in Martian Mono. Empty is an en dash in `ink-graphite-soft`, matching the field-book convention that a blank booking is struck, never left void.

**Cell (computed).** Blue-black, Martian Mono, right-aligned. Non-editable cells carry no lock icon; the ink color already says it.

**Select field.** A square-cornered chip: the option's hue mixed 17% into the page, a 2px bar of the full hue on the leading edge, label darkened toward graphite until it clears 4.5:1 (see § Colors rule 3b). Not a rounded pastel pill. The open menu is a hinged leaf listing options as ruled rows. Options carrying a `stage` marker show it as a small caps suffix (`NOT STARTED` / `RUNNING` / `CLOSED`) in `ink-graphite-soft`.

**Column head.** Bai Jamjuree label caps in `ink-graphite-soft`, 26px tall, closed by a **double rule** in `rule-major` — 1px, 2px gap, 1px. This double rule is the signature mark of the page and appears nowhere else.

**Misclosure slip.** When a node's actual exceeds its estimate, or a parent's roll-up exceeds its baseline, the variance column shows a `vermilion-wash` slip carrying a signed figure in vermilion Martian Mono: `+4d`, `−2d`. The slip is inset within the cell, as an errata slip pasted into a book — it does not fill the cell edge to edge.

**Timeline row.** Estimate bar above, actual bar below, sharing the row. The bar's leading 3px is the module's tab hue. Non-working days are drawn as a `page-edge` vertical band running the full height of the run behind all bars; bars cross them visibly rather than breaking, since the product stores calendar dates and computes working days as a lens. Today is a 1px `datum` vertical rule with the date in a small caps label at its head.

**Baseline mark.** A parent's hand-entered baseline is a graphite bracket — two vertical ticks joined by a hairline — drawn above its row. Its children's roll-up extent is a second, lighter bracket. Where the roll-up bracket extends past the baseline bracket, that overhang alone is drawn in vermilion.

**Buttons.** Square, 1px `ink-graphite` rule, page ground, graphite label in Bai Jamjuree caps. The primary action inverts: `ink-graphite` ground, page-colored label. There is no filled accent button anywhere in the system.

**Empty state.** A ruled page with its columns drawn and no rows — the book open at a blank leaf, with one line of instruction in `ink-graphite-soft` set on the first row's baseline. Never an illustration, never a centered icon.

## Do's and Don'ts

**Do**

- Draw the rules. If a region has no rules, it does not belong to this world.
- Keep graphite for human entry and blue-black for machine derivation, in every new surface without exception.
- Let density be the answer. When a screen feels crowded, remove a column, never add padding.
- Express hierarchy with indent and bracket; express identity with tab hue at the edge.
- Set every figure in tabular Martian Mono so columns align without manual width work.
- Step transitions at 90ms. Two frames, hinged, no curve.

**Don't**

- Don't use vermilion for anything that is not out of tolerance. This is the one rule whose violation destroys the product's meaning.
- Don't introduce a card, a rounded corner, a blurred shadow, or a filled colored panel.
- Don't zebra-stripe rows or tint them by status. Status is a cell value, not a row wash.
- Don't build a dark theme. Reduce page luminance if needed; never invert paper into a screen.
- Don't render status as a rounded pastel pill — that is precisely the category default this world refuses.
- Don't let a module hue touch the reading field.
- Don't animate with easing curves, fades, or spring physics.
- Don't apply letter-spacing or all-caps to Thai text.

---

## `/people` — a scoped departure

The access board follows the List sheet rather than the field book. Direction pinned by the owner on 2026-09-08 from an Untitled UI user-management reference. Scoped to `src/app/people/people.css`, which redeclares the List's `--cu-*` palette locally rather than reaching into `list.css` for it; `tokens.css` is untouched.

**Why a departure is tolerable here.** The board holds no plan and no reality. It is a matrix of who can reach what — one categorical value per cell, no dates, no figures, no roll-up — so none of the laws that keep estimate and actual legible have anything to bite on. What it does hold is a grid to be scanned across, which is the thing the List sheet's language was adopted for in the first place.

- **What the reference offered and this refused.** Row-select checkboxes (nothing here acts on a selection), a kebab overflow (one row action, and it is irreversible — hiding it makes it cheaper to hit by accident, not harder), coloured permission badges, and pagination. The reasons are in the stylesheet's opening comment.
- **Roles are never a hue.** The six tab hues mean module identity and cannot be re-let to mean a permission level. Admin is weight plus a 2px inset bar, View only is italic, No access is faint. All three survive greyscale.
- **Vermilion still means one thing.** The armed delete and a deactivated account — both states where something is wrong or about to be. Nowhere else on the page.
- **The monogram is grey on grey.** A per-person hue would be a seventh colour meaning nothing, and it would collide with the six that already mean something.
- **The invite form stays on the page.** The reference's `+ Add user` opens a modal; here the toolbar button moves the caret to the form that is already there. A task that needs neither interruption nor protected focus does not get a modal.

---

## The base pair — indigo on white

**Pinned by the owner on 2026-09-08: `#2B3A8F` and `#ffffff` are the product's base.** It began as the sign-in panel's field colour and is now what every surface answers to. The tokens live in `src/app/globals.css` — `--brand`, `--brand-deep`, `--brand-ink`, `--brand-wash`, `--brand-line`, `--brand-glow` — not in `tokens.css`, which is generated from this file's frontmatter and describes the paper world. This is the shell the paper is read inside.

**Where indigo is allowed.** Filled primary buttons, the brand mark, the active nav item, the admin marker, focus rings, the selection wash, and the tint carried by hairlines and hover grounds. It also replaced vermilion as the `::selection` background, which had spent the one colour that means misclosure on the most ordinary gesture in the product.

**What it does not touch, and this is the part that costs something to keep.**

- **Rule 1 stands.** Vermilion is still the only colour that means out of closure. Indigo took the primary button so that vermilion never has to.
- **Rule 2 stands.** Graphite means a person entered the value; blue-black (`#24384F`) means the system derived it. `--brand` is deliberately *not* `--color-ink-blue`: they are close enough to be confused if either is ever used where the other belongs, so the value ink is left alone and indigo never enters a cell.
- **Rule 3 stands.** The six tab hues say whose work it is. Indigo says nothing about the work, so it is never mixed into a module chip, an option chip or a Timeline bar — A8's arithmetic is over those, and it is untouched.
- **Body text stays near-black.** Indigo at 13px over a run of rows reads as a page of links.

**What this overrides.** `shelf.css` used to record that there is no filled accent button in this system, and § Components said the same. That is now false by instruction: the primary action takes the base fill. The rule that replaced it — the fill is the base, never a hue that already means something — is the one worth keeping.

## Auth surfaces — a scoped departure

`/sign-in`, `/set-password` and `/change-password` do not speak the field book. Direction pinned by the owner on 2026-09-08 from a reference composition: a floating split card, saturated field left, white form right. It is recorded here rather than argued with, and it is scoped to those three routes exactly as the List's ClickUp restyle is scoped to its sheet. `tokens.css` is untouched; the world lives in `src/app/auth.css` and its opening comment carries the direction contract.

**Why a departure is tolerable here.** These pages hold no data. Every law in this document exists to keep plan and reality legible against each other, and there is nothing on a sign-in page to keep legible — no rows, no figures, no hierarchy, no module identity. What the door owes the product is a statement of what is behind it, and that is what the left panel does: an estimate bar and an actual bar on one row, with the overrun measured. Nothing about it is a mascot.

- **Palette.** Indigo `#2B3A8F` field, white leaf, `#EEF0FA` ground. Secondary text on the field is tinted from the field's own hue (`#B9C1E8`), never grey.
- **Vermilion still means one thing.** It marks the bar's overhang and its `+3d` — lightened to `#E5654E`, because `#A82A17` on indigo is unreadable — and the errata band, which is a write that did not land. Nothing else on these pages is allowed it. The colour law holds even where the rest of the world does not.
- **Shapes.** 20px on the card, 10px on inputs, the button and the reveal's hit area, 8px on the errata slip inset inside them — the one place in this product with a radius, and the reason it is legible as a different room.
- **Type.** The product's own three faces. A pinned composition is a composition; it does not bring its fonts.
- **Fields are labelled above, not by placeholder.** The reference put the name inside the box, which survives two fields; the change-password form has three password rows, and filled placeholders would leave three identical rows of dots.
- **No self-registration, and the page says so.** Where the reference put Google, GitLab and Registration, this carries the fact that an admin creates the account. A control that would have to refuse is worse than a sentence that explains.
- **Below 880px** the split stacks: the field becomes a band sized to its content, the form takes the rest. Below 420px the graphic is dropped before the claim is.
