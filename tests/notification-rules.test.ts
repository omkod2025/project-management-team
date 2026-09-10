/**
 * Who gets told, and who does not (spec 11 §2).
 *
 * These are written as the situations a person would describe rather than as
 * calls: somebody added me, somebody added me twice through different fields,
 * I added myself, the field used to hold rubbish. The rule they defend is the
 * one with no schema behind it — that an assignment is any people field, not a
 * blessed one — which is exactly the kind of rule that drifts silently.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  assignmentsAdded, peopleIn, describeAssignment, type PeopleField,
} from '../src/lib/notification-rules.ts';

const OWNER: PeopleField = { id: 'f-owner', name: 'Owner' };
const REVIEW: PeopleField = { id: 'f-review', name: 'Review' };
const FIELDS = [OWNER, REVIEW];

const ANNA = 'u-anna';
const BEN = 'u-ben';

describe('reading a people field', () => {
  test('an array of ids', () => {
    assert.deepEqual(peopleIn([ANNA, BEN]), [ANNA, BEN]);
  });

  /* These values live in a jsonb column with no foreign keys (D-32), and a
     field that was `text` before it was `people` leaves a bare string behind.
     A save must not fail because of what somebody typed a year ago. */
  test('anything that is not an array is nobody', () => {
    assert.deepEqual(peopleIn(null), []);
    assert.deepEqual(peopleIn(undefined), []);
    assert.deepEqual(peopleIn('u-anna'), []);
    assert.deepEqual(peopleIn(42), []);
  });

  test('and rubbish inside an array is dropped, not carried', () => {
    assert.deepEqual(peopleIn([ANNA, null, 7, '', BEN]), [ANNA, BEN]);
  });
});

describe('somebody puts your name on a task', () => {
  test('you are told, and told which field it was', () => {
    assert.deepEqual(
      assignmentsAdded({}, { [OWNER.id]: [ANNA] }, FIELDS, BEN),
      [{ recipientId: ANNA, fieldId: OWNER.id, fieldName: 'Owner' }],
    );
  });

  /* The roster reads every people field rather than a blessed one (spec 09),
     and so does this. If a project's field is called anything but "Assignee"
     and this ever regresses, notifications go quiet with nothing failing. */
  test('through whichever field the project happens to use', () => {
    assert.deepEqual(
      assignmentsAdded({}, { [REVIEW.id]: [ANNA] }, FIELDS, BEN),
      [{ recipientId: ANNA, fieldId: REVIEW.id, fieldName: 'Review' }],
    );
  });

  test('one write naming three people tells three people', () => {
    const out = assignmentsAdded({}, { [OWNER.id]: [ANNA, BEN, 'u-cleo'] }, FIELDS, 'u-dana');
    assert.deepEqual(out.map((a) => a.recipientId), [ANNA, BEN, 'u-cleo']);
  });

  /* Two fields is two things being asked of you. Collapsing them would print
     the same sentence twice, since the sentence names the field. */
  test('being named in two fields at once is two notifications', () => {
    const out = assignmentsAdded({}, { [OWNER.id]: [ANNA], [REVIEW.id]: [ANNA] }, FIELDS, BEN);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((a) => a.fieldName), ['Owner', 'Review']);
  });

  test('a field the project does not define is not read at all', () => {
    assert.deepEqual(assignmentsAdded({}, { 'f-ghost': [ANNA] }, FIELDS, BEN), []);
  });
});

describe('what is not news', () => {
  test('a name that was already there', () => {
    assert.deepEqual(
      assignmentsAdded({ [OWNER.id]: [ANNA] }, { [OWNER.id]: [ANNA] }, FIELDS, BEN),
      [],
    );
  });

  test('putting your own name on something', () => {
    assert.deepEqual(assignmentsAdded({}, { [OWNER.id]: [ANNA] }, FIELDS, ANNA), []);
  });

  test('but the other people in the same write are still told', () => {
    const out = assignmentsAdded({}, { [OWNER.id]: [ANNA, BEN] }, FIELDS, ANNA);
    assert.deepEqual(out.map((a) => a.recipientId), [BEN]);
  });

  test('a name being taken off', () => {
    assert.deepEqual(
      assignmentsAdded({ [OWNER.id]: [ANNA, BEN] }, { [OWNER.id]: [BEN] }, FIELDS, BEN),
      [],
    );
  });

  test('a write that changes some other column entirely', () => {
    assert.deepEqual(
      assignmentsAdded(
        { [OWNER.id]: [ANNA], 'f-status': 'opt-1' },
        { [OWNER.id]: [ANNA], 'f-status': 'opt-2' },
        FIELDS, BEN,
      ),
      [],
    );
  });

  /* A project with no people field cannot assign anybody, and the roster
     already calls such a project `unassignable`. */
  test('a project that defines no people field', () => {
    assert.deepEqual(assignmentsAdded({}, { [OWNER.id]: [ANNA] }, [], BEN), []);
  });

  test('a name added and removed within one write is not two events', () => {
    // `after` is the settled state, not a stream of edits — there is only ever
    // one before and one after, so this is simply "no change".
    assert.deepEqual(
      assignmentsAdded({ [OWNER.id]: [ANNA] }, { [OWNER.id]: [ANNA] }, FIELDS, BEN),
      [],
    );
  });
});

describe('being re-assigned to something you were taken off', () => {
  /* The earlier row survives an un-assign (spec 11 §3), so this is genuinely a
     second event and must produce a second line — otherwise the log would
     record only the first time you were ever asked. */
  test('is news again', () => {
    assert.deepEqual(
      assignmentsAdded({ [OWNER.id]: [] }, { [OWNER.id]: [ANNA] }, FIELDS, BEN),
      [{ recipientId: ANNA, fieldId: OWNER.id, fieldName: 'Owner' }],
    );
  });
});

describe('the sentence', () => {
  test('names the actor, the field and the task', () => {
    assert.equal(
      describeAssignment('Anna', 'Owner', 'ออกแบบหน้าแรก'),
      'Anna put you in Owner on ออกแบบหน้าแรก',
    );
  });

  /* The actor's account may have been deleted since — the column is SET NULL,
     not CASCADE, precisely so the event survives the person. */
  test('and says "Somebody" when the actor is gone', () => {
    assert.match(describeAssignment(null, 'Owner', 'Task'), /^Somebody put you in/);
  });
});
