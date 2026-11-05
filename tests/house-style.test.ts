import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The static guard for the Notion house style (DESIGN.md).
 *
 * It reads source files rather than rendering anything, so it runs in
 * `npm run check` with no server and no database. Each restyle task appends
 * the stylesheets it migrated to MIGRATED; from then on those files are held
 * to the house rules — including the vermilion law, which a restyle is the
 * likeliest moment to break.
 */

/** Stylesheets already on the house style. Paths are relative to the repo root. */
const MIGRATED: string[] = [
  'src/app/globals.css',
  'src/app/(signed-in)/shelf.css',
  'src/app/(signed-in)/bell.css',
  'src/app/(signed-in)/invite-link.css',
  'src/app/(signed-in)/p/[slug]/list.css',
  'src/app/(signed-in)/p/[slug]/list-polish.css',
  'src/app/(signed-in)/p/[slug]/file-field.css',
  'src/app/(signed-in)/p/[slug]/image-field.css',
  'src/app/(signed-in)/p/[slug]/loading-status.module.css',
  'src/app/(signed-in)/p/[slug]/timeline/timeline.css',
  'src/app/(signed-in)/timeline/roster.css',
  'src/app/(signed-in)/p/[slug]/docs/docs.css',
  'src/app/(signed-in)/p/[slug]/docs/editor.css',
  'src/app/(signed-in)/p/[slug]/docs/doc-image.module.css',
  'src/app/(signed-in)/wiki/wiki.css',
  'src/app/d/[token]/published.css',
  'src/app/w/[token]/published-wiki.css',
  'src/app/(signed-in)/people/people.css',
  'src/app/(signed-in)/profile/profile.css',
  'src/app/(signed-in)/p/[slug]/settings/settings.css',
  'src/app/(signed-in)/p/[slug]/report/report.css',
  'src/app/auth.css',
];

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

/** Comments explain the rules (and name vermilion); they are not rules. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Innermost `selector { declarations }` blocks. Neither group may span a
 * brace, so a rule nested in `@media (…) { … }` comes out with its own
 * selector and the media query itself is never mistaken for one.
 */
function ruleBlocks(css: string): { selector: string; body: string }[] {
  const blocks: { selector: string; body: string }[] = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    blocks.push({ selector: (m[1] ?? '').trim(), body: m[2] ?? '' });
  }
  return blocks;
}

/**
 * A selector that may draw in vermilion: it must name a misclosure or a
 * failed-write state *as a class*. Anchoring on the class token is the point —
 * a bare /over|late/ let `:hover`, `translate` and `template` through.
 */
const VERMILION_STATE = /\.(?:[\w-]*-)?(?:slip|failed|errata|late)\b|\.brk\.over\b|\.over-fig\b/;

/**
 * Every vermilion rule in `css` whose selector list has a member that is not a
 * misclosure or failed-write state. Each comma-separated selector is judged
 * alone, so `.slip, .x:hover` cannot ride on its neighbour.
 */
function vermilionOffenders(css: string): string[] {
  const offenders: string[] = [];
  for (const { selector, body } of ruleBlocks(css)) {
    if (!body.includes('--color-vermilion')) continue;
    for (const one of selector.split(',').map((s) => s.trim())) {
      if (!VERMILION_STATE.test(one)) offenders.push(one);
    }
  }
  return offenders;
}

test('tokens carry the house values', () => {
  const tokens = read('src/app/tokens.css').toLowerCase();
  for (const decl of [
    '--color-canvas: #ffffff',
    '--color-paper: #f6f5f4',
    '--color-primary: #0075de',
    '--color-danger: #c4362f',
    '--radius-lg: 12px',
    '--radius-full: 9999px',
  ]) {
    assert.ok(tokens.includes(decl), `tokens.css lacks \`${decl}\``);
  }
});

