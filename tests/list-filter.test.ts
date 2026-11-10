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
  filterColumnsFrom, describeTerm, likeMatch, inRange, cellText, setText, setRange,
  type FilterColumn, type FilterableRow,
} from '../src/lib/list-filter.ts';

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

  test('choices, text and dates are offered; money and numbers are not', () => {
    const cols = filterColumnsFrom(fields, people, modules, 'f-status');
    assert.deepEqual(
      cols.map((c) => c.key),
      [
        '_module', 'f-status',
        '_name', '_est_start', '_est_end', '_act_start', '_act_end',
        'f-name', 'f-when', 'f-tags', 'f-who', 'f-done',
      ],
    );
  });

  test('a text field takes a box and a date field a range, with nothing to tick', () => {
    const cols = filterColumnsFrom(fields, people, [], null);
    assert.deepEqual(
      cols.filter((c) => c.fieldId === 'f-name' || c.fieldId === 'f-when').map((c) => [c.source, c.choices.length]),
      [['text', 0], ['date', 0]],
    );
  });

  test('the name and the four dates are offered even with no fields at all', () => {
    assert.deepEqual(
      filterColumnsFrom([], [], [], null).map((c) => c.key),
      ['_name', '_est_start', '_est_end', '_act_start', '_act_end'],
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

const NAME: FilterColumn = { key: '_name', label: 'Name', source: 'text', rowKey: 'led_name', choices: [] };
const NOTE: FilterColumn = { key: 'f-note', label: 'หมายเหตุ', source: 'text', fieldId: 'f-note', choices: [] };
const EST_END: FilterColumn = {
  key: '_est_end', label: 'Estimate end', source: 'date', rowKey: 'led_estimate_end', choices: [],
};
const DUE: FilterColumn = { key: 'f-due', label: 'Due', source: 'date', fieldId: 'f-due', choices: [] };
const TYPED = [NAME, NOTE, EST_END, DUE, STATUS];

const task = (over: Partial<FilterableRow> & { values?: Record<string, unknown> } = {}): FilterableRow => ({
  led_node_id: 'n1',
  led_name: 'ออกแบบหน้า Login',
  led_estimate_end: '2026-11-20',
  ...over,
  led_custom_values: over.values ?? {},
});

describe('text, like LIKE', () => {
  test('contains, wherever it falls, in any case', () => {
    assert.equal(likeMatch('Design the LOGIN page', 'login'), true);
    assert.equal(likeMatch('Design the login page', 'signup'), false);
  });

  test('% stands for any run, and the parts must come in order', () => {
    assert.equal(likeMatch('Design the login page', 'design%page'), true);
    assert.equal(likeMatch('Design the login page', 'page%design'), false);
  });

  test('Thai is matched as typed', () => {
    assert.equal(likeMatch('ออกแบบหน้า Login', 'หน้า'), true);
  });

  test('_ is a literal, not a wildcard', () => {
    assert.equal(likeMatch('api_v2', 'i_v'), true);
    assert.equal(likeMatch('apixv2', 'i_v'), false);
  });

  test('an empty box, or only %, asks for nothing', () => {
    assert.equal(likeMatch(null, ''), true);
    assert.equal(likeMatch(null, ' % '), true);
  });

  test('an empty cell never contains anything', () => {
    assert.equal(likeMatch(null, 'a'), false);
  });

  test('the name is read from the row, a text field from its values', () => {
    assert.equal(matchesTerm(task(), { key: '_name', values: [], text: 'login' }, NAME), true);
    assert.equal(
      matchesTerm(task({ values: { 'f-note': 'รอลูกค้ายืนยัน' } }), { key: 'f-note', values: [], text: 'ลูกค้า' }, NOTE),
      true,
    );
    assert.equal(matchesTerm(task(), { key: 'f-note', values: [], text: 'ลูกค้า' }, NOTE), false);
  });
});

describe('a range of days', () => {
  test('both ends are inclusive', () => {
    assert.equal(inRange('2026-11-01', '2026-11-01', '2026-11-30'), true);
    assert.equal(inRange('2026-11-30', '2026-11-01', '2026-11-30'), true);
    assert.equal(inRange('2026-12-01', '2026-11-01', '2026-11-30'), false);
  });

  test('either end may be left open', () => {
    assert.equal(inRange('2030-01-01', '2026-11-01', undefined), true);
    assert.equal(inRange('2020-01-01', undefined, '2026-11-01'), true);
    assert.equal(inRange('2026-11-02', undefined, '2026-11-01'), false);
  });

  test('ends given the wrong way round are read the right way round', () => {
    assert.equal(inRange('2026-11-15', '2026-11-30', '2026-11-01'), true);
  });

  test('an empty cell is outside every range, and no range keeps it', () => {
    assert.equal(inRange(null, '2026-11-01', undefined), false);
    assert.equal(inRange(null, undefined, undefined), true);
  });

  test('a malformed end is ignored rather than obeyed', () => {
    assert.equal(inRange('2026-11-15', 'soon', '2026-11-30'), true);
  });

  test('an estimate date is read from the row, a date field from its values', () => {
    const term = { key: '_est_end', values: [], from: '2026-11-15', to: '2026-11-25' };
    assert.equal(matchesTerm(task(), term, EST_END), true);
    assert.equal(matchesTerm(task({ led_estimate_end: '2026-12-01' }), term, EST_END), false);
    assert.equal(
      matchesTerm(task({ values: { 'f-due': '2026-11-16' } }), { key: 'f-due', values: [], from: '2026-11-16' }, DUE),
      true,
    );
  });

  test('an estimate range never reads the actual', () => {
    const term = { key: '_est_end', values: [], from: '2026-11-01' };
    assert.equal(matchesTerm(task({ led_estimate_end: null, led_actual_end: '2026-11-20' }), term, EST_END), false);
  });
});

describe('typed terms beside ticked ones', () => {
  test('text, a range and a status all narrow together', () => {
    const terms = [
      { key: '_name', values: [], text: 'login' },
      { key: '_est_end', values: [], to: '2026-11-30' },
      { key: STATUS.key, values: ['o2'] },
    ];
    assert.equal(rowMatches(task({ values: { 'f-status': 'o2' } }), terms, TYPED), true);
    assert.equal(rowMatches(task({ values: { 'f-status': 'o1' } }), terms, TYPED), false);
    assert.equal(rowMatches(task({ led_name: 'API', values: { 'f-status': 'o2' } }), terms, TYPED), false);
  });

  test('setText keeps what is typed and drops the column when the box empties', () => {
    const typed = setText([], '_name', 'log ');
    assert.deepEqual(typed, [{ key: '_name', values: [], text: 'log ' }]);
    assert.deepEqual(setText(typed, '_name', ''), []);
  });

  test('setRange keeps one end alone, and both ends cleared drops the column', () => {
    const half = setRange([], '_est_end', '2026-11-01', null);
    assert.deepEqual(half, [{ key: '_est_end', values: [], from: '2026-11-01' }]);
    const whole = setRange(half, '_est_end', '2026-11-01', '2026-11-30');
    assert.deepEqual(whole, [{ key: '_est_end', values: [], from: '2026-11-01', to: '2026-11-30' }]);
    assert.deepEqual(setRange(whole, '_est_end', null, null), []);
  });

  test('a text or a range counts once in the pip', () => {
    assert.equal(filterCount([
      { key: '_name', values: [], text: 'x' },
      { key: '_est_end', values: [], from: '2026-11-01', to: '2026-11-30' },
      { key: STATUS.key, values: ['o1', 'o2'] },
    ]), 4);
  });

  test('saved typed terms that ask for nothing are dropped', () => {
    assert.deepEqual(
      liveTerms([
        { key: '_name', values: [], text: '   ' },
        { key: '_est_end', values: [], from: 'not a day' },
        { key: 'f-due', values: [], to: '2026-11-30' },
      ], TYPED),
      [{ key: 'f-due', values: [], to: '2026-11-30' }],
    );
  });

  test('typed terms read back in words', () => {
    assert.equal(describeTerm({ key: '_name', values: [], text: 'login' }, TYPED), 'Name contains “login”');
    assert.equal(
      describeTerm({ key: '_est_end', values: [], from: '2026-11-01', to: '2026-11-30' }, TYPED),
      'Estimate end: 2026-11-01 – 2026-11-30',
    );
    assert.equal(describeTerm({ key: 'f-due', values: [], to: '2026-11-30' }, TYPED), 'Due: until 2026-11-30');
  });

  test('a text cell holding something else is read as empty', () => {
    assert.equal(cellText(task({ values: { 'f-note': ['x'] } }), NOTE), null);
  });
});
