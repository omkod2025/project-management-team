---
name: T-Timeline
description: A project tracker in the Notion house style — warm paper, white panels, Inter and one blue — where plan and reality are booked side by side and the misclosure is shown in red.
colors:
  # The house (Notion) — DESIGN.md § Colors.
  canvas: "#FFFFFF"
  paper: "#F6F5F4"
  hairline: "#E6E6E6"
  field-line: "#DDDDDD"
  ink: "#000000F2"
  ink-secondary: "#31302E"
  ink-muted: "#615D59"
  ink-faint: "#A39E98"
  primary: "#0075DE"
  primary-active: "#005BAB"
  primary-wash: "#E7F1FB"
  danger: "#C4362F"
  danger-active: "#A52C26"
  danger-wash: "#FBECEB"
  # The List's header rows: a cool slate, so the heads stand apart from the warm paper around the table (owner, 2026-11-06).
  table-head: "#E9EDF1"
  table-head-line: "#D3DAE2"
  # Meaning tokens — frozen names; they say what a value is. The six tab hues were re-picked vivid on 2026-11-05 (owner).
  ink-graphite: "#2A2622"
  ink-blue: "#24384F"
  vermilion: "#A82A17"
  vermilion-wash: "#EED9CE"
  datum: "#1F4A3D"
  tab-1: "#F59E0B"
  tab-2: "#EC4899"
  tab-3: "#22A55A"
  tab-4: "#0EA5A4"
  tab-5: "#3B82F6"
  tab-6: "#8B5CF6"
  # The derived ink's secondary weight: an actual bar's hairline, secondary derived text.
  ink-blue-soft: "#5C7186"
  # The option palette — status and select chips, apart from the module hues (owner, 2026-11-05).
  # Each fill is solid; its ink clears 4.5:1 on it. Red is a pure red, kept 0.10+ from vermilion in OKLab.
  option-1: "#EA011A"
  option-1-ink: "#FFFFFF"
  option-2: "#F9D105"
  option-2-ink: "#472D00"
  option-3: "#057DA9"
  option-3-ink: "#FFFFFF"
  option-4: "#00882F"
  option-4-ink: "#FFFFFF"
  option-5: "#70757C"
  option-5-ink: "#FFFFFF"
  option-6: "#393E43"
  option-6-ink: "#FFFFFF"
  option-7: "#F97605"
  option-7-ink: "#4B1F08"
  option-8: "#D82784"
  option-8-ink: "#FFFFFF"
typography:
  headline:
    fontFamily: "var(--font-sans), var(--font-read), -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  title:
    fontFamily: "var(--font-sans), var(--font-read), -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  label:
    fontFamily: "var(--font-sans), var(--font-read), -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.01em"
  body:
    fontFamily: "var(--font-sans), var(--font-read), -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  figure:
    fontFamily: "var(--font-sans), var(--font-read), -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0"
    fontFeature: "tnum"
rounded:
  xs: "4px"
  sm: "5px"
  md: "8px"
  badge: "6px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "28px"
  xxl: "32px"
---

# Design

> **Reading this file.** **The house style** (§ 1–8) is the Notion language, and every surface follows it. **The meaning laws** (§ 9) say how plan against reality, the two inks and module identity are drawn inside that style, in the Timeline, the roster and the List. **The Calendar** (§ 11) is the one scoped exception.
>
> The YAML frontmatter above **is** the house token set. `scripts/tokens.mjs` generates `src/app/tokens.css` from it, and every stylesheet reads those variables. To change a token, change the frontmatter and run `node scripts/tokens.mjs`; never edit `tokens.css` by hand. The generator reads only two levels of `key: value` with scalar leaves and quoted strings, so keep the frontmatter inside that subset. The two shadow levels live in `src/app/globals.css` (`--shadow-1`, `--shadow-2`), because the generator has no shadow group.
>
> **The history.** The Notion language was adopted for the Wiki on 2026-11-05 and, at the owner's request the same day, became the house style for the whole product. Before that, the product wore a surveyor's field book: cream paper, square corners, Martian Mono figures, Bai Jamjuree captions. The field book's *meanings* survived the change (§ 1, § 9); its look did not. The original Notion analysis, from which § 1–8 were merged, is kept in git history (`git log --diff-filter=D --stat` finds the commit that removed it), not in the tree.

