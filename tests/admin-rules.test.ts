/**
 * Administration rule tests (T8).
 *
 * Most of these guard against a change that would leave the project in a state
 * nobody can recover from through the UI — the kind of bug that is cheap to
 * prevent and expensive to discover.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertFieldKind, assertKindUnchanged, assertFieldName, assertStatusFieldKind,
  assertStage, assertOptionLabel, assertColorIndex, assertKeepsADoneStage,
  assertRole, assertKeepsAnAdmin, assertHolidayDate, assertHolidayName, assertEmail,
  assertPassword, MIN_PASSWORD_LENGTH,
} from '../src/lib/admin-rules.ts';
import { DomainError } from '../src/lib/errors.ts';

function refuses(code: string, fn: () => unknown) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof DomainError, `expected a DomainError, got ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

describe('D-31 — a column keeps its type', () => {
  test('the same kind passes', () => {
    assert.doesNotThrow(() => assertKindUnchanged('select', 'select'));
  });

  test('omitting the kind is not a change', () => {
    assert.doesNotThrow(() => assertKindUnchanged('select', undefined));
  });

  test('a different kind is refused', () => {
    refuses('E_FIELD_TYPE_IMMUTABLE', () => assertKindUnchanged('select', 'text'));
  });

  test('an unknown kind is refused at creation', () => {
    refuses('E_UNKNOWN_FIELD', () => assertFieldKind('formula'));
    assert.equal(assertFieldKind('money'), 'money');
  });

  test('a column needs a name', () => {
    refuses('E_UNKNOWN_FIELD', () => assertFieldName('   '));
    assert.equal(assertFieldName('  Budget  '), 'Budget');
  });
});

describe('D-35 — the status column', () => {
  test('only a select can be it', () => {
    assert.doesNotThrow(() => assertStatusFieldKind('select'));
    refuses('E_STATUS_FIELD_TYPE', () => assertStatusFieldKind('text'));
    refuses('E_STATUS_FIELD_TYPE', () => assertStatusFieldKind('multi_select'));
  });

  test('the designation can be cleared', () => {
    assert.doesNotThrow(() => assertStatusFieldKind(null));
  });

  test('it must keep an option marked done, or finished work is never recorded', () => {
    refuses('E_STATUS_FIELD_TYPE', () =>
      assertKeepsADoneStage(true, ['notStarted', 'inProgress', null]));
    assert.doesNotThrow(() => assertKeepsADoneStage(true, ['notStarted', 'done']));
  });

  test('an ordinary select has no such requirement', () => {
    assert.doesNotThrow(() => assertKeepsADoneStage(false, [null, null]));
  });
});

describe('options', () => {
  test('a stage must be one of the three, or nothing', () => {
    assert.equal(assertStage('done'), 'done');
    assert.equal(assertStage(''), null, 'empty means no stage (D-34b)');
    assert.equal(assertStage(null), null);
    refuses('E_UNKNOWN_FIELD', () => assertStage('finished'));
  });

  test('a colour must be one of the six tab hues', () => {
    assert.equal(assertColorIndex(3), 3);
    assert.equal(assertColorIndex(undefined), 1);
    refuses('E_UNKNOWN_FIELD', () => assertColorIndex(7));
    refuses('E_UNKNOWN_FIELD', () => assertColorIndex('#ff0000'));
  });

  test('an option needs a label', () => {
    refuses('E_UNKNOWN_FIELD', () => assertOptionLabel(''));
    assert.equal(assertOptionLabel('  DONE '), 'DONE');
  });
});

describe('members', () => {
  test('a role must be one of the three', () => {
    assert.equal(assertRole('viewer'), 'viewer');
    refuses('E_FORBIDDEN', () => assertRole('owner'));
  });

  test('a project must keep an admin, so nobody can lock themselves out', () => {
    refuses('E_FORBIDDEN', () => assertKeepsAnAdmin([]));
    assert.doesNotThrow(() => assertKeepsAnAdmin(['someone']));
  });
});

describe('calendar and users', () => {
  test('a holiday needs a real date', () => {
    assert.equal(assertHolidayDate('2026-12-31'), '2026-12-31');
    refuses('E_UNKNOWN_FIELD', () => assertHolidayDate('31/12/2026'));
    refuses('E_UNKNOWN_FIELD', () => assertHolidayDate('2026-13-40'));
  });

  test('a holiday needs a name', () => {
    refuses('E_UNKNOWN_FIELD', () => assertHolidayName(' '));
  });

  test('an email is normalised, and nonsense is refused', () => {
    assert.equal(assertEmail('  Ouan@Example.COM '), 'ouan@example.com');
    refuses('E_UNKNOWN_FIELD', () => assertEmail('not-an-address'));
  });
});

describe('passwords', () => {
  test('the minimum is length, and nothing else', () => {
    assert.equal(assertPassword('Admin54321'), 'Admin54321', 'ten characters is accepted');
    assert.equal(assertPassword('aaaaaaaaaa'), 'aaaaaaaaaa', 'no composition rule is imposed');
    refuses('E_UNKNOWN_FIELD', () => assertPassword('Admin5432'));
    refuses('E_UNKNOWN_FIELD', () => assertPassword(''));
  });

  test('the constant is the single source of that rule', () => {
    // seed.mjs keeps its own copy because it runs without the bundler; if this
    // number moves, that copy has to move with it.
    assert.equal(MIN_PASSWORD_LENGTH, 10);
  });
});
