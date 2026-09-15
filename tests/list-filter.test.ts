/**
 * Filtering the List and the Timeline, over one column and over several.
 *
 * The rules live in their own module for exactly this reason: what an empty
 * set means, what an empty cell means, and how two columns combine are all
 * decisions, and every one of them is invisible when it breaks — a filter that
 * is wrong does not throw, it just quietly shows the wrong rows.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY, TICKED, UNTICKED,
  valuesOf, matchesTerm, rowMatches, liveTerms, filterCount, toggleValue, clearColumn,
  filterColumnsFrom, describeTerm,
  type FilterColumn, type FilterableRow,
} from '../src/app/(signed-in)/p/[slug]/list-filter.ts';

const STATUS: FilterColumn = {
  key: 'f-status',
  label: 'สถานะ',
  source: 'select',
  fieldId: 'f-status',
  choices: [
    { id: 'o1', label: 'ยังไม่เริ่ม' },
    { id: 'o2', label: 'กำลังทำ' },
    { id: 'o3', label: 'เสร็จ', archived: true },
  ],
};

const TAGS: FilterColumn = {
  key: 'f-tags',
  label: 'Tags',
  source: 'multi_select',
  fieldId: 'f-tags',
  choices: [{ id: 't1', label: 'UI' }, { id: 't2', label: 'API' }],
};

const ASSIGN: FilterColumn = {
  key: 'f-who',
  label: 'Assign',
  source: 'people',
  fieldId: 'f-who',
  choices: [{ id: 'p1', label: 'Ann' }, { id: 'p2', label: 'Bee' }],
};

const DONE: FilterColumn = {
  key: 'f-done',
  label: 'Signed off',
  source: 'checkbox',
  fieldId: 'f-done',
  choices: [{ id: TICKED, label: 'Ticked' }, { id: UNTICKED, label: 'Not ticked' }],
};

const MODULE: FilterColumn = {
  key: '_module',
  label: 'Module',
  source: 'module',
  choices: [{ id: 'm1', label: 'One' }, { id: 'm2', label: 'Two' }],
};

const COLUMNS = [MODULE, STATUS, TAGS, ASSIGN, DONE];

const row = (id: string, values: Record<string, unknown> = {}): FilterableRow => ({
  led_node_id: id,
  led_custom_values: values,
});

const moduleOf = new Map([['n1', 'm1'], ['n2', 'm2']]);

describe('what a row is, in one column', () => {
  test('a select answers with its one option', () => {
    assert.deepEqual(valuesOf(row('n1', { 'f-status': 'o2' }), STATUS), ['o2']);
  });

  test('an empty select answers with nothing', () => {
    assert.deepEqual(valuesOf(row('n1', {}), STATUS), []);
    assert.deepEqual(valuesOf(row('n1', { 'f-status': null }), STATUS), []);
    assert.deepEqual(valuesOf(row('n1', { 'f-status': '' }), STATUS), []);
  });

  test('a set answers with every member', () => {
    assert.deepEqual(valuesOf(row('n1', { 'f-tags': ['t1', 't2'] }), TAGS), ['t1', 't2']);
  });

  test('people are read the same way as a set', () => {
    assert.deepEqual(valuesOf(row('n1', { 'f-who': ['p2'] }), ASSIGN), ['p2']);
  });

  /* A checkbox is never empty, so it answers with one of two borrowed values
     rather than with nothing — filtering it to Empty would match no row. */
  test('a checkbox is ticked or not ticked, never empty', () => {
    assert.deepEqual(valuesOf(row('n1', { 'f-done': true }), DONE), [TICKED]);
    assert.deepEqual(valuesOf(row('n1', {}), DONE), [UNTICKED]);
  });

  test('a module is read from the map, not from the row', () => {
    assert.deepEqual(valuesOf(row('n2'), MODULE, moduleOf), ['m2']);
    assert.deepEqual(valuesOf(row('nowhere'), MODULE, moduleOf), []);
  });

  test('a cell holding the wrong shape answers with nothing', () => {
    assert.deepEqual(valuesOf(row('n1', { 'f-tags': 'not-a-list' }), TAGS), []);
    assert.deepEqual(valuesOf(row('n1', { 'f-status': 42 }), STATUS), []);
  });
});

