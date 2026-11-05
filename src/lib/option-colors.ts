/**
 * The option palette (DESIGN.md § 9.2) — status and select options, apart from
 * the six module hues. A stored `option_color_index` is a slot on this wheel,
 * never a raw colour, so a token change repaints every option. Pure: no
 * database, no `server-only`.
 */
import type { CSSProperties } from 'react';

/** Red, yellow, sky, green, grey, dark grey, orange, pink. */
export const OPTION_COLOURS = 8;

const slot = (index: number) => {
  const n = Math.trunc(index);
  return n >= 1 ? ((n - 1) % OPTION_COLOURS) + 1 : 1;
};

/** The custom properties a chip or swatch reads: its fill and the ink on it. */
export function optionStyle(index: number): CSSProperties & { '--opt-hue': string; '--opt-ink': string } {
  const n = slot(index);
  return { '--opt-hue': `var(--color-option-${n})`, '--opt-ink': `var(--color-option-${n}-ink)` };
}

/** The colour a new option is handed: the nth option takes the nth colour. */
export function nextOptionColor(existingCount: number): number {
  return (existingCount % OPTION_COLOURS) + 1;
}
