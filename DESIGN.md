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
  # Meaning tokens — frozen names and values; they say what a value is.
  ink-graphite: "#2A2622"
  ink-blue: "#24384F"
  vermilion: "#A82A17"
  vermilion-wash: "#EED9CE"
  datum: "#1F4A3D"
  tab-1: "#B0503C"
  tab-2: "#C08A2E"
  tab-3: "#5B7A3A"
  tab-4: "#2E6E74"
  tab-5: "#3A5A94"
  tab-6: "#6B4A87"
  # Field-book aliases, kept so existing var()s resolve. Removed in the restyle's last task.
  page: "#FFFFFF"
  page-edge: "#F6F5F4"
  board: "#F6F5F4"
  rule: "#E6E6E6"
  rule-major: "#E6E6E6"
  ink-graphite-soft: "#615D59"
  ink-blue-soft: "#5C7186"
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
  lg: "12px"
  xl: "16px"
  full: "9999px"
  # Aliases, removed with the colour aliases.
  none: "0px"
  hole: "50%"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "28px"
  xxl: "32px"
  # Alias, removed with the colour aliases.
  row: "34px"
---

# Design

> **Reading this file.** The body describes two layers. **The house style** (§ 1–8) is the Notion language, and every surface follows it. **The Timeline** (§ 9) keeps the surveyor's field book, because it is the one surface whose job is to show plan against reality.
>
> The YAML frontmatter above still holds the field-book tokens, and `scripts/tokens.mjs` still generates `src/app/tokens.css` from them. It was left as it is on purpose: this merge changed the document, not the app. The house-style values are in the tables below, and they are already implemented as the `--nt-*` variables at the end of `src/app/(signed-in)/wiki/wiki.css`. Moving the frontmatter over to them is a separate, code-changing step.
>
> **Merged 2026-11-05, at the owner's request**, from `notion/DESIGN.md`. The Notion language had been adopted for the Wiki on the same day; it is now the house style. Before this, the field book was the design of the whole product.

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

1. **Vermilion (`#A82A17`) means out of closure and nothing else.** It is not a brand colour, not a primary button, not a hover state and not an error colour. A screen with nothing out of tolerance shows no vermilion.
2. **Plan and reality are never drawn as one thing.** Where a surface shows an estimate and an actual, they stay visibly separate. § 9 is the full treatment.
3. **The six tab hues say *whose* work it is, never how it is going.** They are module identity and are never repurposed as status, role or decoration.
4. **The Thai rules in § 3 hold on every surface.**

## 2. Colors

### Structure

| Role | Value | Use |
|---|---|---|
| Canvas | `#FFFFFF` | Documents, panels, fields, the header bar, dialogs. |
| Paper | `#F6F5F4` | The page ground behind panels, sidebars, table header rows, code blocks. |
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
| Danger | `#C4362F` | Irreversible acts only: deleting something. The wash is `#FBECEB`, and the pressed state is `#A52C26`. |

**Rules that bind**

1. **One structural accent.** Blue is the only colour that paints an action or marks where you are. No second accent is introduced beside it.
2. **Danger is not vermilion.** Deletion uses `#C4362F`, which is a different colour with a different meaning. Vermilion is kept for misclosure (§ 1, law 1).
3. **Colour is never the sole carrier.** A state readable only by its hue is a bug. Every coloured state also has a word, a weight or a shape.
4. **Light only.** There is no dark theme. Notion's dark indigo "night" hero band is a marketing device, and this product has no use for it.
5. **No decorative palette.** Notion's multicolour sticker palette belongs to its marketing site. Here, the six tab hues (§ 9) are the only extra colours, and they mean module identity.

## 3. Typography

**Face.** Inter (`--font-wiki`) for Latin, then Anuphan (`--font-read`) for Thai, then `-apple-system, system-ui, 'Segoe UI', Helvetica, Arial`. Code uses `ui-monospace, SFMono-Regular, Menlo, Consolas`. OpenType `lnum` and `locl` are on. The Timeline keeps its own faces (§ 9).

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
| Eyebrow | 12px | 600 | 1.33 | +0.125px | Table header captions, small English labels. |

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
| xs | 4px | Inputs, selects, textareas, code blocks, inline chips. |
| sm | 5px | Tree rows, menu items, navigation links. |
| md | 8px | Utility buttons, the formatting bar, inset blocks, confirmations. |
| lg | 12px | Panels, settings sections, table wraps. |
| xl | 16px | Dialogs, empty states. |
| full | 9999px | The primary button, paired dialog actions, flags and badges. |

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