describe('one column', () => {
  test('an empty set is not a filter at all — everything is shown', () => {
    assert.equal(matchesTerm(row('n1', {}), { key: STATUS.key, values: [] }, STATUS), true);
  });

  test('values inside one column are alternatives', () => {
    const term = { key: STATUS.key, values: ['o1', 'o2'] };
    assert.equal(matchesTerm(row('n1', { 'f-status': 'o1' }), term, STATUS), true);
    assert.equal(matchesTerm(row('n1', { 'f-status': 'o2' }), term, STATUS), true);
    assert.equal(matchesTerm(row('n1', { 'f-status': 'o3' }), term, STATUS), false);
  });

  test('a set matches if any one of its members was asked for', () => {
    const term = { key: TAGS.key, values: ['t2'] };
    assert.equal(matchesTerm(row('n1', { 'f-tags': ['t1', 't2'] }), term, TAGS), true);
    assert.equal(matchesTerm(row('n1', { 'f-tags': ['t1'] }), term, TAGS), false);
  });

  test('an empty cell matches only when Empty was asked for', () => {
    assert.equal(matchesTerm(row('n1', {}), { key: STATUS.key, values: ['o1'] }, STATUS), false);
    assert.equal(matchesTerm(row('n1', {}), { key: STATUS.key, values: [EMPTY] }, STATUS), true);
  });

  test('Empty stands beside real values rather than replacing them', () => {
    const term = { key: ASSIGN.key, values: ['p1', EMPTY] };
    assert.equal(matchesTerm(row('n1', { 'f-who': ['p1'] }), term, ASSIGN), true);
    assert.equal(matchesTerm(row('n1', { 'f-who': [] }), term, ASSIGN), true);
    assert.equal(matchesTerm(row('n1', { 'f-who': ['p2'] }), term, ASSIGN), false);
  });

  test('an archived option still filters — rows are filed under it', () => {
    assert.equal(
      matchesTerm(row('n1', { 'f-status': 'o3' }), { key: STATUS.key, values: ['o3'] }, STATUS),
      true,
    );
  });
});

describe('several columns', () => {
  test('columns narrow: every term must be satisfied', () => {
    const terms = [
      { key: STATUS.key, values: ['o1', 'o2'] },
      { key: ASSIGN.key, values: ['p1'] },
    ];
    const hit = row('n1', { 'f-status': 'o2', 'f-who': ['p1', 'p2'] });
    const miss = row('n1', { 'f-status': 'o2', 'f-who': ['p2'] });
    assert.equal(rowMatches(hit, terms, COLUMNS), true);
    assert.equal(rowMatches(miss, terms, COLUMNS), false);
  });

  test('no terms at all keeps every row', () => {
    assert.equal(rowMatches(row('n1', {}), [], COLUMNS), true);
  });

  test('a term naming a column that is gone is dropped, not obeyed', () => {
    const terms = [{ key: 'f-archived-field', values: ['x'] }];
    assert.equal(rowMatches(row('n1', {}), terms, COLUMNS), true);
  });

  test('module and status combine', () => {
    const terms = [
      { key: MODULE.key, values: ['m1'] },
      { key: STATUS.key, values: ['o2'] },
    ];
    assert.equal(rowMatches(row('n1', { 'f-status': 'o2' }), terms, COLUMNS, moduleOf), true);
    assert.equal(rowMatches(row('n2', { 'f-status': 'o2' }), terms, COLUMNS, moduleOf), false);
  });
});

describe('keeping the saved terms honest', () => {
  test('a term naming a missing column is dropped', () => {
    assert.deepEqual(liveTerms([{ key: 'gone', values: ['x'] }], COLUMNS), []);
  });

  test('a value naming a deleted option is dropped', () => {
    assert.deepEqual(
      liveTerms([{ key: STATUS.key, values: ['o1', 'deleted'] }], COLUMNS),
      [{ key: STATUS.key, values: ['o1'] }],
    );
  });

  test('a term left with nothing is dropped whole', () => {
    assert.deepEqual(liveTerms([{ key: STATUS.key, values: ['deleted'] }], COLUMNS), []);
  });

  test('Empty is always an allowed value', () => {
    assert.deepEqual(
      liveTerms([{ key: STATUS.key, values: [EMPTY] }], COLUMNS),
      [{ key: STATUS.key, values: [EMPTY] }],
    );
  });

  test('the pip counts values, not columns', () => {
    assert.equal(filterCount([{ key: 'a', values: ['1', '2'] }, { key: 'b', values: ['3'] }]), 3);
    assert.equal(filterCount([]), 0);
  });
});

