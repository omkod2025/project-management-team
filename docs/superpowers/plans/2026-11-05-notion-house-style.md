# Notion House Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every screen except the Calendar view in the Notion language, driven from the `DESIGN.md` frontmatter. The three meaning laws are kept.

**Architecture:**
- **Task 2 flips the source of truth in one move.** The frontmatter becomes the Notion token set. Every retired field-book token is kept for now as an alias that resolves to its Notion value, so the whole app re-inks at once and nothing references an undefined variable.
- **Tasks 3–8 reshape one surface each**: radii, shadows, density, type and deletion colour. Each task adds its stylesheets to a static guard test, `tests/house-style.test.ts`, which goes red first.
- **Task 9 removes the aliases** and rewrites the docs.
- **A computed-style fingerprint of the Calendar** is captured before anything changes, and is re-checked after every task.

**Tech Stack:** Next.js (App Router), plain CSS files, `next/font/google`, `node:test` with type stripping, Playwright (`chromium` with `channel: 'msedge'`) for browser tests.

**Spec:** `docs/superpowers/specs/2026-11-05-notion-house-style-design.md`. Read it first; this plan argues from it.

## Global Constraints

- **Read `CLAUDE.md` before starting.** Invoke `ouan-react-best-practice` and `impeccable` before writing code, and read `node_modules/next/dist/docs/` before touching `next/font` or layouts.
- **`src/app/tokens.css` is generated.** Change the `DESIGN.md` frontmatter, then run `node scripts/tokens.mjs`. Never hand-edit `tokens.css`. The frontmatter must stay within the generator's subset: two levels of `key: value`, scalar leaves, quoted strings.
- **Meaning tokens keep their names and exact values:** `ink-graphite: "#2A2622"`, `ink-blue: "#24384F"`, `vermilion: "#A82A17"`, `vermilion-wash: "#EED9CE"`, `datum: "#1F4A3D"`, `tab-1: "#B0503C"`, `tab-2: "#C08A2E"`, `tab-3: "#5B7A3A"`, `tab-4: "#2E6E74"`, `tab-5: "#3A5A94"`, `tab-6: "#6B4A87"`.
- **House values.** These are the defaults; the per-surface tasks only override them where noted.

  | | |
  |---|---|
  | `canvas` | `#FFFFFF` |
  | `paper` | `#F6F5F4` |
  | `hairline` | `#E6E6E6` |
  | `field-line` | `#DDDDDD` |
  | `ink` | `#000000F2` (95% black) |
  | `ink-secondary` | `#31302E` |
  | `ink-muted` | `#615D59` |
  | `ink-faint` | `#A39E98` |
  | `primary` | `#0075DE` |
  | `primary-active` | `#005BAB` |
  | `primary-wash` | `#E7F1FB` |
  | `danger` | `#C4362F` |
  | `danger-active` | `#A52C26` |
  | `danger-wash` | `#FBECEB` |
  | Radii | `xs 4px`, `sm 5px`, `md 8px`, `lg 12px`, `xl 16px`, `full 9999px` |
  | Spacing | `xxs 4px`, `xs 8px`, `sm 12px`, `md 16px`, `lg 24px`, `xl 28px`, `xxl 32px` |
  | Shadow 1 | `rgb(0 0 0 / 1%) 0 .175px 1.041px, rgb(0 0 0 / 2%) 0 .8px 2.925px, rgb(0 0 0 / 2.7%) 0 2.025px 7.847px, rgb(0 0 0 / 4%) 0 4px 18px` |
  | Shadow 2 | `rgb(0 0 0 / 1%) 0 1px 3px, rgb(0 0 0 / 2%) 0 3px 7px, rgb(0 0 0 / 2%) 0 7px 15px, rgb(0 0 0 / 4%) 0 14px 28px, rgb(0 0 0 / 5%) 0 23px 52px` |