**Flags.** A small hairline pill with 12px/600 Stone text, such as "Archived". A flag is a word, not a colour.

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
- Don't use vermilion for errors, deletion, brand or hover.
- Don't drop heavy, single-layer shadows or use glassmorphism.
- Don't put pill radii on fields.
- Don't track, uppercase or set below 13px anything that can hold Thai.
- Don't build a dark theme.

---

## 9. The Timeline — the field book, kept

The Timeline keeps the design it was built with. It is the surface where plan and reality are booked side by side, and every rule below exists to keep those two legible against each other. Restyling it to the house style would cost exactly that. The frontmatter tokens (`page`, `ink-*`, `vermilion`, `datum`, `tab-1`…`tab-6`) are its tokens.

Around the Timeline (the header bar, the view switcher, menus, dialogs, and the project chrome), the house style applies. Inside the chart, this section applies.

### 9.1 The idea: the surveyor's T-Timeline

The product took the name on 2026-09-07. A levelling field book is the one everyday artifact that already solves this product's problem.

- A surveyor walks a line, books each measured value into a pre-ruled column, and carries a running reduced level forward.
- At the end of the run they arrive at a point whose height is already known. The difference between what they computed and what is true is the **misclosure**.
- The misclosure is written in red. It is never erased, and the run is never quietly adjusted to hide it.

That is the Timeline. `estimate` is the booked plan, `actual` is the observed measurement, and the difference between them is a misclosure. The chart exists to show it, not absorb it. A parent's baseline against its children's roll-up is the same check one level up.

**Staging: the carried object.** The selected node stays fixed and identical while the surrounding tool changes. Moving from List to Timeline does not navigate away from the task; it changes the instrument pointed at it. Selection, scroll anchor and expansion state survive the switch.

### 9.2 Colours inside the chart

| Role | Token | Value | Use |
|---|---|---|---|
| Page | `page` | `#EDE5D2` | The chart's ground. |
| Page edge | `page-edge` | `#DED2B6` | Non-working-day bands. |
| Rule | `rule` | `#C58C7C` | Gridlines between rows and days. |
| Major rule | `rule-major` | `#B0503C` | Week and month boundaries, the scale's closing rule. |
| Graphite | `ink-graphite` | `#2A2622` | Values a person entered, including the baseline bracket. |
| Graphite soft | `ink-graphite-soft` | `#6B6357` | Estimate bar outlines, scale captions, the roll-up bracket. |
| Blue-black | `ink-blue` | `#24384F` | Values the system captured or derived: the actual bar. |
| Blue-black soft | `ink-blue-soft` | `#5C7186` | The actual bar's hairline and secondary derived text. |
| Vermilion | `vermilion` | `#A82A17` | **Misclosure only.** Overrun beyond the estimate, or a roll-up past its baseline. |
| Vermilion wash | `vermilion-wash` | `#EED9CE` | The errata slip behind a misclosure figure. |
| Datum | `datum` | `#1F4A3D` | Today's line. |
| Tab 1–6 | `tab-1`…`tab-6` | see frontmatter | Module identity on the bars. |

**Rules that bind inside the chart**

