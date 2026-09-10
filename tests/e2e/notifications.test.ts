/**
 * The bell, end to end (spec 11).
 *
 *   npm run dev        # in one terminal
 *   npm run test:e2e   # in another
 *
 * Two things here can only be tested against the real stack, and they are the
 * two worth the trouble:
 *
 *   - **that a notification is written at all.** No trigger writes this table.
 *     It is written by `updateNode`, on the one code path a people field can
 *     change through, and if that call is ever dropped nothing fails — the
 *     save still succeeds and the bell simply stays empty forever. Only an
 *     assertion against a real PATCH catches that.
 *   - **that the read stops where the reader's access stops.** A notification
 *     row outlives membership, and `permissions.ts` rule 1 says a non-member
 *     must not be able to learn a project exists. The filtering is a join, and
 *     a join is exactly the kind of thing that is correct until somebody adds
 *     a second query beside it.
 *
 * The suite adds its own people field to the standard fixture and removes it
 * afterwards. It never touches the imported ClickUp project.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

import {
  setup, signIn, patchNode, archiveNode, BASE_URL, type Fixture, type Jar,
} from '../helpers/harness.ts';
import { hashPassword } from '../../src/lib/password.ts';

let fx: Fixture;
let admin: Jar;
let viewer: Jar;
/** A real account on no project at all. */
let outsider: { id: string; email: string; password: string; jar: Jar };

const ownerFieldId = randomUUID();
const reviewFieldId = randomUUID();

before(async () => {
  fx = await setup();
  admin = await signIn(fx.admin.email, fx.admin.password);
  viewer = await signIn(fx.viewer.email, fx.viewer.password);

  // Two people fields under names that are not "Assignee", deliberately: there
  // is no assignee column in this product and the rule reads every people
  // field (spec 09, spec 11 §2).
  await sql(
    `INSERT INTO pmt_field_definitions
       (field_id, field_project_id, field_name, field_kind, field_position, field_settings)
     VALUES ($1, $3, 'Owner',  'people', 2, '{}'),
            ($2, $3, 'Review', 'people', 3, '{}')`,
    [ownerFieldId, reviewFieldId, fx.projectId],
  );

  outsider = {
    id: randomUUID(),
    email: `e2e-noti-outsider-${randomBytes(4).toString('hex')}@test.invalid`,
    password: randomBytes(18).toString('base64url'),
  } as typeof outsider;
  await sql(
    `INSERT INTO pmt_users (user_id, user_email, user_full_name, user_password_hash)
     VALUES ($1, $2, 'E2E Outsider', $3)`,
    [outsider.id, outsider.email, await hashPassword(outsider.password)],
  );
  outsider.jar = await signIn(outsider.email, outsider.password);
});

after(async () => {
  if (fx) {
    await sql('DELETE FROM pmt_users WHERE user_id = $1', [outsider.id]).catch(() => {});
    await fx.cleanup();
  }
});

async function sql(text: string, params: unknown[] = []) {
  return fx.client.query(text, params);
}

type Item = {
  id: string; text: string; nodeName: string; projectName: string;
  href: string; read: boolean;
};

async function bell(jar: Jar): Promise<{ unread: number; items: Item[] }> {
  const res = await fetch(`${BASE_URL}/api/notifications`, { headers: { cookie: jar.header } });
  assert.equal(res.status, 200);
  return (await res.json()) as { unread: number; items: Item[] };
}

async function badge(jar: Jar): Promise<number> {
  const res = await fetch(`${BASE_URL}/api/notifications?count=1`, { headers: { cookie: jar.header } });
  return ((await res.json()) as { unread: number }).unread;
}

/**
 * Put every test back to "nobody is assigned to anything, and nothing has been
 * said about it".
 *
 * Emptying the log is not enough, and the first draft of this file that only
 * did that failed in a way worth recording: an assignment is a *difference*,
 * so re-assigning somebody the previous test had already left in place is
 * correctly no news at all, and four tests were asserting against a starting
 * state they had inherited rather than set. The people fields have to be
 * cleared too.
 */
