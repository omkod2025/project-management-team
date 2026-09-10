/**
 * The roster timeline (spec 09), end to end.
 *
 *   npm run dev        # in one terminal
 *   npm run test:e2e   # in another
 *
 * This is the one surface that reads across projects, so the test that matters
 * most is the one that proves it still cannot read across a membership. The
 * rest defend the assignment rule — a node is on a person's lane when their id
 * appears in *any* `people` field of its project — which has no schema to
 * enforce it and would fail silently if it drifted.
 *
 * The suite adds its own people field and its own third user to the standard
 * fixture, and removes them afterwards. It never touches the imported ClickUp
 * project.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

import { setup, signIn, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';
import { hashPassword } from '../../src/lib/password.ts';

let fx: Fixture;
let admin: Jar;
let viewer: Jar;
/** A real account that belongs to no project at all. */
let outsider: { id: string; email: string; password: string; jar: Jar };

const ownerFieldId = randomUUID();
const secondPeopleFieldId = randomUUID();
/** A dated node with nobody on it, to prove the Unassigned lane is kept. */
const orphanId = randomUUID();

before(async () => {
  fx = await setup();
  admin = await signIn(fx.admin.email, fx.admin.password);
  viewer = await signIn(fx.viewer.email, fx.viewer.password);

  // Two people fields, deliberately. Custom fields are defined per project, so
  // there is no single "assignee" field id across the shelf, and a project may
  // have several. The roster reads all of them.
  await sql(
    `INSERT INTO pmt_field_definitions
       (field_id, field_project_id, field_name, field_kind, field_position, field_settings)
     VALUES ($1, $3, 'Owner',  'people', 2, '{}'),
            ($2, $3, 'Review', 'people', 3, '{}')`,
    [ownerFieldId, secondPeopleFieldId, fx.projectId],
  );

  // Task → Owner = admin. Subtask → Review = viewer. Neither field is named
  // "Assignee" and the two nodes are assigned through different ones.
  await sql(
    `UPDATE pmt_nodes SET node_custom_values = jsonb_build_object($1::text, jsonb_build_array($2::text))
      WHERE node_id = $3`,
    [ownerFieldId, fx.admin.id, fx.nodes.task],
  );
  await sql(
    `UPDATE pmt_nodes SET node_custom_values = jsonb_build_object($1::text, jsonb_build_array($2::text))
      WHERE node_id = $3`,
    [secondPeopleFieldId, fx.viewer.id, fx.nodes.sub],
  );

  await sql(
    `INSERT INTO pmt_nodes (node_id, node_project_id, node_parent_id, node_depth, node_name,
                            node_estimate_start, node_estimate_end)
     VALUES ($1, $2, $3, 3, 'Nobody holds this', '2026-09-02', '2026-09-08')`,
    [orphanId, fx.projectId, fx.nodes.module],
  );

  outsider = {
    id: randomUUID(),
    email: `e2e-outsider-${randomBytes(4).toString('hex')}@test.invalid`,
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

async function roster(jar: Jar | null): Promise<{ status: number; html: string; location: string | null }> {
  const res = await fetch(`${BASE_URL}/timeline`, {
    redirect: 'manual',
    headers: jar ? { cookie: jar.header } : {},
  });
  return {
    status: res.status,
    location: res.headers.get('location'),
    html: res.status === 200 ? await res.text() : '',
  };
}

/* ================================================================== access */

describe('reaching the roster at all', () => {
  test('a signed-out visitor is sent to sign in, not shown an empty roster', async () => {
    const { status, location } = await roster(null);
    assert.equal(status, 307);
    assert.match(location ?? '', /\/sign-in/);
  });

  test('a signed-in member gets the page', async () => {
    const { status, html } = await roster(admin);
    assert.equal(status, 200);
    // Named "All Timeline" on screen since 2026-09-10; "roster" remains the
    // word for the read itself, and for this file.
    assert.match(html, /All Timeline/);
  });
});

/* ============================================================== assignment */

describe('a node lands on the lane of whoever is named in a people field', () => {
  test("the owner's lane carries the task", async () => {
    const { html } = await roster(admin);
    assert.match(html, /Task/, 'the assigned node is drawn');
    assert.match(html, /E2E/, "the assignee's own name heads a lane");
  });

  test('a second people field assigns just as well as the first', async () => {
    // Nothing in the schema marks one people field as *the* assignee field.
    // If this ever fails, somebody has hardcoded a field name or taken the
    // first people field only, and every project that names its field
    // differently has silently lost its roster.
    const { html } = await roster(viewer);
    assert.match(html, /Subtask/, 'assigned through "Review", not "Owner"');
  });

  test('dated work with nobody on it is kept, under Unassigned', async () => {
    // Not hidden and not dropped: on the real imported data this lane holds
    // almost everything, and a roster that omitted it would answer a much
    // smaller question than the one it was opened for.
    const { html } = await roster(admin);
    assert.match(html, /Unassigned/);
    assert.match(html, /Nobody holds this/);
  });

  test('an undated assigned node is counted, not drawn', async () => {
    const undated = randomUUID();
    await sql(
      `INSERT INTO pmt_nodes (node_id, node_project_id, node_parent_id, node_depth, node_name,
                              node_custom_values)
       VALUES ($1, $2, $3, 3, 'No dates at all', jsonb_build_object($4::text, jsonb_build_array($5::text)))`,
      [undated, fx.projectId, fx.nodes.module, ownerFieldId, fx.admin.id],
    );
    try {
      const { html } = await roster(admin);
      // 122 of the 174 real tasks are in exactly this state, so the count is
      // not an edge case — it is most of the data on day one.
      assert.match(html, /undated/, 'the lane states how much of its work has no dates');
      assert.doesNotMatch(html, /No dates at all/, 'and does not draw a bar for it');
    } finally {
      await sql('DELETE FROM pmt_nodes WHERE node_id = $1', [undated]);
    }
  });

  test('the project root is nobody’s work', async () => {
    // Depth 1 is the project itself. It has no assignee and must never appear
    // as an item in a lane.
    const { html } = await roster(admin);
    assert.doesNotMatch(html, /E2E project<\/span>/);
  });
});

/* ================================================================= scoping */

describe('the roster stops at the membership boundary', () => {
  test('a user in no project sees no lanes and no work', async () => {
    const { status, html } = await roster(outsider.jar);
    assert.equal(status, 200, 'the page still renders — an empty roster is a state, not an error');
    assert.doesNotMatch(html, /Task/, "another project's nodes are absent, not merely hidden");
    assert.doesNotMatch(html, /Nobody holds this/);
  });

  test('losing membership removes the project from the roster', async () => {
    await sql(
      `DELETE FROM pmt_project_members WHERE member_project_id = $1 AND member_user_id = $2`,
      [fx.projectId, fx.viewer.id],
    );
    try {
      const { html } = await roster(viewer);
      assert.doesNotMatch(html, /Nobody holds this/, 'the project is gone from their roster');
    } finally {
      await sql(
        `INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role)
         VALUES ($1, $2, 'viewer')`,
        [fx.projectId, fx.viewer.id],
      );
    }
  });

  test('an archived project leaves the roster with its work', async () => {
    await sql('UPDATE pmt_projects SET project_archived_at = now() WHERE project_id = $1', [fx.projectId]);
    try {
      const { html } = await roster(admin);
      assert.doesNotMatch(html, /Nobody holds this/);
    } finally {
      await sql('UPDATE pmt_projects SET project_archived_at = NULL WHERE project_id = $1', [fx.projectId]);
    }
  });
});

/* ================================================================ the page */

describe('what the page states about itself', () => {
  test('every project the reader can see is offered as a filter', async () => {
    const { html } = await roster(admin);
    const { rows } = await sql(
      `SELECT project_name FROM pmt_projects p
         JOIN pmt_project_members m ON m.member_project_id = p.project_id
        WHERE m.member_user_id = $1 AND p.project_archived_at IS NULL`,
      [fx.admin.id],
    );
    for (const r of rows as { project_name: string }[]) {
      assert.ok(html.includes(escapeHtml(r.project_name)), `${r.project_name} has a chip`);
    }
  });

  test('nothing on this page is draggable', async () => {
    // Spec 09 §6. The project Timeline ships drag handles; this one must not,
    // because a date moved here would be moved without its module beside it.
    const { html } = await roster(admin);
    assert.doesNotMatch(html, /class="[^"]*\bhandle\b/, 'no drag handles are rendered');
  });
});

/** Next escapes text nodes; project names in this fixture are ASCII, but the
 *  real ones are Thai and would arrive as entities. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
