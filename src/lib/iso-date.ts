import { TIME_ZONE } from './constants.ts';

/*
 * Calendar dates as the API carries them: `yyyy-MM-dd`, a date and never a
 * timestamp. The picker works on local midnight `Date`s because that is what
 * react-day-picker draws; converting through the fields (never through
 * `toISOString`, which is UTC) keeps the day the person chose.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-11-09` → local midnight on that day; anything else → undefined. */
export function parseIsoDate(iso: string | null | undefined): Date | undefined {
  const m = iso ? ISO.exec(iso) : null;
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Refuse rollovers such as 2026-02-30, which `new Date` would make 2 March.
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : undefined;
}

/** A local `Date` → `yyyy-MM-dd`, read from its local fields. */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `2026-11-09` → `9 Nov 2026`, the trigger's reading form. */
export function formatIsoDate(iso: string | null | undefined): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Today in Asia/Bangkok as `yyyy-MM-dd`, whatever zone the browser is in. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** `2026-11-09` → `09 Nov`, the List's column form, where the year is the band's. */
export function formatIsoDateShort(iso: string | null | undefined): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`;
}
