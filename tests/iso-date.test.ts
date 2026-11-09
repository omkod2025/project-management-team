/**
 * The shared date picker carries `yyyy-MM-dd` across the wire and local
 * midnight `Date`s inside the calendar. These tests pin the conversion, so a
 * chosen day never slides by one through a UTC round trip.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { formatIsoDate, formatIsoDateShort, parseIsoDate, toIsoDate, todayIso } from '../src/lib/iso-date.ts';

test('a stored date parses to local midnight on that day', () => {
  const d = parseIsoDate('2026-11-09')!;
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 9);
  assert.equal(d.getHours(), 0);
});

test('a date round-trips through the picker unchanged', () => {
  for (const iso of ['2026-01-01', '2026-12-31', '2028-02-29', '2026-03-29']) {
    assert.equal(toIsoDate(parseIsoDate(iso)!), iso);
  }
});

test('empty, malformed and impossible dates parse to nothing', () => {
  for (const bad of [null, undefined, '', '2026-2-3', '09/11/2026', '2026-02-30', '2027-02-29', '2026-13-01']) {
    assert.equal(parseIsoDate(bad), undefined, String(bad));
  }
});

test('the trigger reads day, short month, year', () => {
  assert.equal(formatIsoDate('2026-11-09'), '9 Nov 2026');
  assert.equal(formatIsoDate('2027-01-31'), '31 Jan 2027');
  assert.equal(formatIsoDate(null), null);
  assert.equal(formatIsoDate('nonsense'), null);
});

test('today is Bangkok’s today, not the browser’s', () => {
  // 2026-11-09 18:30 UTC is already 10 November in Asia/Bangkok (UTC+7).
  assert.equal(todayIso(new Date(Date.UTC(2026, 10, 9, 18, 30))), '2026-11-10');
  assert.equal(todayIso(new Date(Date.UTC(2026, 10, 9, 16, 59))), '2026-11-09');
});

test('the List cell reads the column’s own short form', () => {
  assert.equal(formatIsoDateShort('2026-11-09'), '09 Nov');
  assert.equal(formatIsoDateShort('2026-12-25'), '25 Dec');
  assert.equal(formatIsoDateShort(''), null);
});