1. **Vermilion is never decoration.** If red appears where nothing is out of tolerance, the chart is lying.
2. **Two inks carry meaning.** Graphite means a person put it there. Blue-black means the system derived or captured it. A user overriding an automatic actual turns it from blue-black to graphite, so the colour change *is* the audit trail.
3. **Tab hues say *whose*, never *how it is going*.**
   - A module's hue appears as the leading 3px of both bars, and mixed into the bars' fills.
   - It is always mixed into the page or the ink, never used raw. A raw `tab-1` lands close enough to vermilion to be misread.
   - `tests/e2e/acceptance.test.ts` A8 computes that distance, and fails if the mix is removed.

   (Amended 2026-09-07, at the user's request, to let hue into the field at all. The amendment kept hue mixed and corners square.)

   **3b. A chosen option is stated in its own colour.** Where an option chip is drawn inside the chart, it is a square-cornered chip:
   - its hue mixed 17% into the page;
   - a 2px bar of the full hue on its leading edge;
   - a label darkened toward graphite until it clears 4.5:1.

   It is not a pastel pill.
4. **Light only.**
5. **Colour is never the sole carrier.** Estimate and actual differ by *position and height* before they differ by ink. Misclosure carries a `+`/`−` sign and a figure, not only red.

### 9.3 Type inside the chart

- **Martian Mono** is for figures: dates, durations, misclosure values. It is tabular (`tnum`), so numbers align by construction.
- **Bai Jamjuree** is for the date scale's captions. It is set in English caps at label size with `0.13em` tracking, and never applied to Thai.
- **Anuphan** is for task names on rows.
- The Thai rules (§ 3) hold.

### 9.4 Shapes and marks

- **The chart is square.** Bars, slips, brackets and bands have no radius. A ruled book has no rounded corners.
- **The estimate bar.** It sits above the actual bar in the same row, with a 2px gap between them.
  - 9px tall.
  - A 1px `ink-graphite-soft` outline.
  - A 45° hatch fill at 12%: pencil, not ink.
- **The actual bar.** It sits below the estimate bar.
  - 13px tall.
  - A solid `ink-blue` fill, mixed with the module hue as rule 3 describes.
- **The leading 3px** of each bar is the module's tab hue, mixed.
- **Non-working days.** A `page-edge` vertical band runs the full height of the run behind all bars. Bars cross it visibly rather than breaking, because the product stores calendar dates and computes working days as a lens.
- **Today.** A 1px `datum` vertical rule, with the date in a small-caps label at its head.
- **The baseline mark.**
  - A parent's hand-entered baseline is a graphite bracket drawn above its row: two vertical ticks joined by a hairline.
  - Its children's roll-up extent is a second, lighter bracket.
  - Where the roll-up bracket overhangs the baseline, that overhang alone is vermilion.
- **The misclosure slip.** A `vermilion-wash` slip carrying a signed figure in vermilion Martian Mono, such as `+4d` or `−2d`. It is inset like an errata slip pasted into a book, and never fills edge to edge.
- **Depth is ply, not blur.** Inside the chart, a selected row takes a 1px graphite box rather than a lift, and nothing casts a shadow.

### 9.5 Motion and behaviour

- **Dragging a bar** tracks the pointer at 1:1 with no smoothing, then steps to its snapped day on release.
- **Other state changes in the chart** are a two-frame step at 90ms (`steps(2)`). Nothing eases and nothing fades. `prefers-reduced-motion` applies the end state at once.
- **The Timeline never reflows to vertical.** On a narrow screen it scrolls, with the date scale pinned.
- **The chrome holds the viewport, and only the run scrolls**, so the scale, the project name and the view tabs stay on their edges at row 174.

### 9.6 Do's and Don'ts inside the chart

- Do keep graphite for human entry and blue-black for machine derivation.
- Do set every figure in tabular Martian Mono.
- Do keep estimate above actual, and draw them as different shapes, not only different inks.
- Don't use vermilion for anything not out of tolerance. Breaking this rule destroys the product's meaning.
- Don't round a bar, a slip or a band.
- Don't use a raw tab hue, or let one tint a row's ground.
- Don't redraw the chart in the house style's blue: blue is action, and nothing in the chart is a button.

---

## 10. Migration status

This merge changed the document only. As of 2026-11-05, these surfaces still wear an earlier look in code, and are expected to move to the house style when they are next touched:

- **List view.** It wears the field book and the ClickUp-style sheet (`list.css`, the `--cu-*` palette). Its chips, misclosure column and ink law are plan-against-reality marks, and they keep their meaning (§ 1 laws). The rest of its chrome moves to the house style.
- **Docs.** It wears the Docs sheet (`docs.css`, `editor.css`). It moves by the same variable rebinding the Wiki uses.
- **`/people`.** It wears the List sheet, with roles shown by weight and italics, never hue.
- **Auth pages** (`/sign-in`, `/set-password`, `/change-password`). They wear a split card with an indigo field (`auth.css`), and indigo `#2B3A8F` is the old product base (`--brand` in `globals.css`). Under the house style, the base blue is `#0075DE`.
- **The public `/w/` link.** It wears the Docs sheet.

The Wiki is already in the house style: `.wiki-book` in `src/app/(signed-in)/wiki/wiki.css`, loaded with Inter in `src/app/(signed-in)/wiki/layout.tsx`.