- **Type.** The family is `var(--font-sans), var(--font-read), -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif`, where `--font-sans` is Inter, loaded once in the root layout.
  - Sizes: body 15px/400/1.5, prose 16px/1.75, headings 22–34px/700, title 17–20px/600, eyebrow 12px/600 with `+0.125px` tracking (English only).
  - Figures use `font-variant-numeric: tabular-nums`.
  - Code uses `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- **Motion.** Buttons and fields take 120ms ease. Dialogs take 180ms `cubic-bezier(.16, 1, .3, 1)`. No `steps(2)`. Keep the global `prefers-reduced-motion` reset.
- **Thai.** No `letter-spacing` other than `normal`/`0` and no `text-transform: uppercase` on anything that can hold Thai. Never set Thai below 13px. Keep the `:lang(th)` block in `globals.css`.
- **Vermilion is allowed only on misclosure and failed-write states.** In CSS, that means a rule using `--color-vermilion` must have a selector matching `/slip|failed|errata|over|late/`.
  - Deletion moves to `--color-danger`.
  - Generic validation hints move to `--color-danger`, or to Stone with a word.
- **The Calendar view's own rendering must not change.** `src/app/(signed-in)/p/[slug]/calendar/calendar.css` may only gain pins inside `.cal-page`.
- **Commit after each task.** End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage only that task's files: the branch carries unrelated uncommitted work.

## Review Focus

1. **Thai inside newly tracked headings.** Notion's negative headline tracking must never reach Thai titles.
   - Pinned by: the guard's "no negative letter-spacing in migrated files" check (Task 2, extended in every task).
2. **Phone width.** Taller List rows, panel padding and pills must not cause horizontal page scroll at 390px.
   - Pinned by: each task's 390px screenshot step, and `document.documentElement.scrollWidth <= 390` asserted in `tests/e2e/house-style.browser.test.ts` (Task 3, extended in Tasks 4, 5 and 7).
3. **Option chips in greyscale.** Mixing the hue into the ground can make two options identical without colour.
   - Pinned by: the guard's `.pill` assertions in Task 4. The chip must keep a leading-edge mark, and must not be a raw fill with a white label.
4. **The Calendar inherits through shared files.** It inherits through `roster.css`, `globals.css` and the root layout fonts, and any task can silently change it.
   - Pinned by: running `tests/e2e/calendar-look.browser.test.ts` in every task's verification step.
5. **Focus visibility.** The 2px blue focus outline must survive on white, on paper and on the primary pill.
   - Pinned by: the guard's `globals.css` check (Task 2) and the pill-specific check (Task 3).

---

### Task 1: Calendar look baseline

**Files:**
- Create: `tests/e2e/calendar-look.browser.test.ts`
- Create: `tests/e2e/fixtures/calendar-look.json` (generated, committed)
- Modify: `package.json` (add the script `"test:calendar-look": "node --env-file=.env --test tests/e2e/calendar-look.browser.test.ts"`)

**Interfaces:**
- Produces: `npm run test:calendar-look`. Every later task runs it, and it must pass unchanged.

- [ ] **Step 1: Write the fingerprint test.** Follow the setup in `tests/e2e/calendar.browser.test.ts`: `setup()`, `signIn()`, Edge headless, the same two seeded dates.
  - Open `/p/<slug>/calendar` at 1440×1000 in month view, then switch to week view. Close any dialog.
  - For each of these selectors, collect the first match's `getComputedStyle` values for `fontFamily, fontSize, fontWeight, color, backgroundColor, borderTopLeftRadius, borderTopColor, boxShadow, paddingTop, paddingLeft`: `.cal-page`, `.cal-header`, `.cal-heading h1`, `.cal-project-nav a`, the sidebar root, a day cell, `.cal-bars button[data-kind="estimate"]`, `.cal-bars button[data-kind="actual"]`. Find the sidebar and day-cell class names in `calendar.css`.
  - Repeat at 390×844.
  - If `process.env.UPDATE_CALENDAR_LOOK === '1'`, write the object to `tests/e2e/fixtures/calendar-look.json`. Otherwise `assert.deepEqual(actual, JSON.parse(readFileSync(fixture)))`.
- [ ] **Step 2: Capture the baseline.** With `npm run dev` running, run `UPDATE_CALENDAR_LOOK=1 npm run test:calendar-look`. Expected: PASS, and the fixture is written.
- [ ] **Step 3: Check the guard works.** Run `npm run test:calendar-look`. Expected: PASS. Temporarily change `.cal-heading h1` `font-size` to 23px, rerun, and expect FAIL naming that key. Then revert the change.
- [ ] **Step 4: Commit** the test, the fixture and `package.json`, with the message `test(calendar): pin the Calendar's own look before the restyle`.

