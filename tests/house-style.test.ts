import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    'tab-1': '#B0503C',
    'tab-2': '#C08A2E',
    'tab-3': '#5B7A3A',
    'tab-4': '#2E6E74',
    'tab-5': '#3A5A94',
    'tab-6': '#6B4A87',
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
    for (const { selector, body } of ruleBlocks(rules)) {
      if (!body.includes('--color-vermilion')) continue;
      assert.match(selector, /slip|failed|errata|over|late/,
        `${path}: \`${selector}\` uses vermilion but is not a misclosure or failed-write state`);
    }
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
