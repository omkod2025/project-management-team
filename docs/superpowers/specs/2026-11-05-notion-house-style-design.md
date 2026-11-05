# Notion as the house style — design

**Date:** 2026-11-05
**Status:** approved by the owner, 2026-11-05

## Intent

The owner wants T-Timeline to look and feel like Notion on every screen except one. The Wiki already wears the Notion language (since 2026-11-05) and the owner likes it. The goal is one calm, consistent product rather than a field book here, a ClickUp sheet there, an indigo split card at the door and Notion in the Wiki.

The one exception is the **Calendar** view (`src/app/(signed-in)/p/[slug]/calendar/`). It keeps its current Google-Calendar look, unchanged.

What the field book was protecting is not a look. It is three meanings, and the owner chose to keep all three (§ Constraints). The product's whole purpose is plan against reality; a restyle that blurs that is a failure even if every screen looks like Notion.

## Decisions the owner made

1. **Notion is the house style for every surface except the Calendar view.** That includes:
   - the shelf (project list) and the header shell;
   - List and Timeline;
   - All Timeline, the roster (`/timeline`);
   - task detail, Docs and Wiki;
   - the public published links (`/d/[token]`, `/w/[token]`);
   - `/people`, profile, report, project settings and the notification bell;
   - the invite link, and the auth pages (`/sign-in`, `/set-password`, `/change-password`).
2. **The `DESIGN.md` frontmatter becomes the Notion token set.** It still generates `src/app/tokens.css` through `scripts/tokens.mjs`.
3. **The Calendar view keeps its current look**: its own header, sidebar and day/week/month grid render identically before and after. The shared pieces it opens, the notification bell and the task modal (`timeline/task-modal.tsx`, styled in `timeline/roster.css`), follow the house style like everywhere else. Decided by the owner in review.
4. **Three meaning laws stay, on every surface:**
   - **Vermilion `#A82A17` means out of closure and nothing else.** A misclosure is out of closure. So is a write that did not land: a failed save in the List (`td.failed`, `.title-errata`), profile or `/people` is an errata, and it stays vermilion. Decided by the owner in review, matching the existing code and A8's allowlist (`slip|failed|errata`). Vermilion is never used for deletion, generic validation hints, brand or hover. Deletion uses danger red.
   - **Two inks are the audit trail.** One ink means a person entered the value. A different, distinguishable ink means the system derived or captured it. Overriding an automatic actual changes the value's ink.
   - **The six tab hues say *whose* work it is (module identity), never status.** They are always mixed into the ground or the ink, never used raw; acceptance test A8's reasoning still holds.
5. **The List becomes airy, like a Notion database table.** It is no longer the dense 34px field-book run.
6. **`notion/DESIGN.md` may be deleted** once its content lives in `DESIGN.md`.

## Goals

- Every in-scope screen reads as one product in the Notion language:
  - warm paper (`#F6F5F4`) behind white documents, panels and fields;
  - near-black Inter;
  - one blue (`#0075DE`) for action, links, focus and "you are here";
  - hairlines and layered near-transparent shadows;
  - radii of 4 / 5 / 8 / 12 / 16px, and a full pill for the primary action.
- One source of truth. `DESIGN.md`'s frontmatter generates the tokens, and every stylesheet reads them. The Wiki's private `--nt-*` skin is folded into the shared tokens rather than duplicated per surface.
- The three meaning laws remain visible and tested.

## Non-goals

- No new features, no layout restructuring beyond what the style needs, and no change to behaviour or data.
- No dark theme.
- None of Notion's marketing devices: the 54–64px display type, the dark indigo hero band, the multicolour sticker palette, pricing cards or illustrations.
- No change to the Calendar view, its stylesheet or its look.

## Anti-goals

The work has failed, even if every screen looks like Notion, if any of these happens:

- **Estimate and actual can no longer be told apart without colour.** In the Timeline, they still differ by position and height, and the estimate is still hatched while the actual is solid (A8).
- **Vermilion appears anywhere that is not out of closure,** or a misclosure is no longer shown in vermilion.
- **The entered ink and the derived ink collapse into one colour.**
- **A module hue is used raw, or comes to read as a status.**
- **Thai text is tracked, uppercased, set below 13px, or loses tone-mark headroom.** Notion's tight headline tracking must not reach Thai.
- **The Calendar view changes.**

## Constraints

- **Stack and conventions.** The rules in `CLAUDE.md` for the stack and conventions still apply. Before writing code, invoke `ouan-react-best-practice` and `impeccable`, and read `node_modules/next/dist/docs/` before touching anything Next-specific.
- **`tokens.css` is generated.** Change the frontmatter and run `node scripts/tokens.mjs`, never edit the CSS by hand. The generator parses only two levels of `key: value`. Keep the frontmatter inside that subset, or replace the parser with a real YAML dependency, and say so.
- **Tests must stay green:**
  - `npm run check`;
  - `npm run test:acceptance`, which includes A8;
  - `npm run test:e2e` and `npm run test:wiki` against a running dev server, including the browser tests.
  A test that asserts the *old look* rather than a meaning, such as one that asserts a radius of 0, is updated to the new style with a note saying why. A test that asserts a meaning is never weakened.