### Task 2: Notion frontmatter, tokens, globals, fonts, and the guard

**Files:**
- Modify: `DESIGN.md` (frontmatter only)
- Regenerate: `src/app/tokens.css`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(signed-in)/wiki/layout.tsx`
- Modify: `src/app/(signed-in)/p/[slug]/calendar/calendar.css` (pins only)
- Create: `tests/house-style.test.ts`
- Modify: `package.json`. Add `tests/house-style.test.ts` to the `test` script, so it runs in `npm run check`.

**Interfaces:**
- Produces these variables, which every later task uses:
  - **House colours:** `--color-canvas`, `--color-paper`, `--color-hairline`, `--color-field-line`, `--color-ink`, `--color-ink-secondary`, `--color-ink-muted`, `--color-ink-faint`, `--color-primary`, `--color-primary-active`, `--color-primary-wash`, `--color-danger`, `--color-danger-active`, `--color-danger-wash`.
  - **Radii and spacing:** `--radius-xs|sm|md|lg|xl|full` and `--space-xxs…xxl`.
  - **Shadows:** `--shadow-1` and `--shadow-2`, declared in `globals.css` `:root`, because the generator has no shadow group.
  - **Fonts:** `--font-sans` (Inter) and `--font-mono`.
- Produces `tests/house-style.test.ts` with an exported-in-file constant `MIGRATED: string[]`. Its paths are relative to the repo root, and later tasks append to it.
- **Aliases kept until Task 9** in the frontmatter, so existing `var()`s still resolve:

  | Alias | Resolves to |
  |---|---|
  | `page` | `#FFFFFF` |
  | `page-edge` | `#F6F5F4` |
  | `board` | `#F6F5F4` |
  | `rule` | `#E6E6E6` |
  | `rule-major` | `#E6E6E6` |
  | `ink-graphite-soft` | `#615D59` |
  | `ink-blue-soft` | `#5C7186` |
  | `radius none` | `0px` |
  | `radius hole` | `50%` |
  | `space row` | `34px` |

  The type roles `body`, `label`, `figure`, `headline` and `title` keep their keys, with Notion values. `label` is 12px/600/`0.01em`. `figure` uses the sans family at 13px with tracking `0`. All families point at `var(--font-sans)`.

- [ ] **Step 1: Write `tests/house-style.test.ts`.** It reads files with `readFileSync`. The tests are:
  - `tokens carry the house values`. `tokens.css` contains `--color-canvas: #FFFFFF`, `--color-paper: #F6F5F4`, `--color-primary: #0075DE`, `--color-danger: #C4362F`, `--radius-lg: 12px` and `--radius-full: 9999px`. Compare case-insensitively.
  - `meaning tokens are frozen`. Each meaning token from Global Constraints has its exact hex.
  - `globals: brand is the house blue, focus is visible, motion respects the user`. `globals.css` has `--brand: var(--color-primary)`, `:focus-visible` with `outline: 2px solid`, and a `prefers-reduced-motion` block. It has no `steps(2)`, and no `border-radius: var(--radius-none)` on `button, input, select, textarea`.
  - `root layout loads Inter once`. `src/app/layout.tsx` imports `Inter` and sets `--font-sans`. `src/app/(signed-in)/wiki/layout.tsx` no longer imports `Inter`.
  - `migrated files keep the house rules`. For each file in `MIGRATED`, which starts as `['src/app/globals.css']`:
    - no `text-transform: uppercase`;
    - no `steps(2)`;
    - no `var(--radius-none)`;
    - no negative `letter-spacing`;
    - every rule block containing `--color-vermilion` has a selector matching `/slip|failed|errata|over|late/`.
    Parse with `/([^{}]+)\{([^}]*)\}/g`.
  - `calendar is pinned`. `calendar.css` `.cal-page` declares `font-family`.