test('meaning tokens are frozen', () => {
  const tokens = read('src/app/tokens.css').toLowerCase();
  const meaning: Record<string, string> = {
    'ink-graphite': '#2A2622',
    'ink-blue': '#24384F',
    vermilion: '#A82A17',
    'vermilion-wash': '#EED9CE',
    datum: '#1F4A3D',
    'tab-1': '#F08C2E',
    'tab-2': '#EC4899',
    'tab-3': '#22A55A',
    'tab-4': '#0EA5A4',
    'tab-5': '#3B82F6',
    'tab-6': '#8B5CF6',
  };
  for (const [name, hex] of Object.entries(meaning)) {
    const decl = `--color-${name}: ${hex.toLowerCase()};`;
    assert.ok(tokens.includes(decl), `tokens.css lacks \`${decl}\``);
  }
});

test('globals: brand is the house blue, focus is visible, motion respects the user', () => {
  const css = read('src/app/globals.css');
  const rules = stripComments(css);
  assert.match(rules, /--brand:\s*var\(--color-primary\)/);
  assert.match(rules, /:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  assert.match(rules, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(rules, /steps\(2\)/);
  const controlReset = ruleBlocks(css).find(
    (b) => /\bbutton\b/.test(b.selector) && /\binput\b/.test(b.selector)
      && /\bselect\b/.test(b.selector) && /\btextarea\b/.test(b.selector)
      && /border-radius:\s*var\(--radius-none\)/.test(b.body),
  );
  assert.equal(controlReset, undefined, 'form controls are still reset to square corners');
});

test('root layout loads Inter once', () => {
  const rootLayout = read('src/app/layout.tsx');
  assert.match(rootLayout, /import\s*\{[^}]*\bInter\b[^}]*\}\s*from\s*'next\/font\/google'/);
  assert.match(rootLayout, /variable:\s*'--font-sans'/);
  const wikiLayout = read('src/app/(signed-in)/wiki/layout.tsx');
  assert.doesNotMatch(wikiLayout, /import\s*\{[^}]*\bInter\b[^}]*\}\s*from/);
});

test('migrated files keep the house rules', () => {
  for (const path of MIGRATED) {
    const rules = stripComments(read(path));
    assert.doesNotMatch(rules, /text-transform:\s*uppercase/, `${path}: uppercase`);
    assert.doesNotMatch(rules, /steps\(2\)/, `${path}: steps(2)`);
    assert.doesNotMatch(rules, /var\(--radius-none\)/, `${path}: --radius-none`);
    assert.doesNotMatch(rules, /letter-spacing:\s*-/, `${path}: negative letter-spacing`);
    for (const selector of vermilionOffenders(rules)) {
      assert.fail(`${path}: \`${selector}\` uses vermilion but is not a misclosure or failed-write state`);
    }
  }
});

test('the vermilion guard has no hole', () => {
  // Hover, transforms and templates are not states.
  for (const css of [
    '.x:hover { color: var(--color-vermilion); }',
    '.grid-template { background: var(--color-vermilion-wash); }',
    '.translate { color: var(--color-vermilion); }',
    '.slip, .x:hover { color: var(--color-vermilion); }',
    '.overflow { color: var(--color-vermilion); }',
    '.who-state.off { color: var(--color-vermilion); }',
  ]) {
    assert.notDeepEqual(vermilionOffenders(css), [], `the guard let \`${css}\` through`);
  }
  // Every legitimate misclosure and failed-write selector still passes.
  for (const selector of [
    '.slip', 'td.failed', '.title-errata', '.errata', '.brk.over', '.over-fig', '.rs-late',
    '.rs-item .bar.act.rs-late', '.rs-slip', '.rs-task-modal .rs-task-errata', '.sh-write-failed',
    '.auth-errata--failed-write', '.people-errata', '.prof-errata',
  ]) {
    assert.deepEqual(vermilionOffenders(`${selector} { color: var(--color-vermilion); }`), [],
      `the guard refuses the legitimate \`${selector}\``);
  }
});

