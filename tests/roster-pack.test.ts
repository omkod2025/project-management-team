/**
 * Roster lane packing.
 *
 * The roster's one visual claim is that **a lane's height is how much work
 * overlaps in it**. Every test here defends that claim, because a packer that
 * is subtly wrong does not render as an error — it renders as a person who
 * looks less busy than they are, and nothing downstream will catch it.
 *
 *   npm test        # no database, no server
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  contendedRuns, occupancy, pack, span, unpack, type Packable,
} from '../src/app/(signed-in)/timeline/pack.ts';

/** An item with an estimate only — the shape 122 of the 174 real tasks have. */
const est = (s: string | null, e: string | null): Packable =>
  ({ estimateStart: s, estimateEnd: e, actualStart: null, actualEnd: null });

const both = (es: string, ee: string, as: string, ae: string): Packable =>
  ({ estimateStart: es, estimateEnd: ee, actualStart: as, actualEnd: ae });

const shape = (rows: Packable[][]) => rows.map((r) => r.length);

/* ==================================================================== span */

describe('span — what an item reserves', () => {
  test('an estimate alone reserves its estimate', () => {
    assert.deepEqual(span(est('2026-09-01', '2026-09-05')), { s: '2026-09-01', e: '2026-09-05' });
  });

  test('an overrun reserves the union, not the plan', () => {
    // The whole reason the roster asks for occupancy rather than for the
    // schedule: a task planned for a week that ran three weeks held its owner
    // for three. Reserving the estimate would report them free for the
    // fortnight they were not.
    const it = both('2026-09-01', '2026-09-07', '2026-09-01', '2026-09-21');
    assert.deepEqual(span(it), { s: '2026-09-01', e: '2026-09-21' });
  });

  test('an actual that started before the plan widens the span at the front too', () => {
    const it = both('2026-09-10', '2026-09-20', '2026-09-03', '2026-09-18');
    assert.deepEqual(span(it), { s: '2026-09-03', e: '2026-09-20' });
  });

  test('a milestone — one end, no start — still occupies its day', () => {
    assert.deepEqual(span(est(null, '2026-09-09')), { s: '2026-09-09', e: '2026-09-09' });
  });

  test('an item with none of the four dates reserves nothing', () => {
    assert.equal(span(est(null, null)), null);
  });
});

/* ==================================================================== pack */

describe('pack — the lane is as deep as the busiest day', () => {
  test('items that never overlap all share one sub-row', () => {
    const rows = pack([
      est('2026-09-01', '2026-09-03'),
      est('2026-09-10', '2026-09-12'),
      est('2026-09-20', '2026-09-22'),
    ]);
    assert.deepEqual(shape(rows), [3]);
  });

  test('three items overlapping on one day open three sub-rows, and no more', () => {
    const rows = pack([
      est('2026-09-01', '2026-09-10'),
      est('2026-09-05', '2026-09-15'),
      est('2026-09-08', '2026-09-20'),
    ]);
    assert.equal(rows.length, 3, 'depth equals the maximum simultaneous count');
  });

  test('a lane whose overlaps are staggered stays shallower than its item count', () => {
    // Six items, never more than two at once. A packer that opened a row per
    // item would draw this lane three times too tall and report a person as
    // triple-booked who is not.
    const rows = pack([
      est('2026-09-01', '2026-09-06'), est('2026-09-04', '2026-09-09'),
      est('2026-09-11', '2026-09-16'), est('2026-09-14', '2026-09-19'),
      est('2026-09-21', '2026-09-26'), est('2026-09-24', '2026-09-29'),
    ]);
    assert.equal(rows.length, 2);
    assert.deepEqual(shape(rows), [3, 3]);
  });

  test('input order does not change the result — items are sorted by start', () => {
    const items = [
      est('2026-09-20', '2026-09-22'),
      est('2026-09-01', '2026-09-03'),
      est('2026-09-10', '2026-09-12'),
    ];
    assert.deepEqual(shape(pack(items)), [3]);
    assert.deepEqual(shape(pack([...items].reverse())), [3]);
  });

  test('a long item does not have its row shortened by a short one behind it', () => {
    // The bug this guards: tracking each row's *last placed end* rather than
    // its extent. Place a long bar, then a short one that fits after it, then
    // something that overlaps the long bar — a row tracking the wrong end
    // would accept it and draw two bars on top of each other.
    const rows = pack([
      est('2026-09-01', '2026-09-30'),
      est('2026-10-02', '2026-10-03'),
      est('2026-09-15', '2026-09-20'),
    ]);
    assert.equal(rows[0]!.length, 2, 'the long bar and the one clear of it');
    assert.equal(rows[1]!.length, 1, 'the overlapping one is pushed down');
  });

  test('items touching end-to-start share a row when nothing pads them', () => {
    const rows = pack([est('2026-09-01', '2026-09-05'), est('2026-09-06', '2026-09-09')]);
    assert.deepEqual(shape(rows), [2]);
  });

  test('a pad separates bars that a coarse zoom would otherwise fuse', () => {
    // At month zoom a day is four pixels wide, so a one-day gap is invisible
    // and two items read as one continuous bar. The pad is a rendering
    // concession and changes nothing about the schedule.
    const rows = pack([est('2026-09-01', '2026-09-05'), est('2026-09-06', '2026-09-09')], 3);
    assert.deepEqual(shape(rows), [1, 1]);
  });

  test('undated items are not packed at all', () => {
    const rows = pack([est(null, null), est('2026-09-01', '2026-09-03'), est(null, null)]);
    assert.deepEqual(shape(rows), [1]);
  });

  test('a lane holding nothing dated packs to no rows', () => {
    assert.deepEqual(pack([est(null, null)]), []);
    assert.deepEqual(pack([]), []);
  });
});