- [ ] **Step 2: Run it.** `node --test tests/house-style.test.ts`. Expected: FAIL on the tokens, globals, layout and calendar tests.
- [ ] **Step 3: Change the code.**
  - **Frontmatter.** Replace it: `name: T-Timeline`, a new `description`, the house colours, the meaning tokens, the aliases, radii, spacing and type roles. Drop `components:`, since nothing reads the `.fb-*` classes. Then run `node scripts/tokens.mjs`.
  - **`globals.css`.** Brand variables:
    - `--brand: var(--color-primary)`
    - `--brand-deep: var(--color-primary-active)`
    - `--brand-ink: #fff`
    - `--brand-wash: var(--color-primary-wash)`
    - `--brand-line: #CFE3F7`
    - `--brand-glow: rgb(0 117 222 / 16%)`
  - **More `globals.css`:**
    - Add `--shadow-1`, `--shadow-2` and `--font-mono` to `:root`.
    - The body becomes `background: var(--color-paper)`, `color: var(--color-ink)`, the house family and `font-feature-settings: 'lnum', 'locl'`.
    - Remove the radius reset on form controls. Fields get `border-radius: var(--radius-xs)`.
    - `.label` loses `text-transform`.
    - `.figure` uses the sans family with `tabular-nums`.
    - `.page` loses the hard shadow.
    - `:focus-visible` becomes `outline: 2px solid var(--brand); outline-offset: 2px`.
    - Rewrite the file's header comment to the house style.
  - **`layout.tsx`.**
    - Load `Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })` and keep Anuphan.
    - Drop Bai Jamjuree and Martian Mono.
    - In `globals.css`, define `--font-struct: var(--font-sans)` and `--font-figure: var(--font-sans)`. These are temporary until Task 9.
  - **Wiki layout.** Remove its `Inter` load, and point `--nt-sans` at `var(--font-sans)`.
  - **`calendar.css`.** Pin `.cal-page { font-family: <the exact value Task 1's fixture recorded>; }`, plus any other inherited property the fingerprint shows has drifted.
- [ ] **Step 4: Run the tests.** `npm run check && npm run test:calendar-look`. Expected: PASS.
- [ ] **Step 5: Look at it.** Screenshot the shelf, the List, the Timeline and the Wiki at 1440px. Expect paper and Inter everywhere and no unstyled element. Run `npm run test:acceptance`, and expect A8 to PASS.
- [ ] **Step 6: Commit** with the message `feat(style): Notion tokens drive the app; field-book tokens kept as aliases`.

### Task 3: Shell and shelf

**Files:**
- Modify: `src/app/(signed-in)/shelf.css`, `src/app/(signed-in)/bell.css`, `src/app/(signed-in)/invite-link.css`, `src/app/globals.css` (`.shelf-button`), `src/app/(signed-in)/bell.tsx` (comment only, indigo → blue)
- Create: `tests/e2e/house-style.browser.test.ts`
- Test: `tests/house-style.test.ts`

**Interfaces:**
- Consumes: Task 2's variables.
- Produces: `.shelf-button` as the utility button (white, `--radius-md`, a hairline border, ink label). Also `tests/e2e/house-style.browser.test.ts` with `const PAGES: Array<{ name: string; path: (fx) => string }>`, which later tasks extend.

- [ ] **Step 1: Write the failing checks.**
  - Append the three CSS files to `MIGRATED`.
  - Add a test `shelf primary is a pill`: in `shelf.css`, the primary action's rule contains `border-radius: var(--radius-full)`.
  - In the browser test:
    - Sign in as the harness admin.
    - Visit `/` at 390×844 and assert `scrollWidth <= 390`.
    - Visit it at 1440 and assert that the header's computed `backgroundColor` is `rgb(255, 255, 255)`.
    - Tab to the first primary button and assert its `outlineStyle` is `solid`.