describe('ticking and unticking', () => {
  test('the first tick in a column opens the column', () => {
    assert.deepEqual(toggleValue([], STATUS.key, 'o1'), [{ key: STATUS.key, values: ['o1'] }]);
  });

  test('a second tick widens the same column', () => {
    assert.deepEqual(
      toggleValue([{ key: STATUS.key, values: ['o1'] }], STATUS.key, 'o2'),
      [{ key: STATUS.key, values: ['o1', 'o2'] }],
    );
  });

  test('unticking removes just that value', () => {
    assert.deepEqual(
      toggleValue([{ key: STATUS.key, values: ['o1', 'o2'] }], STATUS.key, 'o1'),
      [{ key: STATUS.key, values: ['o2'] }],
    );
  });

  /* An empty set would mean "everything" anyway, but leaving it behind would
     keep the pip counting a column that filters nothing. */
  test('unticking the last value drops the column', () => {
    assert.deepEqual(toggleValue([{ key: STATUS.key, values: ['o1'] }], STATUS.key, 'o1'), []);
  });

  test('clearing one column leaves the others standing', () => {
    const terms = [{ key: STATUS.key, values: ['o1'] }, { key: TAGS.key, values: ['t1'] }];
    assert.deepEqual(clearColumn(terms, STATUS.key), [{ key: TAGS.key, values: ['t1'] }]);
  });
});

describe('which columns are offered', () => {
  const fields = [
    { id: 'f-name', name: 'Note', kind: 'text', archived: false, options: [] },
    { id: 'f-when', name: 'When', kind: 'date', archived: false, options: [] },
    { id: 'f-cost', name: 'Cost', kind: 'money', archived: false, options: [] },
    {
      id: 'f-tags', name: 'Tags', kind: 'multi_select', archived: false,
      options: [{ id: 't1', label: 'UI', archived: false }],
    },
    { id: 'f-who', name: 'Assign', kind: 'people', archived: false, options: [] },
    { id: 'f-done', name: 'Done', kind: 'checkbox', archived: false, options: [] },
    {
      id: 'f-status', name: 'Status', kind: 'select', archived: false,
      options: [{ id: 'o1', label: 'A', archived: false }, { id: 'o3', label: 'C', archived: true }],
    },
    {
      id: 'f-old', name: 'Old', kind: 'select', archived: true,
      options: [{ id: 'z', label: 'Z', archived: false }],
    },
  ];
  const people = [{ id: 'p1', name: 'Ann' }];
  const modules = [{ id: 'm1', name: 'One' }];

  test('only the columns that are a choice from a known set', () => {
    const cols = filterColumnsFrom(fields, people, modules, 'f-status');
    assert.deepEqual(
      cols.map((c) => c.key),
      ['_module', 'f-status', 'f-tags', 'f-who', 'f-done'],
    );
  });

  test('status leads the fields wherever it is filed', () => {
    const cols = filterColumnsFrom(fields, people, [], 'f-status');
    assert.equal(cols[0]?.key, 'f-status');
  });

  test('an archived field is not offered at all', () => {
    const cols = filterColumnsFrom(fields, people, modules, 'f-status');
    assert.equal(cols.some((c) => c.key === 'f-old'), false);
  });

  test('an archived option is offered, and says so', () => {
    const status = filterColumnsFrom(fields, people, [], 'f-status')[0]!;
    assert.deepEqual(status.choices.map((c) => [c.id, c.archived ?? false]), [['o1', false], ['o3', true]]);
  });

  test('a people column takes the project roster as its choices', () => {
    const who = filterColumnsFrom(fields, people, [], null).find((c) => c.key === 'f-who')!;
    assert.deepEqual(who.choices, [{ id: 'p1', label: 'Ann' }]);
  });

  test('no modules means no module column', () => {
    const cols = filterColumnsFrom(fields, people, [], null);
    assert.equal(cols.some((c) => c.key === '_module'), false);
  });

  test('a term reads back as its column and its values', () => {
    assert.equal(
      describeTerm({ key: STATUS.key, values: ['o1', EMPTY] }, COLUMNS),
      'สถานะ: ยังไม่เริ่ม, Empty',
    );
  });
});