test('shelf primary is a pill', () => {
  const css = read('src/app/(signed-in)/shelf.css');
  const primary = ruleBlocks(css).find((b) => b.selector.split(',').some((s) => s.trim() === '.sh-btn-primary'));
  assert.ok(primary, 'shelf.css has no `.sh-btn-primary` rule');
  assert.match(primary!.body, /border-radius:\s*var\(--radius-full\)/);
});

test('calendar is pinned', () => {
  const css = read('src/app/(signed-in)/p/[slug]/calendar/calendar.css');
  const page = ruleBlocks(css).filter((b) => b.selector === '.cal-page');
  assert.ok(page.some((b) => /font-family\s*:/.test(b.body)), '.cal-page declares no font-family');
});

const LIST = 'src/app/(signed-in)/p/[slug]/list.css';
const REPORT = 'src/app/(signed-in)/p/[slug]/report/report.css';

test('list rows are airy', () => {
  const blocks = ruleBlocks(read(LIST));
  const body = blocks.find((b) => b.selector === '.run tbody td');
  assert.ok(body, 'list.css has no `.run tbody td` rule');
  const height = /(?:^|[;\s])(?:min-)?height:\s*(\d+(?:\.\d+)?)px/.exec(body!.body);
  assert.ok(height, '`.run tbody td` sets no row height');
  const px = Number(height![1]);
  assert.ok(px >= 36 && px <= 40, `body rows are ${px}px, not 36–40px`);
  const size = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(body!.body);
  assert.ok(size, '`.run tbody td` sets no row text size');
  assert.ok(['14', '15'].includes(size![1]!), `row text is ${size![1]}px, not 14px or 15px`);
});