- **Language.** Interface chrome is English and content is Thai. Never `letter-spacing` or `text-transform: uppercase` on Thai, and never Thai below 13px.

## The house style (the target)

`DESIGN.md` § 1–8, as already written on 2026-11-05, is the reference. Its body text stays, apart from the § 9–10 rewrite below. In summary:

| | |
|---|---|
| Canvas | `#FFFFFF` |
| Paper | `#F6F5F4` |
| Hairline | `#E6E6E6` |
| Field line | `#DDDDDD` |
| Hover | `rgb(0 0 0 / 4%)` |
| Ink | `rgb(0 0 0 / 95%)` |
| Charcoal | `#31302E` |
| Stone | `#615D59` |
| Ash | `#A39E98` |
| Blue | `#0075DE`, pressed `#005BAB`, wash `#E7F1FB` |
| Danger (deletion only) | `#C4362F` |
| Type | Inter → Anuphan → system. Body 15/400, prose 16/1.75, headings 22–34/700, eyebrow 12/600 |
| Radius | 4 / 5 / 8 / 12 / 16 / full |
| Shadows | Level 1 (four layers, ≤4% alpha) and level 2 (five layers, ≤5% alpha) |
| Motion | 120ms ease on buttons and fields, 180ms for dialog entrance; `prefers-reduced-motion` respected |

Components (primary pill, utility 8px, quiet, danger, fields, panels, tables, dialogs, prose, tree, flags, empty state) are as described in `DESIGN.md` § 7, and as they already render in the Wiki.

## Surface by surface

### Frontmatter and tokens

- **Replace the frontmatter** with the Notion token set, adapted to this app. Keep it to the colours, type roles, radii and spacing above. Drop the marketing roles and the `ex-*` examples.
- **Keep the meaning tokens in it**, so they are generated alongside: `vermilion`, `vermilion-wash`, the entered ink, the derived ink, `datum` and `tab-1`…`tab-6`.
- **Keep the meaning tokens' current names** (`ink-graphite`, `ink-blue`, `vermilion`, `tab-n`), so that the dozens of existing uses survive the swap. *(My call: least churn, and the names describe meaning, not look.)*
- **Keep the meaning tokens' current values, frozen**, as 6-digit hex: `ink-graphite #2A2622`, `ink-blue #24384F`, `vermilion #A82A17`, `vermilion-wash #EED9CE`, `datum #1F4A3D` and `tab-1`…`tab-6`. *(My call: A8's distance check mixes the tab hues toward `ink-blue`, so freezing them keeps A8's arithmetic valid. `ink-blue` stays clearly apart from the action blue `#0075DE`.)* Body text that nobody entered as a value, such as headings and labels, uses the Notion ink. `ink-graphite` is for entered values in cells, and `ink-blue` for derived ones. The pair still reads as two inks next to each other in a row.
- **Retiring field-book tokens:** `page`, `page-edge`, `board`, `rule`, `rule-major`, and the Bai Jamjuree and Martian Mono type roles. Remove them once nothing reads them, or map them onto Notion values during the transition. The builder chooses which, but none survive at the end except where the Calendar needs them.
- **The `.fb-*` component classes** in `tokens.css` are not used by any source file today. The builder decides whether the new frontmatter keeps a `components:` block at all.
- **`globals.css`:**
  - `--brand` moves from indigo `#2B3A8F` to Notion blue, with the deep, wash, line and glow variants re-derived.
  - The body moves to the paper ground and Inter.
  - The "radius 0, one hard shadow, steps(2)" rules go.
  - The `:lang(th)` rules stay.
- **`wiki.css`:** its local `--nt-*` block becomes redundant and is removed in favour of the shared tokens.

### Shell and shelf

`shelf.css`, the header and the project nav move to the Notion shell: a white header bar on paper, quiet nav links, and the current item in the blue wash. The project list becomes a Notion table or panel list.

### List

Airy, like a Notion database table:

- **Rows and type.** Rows are taller (about 36–40px; the builder tunes this), body is 14–15px, and cells have more padding.
- **Header.** The header row uses the eyebrow style in Stone, on paper or white.
- **Grid lines.** Rules are hairlines, and no vertical rule is drawn between every column.
- **Banding.** The Estimate / Actual / Variance band stays as a header grouping, because it carries meaning. It is drawn in the Notion style.
- **Plan and reality.** Estimate and actual stay visually separate columns.
- **Inks.** The entered ink and the derived ink stay distinct.
- **Misclosure.** It stays a vermilion slip with a signed figure. It may take the 4px radius, but it is never a pastel pill.
- **Module identity.** It stays as the chip at the module row and the indent hairline: hue mixed, never raw, and never a row tint.
- **Option chips** (status and selects) become Notion-style chips. A small radius (4–5px) is allowed now. They still carry their own hue mixed into the ground, and a label that clears 4.5:1. The leading-edge bar that kept them distinct in greyscale stays, or is replaced by something else that survives greyscale.
- **No zebra striping, and no row tint by status.**
- **Drag, sort, filter and column-move behaviour do not change.**

