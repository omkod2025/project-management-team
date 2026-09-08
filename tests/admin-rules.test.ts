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
  assertPassword, assertNewPassword, MIN_PASSWORD_LENGTH,
  assertNotProtectedAccount, assertNotSelf, assertLeavesNoProjectAdminless,
  assertAdminsEveryProjectOf, PROTECTED_EMAIL,
  assertFullName, assertNotProtectedReset, assertResetIsNotSelf,
  assertSharesAnAdministeredProject,
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

  test('a replacement may not be the password it replaces', () => {
    // The forced change after an admin-set starting password: re-entering the
    // same string would lower the flag while the admin still holds a working
    // credential, which is worse than not asking.
    assert.equal(assertNewPassword('Given12345', 'Chosen54321'), 'Chosen54321');
    refuses('E_UNKNOWN_FIELD', () => assertNewPassword('Given12345', 'Given12345'));
  });

  test('sameness is judged after Unicode normalisation, as hashing is', () => {
    // The two strings below are the same text in different normal forms. If
    // this compared raw code units the rule would pass them as different and
    // scrypt would then hash them to the same key — the admin's password back
    // again, with the flag cleared.
    const composed = 'ñabcdefghij'.normalize('NFC');
    const decomposed = 'ñabcdefghij'.normalize('NFD');
    assert.notEqual(composed, decomposed, 'the test is meaningless if these match');
    refuses('E_UNKNOWN_FIELD', () => assertNewPassword(composed, decomposed));
  });

  test('a too-short replacement is refused before it is compared', () => {
    refuses('E_UNKNOWN_FIELD', () => assertNewPassword('Given12345', 'short'));
  });

  test('the constant is the single source of that rule', () => {
    // seed.mjs keeps its own copy because it runs without the bundler; if this
    // number moves, that copy has to move with it.
    assert.equal(MIN_PASSWORD_LENGTH, 10);
  });
});

/* ================================================ deleting a user account */

describe('deleting a user — the four refusals', () => {
  test('the install account cannot be deleted, however the address is cased', () => {
    assert.equal(PROTECTED_EMAIL, 'admin@cit.com');
    refuses('E_FORBIDDEN', () => assertNotProtectedAccount('admin@cit.com'));
    refuses('E_FORBIDDEN', () => assertNotProtectedAccount('Admin@CIT.com'));
    refuses('E_FORBIDDEN', () => assertNotProtectedAccount('  admin@cit.com  '));
  });

  test('and any other address passes', () => {
    assert.equal(assertNotProtectedAccount('someone@cit.com'), undefined);
    // Near misses, so the guard is an equality test and not a substring one.
    assert.equal(assertNotProtectedAccount('admin@cit.com.co'), undefined);
    assert.equal(assertNotProtectedAccount('notadmin@cit.com'), undefined);
  });

  test('nobody deletes themselves — the session would outlive the row', () => {
    refuses('E_FORBIDDEN', () => assertNotSelf('u1', 'u1'));
    assert.equal(assertNotSelf('u1', 'u2'), undefined);
  });

  /*
   * Membership cascades on delete, so removing an account removes every
   * membership it held. Without this rule, deleting is a back door into
   * exactly the adminless project `assertKeepsAnAdmin` refuses to create.
   */
  test('deleting the only admin of a project is refused, and the project is named', () => {
    refuses('E_FORBIDDEN', () => assertLeavesNoProjectAdminless(['Bannayuu Next']));
    refuses('E_FORBIDDEN', () => assertLeavesNoProjectAdminless(['A', 'B']));
    assert.equal(assertLeavesNoProjectAdminless([]), undefined);
  });

  test('you cannot delete somebody whose projects you do not administer', () => {
    // There is no workspace superuser (spec 05 §2), so admin of one project is
    // no standing to destroy access to another.
    refuses('E_FORBIDDEN', () => assertAdminsEveryProjectOf(1));
    assert.equal(assertAdminsEveryProjectOf(0), undefined);
  });
});

/* ============================================================ own profile */

describe('renaming yourself', () => {
  test('a name is trimmed and kept exactly as typed otherwise', () => {
    assert.equal(assertFullName('  Pim Suwannarat  '), 'Pim Suwannarat');
    // Thai is content, not chrome: no case folding, no transliteration, and it
    // must survive the boundary unchanged.
    assert.equal(assertFullName('พิมพ์ สุวรรณรัตน์'), 'พิมพ์ สุวรรณรัตน์');
  });

  test('an empty name is refused — the column is NOT NULL and it is drawn everywhere', () => {
    refuses('E_UNKNOWN_FIELD', () => assertFullName(''));
    refuses('E_UNKNOWN_FIELD', () => assertFullName('   '));
    refuses('E_UNKNOWN_FIELD', () => assertFullName(null));
    refuses('E_UNKNOWN_FIELD', () => assertFullName(42));
  });

  test('and an unreasonable one', () => {
    assert.equal(assertFullName('น'.repeat(120)).length, 120);
    refuses('E_UNKNOWN_FIELD', () => assertFullName('n'.repeat(121)));
  });
});

/* ================================================ resetting a password */

describe('resetting somebody else’s password — the three refusals', () => {
  test('the install account is not resettable, however the address is cased', () => {
    refuses('E_FORBIDDEN', () => assertNotProtectedReset('admin@cit.com'));
    refuses('E_FORBIDDEN', () => assertNotProtectedReset('  Admin@CIT.com '));
    // Near misses pass, so the guard is equality and not a substring test.
    assert.equal(assertNotProtectedReset('notadmin@cit.com'), undefined);
    assert.equal(assertNotProtectedReset('admin@cit.com.co'), undefined);
  });

  test('the refusal is about the password, not about deletion', () => {
    // Two rules, two sentences. Being told the account cannot be deleted when
    // you asked to reset a password reads as a bug in the page.
    assert.throws(() => assertNotProtectedReset(PROTECTED_EMAIL), (err: unknown) => {
      assert.ok(err instanceof DomainError);
      assert.ok(!/deleted/.test(err.message), err.message);
      return true;
    });
  });

  test('nobody resets their own — it would raise the flag on their own session', () => {
    refuses('E_FORBIDDEN', () => assertResetIsNotSelf('u1', 'u1'));
    assert.equal(assertResetIsNotSelf('u1', 'u2'), undefined);
  });

  /*
   * One shared administered project is the whole standing test, at the owner's
   * instruction (2026-09-08). It is looser than deletion's on purpose: the
   * stricter rule made a reset unusable on an install where people sit on
   * several projects, because only an admin of all of them could help.
   */
  test('one project you administer, shared with them, is enough', () => {
    assert.equal(assertSharesAnAdministeredProject(1), undefined);
    assert.equal(assertSharesAnAdministeredProject(4), undefined);
  });

  test('and none is not', () => {
    // Which is the case that matters: the access board lists every account on
    // the install, including people the caller has no relationship with.
    refuses('E_FORBIDDEN', () => assertSharesAnAdministeredProject(0));
  });

  test('this is deliberately looser than the rule for deleting the same person', () => {
    // Somebody on two projects, one of which the caller does not administer.
    // Their password may be reset; their account may not be deleted.
    assert.equal(assertSharesAnAdministeredProject(1), undefined);
    refuses('E_FORBIDDEN', () => assertAdminsEveryProjectOf(1));
  });
});
