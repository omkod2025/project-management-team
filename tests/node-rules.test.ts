/**
 * Domain rule tests.
 *
 *   npm test
 *
 * Every test names the rule it defends (D-nn from docs/spec/01-domain.md).
 * These run without a database, because the rules they cover are decisions,
 * not queries — the SQL side is covered separately by db/tests.sql.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  planDateWrite,
  planAutoCapture,
  crossesAxes,
  childDepth,
  planMove,
  placeAmong,
  coerceValue,
  assertWritableKey,
  assertMoveTarget,
  assertArchivable,
  type NodeDates,
  type FieldSpec,
  type OptionSpec,
} from '../src/lib/node-rules.ts';
import { DomainError } from '../src/lib/errors.ts';
import { MAX_DEPTH } from '../src/lib/constants.ts';

const TODAY = '2026-09-07';

const blank: NodeDates = {
  estimateStart: null,
  estimateEnd: null,
  actualStart: null,
  actualEnd: null,
  actualSourceStart: null,
  actualSourceEnd: null,
};

const dated = (over: Partial<NodeDates> = {}): NodeDates => ({
  ...blank,
  estimateStart: '2026-09-01',
  estimateEnd: '2026-09-10',
  ...over,
});

/** Assert a call throws a DomainError carrying a specific code. */
function refuses(code: string, fn: () => unknown) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof DomainError, `expected a DomainError, got ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

/* ==================================================================== D-10 */

describe('D-10 — estimate and actual never touch each other', () => {
  test('writing an estimate produces no actual fields', () => {
    const write = planDateWrite(dated(), { estimateEnd: '2026-09-20' });
    assert.equal(write.estimateEnd, '2026-09-20');
    assert.equal(write.actualStartRaw, undefined);
    assert.equal(write.actualEndRaw, undefined);
    assert.equal(write.actualSourceEnd, undefined);
    assert.equal(crossesAxes(write), false);
  });

  test('writing an actual produces no estimate fields', () => {
    const write = planDateWrite(dated(), { actualEnd: '2026-09-14' });
    assert.equal(write.actualEndRaw, '2026-09-14');
    assert.equal(write.estimateStart, undefined);
    assert.equal(write.estimateEnd, undefined);
    assert.equal(crossesAxes(write), false);
  });

  test('automatic capture never writes an estimate', () => {
    const write = planAutoCapture(dated(), 'done', TODAY);
    assert.equal(write.estimateStart, undefined);
    assert.equal(write.estimateEnd, undefined);
    assert.equal(crossesAxes(write), false);
  });
});

/* ==================================================================== D-11 */

describe('D-11 — a range may not be inverted', () => {
  test('an estimate start after its end is refused', () => {
    refuses('E_RANGE_INVERTED', () =>
      planDateWrite(dated(), { estimateStart: '2026-09-20' }),
    );
  });

  test('an actual start after its end is refused', () => {
    refuses('E_RANGE_INVERTED', () =>
      planDateWrite(dated({ actualStart: '2026-09-01', actualEnd: '2026-09-05' }), {
        actualStart: '2026-09-09',
      }),
    );
  });

  test('a single-day range is legal', () => {
    const write = planDateWrite(blank, { estimateStart: '2026-09-07', estimateEnd: '2026-09-07' });
    assert.equal(write.estimateStart, '2026-09-07');
    assert.equal(write.estimateEnd, '2026-09-07');
  });

  test('D-12 — an end with no start is legal', () => {
    const write = planDateWrite(blank, { estimateEnd: '2026-09-30' });
    assert.equal(write.estimateEnd, '2026-09-30');
  });
});

/* ==================================================================== D-13 */

describe('D-13 — automatic actual capture', () => {
  test('inProgress fills a null actual start', () => {
    const write = planAutoCapture(blank, 'inProgress', TODAY);
    assert.equal(write.actualStartRaw, TODAY);
    assert.equal(write.actualSourceStart, 'auto');
    assert.equal(write.actualEndRaw, undefined, 'and does not touch the end');
  });

  test('done fills both when both are null', () => {
    const write = planAutoCapture(blank, 'done', TODAY);
    assert.equal(write.actualStartRaw, TODAY);
    assert.equal(write.actualEndRaw, TODAY);
    assert.equal(write.actualSourceEnd, 'auto');
  });

  test('done leaves an existing start alone', () => {
    const current = dated({ actualStart: '2026-09-01', actualSourceStart: 'auto' });
    const write = planAutoCapture(current, 'done', TODAY);
    assert.equal(write.actualStartRaw, undefined, 'the recorded start survives');
    assert.equal(write.actualEndRaw, TODAY);
  });

  test('notStarted captures nothing', () => {
    assert.deepEqual(planAutoCapture(blank, 'notStarted', TODAY), {});
  });

  test('D-34b — a null stage captures nothing, which is what makes cancelled safe', () => {
    assert.deepEqual(planAutoCapture(blank, null, TODAY), {});
  });

  test('returning from done to inProgress does not clear the end', () => {
    const current = dated({
      actualStart: '2026-09-01', actualSourceStart: 'auto',
      actualEnd: '2026-09-05', actualSourceEnd: 'auto',
    });
    const write = planAutoCapture(current, 'inProgress', TODAY);
    assert.equal(write.actualEndRaw, undefined, 'the work did finish once, and that is a fact');
  });

  test('re-entering done twice does not move the recorded end', () => {
    const current = dated({ actualEnd: '2026-09-05', actualSourceEnd: 'auto' });
    const write = planAutoCapture(current, 'done', TODAY);
    assert.equal(write.actualEndRaw, undefined);
  });
});

/* ==================================================================== D-14 */

describe('D-14 — a hand edit is manual, and manual is permanent', () => {
  test('a hand-edited actual is recorded as manual', () => {
    const write = planDateWrite(blank, { actualEnd: '2026-09-14' });
    assert.equal(write.actualSourceEnd, 'manual');
  });

  test('automatic capture never overwrites a manual field, even once cleared', () => {
    const current = dated({ actualEnd: null, actualSourceEnd: 'manual' });
    const write = planAutoCapture(current, 'done', TODAY);
    assert.equal(write.actualEndRaw, undefined, 'a human decided this field is empty');
  });

  test('clearing an actual clears its source, so capture may fill it again', () => {
    const write = planDateWrite(dated({ actualEnd: '2026-09-14', actualSourceEnd: 'manual' }), {
      actualEnd: null,
    });
    assert.equal(write.actualEndRaw, null);
    assert.equal(write.actualSourceEnd, null);
  });

  test('a manual edit in the same request wins over capture', () => {
    const pending = planDateWrite(blank, { actualEnd: '2026-09-30' });
    const write = planAutoCapture(blank, 'done', TODAY, pending);
    assert.equal(write.actualEndRaw, '2026-09-30', 'not today');
    assert.equal(write.actualSourceEnd, 'manual');
  });
});

/* ============================================================== D-1 to D-3 */

describe('D-1, D-2 — the depth ceiling', () => {
  test('a child sits one below its parent', () => {
    assert.equal(childDepth(1), 2);
    assert.equal(childDepth(3), 4);
  });

  test(`a child of depth ${MAX_DEPTH} is refused`, () => {
    refuses('E_MAX_DEPTH', () => childDepth(MAX_DEPTH));
  });

  test('the ceiling is 6, raised from 4 on 2026-09-07', () => {
    assert.equal(MAX_DEPTH, 6);
    assert.equal(childDepth(5), 6);
  });
});

describe('D-3 — moves, including indent and outdent', () => {
  test('a task moves to another parent at the same level', () => {
    assert.deepEqual(planMove(3, 2, 0), { newDepth: 3, delta: 0 });
  });

  test('indent — a task becomes a child of its previous sibling', () => {
    // depth 3 moving under another depth-3 node lands at 4
    assert.deepEqual(planMove(3, 3, 0), { newDepth: 4, delta: 1 });
  });

  test('outdent — a subtask is promoted to the level of its parent', () => {
    assert.deepEqual(planMove(4, 2, 0), { newDepth: 3, delta: -1 });
  });

  test('a whole subtree shifts by the same amount', () => {
    // a depth-3 node with two levels under it, indented one step
    assert.deepEqual(planMove(3, 3, 2), { newDepth: 4, delta: 1 });
  });

  test('the ceiling is what still refuses a move', () => {
    // depth 4 with three levels beneath it would reach 7
    refuses('E_MAX_DEPTH', () => planMove(4, 3, 3));
  });

  test('and the deepest resulting depth is reported, so the message can say why', () => {
    assert.throws(() => planMove(4, 5, 1), (err: unknown) => {
      assert.ok(err instanceof DomainError);
      assert.equal(err.detail?.deepest, 7);
      return true;
    });
  });
});

describe('D-3 — a move must never make a cycle', () => {
  test('a node cannot be moved under itself', () => {
    refuses('E_LEVEL_MISMATCH', () => assertMoveTarget('a', 'a', []));
  });

  test('a node cannot be moved into its own subtree', () => {
    // target 'c' sits beneath 'a'
    refuses('E_LEVEL_MISMATCH', () => assertMoveTarget('a', 'c', ['b', 'a']));
  });

  test('an unrelated target is fine', () => {
    assert.doesNotThrow(() => assertMoveTarget('a', 'z', ['y', 'root']));
  });
});

describe('D-4 — archiving', () => {
  test('a module can be archived', () => {
    assert.doesNotThrow(() => assertArchivable(2));
  });

  test('the project root cannot', () => {
    refuses('E_LEVEL_MISMATCH', () => assertArchivable(1));
  });
});

/* ============================================================= D-31 to D-34 */

const selectField: FieldSpec = { id: 'f-status', kind: 'select', archived: false };
const moneyField: FieldSpec = { id: 'f-budget', kind: 'money', archived: false, currency: 'USD' };
const options: OptionSpec[] = [
  { id: 'o-backlog', fieldId: 'f-status', archived: false },
  { id: 'o-cancelled', fieldId: 'f-status', archived: true },
];

describe('D-32 — value shapes', () => {
  test('money keeps its field currency, not an assumed one', () => {
    assert.deepEqual(coerceValue(moneyField, 50000, options), { amount: 50000, currency: 'USD' });
  });

  test('money accepts an already-shaped value', () => {
    assert.deepEqual(coerceValue(moneyField, { amount: 12, currency: 'ignored' }, options), {
      amount: 12, currency: 'USD',
    });
  });

  test('an empty string clears rather than storing ""', () => {
    assert.equal(coerceValue(selectField, '', options), null);
    assert.equal(coerceValue(moneyField, '', options), null);
  });

  test('a date must be YYYY-MM-DD', () => {
    const f: FieldSpec = { id: 'f-d', kind: 'date', archived: false };
    assert.equal(coerceValue(f, '2026-09-07', []), '2026-09-07');
    refuses('E_UNKNOWN_FIELD', () => coerceValue(f, '7 Sep 2026', []));
  });

  test('a number that is not a number is refused, never stored as NaN', () => {
    const f: FieldSpec = { id: 'f-n', kind: 'number', archived: false };
    refuses('E_UNKNOWN_FIELD', () => coerceValue(f, 'abc', []));
  });

  test('multi_select requires a list', () => {
    const f: FieldSpec = { id: 'f-status', kind: 'multi_select', archived: false };
    refuses('E_UNKNOWN_FIELD', () => coerceValue(f, 'o-backlog', options));
    assert.deepEqual(coerceValue(f, ['o-backlog'], options), ['o-backlog']);
  });
});

describe('D-33, D-34 — archived options and fields', () => {
  test('a live option is accepted', () => {
    assert.equal(coerceValue(selectField, 'o-backlog', options), 'o-backlog');
  });

  test('an archived option cannot be chosen', () => {
    refuses('E_OPTION_ARCHIVED', () => coerceValue(selectField, 'o-cancelled', options));
  });

  test('an unknown option is refused rather than stored', () => {
    refuses('E_UNKNOWN_FIELD', () => coerceValue(selectField, 'o-nonexistent', options));
  });

  test('an archived field cannot be written', () => {
    const archived: FieldSpec = { ...selectField, archived: true };
    refuses('E_UNKNOWN_FIELD', () => coerceValue(archived, 'o-backlog', options));
  });

  test('an option belonging to another field is refused', () => {
    const other: OptionSpec[] = [{ id: 'o-x', fieldId: 'f-other', archived: false }];
    refuses('E_UNKNOWN_FIELD', () => coerceValue(selectField, 'o-x', other));
  });
});

describe('D-32 — reserved keys', () => {
  test('a client cannot write the importer key', () => {
    refuses('E_RESERVED_KEY', () => assertWritableKey('_clickup_id'));
  });

  test('any underscore key is refused, not just the known one', () => {
    refuses('E_RESERVED_KEY', () => assertWritableKey('_anything'));
  });

  test('an ordinary field id is fine', () => {
    assert.doesNotThrow(() => assertWritableKey('f-status'));
  });
});

/* ------------------------------------------------- D-3 · where it lands */

describe('placeAmong — the order a moved or created row takes', () => {
  const run = [
    { id: 'a', sortOrder: 0 },
    { id: 'b', sortOrder: 1 },
    { id: 'c', sortOrder: 2 },
  ];

  test('behind a named sibling, between it and the next', () => {
    assert.equal(placeAmong(run, 'a'), 0.5);
    assert.equal(placeAmong(run, 'b'), 1.5);
  });

  test('behind the last one, past the end', () => {
    assert.equal(placeAmong(run, 'c'), 3);
  });

  /* `null` is the front of the run, and it is deliberately not the same as
     leaving it out: a row dropped above the first child has to land first,
     and an omitted `afterId` appends. */
  test('null is the front', () => {
    assert.equal(placeAmong(run, null), -1);
  });

  test('omitted is the end', () => {
    assert.equal(placeAmong(run, undefined), 3);
  });

  test('the first row of an empty parent takes zero', () => {
    assert.equal(placeAmong([], null), 0);
    assert.equal(placeAmong([], undefined), 0);
  });

  /* Inserting between two rows must touch one row, not renumber the run —
     which is why node_sort_order is a float. */
  test('inserting repeatedly between the same two never disturbs them', () => {
    let siblings = [{ id: 'a', sortOrder: 0 }, { id: 'b', sortOrder: 1 }];
    for (let i = 0; i < 20; i++) {
      const placed = placeAmong(siblings, 'a');
      assert.ok(placed > 0 && placed < siblings[1]!.sortOrder, `round ${i}`);
      siblings = [siblings[0]!, { id: `x${i}`, sortOrder: placed }, ...siblings.slice(1)];
    }
    assert.equal(siblings[0]!.sortOrder, 0);
    assert.equal(siblings.at(-1)!.sortOrder, 1);
  });

  test('a sibling that is not there is treated as the end, never as the front', () => {
    assert.equal(placeAmong(run, 'gone'), 3);
  });
});