- [ ] **Step 2: Run them.** `node --test tests/house-style.test.ts`. Expected: FAIL on `shelf.css` (uppercase, `steps(2)`, the vermilion selector at `shelf.css:488`, and the radius).
- [ ] **Step 3: Restyle.**
  - Header: a white bar with a hairline bottom, quiet nav links (`--radius-sm`), and the current item in `--brand-wash`.
  - The project list becomes white panels or a table at `--radius-lg` on paper, with the primary pill.
  - The bell panel uses `--shadow-2` and `--radius-lg`. Its unread count stays blue, never vermilion.
  - Rename the selector on `shelf.css:488` so it describes a misclosure (contains `over` or `slip`) if it is one. If it is not, move it to `--color-danger`. Read the rule's comment to decide.
- [ ] **Step 4: Run the checks.** `npm run check && npm run test:calendar-look && node --env-file=.env --test tests/e2e/house-style.browser.test.ts`. Expected: PASS. Screenshot `/` at 1440 and 390.
- [ ] **Step 5: Commit** with the message `feat(style): shell, shelf and bell in the house style`.

### Task 4: List — an airy Notion database

**Files:**
- Modify: `src/app/(signed-in)/p/[slug]/list.css`, `list-polish.css`, `file-field.css`, `image-field.css`, `loading-status.module.css`, `detail-panel.tsx` (classes only, if needed)
- Test: `tests/house-style.test.ts`, `tests/e2e/house-style.browser.test.ts`

**Interfaces:**
- Consumes: Task 2's variables, and the `--cu-*` variables that `list.css` already declares. Rebind them to house tokens at the top of `list.css` (`--cu-canvas: var(--color-canvas)`, `--cu-line: var(--color-hairline)`, `--cu-ink: var(--color-ink)`, `--cu-ink-soft: var(--color-ink-muted)`, `--cu-r: var(--radius-xs)`), the way `wiki.css` does.

- [ ] **Step 1: Write the failing checks.**
  - Append the CSS files to `MIGRATED`.
  - Add the test `list rows are airy`: the body-row height or `min-height` in `list.css` is between `36px` and `40px`, and the row text is `14px` or `15px`.
  - Add the test `option chip survives greyscale and is not a raw fill`: the `.pill {` block has no `color: #fff`, its `background` uses `color-mix(` with `var(--opt-hue)`, and it has a leading mark (`box-shadow: inset 2px 0 0` or `border-left: 2px solid`) using `var(--opt-hue)`.
  - Add the test `entered and derived inks stay apart`: `list.css` still references both `--color-ink-graphite` and `--color-ink-blue`.
  - Add the List page to the browser test's `PAGES`, so it gets the 390px no-overflow check.
- [ ] **Step 2: Run them.** `node --test tests/house-style.test.ts`. Expected: FAIL.
- [ ] **Step 3: Restyle.**
  - **Grid.** Rows are 36–40px, cells are padded `8px 12px`, there are hairline row rules, and no vertical rules between every column.
  - **Header row.** The eyebrow style in `--color-ink-muted` on paper. The Estimate / Actual / Variance band stays as a grouped header.
  - **Chips.** Hue mixed 17% into canvas, a 2px leading inset of the full hue, a label darkened toward ink until it clears 4.5:1, and `--radius-xs`.
  - **Module identity.** `.modchip`, the indent hairline and the module-row tag keep their hues, mixed.
  - **Vermilion.** The `.slip`, `td.failed` and `.title-errata` rules stay as they are; they may take `--radius-xs`.
  - **The detail panel** becomes a white side panel with a hairline spine and `--shadow-2`.
  - **Behaviour.** Drag, sort, filter and column-move behaviour is unchanged.