/* ================================================================== unpack */

describe('unpack — the soloed reading', () => {
  test('one item per row, earliest first', () => {
    const a = est('2026-09-20', '2026-09-22');
    const b = est('2026-09-01', '2026-09-03');
    const rows = unpack([a, b]);
    assert.deepEqual(shape(rows), [1, 1]);
    assert.equal(rows[0]![0], b, 'earliest first');
  });

  test('it drops undated items on the same rule pack does', () => {
    assert.deepEqual(shape(unpack([est(null, null), est('2026-09-01', '2026-09-02')])), [1]);
  });
});

/* =============================================================== occupancy */

describe('occupancy and contention', () => {
  const window = '2026-09-01';

  test('a single item raises exactly its own days, inclusive of both ends', () => {
    const counts = occupancy([est('2026-09-03', '2026-09-05')], window, 10);
    assert.deepEqual(counts, [0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
  });

  test('overlaps add up', () => {
    const counts = occupancy(
      [est('2026-09-01', '2026-09-04'), est('2026-09-03', '2026-09-06'), est('2026-09-03', '2026-09-03')],
      window, 8,
    );
    assert.deepEqual(counts, [1, 1, 3, 2, 1, 1, 0, 0]);
  });

  test('items starting before the window are clamped, not dropped', () => {
    // The field opens 180 days before today; work older than that still runs
    // into it, and a lane that ignored it would show a gap where there is none.
    const counts = occupancy([est('2026-08-20', '2026-09-02')], window, 5);
    assert.deepEqual(counts, [1, 1, 0, 0, 0]);
  });

  test('items running past the window are clamped at its end', () => {
    const counts = occupancy([est('2026-09-04', '2027-01-01')], window, 6);
    assert.deepEqual(counts, [0, 0, 0, 1, 1, 1]);
  });

  test('a run is marked from the first contended day to the last', () => {
    const runs = contendedRuns([0, 1, 3, 3, 1, 3, 0], 3);
    assert.deepEqual(runs, [{ from: 2, to: 4 }, { from: 5, to: 6 }]);
  });

  test('contention that reaches the end of the window is still closed', () => {
    assert.deepEqual(contendedRuns([1, 3, 3], 3), [{ from: 1, to: 3 }]);
  });

  test('below the threshold nothing is marked — two at once is not a finding', () => {
    assert.deepEqual(contendedRuns([2, 2, 2], 3), []);
  });
});