test('option chip survives greyscale and is not a raw fill', () => {
  const pill = ruleBlocks(read(LIST)).find((b) => b.selector === '.pill');
  assert.ok(pill, 'list.css has no `.pill` rule');
  assert.doesNotMatch(pill!.body, /color:\s*#fff/i, 'the chip label is white on a raw fill');
  assert.match(pill!.body, /background:\s*color-mix\([^;]*var\(--opt-hue\)/, 'the chip fill is not mixed');
  // The badge (DESIGN.md § 7): a 1px border of the hue, mixed, outlines the
  // chip, so two options still part in greyscale.
  assert.match(pill!.body, /border:\s*1px solid color-mix\([^;]*var\(--opt-hue\)/,
    'the chip has no mixed 1px border of its hue');
  assert.match(pill!.body, /border-radius:\s*var\(--radius-badge\)/, 'the chip is not the badge shape');
});

test('every badge wears the one badge shape', () => {
  // DESIGN.md § 7 Badges: a pastel wash, a 1px darker-tint border, 6px corners.
  const badges: Array<[string, string]> = [
    [LIST, '.pill'],
    [LIST, '.run tr.module .name-text'],
    [LIST, '.slip'],
    [PEOPLE, '.who-state'],
    [REPORT, '.report-options .report-money'],
    [WIKI, '.wiki-flag'],
  ];
  for (const [file, selector] of badges) {
    const block = ruleBlocks(read(file)).find((b) => b.selector === selector);
    assert.ok(block, `${file} has no \`${selector}\` rule`);
    assert.match(block!.body, /border-radius:\s*var\(--radius-badge\)/, `${selector} is not the badge shape`);
    assert.match(block!.body, /border:\s*1px solid/, `${selector} has no 1px border`);
  }
  assert.match(read('src/app/tokens.css'), /--radius-badge:\s*6px/i, 'tokens.css lacks --radius-badge: 6px');
});

test('no tab hue is drawn raw in the List', () => {
  // A hue variable may only appear inside a color-mix(): raw, tab-1 reads as vermilion.
  const offenders: string[] = [];
  for (const { selector, body } of ruleBlocks(read(LIST))) {
    for (const decl of body.split(';')) {
      // Strip every color-mix(…) (one level of nested var(…) inside it); what is left is raw.
      const unmixed = decl.replace(/color-mix\((?:[^()]|\([^()]*\))*\)/g, '');
      if (/var\(--(?:opt|row|mod)-hue\)|var\(--color-tab-\d\)/.test(unmixed)) offenders.push(`${selector}: ${decl.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `raw hue in list.css:\n${offenders.join('\n')}`);
});

test('entered and derived inks stay apart', () => {
  const rules = stripComments(read(LIST));
  assert.match(rules, /--color-ink-graphite/);
  assert.match(rules, /--color-ink-blue/);
});

test('list text that can hold Thai is never below 13px', () => {
  const blocks = ruleBlocks(read(LIST));
  // Column names are user-defined and an errata message can quote one; only
  // the band's fixed English captions may take the 12px eyebrow.
  for (const selector of ['.run thead th', '.run tr.grouphead th', '.title-errata', '.pill', '.run tr.module .name-text']) {
    const block = blocks.find((b) => b.selector === selector);
    assert.ok(block, `list.css has no \`${selector}\` rule`);
    const size = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(block!.body);
    assert.ok(size, `\`${selector}\` sets no font-size`);
    assert.ok(Number(size![1]) >= 13, `\`${selector}\` is ${size![1]}px; Thai may not go below 13px`);
  }
});

/**
 * Two Thai-capable texts sit inside the global `.label` eyebrow (12px,
 * tracked): the detail panel's ancestor crumb and the report's column heads.
 * Each must restore 13px and no tracking itself.
 */
test('Thai inside a .label eyebrow is restored to 13px and untracked', () => {
  for (const [path, selector] of [
    [LIST, '.facing .crumb'],
    ['src/app/(signed-in)/p/[slug]/report/report.css', '.report-table th'],
  ] as const) {
    const block = ruleBlocks(read(path)).find((b) => b.selector === selector && /font-size/.test(b.body));
    assert.ok(block, `${path} has no \`${selector}\` rule with a font-size`);
    const size = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(block!.body);
    assert.ok(size && Number(size[1]) >= 13, `\`${selector}\` is below 13px`);
    assert.match(block!.body, /letter-spacing:\s*(?:normal|0)\b/, `\`${selector}\` keeps the eyebrow's tracking`);
  }
});

const TIMELINE = 'src/app/(signed-in)/p/[slug]/timeline/timeline.css';
const ROSTER = 'src/app/(signed-in)/timeline/roster.css';

test('today line stays datum', () => {
  const rules = stripComments(read(TIMELINE));
  assert.match(rules, /--color-datum/, 'timeline.css no longer draws today in datum ink');
  const datum = ruleBlocks(read(TIMELINE)).find((b) => b.selector === '.datum');
  assert.ok(datum, 'timeline.css has no `.datum` rule');
  assert.match(datum!.body, /background:\s*var\(--color-datum\)/, 'the today line is not datum');
});

test('bars keep a small radius at most', () => {
  const bar = ruleBlocks(read(TIMELINE)).find((b) => b.selector === '.bar');
  assert.ok(bar, 'timeline.css has no `.bar` rule');
  const radius = /border-radius:\s*(\d+(?:\.\d+)?)px/.exec(bar!.body);
  assert.ok(radius, '`.bar` sets no px border-radius');
  assert.ok(Number(radius![1]) <= 3, `bars are rounded ${radius![1]}px; a pill eats the leading edge`);
});

test('the task modal is a house dialog with a primary pill', () => {
  const blocks = ruleBlocks(read(ROSTER));
  const modal = blocks.find((b) => b.selector === '.rs-task-modal');
  assert.ok(modal, 'roster.css has no `.rs-task-modal` rule');
  assert.match(modal!.body, /border-radius:\s*var\(--radius-xl\)/);
  assert.match(modal!.body, /box-shadow:[^;]*var\(--shadow-2\)/);
  const primary = blocks.find((b) => b.selector.includes('.rs-task-actions') && /type=['"]?submit/.test(b.selector)
    && /border-radius:\s*var\(--radius-full\)/.test(b.body));
  assert.ok(primary, "the modal's save button is not a primary pill");
});

test('the date scale never sets Thai-capable text below 13px and caps never collide', () => {
  const blocks = ruleBlocks(read(TIMELINE));
  // Names and module labels can be Thai.
  for (const selector of ['.rowmodule', '.tl-namerow']) {
    const block = blocks.find((b) => b.selector === selector && /font-size/.test(b.body));
    assert.ok(block, `timeline.css has no \`${selector}\` rule with a font-size`);
    const size = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(block!.body);
    assert.ok(size && Number(size[1]) >= 13, `\`${selector}\` is below 13px`);
  }
  // The Today cap and the month caption share the month band; they sit on
  // different lines of it so a month that starts near today is not overprinted.
  const month = blocks.find((b) => b.selector === '.tl-month');
  assert.ok(month && /align-items:\s*flex-start/.test(month.body), 'the month caption is not held to the top of its band');
});

const WIKI = 'src/app/(signed-in)/wiki/wiki.css';
const EDITOR = 'src/app/(signed-in)/p/[slug]/docs/editor.css';

test('wiki has no private palette', () => {
  assert.doesNotMatch(read(WIKI), /--nt-/, 'wiki.css still declares or reads a --nt-* variable');
});

test('docs deletion is danger, not vermilion', () => {
  const blocks = ruleBlocks(read(EDITOR))
    .filter((b) => /\.doc-tree-delete|\.doc-delete-action/.test(b.selector));
  assert.ok(blocks.length > 0, 'editor.css has no `.doc-tree-delete` or `.doc-delete-action` rule');
  for (const { selector, body } of blocks) {
    assert.doesNotMatch(body, /--color-vermilion/, `\`${selector}\` still draws deletion in vermilion`);
  }
  assert.ok(blocks.some((b) => /--color-danger/.test(b.body)), 'docs deletion does not use --color-danger');
});

const PEOPLE = 'src/app/(signed-in)/people/people.css';

test('a deactivated account and a money column are danger, not vermilion', () => {
  const people = ruleBlocks(read(PEOPLE)).find((b) => b.selector === '.who-state.off');
  assert.ok(people, 'people.css has no `.who-state.off` rule');
  assert.match(people!.body, /--color-danger\b/);
  const report = ruleBlocks(read('src/app/(signed-in)/p/[slug]/report/report.css'))
    .filter((b) => /report-money|report-caution/.test(b.selector));
  assert.equal(report.length, 2, 'report.css lacks `.report-money` or `.report-caution`');
  for (const { selector, body } of report) {
    assert.doesNotMatch(body, /--color-vermilion/, `\`${selector}\` draws a caution in vermilion`);
    assert.match(body, /--color-danger\b/, `\`${selector}\` is not danger`);
  }
});

test('people roles are not a hue', () => {
  const rules = stripComments(read(PEOPLE));
  for (const { selector, body } of ruleBlocks(rules)) {
    if (!/role/.test(selector)) continue;
    assert.doesNotMatch(body, /--color-tab-/, `\`${selector}\` draws a role in a module hue`);
    assert.doesNotMatch(body, /--color-primary/, `\`${selector}\` draws a role in the house blue`);
  }
});

test('Docs and Wiki share one skin on .docs-book', () => {
  const book = ruleBlocks(read('src/app/(signed-in)/p/[slug]/docs/docs.css')).find((b) => b.selector === '.book.docs-book');
  assert.ok(book, 'docs.css has no `.book.docs-book` rule');
  assert.match(book!.body, /--brand:\s*var\(--color-primary\)/);
  assert.match(book!.body, /--cu-ground:\s*var\(--color-paper\)/);
});

const AUTH = 'src/app/auth.css';

test('auth has no indigo field', () => {
  const css = read(AUTH);
  const rules = stripComments(css);
  assert.doesNotMatch(rules, /#2B3A8F/i, 'auth.css still carries the indigo field colour');
  const page = ruleBlocks(rules).find((b) => b.selector === '.auth');
  assert.ok(page, 'auth.css has no `.auth` page-root rule');
  assert.doesNotMatch(page!.body, /--brand-deep/, 'the page root still backs onto the indigo brand colour');
  const card = ruleBlocks(rules).find((b) => b.selector === '.auth-card');
  assert.ok(card, 'auth.css has no `.auth-card` rule');
  assert.match(card!.body, /border-radius:\s*var\(--radius-xl\)/, 'the card is not the house xl radius');
  assert.match(card!.body, /box-shadow:[^;]*var\(--shadow-2\)/, 'the card does not carry the house shadow-2');
});

test('auth refusals are danger; vermilion is only the unsaved-write band', () => {
  const blocks = ruleBlocks(read(AUTH));
  const refusal = blocks.find((b) => b.selector === '.auth-errata--refusal');
  assert.ok(refusal, 'auth.css has no `.auth-errata--refusal` rule');
  assert.match(refusal!.body, /--color-danger\b/, 'the refusal band is not the house red');
  assert.doesNotMatch(refusal!.body, /--color-vermilion/, 'a wrong-credential or mismatch refusal still draws in vermilion');
  const failedWrite = blocks.find((b) => b.selector === '.auth-errata--failed-write');
  assert.ok(failedWrite, 'auth.css has no `.auth-errata--failed-write` rule');
  assert.match(failedWrite!.body, /--color-vermilion\b/, 'the failed-write band no longer carries the misclosure colour');
});

/** Every file under `dir`, recursively, as repo-relative paths. */
function walk(dir: string): string[] {
  return readdirSync(root + dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => `${e.parentPath.slice(root.length).replaceAll('\\', '/')}/${e.name}`);
}

/**
 * The field book's tokens were kept as aliases while the restyle moved
 * surface by surface; the last task retired them. A use left behind would
 * resolve to nothing and silently fall back to the browser default. The
 * Calendar's own sheet is exempt: it pins its old look inside `.cal-page`.
 */
test('no retired token survives', () => {
  const retired = [
    '--color-page)', '--color-page-edge', '--color-board', '--color-rule)', '--color-rule-major',
    '--color-ink-graphite-soft', '--radius-none', '--radius-hole', '--space-row',
    '--font-struct', '--font-figure',
  ];
  const offenders: string[] = [];
  for (const path of walk('src/app')) {
    if (path.endsWith('/calendar.css') || path === 'src/app/tokens.css' || !/\.(css|tsx?)$/.test(path)) continue;
    const text = read(path);
    for (const token of retired) if (text.includes(token)) offenders.push(`${path}: ${token}`);
  }
  assert.deepEqual(offenders, [], `retired tokens still in use:\n${offenders.join('\n')}`);

  const tokens = read('src/app/tokens.css');
  for (const token of retired) {
    const name = token.replace(/\)$/, '');
    assert.doesNotMatch(tokens, new RegExp(`${name}:`), `tokens.css still defines ${name}`);
  }
});

test('nothing points at the retired Notion analysis folder', () => {
  // Built, not written, so this file does not match itself.
  const folder = ['notion', ''].join('/');
  const offenders = [
    'CLAUDE.md', 'DESIGN.md', 'PRODUCT.md',
    ...walk('src'), ...walk('tests'), ...walk('docs/spec'), ...walk('docs/guides'),
  ].filter((path) => read(path).includes(folder));
  assert.deepEqual(offenders, [], `files still pointing at ${folder}:\n${offenders.join('\n')}`);
});