- [ ] **Step 4: Run the checks.** Run `npm run check && npm run test:calendar-look && npm run test:acceptance && npm run test:defects` and the browser guard. Expected: PASS, with A8's vermilion-selector test unchanged. Screenshot a project List at 1440 and 390, and in greyscale (Chrome DevTools emulation) to check that two options differ.
- [ ] **Step 5: Commit** with the message `feat(style): the List as an airy Notion table; chips mixed, inks kept`.

### Task 5: Timeline and the roster (and the shared task modal)

**Files:**
- Modify: `src/app/(signed-in)/p/[slug]/timeline/timeline.css`, `src/app/(signed-in)/timeline/roster.css`
- Test: `tests/house-style.test.ts`, `tests/e2e/house-style.browser.test.ts`

**Interfaces:**
- Consumes: Task 2's variables.
- **Constraint from A8 (`tests/e2e/acceptance.test.ts:350-435`).**
  - `.bar.est` and `.bar.act` keep different `top:` and `height:` px values.
  - `.bar.est` keeps a `background-image`; `.bar.act` has none.
  - The `bar.act {` block keeps `background: color-mix(in srgb, var(--bar-hue) N%`, with an `N` that passes the distance test in both files.

- [ ] **Step 1: Write the failing checks.**
  - Append both files to `MIGRATED`.
  - Add the test `today line stays datum`: `timeline.css` references `--color-datum`.
  - Add the test `bars keep a small radius at most`: the `.bar {` block has `border-radius` of 3px or less.
  - Add `/timeline` and a project Timeline to the browser test's `PAGES`.
- [ ] **Step 2: Run them.** `node --test tests/house-style.test.ts`. Expected: FAIL. `roster.css:62` (`.rs-task-modal [role=alert]` uses vermilion) fails the selector rule, and there is uppercase and old chrome.
- [ ] **Step 3: Restyle.**
  - **Chrome.** The toolbar, scale and lanes move to the house style. The date-scale captions use the eyebrow style without uppercase. Gridlines are hairlines, and non-working days are a `--color-paper` band.
  - **Bars.** They keep the A8 constraints, with a radius of 3px or less and the leading edge in the mixed hue.
  - **Brackets.** Baseline brackets and the `.brk.over` overhang are unchanged in meaning.
  - **The task modal** (`.rs-task-modal`) becomes a house dialog: `--radius-xl`, `--shadow-2`, the house fields and a primary pill.
  - **The modal's alert.** If `[role=alert]` reports a save that failed, give it a class containing `errata` and keep vermilion. If not, use `--color-danger`.
  - **Dragging** still tracks 1:1. Other transitions use the 120ms ease.
- [ ] **Step 4: Run the checks.** Run `npm run check && npm run test:acceptance && npm run test:calendar-look`, then `node --env-file=.env --test tests/e2e/roster.test.ts tests/e2e/roster-modal.browser.test.ts tests/e2e/calendar.browser.test.ts`, then the browser guard. Expected: PASS. The Calendar fingerprint passes even though the modal it opens has changed: the fingerprint is taken with no dialog open. Screenshot the Timeline and the roster at 1440 and 390.
- [ ] **Step 5: Commit** with the message `feat(style): Timeline, roster and task modal in the house style; A8 holds`.

### Task 6: Docs, Wiki, and the published links

**Files:**
- Modify: `src/app/(signed-in)/p/[slug]/docs/docs.css`, `src/app/(signed-in)/p/[slug]/docs/editor.css`, `src/app/(signed-in)/p/[slug]/docs/doc-image.module.css`, `src/app/(signed-in)/wiki/wiki.css`, `src/app/d/[token]/published.css`, `src/app/w/[token]/published-wiki.css`
- Test: `tests/house-style.test.ts`

**Interfaces:**
- Consumes: Task 2's variables.
- Produces: one docs skin for Docs and Wiki. The `--nt-*` block in `wiki.css` is replaced: `--cu-*` and `--brand` bind to the house tokens in a shared rule on `.docs-book` in `docs.css`, so Docs and Wiki look the same. Wiki-only rules (tree search, transfer, settings, tokens, dialog, edit-mode width) stay in `wiki.css`.