## 1. Overview

**The house style: a well-organised desk in good daylight.** The ground is a warm, paper-soft off-white (`#F6F5F4`), not clinical white. That keeps long pages feeling like documents rather than an app. Documents, panels and fields are pure white on top of it. Type is near-black Inter. The whole interface speaks in greys and black, then says exactly one thing in colour: a single, dependable blue (`#0075DE`), reserved for the primary action, links, focus and "you are here".

Surfaces are defined by hairlines and the faintest layered shadows, never by heavy elevation. Panels round at 12px, the primary action is a full pill, utility buttons round at a tighter 8px, and fields at 4px. Nothing is loud. The character comes from restraint.

**Key characteristics**

- A warm paper canvas under white documents and panels.
- Near-black Inter for Latin, and Anuphan for Thai.
- Exactly one structural accent: blue, for action and place only.
- A pill for the primary action, 8px for utility buttons, 4px for fields. The contrast is intentional.
- Elevation comes from a hairline plus a barely-there layered shadow.
- Whitespace does the grouping, not rules.

**What carries over from the field book, everywhere.** These are product laws, not a look, so they survive the change of style:

1. **Vermilion (`#A82A17`) means out of closure and nothing else.** A misclosure is out of closure. So is a write that did not land: a failed save is an errata, and it is vermilion (owner's decision, 2026-11-05). It is not a brand colour, not a primary button, not a hover state, not deletion and not a validation hint. A screen with nothing out of tolerance and no failed write shows no vermilion.
2. **Plan and reality are never drawn as one thing.** Where a surface shows an estimate and an actual, they stay visibly separate. § 9 is the full treatment.
3. **The six tab hues say *whose* work it is, never how it is going.** They are module identity and are never repurposed as status, role or decoration.
4. **The Thai rules in § 3 hold on every surface.**

## 2. Colors

### Structure

| Role | Value | Use |
|---|---|---|
| Canvas | `#FFFFFF` | Documents, panels, fields, the header bar, dialogs. |
| Paper | `#F6F5F4` | The page ground behind panels, sidebars, table header rows, code blocks. |
| Table head | `#E9EDF1` | The List's header rows: the Estimate / Actual band and the column heads, ruled off in `#D3DAE2`. A cool slate, so the heads read apart from the warm paper the table sits on. It is chrome, not a meaning: not selection (the blue wash), not the derived ink. |
| Hairline | `#E6E6E6` | 1px borders and dividers. |
| Field line | `#DDDDDD` | Input borders at rest. |
| Hover | `rgb(0 0 0 / 4%)` | The hover ground on quiet controls and rows. |

### Text

| Role | Value | Use |
|---|---|---|
| Ink | `rgb(0 0 0 / 95%)` | Headings and body, a soft true black. |
| Charcoal | `#31302E` | Secondary text, navigation links, section heads. |
| Stone | `#615D59` | Muted copy: metadata, breadcrumbs, hints, descriptions. |
| Ash | `#A39E98` | Captions and placeholders that may be faint. Never body text. |

### Action

| Role | Value | Use |
|---|---|---|
| Blue | `#0075DE` | The primary button's fill, links, focus rings, the caret, the current item in a navigation tree, text selection (at 20%). |
| Blue pressed | `#005BAB` | Hover and press on the primary button. |
| Blue wash | `#E7F1FB` | The current tree row, a pressed toggle. |

### Danger

| Role | Value | Use |
|---|---|---|
| Danger | `#C4362F` | Deleting something, and a refusal or validation message (a wrong password, a mismatch). The wash is `#FBECEB`, and the pressed state is `#A52C26`. |

**Rules that bind**

1. **One structural accent.** Blue is the only colour that paints an action or marks where you are. No second accent is introduced beside it.
2. **Danger is not vermilion.** Deletion and refusals use `#C4362F`, which is a different colour with a different meaning. Vermilion is kept for misclosure and failed writes (§ 1, law 1). In CSS, a rule that uses `--color-vermilion` must have every selector in its list name a misclosure or failed-write state as a class — a class ending in `slip`, `failed`, `errata` or `late` (`.slip`, `td.failed`, `.people-errata`, `.rs-late`), or the Timeline's `.brk.over` and `.over-fig` (a bare `over` would let `:hover` through); `tests/house-style.test.ts` holds every migrated stylesheet to it.
3. **Colour is never the sole carrier.** A state readable only by its hue is a bug. Every coloured state also has a word, a weight or a shape.
4. **Light only.** There is no dark theme. Notion's dark indigo "night" hero band is a marketing device, and this product has no use for it.
5. **No decorative palette.** Notion's multicolour sticker palette belongs to its marketing site. Here there are two extra palettes and each means one thing: the six tab hues (§ 9) are module identity, and the eight option colours (§ 9.2) are the value a status or select field holds.

## 3. Typography

**Face.** Inter (`--font-sans`) for Latin, then Anuphan (`--font-read`) for Thai, then `-apple-system, system-ui, 'Segoe UI', Helvetica, Arial`. Both are loaded once, by `next/font` in the root layout (`src/app/layout.tsx`). Code uses `ui-monospace, SFMono-Regular, Menlo, Consolas` (`--font-mono`). OpenType `lnum` and `locl` are on. **Figures** (dates, durations, variance) are Inter with `font-variant-numeric: tabular-nums`, so they column-align without a monospace face.

**Weights.** Body is 400, buttons are 500, and titles are 600–700. `font-synthesis-weight: none`. Anuphan is loaded up to 600, so a 700 heading takes Inter's real bold for Latin and Anuphan's 600 for Thai, never a smeared synthetic bold.

**Scale.** This is an application, so Notion's 54–64px marketing display sizes are not used.

| Role | Size | Weight | Line height | Tracking (Latin only) | Use |
|---|---|---|---|---|---|
| Page title | 34px | 700 | 1.35 | normal | A document's or a wiki's title. |
| Heading 1 | 26px | 700 | 1.23 | −0.625px | Index and screen headings. |
| Heading 2 | 22px | 700 | 1.27 | −0.25px | Panel and section titles. |
| Title | 17–20px | 600 | 1.4 | −0.125px | Settings sections, dialog heads. |
| Prose | 16px | 400 | 1.75 | 0 | Long reading text in documents. |
| Body | 15px | 400 | 1.5 | 0 | Default interface copy, dense rows. |
| Button | 14–16px | 500 | 1.5 | 0 | Button labels. |
| Caption | 13–14px | 400 | 1.43 | 0 | Metadata, footnotes. |
| Eyebrow | 12px | 600 | 1.33 | +0.125px | Fixed English captions: the List's band, the Timeline's scale, small labels. Sentence case, never uppercase. A column head holds a user-written name, so it is 13px with no tracking. |

**Thai discipline.** These rules override Notion wherever the two meet.

- Notion tracks headlines tight, but anything that can hold Thai keeps `letter-spacing: normal`. Only English chrome is tracked.
- Thai is never uppercased, and never set below 13px.
- Thai tone marks need headroom. Never set a line height below 1.5 on a run that can hold Thai, except single-line headings at 1.35.

## 4. Layout

- **Spacing.** The base unit is 8px. The steps are 4, 8, 12, 16, 24, 28 and 32px. Panels pad at 24px. Utility buttons pad at `4–6px 14px`. Fields pad at 6–8px.
- **Shell.** A white header bar across the top. Navigation trees (Docs, Wiki) sit on the left on paper, sticky against a long page. Content takes the rest.
- **Measure.** Reading text sits in a centred 760px column. Forms, settings and token pages sit in a 780px column.
- **Editing takes the width.** When a document is being edited (from 751px up), the editor, its title and its Done bar stretch across the whole content area with `padding-inline: 5%` per side. Writing needs room more than it needs a reading measure.
- **Whitespace groups.** Sections separate by vertical space before rules. Larger gaps go above a heading than below it.
- **Breakpoints.**
  - 750px and below is the phone layout. Sidebars become toggled panels, rows of controls stack, and tables become one record per row.
  - Below 650px, dialog actions go full width.
  - Touch targets stay at least 34px tall, aiming for 44px.

## 5. Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0, flat | A 1px hairline, no shadow | Panels and table wraps on paper. The default. |
| 1, soft | `rgb(0 0 0 / 1%) 0 .175px 1.041px, rgb(0 0 0 / 2%) 0 .8px 2.925px, rgb(0 0 0 / 2.7%) 0 2.025px 7.847px, rgb(0 0 0 / 4%) 0 4px 18px` | Focused fields, the secondary pill. |
| 2, raised | `rgb(0 0 0 / 1%) 0 1px 3px, rgb(0 0 0 / 2%) 0 3px 7px, rgb(0 0 0 / 2%) 0 7px 15px, rgb(0 0 0 / 4%) 0 14px 28px, rgb(0 0 0 / 5%) 0 23px 52px` | Dialogs, popovers, the formatting bar. |

Shadows are many near-transparent layers, so a surface feels gently lifted off the paper rather than dropped. Most surfaces rely on the hairline alone. A modal's backdrop is black at 40%.

**Motion.** It is short and quiet.

- Buttons and fields ease background, border and shadow over 120ms.
- A dialog rises 6px and scales from 0.98 over 180ms on `cubic-bezier(.16, 1, .3, 1)`, and its backdrop fades in.
- `prefers-reduced-motion` removes entrance animations.

## 6. Shapes

| Radius | Value | Use |
|---|---|---|
| xs | 4px | Inputs, selects, textareas, code blocks. |
| sm | 5px | Tree rows, menu items, navigation links. |
| md | 8px | Utility buttons, the formatting bar, inset blocks, confirmations. |
| badge | 6px | Every badge: option and status chips, module tags, the misclosure slip, flags, account states, report tags. |
| lg | 12px | Panels, settings sections, table wraps. |
| xl | 16px | Dialogs, empty states. |
| full | 9999px | The primary button and paired dialog actions. |

**Focus.** Buttons and links take a 2px blue outline offset by 2px. Fields turn their border blue and add a 3px blue ring at 16% plus the level-1 shadow.

## 7. Components

**Buttons**

- **Primary.** A blue pill with a white label, padded `6px 18px`. There is one per view, for the act the view exists for.
- **Secondary.** A white pill with an ink label, lifted by the level-1 shadow. It is used beside a primary, as Cancel in a dialog.
- **Utility.** White, an 8px radius, a hairline border and an ink label. It is used for everyday controls.
- **Quiet.** Transparent with a Stone label, turning to the hover ground and ink on hover. It is used for tree menus, close buttons and save-bar actions.
- **Danger.** Red text on white. Its armed confirmation is filled red. It is only ever used for deletion.

**Fields.** A white ground, a `#DDDDDD` border, a 4px radius and 6–8px padding. Labels sit above the field and are never only a placeholder. A document's title is typed in place: no border, no ground, no shadow, set in the page-title style.

**Panels.** A white ground, a hairline border, a 12px radius and 24px padding, sitting on paper. A settings page is a stack of them, one per section.

**Tables.** A white panel with a 12px radius. The header row is paper, with 12px/600 Stone captions. Cells pad at `12px 16px` with hairline rules, and the last row has none. A row's link is ink and 600, turning blue and underlined on hover.

**Dialogs.** A white sheet, `min(520px, 100vw − 32px)` wide, with a 16px radius and the level-2 shadow. The head is padded `20px 16px 4px 24px`, and the actions sit right-aligned at the foot.

**Prose.**

- Links are blue, underlined at 40% alpha with a 3px offset.
- Code blocks sit on paper with a 4px radius, padded `14px 16px`.
- Inline code sits on a warm-grey 15% wash.
- A blockquote is a 3px ink rule on the left.

**Navigation tree.** Rows have a 5px radius and Charcoal text. The current row is the blue wash with blue text.

**Badges.** One shape for every small label that names a value or a state (decided by the owner 2026-11-05, from a reference of pastel chips such as "Dashboard" and "Mobile App"; made vivid the same day):
- a 6px radius (`--radius-badge`), about 22–24px tall, padded `0 8px`;
- every colour in the badge is its hue **re-lit in OKLCH** at a fixed lightness, keeping most of its chroma: `oklch(from <hue> L calc(c * k) h)`. A mix into white (`color-mix`) keeps only its own share of the chroma, so a 30% wash came out grey-pastel and a label mixed toward charcoal came out grey-brown;
- a bright wash at L 0.92, chroma × 0.62;
- a 1px border at L 0.76, chroma × 0.95, darker than the wash, so the badge still reads as a shape in greyscale;
- a label at L 0.43, chroma × 0.85: the hue itself, deep, clearing 5.9:1 on its own wash on all six tab hues;
- **one exception, by weight not shape: the option chip is drawn solid** (owner, 2026-11-05) — a fill of its own option colour (§ 9.2, not a module hue), that colour's ink, and a 1px border a shade darker than the fill (`calc(l - 0.08)`). Module tags stay light. A status and a module therefore never look alike: one is a solid block, the other a bright tint;
- 13px and no tracking wherever the label can be Thai (11–12px only for fixed English words).

The colour comes from what the badge means, never from decoration: a module's tab hue (always mixed or re-lit, never raw), an option's own option colour (§ 9.2), danger for a caution or a deactivated account, the derived blue-black for a pending invitation, vermilion only for a misclosure slip. **Flags** such as "Archived" are the neutral badge: paper wash, hairline border, Stone 12px/600 text. A flag is a word, not a colour.

**Empty state.** A paper or white panel with a 16px radius, 32px padding, a short heading and one line saying what to do next. It has no illustration.

## 8. Do's and Don'ts

**Do**

- Keep the page on warm paper and put documents, panels and fields on white.
- Reserve blue for the primary action, links, focus and the current place.
- Define surfaces with a hairline and, only when something floats, the layered shadow.
- Use a pill for the primary action and 8px for utility buttons, and keep fields at 4px.
- Keep body at 400, and let 600–700 belong to headings.
- Keep vermilion out of every surface that has nothing out of closure.

**Don't**

- Don't introduce a second accent colour, or paint an action in a tab hue.
- Don't use vermilion for validation errors, refusals, deletion, brand or hover. A failed write is the one error it names.
- Don't drop heavy, single-layer shadows or use glassmorphism.
- Don't put pill radii on fields.
- Don't track, uppercase or set below 13px anything that can hold Thai.
- Don't build a dark theme.

---

## 9. The meaning laws in the chart and the List

The product exists to show plan against reality. The house style decides how a screen looks; this section decides what may never be lost while it looks that way. It applies wherever an estimate meets an actual: the Timeline (`timeline/timeline.css`), All Timeline, the roster (`timeline/roster.css`, which imports the Timeline's bars), and the List (`list.css`). Around them, the header bar, toolbars, filters, menus and dialogs are plain house style.

### 9.1 The idea: the surveyor's T-Timeline

The product took the name on 2026-09-07. A levelling field book is the one everyday artifact that already solves this product's problem.

- A surveyor walks a line, books each measured value into a pre-ruled column, and carries a running reduced level forward.
- At the end of the run they arrive at a point whose height is already known. The difference between what they computed and what is true is the **misclosure**.
- The misclosure is written in red. It is never erased, and the run is never quietly adjusted to hide it.

`estimate` is the booked plan, `actual` is the observed measurement, and the difference between them is a misclosure. The chart exists to show it, not absorb it. A parent's baseline against its children's roll-up is the same check one level up. The field book's look is retired; this idea is not.

**Staging: the carried object.** The selected node stays fixed and identical while the surrounding tool changes. Moving from List to Timeline does not navigate away from the task; it changes the instrument pointed at it. Selection, scroll anchor and expansion state survive the switch. Selection is a place, not a verdict, so it is drawn in the house blue wash with a 2px blue leading edge.

### 9.2 The meaning tokens

They sit in the frontmatter beside the house tokens, with frozen names and values.

| Token | Value | Meaning |
|---|---|---|
| `ink-graphite` | `#2A2622` | A value a person entered: an entered date in a cell, the baseline bracket. |
| `ink-blue` | `#24384F` | A value the system captured or derived: the actual bar, a derived cell. |
| `ink-blue-soft` | `#5C7186` | The derived ink's secondary weight: the actual bar's hairline, secondary derived text. |
| `vermilion` | `#A82A17` | **Out of closure only:** an overrun, a roll-up past its baseline, a failed write. |
| `vermilion-wash` | `#EED9CE` | The slip or errata band behind a vermilion figure or message. |
| `datum` | `#1F4A3D` | Today. |
| `tab-1`…`tab-6` | `#F59E0B` amber (moved from orange toward amber on 2026-11-05, further from vermilion), `#EC4899` pink, `#22A55A` green, `#0EA5A4` teal, `#3B82F6` blue, `#8B5CF6` violet | Module identity. Vivid by the owner's decision (2026-11-05); every one keeps the actual bar ≥74 from vermilion under A8, and none is a red. |
| `option-1`…`option-8` | `#EA011A` red, `#F9D105` yellow, `#057DA9` sky, `#00882F` green, `#70757C` grey, `#393E43` dark grey, `#F97605` orange, `#D82784` pink — each with an `option-n-ink` (white; deep brown on the two bright fills, `#472D00` on yellow and `#4B1F08` on orange) | The value a status or select option holds, drawn as a solid chip (owner, 2026-11-05). A new option takes the next colour in this order, so a field's first option is red. **A status has one colour in every project, by its label:** BACKLOG red (1), ONPROCESS yellow (2), WAIT_TEST sky (3), COMPLETED green (4), HOLD grey (5), CANCELLED and CANCEL dark grey (6), RE_PROCESS orange (7), RETEST pink (8). A new project starts with these eight statuses (`DEFAULT_STATUS_OPTIONS`); projects made while the wheel had six colours were repainted to match by `db/migrations/023_status_colours.sql` and `024_status_colours_by_label.sql` — colour only, in the designated status field (task and defect), with no option added, renamed or re-staged. Other select fields keep the colour they were dealt. The red is a pure red, not brick: every option fill stays 0.10 or more from vermilion in OKLab, checked by `tests/house-style.test.ts`. These are never module identity, and the tab hues are never an option. |

Headings, labels and body copy that nobody entered as a value use the house ink, not graphite. Graphite and blue-black are for *values*, and they read as two inks next to each other in a row.

### 9.3 The laws, as drawn

1. **Vermilion is never decoration.** If red appears where nothing is out of tolerance and no write failed, the screen is lying.
   - In the chart: only the overhang of a roll-up bracket past its baseline (`.brk.over`), the signed overrun figure (`.over-fig`), and on the roster the 3px trailing edge of an actual that ran past its plan (`.rs-late`).
   - In the List: the misclosure slip (`.slip`), a cell whose save failed (`td.failed`), and the errata bands (`.errata`, `.title-errata`).
   - In the task modal, profile, `/people` and the auth pages: only the band that says a save did not land. Wrong credentials, mismatches and validation hints are danger red.
   - Overload on the roster (a person holding four things at once) is **not** vermilion. It is a fact about a schedule, not a measurement that failed a check.
2. **Two inks carry the audit trail.** Graphite means a person put it there; blue-black means the system derived or captured it. A user overriding an automatic actual turns it from blue-black to graphite, so the colour change *is* the audit trail. In the List, `.entered` and `.computed` hold the two, and the band's Estimate and Actual captions take the same two inks.
3. **Tab hues say *whose*, never *how it is going*.**
   - They are always mixed into the canvas or the ink, never laid down raw. A raw `tab-1` lands close enough to vermilion to be misread; `tests/e2e/acceptance.test.ts` A8 computes that distance and fails if the mix is removed.
   - They are never a row tint, a status, a role or a decoration.
4. **A chosen option is stated in its own colour.** An option chip (status and selects) is the house badge (§ 7):
   - a 6px radius, 22px tall;
   - drawn solid, apart from the light module tag: a fill of its option colour (`option-1`…`option-8`) as it is — the option palette is picked to be drawn raw, the module hues are not;
   - a 1px border of the fill a shade darker (`oklch(from <fill> calc(l - 0.08) c h)`), so it still reads as a chip in greyscale;
   - a label in that colour's ink (`option-n-ink`): white on every fill but yellow and orange, which are drawn bright and take a deep brown; each clears 4.5:1, and `tests/house-style.test.ts` computes it;
   - 13px and no tracking, because labels are Thai.
5. **Colour is never the sole carrier.** Estimate and actual differ by *position, height and fill* before they differ by ink. A misclosure carries a `+`/`−` sign and a figure, not only red.

### 9.4 Bars and marks in the chart

- **The estimate bar** sits above, 9px tall: a 1px border of the module hue mixed toward Stone, a fill of the hue at 26% in the canvas, and a 45° pencil hatch over it. Pencil, not ink.
- **The actual bar** sits below, 11px tall: solid, the module hue mixed 60% into `ink-blue` so it stays ink rather than a bright block, with a hairline of the hue mixed toward `ink-blue-soft`.
- **A8 reads these two rules** (`.bar.est`, `.bar.act`) as the first of their kind in `timeline.css`. Nothing may precede them with an override.
- **Radius.** Bars round at 3px at most (guarded). A full pill at 9px tall eats the leading edge, and the leading edge is where a run starts.
- **The leading 3px** of each bar is the module hue mixed 45% into `ink-blue`, deeper than either fill.
- **A milestone** (an end with no start, D-12) is a 9px diamond: hollow for a plan, filled for a record.
- **Non-working days** are a paper (`#F6F5F4`) band behind every bar, running the full height. Bars cross it rather than breaking, because the product stores calendar dates and computes working days as a lens.
- **Today** is a 1px `datum` rule, capped in the scale in datum ink. Not blue: blue means action.
- **The baseline mark.** A parent's hand-entered baseline is a graphite bracket above its row. Its children's roll-up extent is a lighter Stone bracket below. Where the roll-up overhangs the baseline, that overhang alone is vermilion, with the signed figure beside it.
- **Dragging a bar** tracks the pointer 1:1 with no transition, then snaps to its day on release. A dashed ghost holds the original position while dragging.
- **Rows** are 34px in the chart, and module rows 44px. A module row's name cell takes a 9% wash of its hue and a 3px spine. The scale's month captions are the eyebrow (12px/600, sentence case), and day numbers are 11px tabular Inter.
- **Motion** is the house's: 120ms ease on controls. There is no `steps(2)`.

### 9.5 The List

- **An airy table.** Rows are 40px, cells pad `8px 12px`, rows part on hairlines, and no rule is drawn between columns. Row text is 14–15px. Column heads are 13px on the slate table head (`#E9EDF1`, ruled in `#D3DAE2`), which sets them apart from the paper around the table; 13px because a column's name is user-written and can be Thai.
- **The Estimate / Actual / Variance band** stays above the column heads as a grouped header. It is the only thing on the page that says which dates are the plan and which are the record.
- **Estimate and actual are separate columns**, in the two inks.
- **The misclosure** is a vermilion slip with a signed figure, in the badge shape: a quiet wash (vermilion re-lit to L 0.94, chroma × 0.3), and a 1px border and a 600-weight figure in vermilion itself, 6px corners. It parts from the bright module tags by its ink, not its wash: a tag's border is its hue re-lit light, so a warm module tag is never mistaken for a misclosure, nor louder than one.
- **Module identity** is the badge on the module row (the hue re-lit as every badge is, § 7) and a 2px hairline of the mixed hue down the indent, never a row tint.
- **No zebra striping, and no row tint by status.** Hover is the house hover ground; selection is the blue wash.

### 9.6 Do's and Don'ts

- Do keep graphite for human entry and blue-black for machine derivation.
- Do set every figure in tabular Inter.
- Do keep estimate above actual, and draw them as different shapes, not only different inks.
- Don't use vermilion for anything that is not out of closure or a failed write. Breaking this rule destroys the product's meaning.
- Don't round a bar past 3px, or give a badge a raw fill, a full-pill radius or a shadow.
- Don't use a raw tab hue, or let one tint a row's ground.
- Don't draw a bar in the house blue: blue is action, and a bar is a measurement.

---

## 10. Status after the migration

The restyle to the house style finished on 2026-11-05. Every surface below reads the generated tokens, and none carries a private palette.

- **Tokens.** The frontmatter is the house set plus the meaning tokens. The field book's tokens (`page`, `page-edge`, `board`, `rule`, `rule-major`, `ink-graphite-soft`, the `none` and `hole` radii, the `row` space) and its faces (Martian Mono, Bai Jamjuree, and the `--font-struct` and `--font-figure` bridges) are retired. `tests/house-style.test.ts` fails if any of them comes back.
- **Fonts.** Inter (`--font-sans`) and Anuphan (`--font-read`) are loaded once, in the root layout.
- **Shell and shelf.** A white header bar on paper. The primary action is a blue pill.
- **List.** The airy table of § 9.5: 40px rows, module tags drawn light (the hue re-lit in OKLCH: wash L 0.92, border L 0.76, label L 0.43) and option chips drawn solid in the option palette (§ 9.2) with each colour's ink, 6px corners, 13px column heads.
- **Timeline and All Timeline.** House chrome around the bars of § 9.4: the estimate 9px and hatched above, the actual 11px and solid below, radius ≤ 3px, today in datum, non-working days on paper.
- **The task modal** (opened from All Timeline and from the Calendar) is a house dialog: a 16px radius, the level-2 shadow and a primary pill.
- **Docs, Wiki and the published links** (`/d/`, `/w/`) share one skin on `.book.docs-book`, which binds the sheet's local names to the house tokens. Deleting a page draws in danger.
- **`/people`, profile, project settings, report, the bell and the invite link** are house panels, tables, fields and buttons. Roles on `/people` are weight and italics, never a hue. Deletion is danger.
- **Auth pages** (`/sign-in`, `/set-password`, `/change-password`) are a centred white panel on paper with a 16px radius and the level-2 shadow. Refusals are danger; a write that did not land is the vermilion errata.
- **Figures** are Inter with `tabular-nums` everywhere. **Labels** are the eyebrow, never uppercase.

**What guards it.** `tests/house-style.test.ts` (static, in `npm run check`); `tests/e2e/house-style.browser.test.ts` (no sideways scroll at 390px, a white header and a visible focus ring at 1440px, deletion in danger); acceptance A8 (the bar distinction and the hue distance); and `npm run test:calendar-look` (§ 11).

---

## 11. Calendar — a scoped exception

The Calendar view (`src/app/(signed-in)/p/[slug]/calendar/`) keeps its Google-Calendar look: its own header with the calendar logo, the mini-month sidebar, round day buttons, and the day, week and month grid in its own blue (`#245FC4`) on `#F8FAFD`. **This is the owner's decision, made on 2026-11-05**, when the rest of the product moved to the house style. People read a calendar by the conventions of the one they already use, and this view trades consistency for that recognition.

- **What is fixed.** `calendar.css` and the Calendar's markup do not change. The stylesheet may only gain *pins* inside `.cal-page`: rules that restate what it used to inherit from the old base (its face, leading, square controls and selection colour), so that changes to `globals.css` do not reach it.
- **What still applies.** The meaning laws hold here too. Estimate and actual stay separate (a dashed outline against a solid fill), a module's hue identifies the module and never its status, and the Thai rules hold.
- **What follows the house style.** The pieces the Calendar shares with the rest of the product: the notification bell, and the task modal it opens.
- **What guards it.** `tests/e2e/calendar-look.browser.test.ts` (`npm run test:calendar-look`) compares the Calendar's computed look against a pinned fixture. Never regenerate that fixture to make a change pass: a difference means the exception has drifted.
- **What it is exempt from.** The house-style guard's retired-token check skips `calendar.css`.