async function clear() {
  await sql('DELETE FROM pmt_notifications WHERE notification_project_id = $1', [fx.projectId]);
  // Only the two people fields, so a test that set a status or a budget keeps
  // whatever the fixture gave it.
  await sql(
    `UPDATE pmt_nodes
        SET node_custom_values = node_custom_values - $2::text - $3::text
      WHERE node_project_id = $1`,
    [fx.projectId, ownerFieldId, reviewFieldId],
  );
}

/** Put `who` in a people field of `node`, as `by`. */
async function assign(by: Jar, node: string, fieldId: string, who: string[]) {
  return patchNode(by, node, { values: { [fieldId]: who } });
}

/* ============================================================== the write */

describe('putting somebody’s name on a task tells them', () => {
  test('they are told, and told which field carried it', async () => {
    await clear();
    const { status } = await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);
    assert.equal(status, 200);

    const { unread, items } = await bell(viewer);
    assert.equal(unread, 1);
    assert.equal(items.length, 1);
    assert.match(items[0]!.text, /put you in Owner on Task/);
    assert.equal(items[0]!.read, false);
  });

  /* Nothing in the schema marks one people field as *the* assignee field. If
     this fails, somebody has hardcoded a field name, and every project whose
     field is called something else has silently gone quiet. */
  test('through a second people field just as well as the first', async () => {
    await clear();
    await assign(admin, fx.nodes.sub, reviewFieldId, [fx.viewer.id]);

    const { items } = await bell(viewer);
    assert.equal(items.length, 1);
    assert.match(items[0]!.text, /put you in Review on Subtask/);
  });

  test('the link goes to that task in that project’s List', async () => {
    await clear();
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);

    const { items } = await bell(viewer);
    // `?node=` is the parameter the List and the Timeline already share, so
    // following a notification uses the road that was already there.
    assert.match(items[0]!.href, new RegExp(`^/p/[^?]+\\?node=${fx.nodes.task}$`));
  });

  test('assigning yourself is not news', async () => {
    await clear();
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.admin.id]);
    assert.equal(await badge(admin), 0);
  });

  test('a name that was already there is not news again', async () => {
    await clear();
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);
    assert.equal(await badge(viewer), 1);
  });

  test('but being put back on after being taken off is', async () => {
    await clear();
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);
    await assign(admin, fx.nodes.task, ownerFieldId, []);
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);
    assert.equal(await badge(viewer), 2);
  });

  test('a write that changes something else entirely says nothing', async () => {
    await clear();
    await patchNode(admin, fx.nodes.task, { values: { [fx.statusFieldId]: fx.options.running } });
    assert.equal(await badge(viewer), 0);
  });

  test('renaming a task says nothing', async () => {
    await clear();
    await patchNode(admin, fx.nodes.task, { name: 'Task' });
    assert.equal(await badge(viewer), 0);
  });

  /* A people field stores bare ids with no foreign key (D-32), so it can name
     somebody who is not on the project — the ClickUp import is full of them.
     Writing them a notification would tell them a project they cannot open
     exists, which is the disclosure spec 05 rule 1 forbids. */
  test('somebody who is not on the project is not told', async () => {
    await clear();
    const { status } = await assign(admin, fx.nodes.task, ownerFieldId, [outsider.id]);
    assert.equal(status, 200, 'the save still succeeds — this is not a validation rule');
    assert.equal(await badge(outsider.jar), 0);
  });
});

/* ============================================================ un-assigning */

describe('taking the name back off', () => {
  /* The log records that it happened, and it did. Deleting the row would make
     the bell a mirror of who is currently assigned, which All Timeline already
     is — and would mean somebody who assigned you and changed their mind three
     days later had left you no trace of having been asked. */
  test('leaves the notification standing', async () => {
    await clear();
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);
    await assign(admin, fx.nodes.task, ownerFieldId, []);

    const { unread, items } = await bell(viewer);
    assert.equal(unread, 1);
    assert.equal(items.length, 1);
  });
});

/* ================================================================== reading */