- [ ] **Step 1: Write the failing checks.**
  - Append the files to `MIGRATED`.
  - Add the test `wiki has no private palette`: `wiki.css` contains no `--nt-`.
  - Add the test `docs deletion is danger, not vermilion`: `editor.css` has no `--color-vermilion` in `.doc-tree-delete` or `.doc-delete-action`, and uses `--color-danger`.
- [ ] **Step 2: Run them.** `node --test tests/house-style.test.ts`. Expected: FAIL.
- [ ] **Step 3: Restyle.**
  - Move the Notion skin from the end of `wiki.css` onto `.docs-book`, using house tokens.
  - Delete the `--nt-*` variables, and replace their uses with the matching `--color-*`, `--radius-*` and `--shadow-*`.
  - Move `editor.css:87-93` to danger.
  - Give the published pages (`/d/`, `/w/`) the same prose and paper.
  - Keep the Mermaid config untouched. `tests/mermaid-rules.test.ts` pins Anuphan, which stays in the family.
- [ ] **Step 4: Run the checks.** `npm run check && npm run test:wiki && npm run test:docs && npm run test:docs-browser && npm run test:calendar-look`. Expected: PASS. Screenshot a Docs page, a Wiki page in read and edit mode (edit stays full width with 5% padding), and `/w/<token>`.
- [ ] **Step 5: Commit** with the message `feat(style): Docs, Wiki and published pages share one house skin`.

### Task 7: People, profile, settings, report

**Files:**
- Modify: `src/app/(signed-in)/people/people.css`, `src/app/(signed-in)/profile/profile.css`, `src/app/(signed-in)/p/[slug]/settings/settings.css`, `src/app/(signed-in)/p/[slug]/report/report.css`
- Test: `tests/house-style.test.ts`, `tests/e2e/house-style.browser.test.ts`

**Interfaces:**
- Consumes: Task 2's variables.

- [ ] **Step 1: Write the failing checks.**
  - Append the files to `MIGRATED`.
  - Add the test `people roles are not a hue`: `people.css` uses no `--color-tab-` and no `--color-primary` on role selectors (the selectors containing `role`).
  - Add `/people`, `/profile` and a project's settings and report pages to `PAGES`.
- [ ] **Step 2: Run them.** `node --test tests/house-style.test.ts`. Expected: FAIL.
- [ ] **Step 3: Restyle.**
  - **Layout.** House panels, tables, fields, buttons and dialogs.
  - **Failed saves keep vermilion**: `profile.css:145-148`, `people.css:188-191` and `people.css:336-337`. Each selector must contain `failed` or `errata`; rename the class in the matching `.tsx` if it doesn't.
  - **Delete moves to danger.** The armed delete and the delete confirm (`people.css:472-488`) become `--color-danger`, `--color-danger-wash` and `--color-danger-active`.
  - **Roles** stay as weight, italic or faint.
  - **The report's misclosure slip** (`report.css:35-36`) stays vermilion, under a selector containing `slip`.
- [ ] **Step 4: Run the checks.** `npm run check && npm run test:e2e && npm run test:calendar-look` and the browser guard. Expected: PASS. Screenshot each page at 1440 and 390.
- [ ] **Step 5: Commit** with the message `feat(style): people, profile, settings and report in the house style`.

### Task 8: Auth pages

**Files:**
- Modify: `src/app/auth.css`, `src/app/auth-shell.tsx`, `src/app/auth-fields.tsx` (markup only, if needed)
- Test: `tests/house-style.test.ts`

**Interfaces:**
- Consumes: Task 2's variables.

- [ ] **Step 1: Write the failing checks.**
  - Append `src/app/auth.css` to `MIGRATED`.
  - Add the test `auth has no indigo field`: `auth.css` contains no `#2B3A8F` and no `--brand-deep` background on the page root, and the card rule contains `var(--radius-xl)` and `var(--shadow-2)`.
