/**
 * Lane packing for the roster.
 *
 * This lives in its own module for the same reason `sort.ts` does: it is the
 * one piece of the roster that carries a claim. **A lane's height is a
 * statement about how much work overlaps in it**, and that statement is only
 * true if the packer is correct. A packer that is merely nearly right does not
 * look broken — it looks like a person who is slightly less busy than they are,
 * which is the failure the page cannot afford and the eye cannot catch.
 *
 * No React, no DOM, no dates beyond ISO strings, so it is testable without a
 * browser or a database (`tests/roster-pack.test.ts`).
 */

/** The minimum an item must carry to be placed: a name is not needed to pack. */
export type Packable = {
  estimateStart: string | null;
  estimateEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
};

export type Span = { s: string; e: string };

const MS = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => toIso(new Date(toDate(iso).getTime() + n * MS));

/**
 * The space an item reserves in a lane: the union of its plan and its record.
 *
 * Deliberately the union rather than either one. A task estimated for a week
 * that actually ran three occupies its holder for three, and a lane that
 * reserved only the estimate would report them free during the fortnight they
 * were not. The product keeps plan and record separate everywhere else; here
 * the question is occupancy, and occupancy is the outer envelope of both.
 *
 * An item with only one date of the four still has a span — a single day —
 * because a milestone still lands on somebody's calendar.
 */
export function span(it: Packable): Span | null {
  const all = [it.estimateStart, it.estimateEnd, it.actualStart, it.actualEnd]
    .filter((d): d is string => Boolean(d))
    .sort();
  if (!all.length) return null;
  return { s: all[0]!, e: all[all.length - 1]! };
}

/**
 * Greedy interval packing, earliest start first.
 *
 * An item joins the first sub-row whose occupied extent ends before the item
 * begins, and opens a new sub-row when none does. Sorting by start first is
 * what makes the greedy choice optimal: the number of sub-rows produced equals
 * the maximum number of items overlapping on any single day, so the lane is
 * exactly as deep as the busiest moment in it and no deeper.
 *
 * `padDays` is a rendering concession, not a scheduling one. At month zoom a
 * day is four pixels, so two items a day apart abut into what looks like one
 * continuous bar; padding forces them onto separate sub-rows instead. It is
 * passed in rather than read from a constant because the caller owns the zoom.
 */
export function pack<T extends Packable>(items: T[], padDays = 0): T[][] {
  const rows: T[][] = [];
  const ends: string[] = [];

  for (const { it, sp } of dated(items)) {
    let placed = false;
    for (let i = 0; i < rows.length; i++) {
      if (addDays(ends[i]!, padDays) < sp.s) {
        rows[i]!.push(it);
        // The extent, not the last item's end: a long item followed by a short
        // one must not shorten the row it sits in.
        if (sp.e > ends[i]!) ends[i] = sp.e;
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([it]);
      ends.push(sp.e);
    }
  }
  return rows;
}

/**
 * One item per row, earliest first — the soloed reading of a lane.
 *
 * Not a special case of `pack` with an infinite pad: soloing asks *what is in
 * here*, and the answer wants one row per thing so each has room for its name.
 */
export function unpack<T extends Packable>(items: T[]): T[][] {
  return dated(items).map(({ it }) => [it]);
}

/**
 * Day-by-day occupancy across a window, for marking where a lane is contended.
 *
 * Returned as counts rather than as a boolean so the caller chooses the
 * threshold. Three is the roster's, but the number is a judgement about how
 * many things a person can hold, and judgements do not belong in the counter.
 */
export function occupancy(items: Packable[], start: string, days: number): number[] {
  const counts = new Array<number>(days).fill(0);
  const origin = toDate(start).getTime();

  for (const { sp } of dated(items)) {
    const from = Math.max(0, Math.round((toDate(sp.s).getTime() - origin) / MS));
    const to = Math.min(days - 1, Math.round((toDate(sp.e).getTime() - origin) / MS));
    for (let i = from; i <= to; i++) counts[i]! += 1;
  }
  return counts;
}

/** Contiguous runs where occupancy reaches `threshold`, as half-open [from,to). */
export function contendedRuns(counts: number[], threshold: number): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  let open = -1;
  for (let i = 0; i < counts.length; i++) {
    const hot = counts[i]! >= threshold;
    if (hot && open < 0) open = i;
    if (!hot && open >= 0) { runs.push({ from: open, to: i }); open = -1; }
  }
  if (open >= 0) runs.push({ from: open, to: counts.length });
  return runs;
}

/** Undated items drop out of every one of the above, sorted by start. */
function dated<T extends Packable>(items: T[]): { it: T; sp: Span }[] {
  return items
    .map((it) => ({ it, sp: span(it) }))
    .filter((v): v is { it: T; sp: Span } => v.sp !== null)
    .sort((a, b) => (a.sp.s < b.sp.s ? -1 : a.sp.s > b.sp.s ? 1 : 0));
}
