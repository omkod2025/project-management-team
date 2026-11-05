/**
 * The option palette (DESIGN.md § 9.2): status and select options take eight
 * colours of their own, apart from the six module hues. These tests pin how a
 * stored colour index becomes a chip's colours, and which colour a new option
 * is handed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { OPTION_COLOURS, nextOptionColor, optionStyle } from '../src/lib/option-colors.ts';

test('there are eight option colours', () => {
  assert.equal(OPTION_COLOURS, 8);
});

test('a colour index names its fill and its ink', () => {
  assert.deepEqual(optionStyle(1), { '--opt-hue': 'var(--color-option-1)', '--opt-ink': 'var(--color-option-1-ink)' });
  assert.deepEqual(optionStyle(8), { '--opt-hue': 'var(--color-option-8)', '--opt-ink': 'var(--color-option-8-ink)' });
});

test('an index outside the palette wraps rather than naming a colour that does not exist', () => {
  assert.equal(optionStyle(9)['--opt-hue'], 'var(--color-option-1)');
  assert.equal(optionStyle(0)['--opt-hue'], 'var(--color-option-1)');
  assert.equal(optionStyle(-3)['--opt-hue'], 'var(--color-option-1)');
});

test('the nth new option takes the nth colour: red, yellow, sky, green, grey, dark grey, orange, pink', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(nextOptionColor), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(nextOptionColor(8), 1, 'the ninth option starts the wheel again');
});