- [ ] **Step 2: Run them.** `node --test tests/house-style.test.ts`. Expected: FAIL. `.auth-field-row.is-bad` uses vermilion, and there is uppercase.
- [ ] **Step 3: Restyle.**
  - **Layout.** A centred white panel on paper (`--radius-xl`, `--shadow-2`), labels above fields, and a primary pill. Below 420px the panel goes full width.
  - **The estimate/actual graphic** is dropped. *(Spec leaves it to the builder; dropping it removes the only light-on-dark vermilion variant.)*
  - **The invalid-field state** (`.is-bad`) becomes `--color-danger` with its message text.
  - **The errata band** for a write that did not land (`auth.css:298-311`) keeps vermilion, under a selector containing `errata`.
- [ ] **Step 4: Run the checks.** `npm run check && node --env-file=.env --test tests/e2e/password.test.ts tests/e2e/profile.test.ts`. Expected: PASS. Screenshot `/sign-in` and `/change-password` at 1440 and 390.
- [ ] **Step 5: Commit** with the message `feat(style): sign-in pages as a house panel`.

### Task 9: Remove aliases, rewrite the docs, retire `notion/`

**Files:**
- Modify: `DESIGN.md` (frontmatter: drop the aliases; body: rewrite § 9 and § 10, and add the Calendar section), `CLAUDE.md` (§ Colour law, and the `notion/` reference), `src/app/globals.css` (drop `--font-struct` and `--font-figure`), every CSS file still using an alias
- Modify: `src/app/(signed-in)/wiki/wiki.css` and `src/app/(signed-in)/wiki/layout.tsx` (comments pointing at `notion/DESIGN.md`)
- Delete: `notion/` (after committing it once)
- Test: `tests/house-style.test.ts`

- [ ] **Step 1: Write the failing check.** Add the test `no retired token survives`.
  - No file under `src/app`, except `calendar.css`, references any of: `--color-page)`, `--color-page-edge`, `--color-board`, `--color-rule)`, `--color-rule-major`, `--color-ink-graphite-soft`, `--radius-none`, `--radius-hole`, `--space-row`, `--font-struct`, `--font-figure`.
  - `tokens.css` defines none of them.
  - No file references `notion/DESIGN.md`.
- [ ] **Step 2: Run it.** `node --test tests/house-style.test.ts`. Expected: FAIL, listing the files.
- [ ] **Step 3: Remove the aliases.**
  - Replace each alias use with its house token.
  - Remove the aliases from the frontmatter, and run `node scripts/tokens.mjs`.
  - Keep `ink-blue-soft` as a meaning-adjacent token (the derived secondary ink).
- [ ] **Step 4: Rewrite the docs.**
  - **`DESIGN.md` § 9** becomes "The meaning laws in the chart and the List": how bars, slips, the two inks and module hue are drawn in the house style.
  - **New section "Calendar — a scoped exception"**: it keeps its Google-Calendar look by the owner's decision on 2026-11-05, while the bell and task modal follow the house style.
  - **`DESIGN.md` § 10** becomes the post-migration state.
  - **`CLAUDE.md` § Colour law**: keep the vermilion (now naming failed writes as errata), ink and tab-hue paragraphs. Replace the "No cards, no rounded corners… One exception: the signed-in Wiki" paragraph with the house style, the Calendar exception, and "no dark theme, no zebra striping, no status tint on rows".
- [ ] **Step 5: Retire `notion/`.**
  - Commit it as it is, with the message `docs: keep notion/DESIGN.md in history before merging it away`.
  - Then `git rm -r notion/`.
  - Point the remaining comments at `DESIGN.md`.
- [ ] **Step 6: Run the full suite.** Run `npm run check && npm run db:test && npm run test:e2e && npm run test:wiki && npm run test:docs && npm run test:acceptance && npm run test:defects && npm run test:calendar-look` and the browser guard. Expected: all PASS. Take the full screenshot set at 1440 and 390, and compare the Calendar against Task 1.
- [ ] **Step 7: Commit** with the message `refactor(style): drop field-book aliases; DESIGN.md and CLAUDE.md describe the house style`.