### Timeline (project) and All Timeline (roster)

- The chrome around the chart moves to Notion.
- **The bars keep A8 intact.** The estimate sits above, is shorter and is hatched; the actual sits below, is taller and is solid. They are no longer required to be square: a small radius (2–3px) is the builder's call.
- **Leading edge.** Each bar's leading edge carries the mixed module hue.
- **Today line.** It stays a 1px line in `datum` or blue. *(My call: keep `datum`, because blue means action.)*
- **Non-working days.** They become a paper-coloured band behind the bars.
- **Baseline brackets and the vermilion overhang stay.**
- **Dragging a bar still tracks 1:1** and snaps on release. Other transitions use the Notion easing, not `steps(2)`.

### Figures

Dates, durations and variance figures drop Martian Mono for Inter with `font-variant-numeric: tabular-nums`, so they still column-align. Code blocks keep a monospace face. *(My call: Notion has no instrumental mono, and tabular Inter keeps alignment.)*

### Labels

Bai Jamjuree uppercase labels become the Notion eyebrow (12px/600, sentence case, light tracking on English only).

### Docs, published links, task detail

- **Docs** takes the same skin the Wiki uses, through shared tokens.
- **Published pages** (`/d/`, `/w/`) follow the same style.
- **The task detail panel** becomes a Notion side panel: white, a hairline on its spine and a level-2 shadow.

### `/people`, profile, settings, report, bell, invite link

These move to Notion panels, tables, fields and buttons. On `/people`, roles stay non-hue (weight, italic, faint). Deactivated and armed-delete states use danger red, not vermilion.

### Auth pages

- The indigo split card goes. In its place, a centred white panel on paper with a 16px radius and the level-2 shadow.
- Labels sit above fields.
- The primary action is a blue pill.
- The estimate-versus-actual graphic may stay as a small illustration, with its overrun still in vermilion, or be dropped. This is the builder's call.

### Calendar (unchanged)

- `calendar.css` and the Calendar view's markup are not edited, except to pin what it inherits. That means any removed shared token, and the body `font-family`, which it inherits from `globals.css` today and which moves to Inter. These are pinned to their old values inside `.cal-page`, so its own rendering does not change.
- The bell and the task modal opened from the Calendar take the house style (decision 3).
- **Verification.** Screenshot the Calendar view (week and month, at 1440px and 390px) before any change and after the last one, with no modal or bell panel open. They must match.

## Documentation changes

- **`DESIGN.md`:**
  - Replace the frontmatter as above.
  - Rewrite § 9 as **"The meaning laws in the chart and the List"**. It covers how the three laws are drawn in the Notion style (bars, slips, inks, module hue) and drops the "field book kept" framing.
  - Add a short **"Calendar — a scoped exception"** section recording that the Calendar keeps its Google-Calendar look, and why (the owner's decision, 2026-11-05).
  - Replace § 10, Migration status, with the post-migration state.
- **`CLAUDE.md`, § Colour law:** keep the vermilion, ink and tab-hue paragraphs. Replace "No cards, no rounded corners, no blurred shadows, no dark theme, no zebra striping … One exception: the signed-in Wiki screens…" with the Notion house style, the Calendar exception, and the rules that remain: no dark theme, no zebra striping, no status tint on rows.
- **References to `notion/DESIGN.md`** in `CLAUDE.md`, `wiki.css` and `wiki/layout.tsx` point to `DESIGN.md`.
- **Delete `notion/`.** It is untracked today. Commit it once before deleting, so that git history keeps the original analysis. *(My call: deletion is otherwise unrecoverable.)*

## Left to the builder

- The order of surfaces and how the work splits into commits. A suggested order: tokens and globals → shell → List → Timeline and roster → Docs and published pages → the remaining screens → auth → docs cleanup.
- The exact row height, paddings, and the radius of bars and slips, within the ranges above.
- Whether retired tokens are removed at once or mapped first and removed later.
- Whether to keep a `components:` block in the frontmatter.
- How each surface adopts the tokens: by variable rebinding (as `wiki.css` does) or by rewriting the selectors.

## Done means

- Every in-scope screen renders in the Notion style, checked by screenshot at desktop and phone widths.
- The Calendar view screenshots match the "before" set.
- No vermilion appears outside misclosure and failed-write (errata) states. A8 passes, and the vermilion-selector test passes unchanged.
- `npm run check`, `test:acceptance`, `test:e2e` and `test:wiki` pass, with any updated tests noted.
- `DESIGN.md` and `CLAUDE.md` describe the new world, and nothing references `notion/`.