describe('the count', () => {
  test('drops when you follow one through, not when you look at the bell', async () => {
    await clear();
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);

    const { items } = await bell(viewer);
    assert.equal(await badge(viewer), 1, 'listing them is not reading them');

    const res = await fetch(`${BASE_URL}/api/notifications/${items[0]!.id}`, {
      method: 'POST', headers: { cookie: viewer.header },
    });
    assert.equal(res.status, 200);
    assert.equal(await badge(viewer), 0);
  });

  test('the line stays in the list once read, quieter', async () => {
    const { items } = await bell(viewer);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.read, true);
  });

  test('mark all read clears it without following anything', async () => {
    await clear();
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);
    await assign(admin, fx.nodes.sub, reviewFieldId, [fx.viewer.id]);
    assert.equal(await badge(viewer), 2);

    await fetch(`${BASE_URL}/api/notifications`, { method: 'POST', headers: { cookie: viewer.header } });
    assert.equal(await badge(viewer), 0);
  });

  /* Scoped by user in the WHERE rather than checked first, so this changes
     nothing and answers the same as an id that never existed. */
  test('marking somebody else’s notification read does nothing to it', async () => {
    await clear();
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);
    const { items } = await bell(viewer);

    const res = await fetch(`${BASE_URL}/api/notifications/${items[0]!.id}`, {
      method: 'POST', headers: { cookie: admin.header },
    });
    assert.equal(res.status, 200, 'and does not confirm the id is real by refusing');
    assert.equal(await badge(viewer), 1, "the other reader's badge is untouched");
  });
});

/* ================================================================= scoping */

describe('the bell stops where the reader’s access stops', () => {
  test('a signed-out visitor is refused', async () => {
    const res = await fetch(`${BASE_URL}/api/notifications`);
    assert.equal(res.status, 401);
  });

  test('somebody on no project has an empty bell, not an error', async () => {
    const { unread, items } = await bell(outsider.jar);
    assert.equal(unread, 0);
    assert.deepEqual(items, []);
  });

  /* The row still names the project and the task. If the read ever trusted
     the stored project id instead of joining membership, this is where a
     removed member would be told the names of tasks on a project they can no
     longer open. */
  test('losing membership takes the project’s notifications with it', async () => {
    await clear();
    await assign(admin, fx.nodes.task, ownerFieldId, [fx.viewer.id]);
    assert.equal(await badge(viewer), 1);

    await sql(
      'DELETE FROM pmt_project_members WHERE member_project_id = $1 AND member_user_id = $2',
      [fx.projectId, fx.viewer.id],
    );
    try {
      const { unread, items } = await bell(viewer);
      assert.equal(unread, 0);
      assert.deepEqual(items, [], 'the task name is absent, not merely unread');
    } finally {
      await sql(
        `INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role)
         VALUES ($1, $2, 'viewer')`,
        [fx.projectId, fx.viewer.id],
      );
    }
  });

  test('and getting it back brings them back — they were filtered, not deleted', async () => {
    assert.equal(await badge(viewer), 1);
  });

  test('an archived project takes its notifications off the bell', async () => {
    await sql('UPDATE pmt_projects SET project_archived_at = now() WHERE project_id = $1', [fx.projectId]);
    try {
      assert.equal(await badge(viewer), 0);
    } finally {
      await sql('UPDATE pmt_projects SET project_archived_at = NULL WHERE project_id = $1', [fx.projectId]);
    }
  });

  /* There is nothing to go and look at, and the count is meant to mean work
     you have not gone and looked at (spec 11 §3). */
  test('archiving the task takes its notification off the bell', async () => {
    await clear();
    await assign(admin, fx.nodes.sub, ownerFieldId, [fx.viewer.id]);
    assert.equal(await badge(viewer), 1);

    await archiveNode(admin, fx.nodes.sub);
    try {
      assert.equal(await badge(viewer), 0);
    } finally {
      await fetch(`${BASE_URL}/api/nodes/${fx.nodes.sub}/restore`, {
        method: 'POST', headers: { cookie: admin.header },
      });
    }
  });

  test('restoring the task brings it back', async () => {
    assert.equal(await badge(viewer), 1);
  });
});
