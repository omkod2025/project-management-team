/**
 * A password an admin chose, and the change it forces (spec 05 §1b).
 *
 * The point of these tests is the lock, not the happy path: an account holding
 * a password two people know must be able to reach exactly one thing. Every
 * refusal below is a door somebody could otherwise walk through with a
 * credential that was read off a whiteboard.
 *
 * Signs in through the real Auth.js endpoints like the rest of the suite, so a
 * regression in sign-in fails here too.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setup, signIn, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';

let fx: Fixture;
let admin: Jar;

/** The account created with a starting password, and its way in. */
let madeId = '';
let madeEmail = '';
const given = `Given-${randomBytes(6).toString('base64url')}`;
const chosen = `Chosen-${randomBytes(6).toString('base64url')}`;

before(async () => {
  fx = await setup();
  admin = await signIn(fx.admin.email, fx.admin.password);
  madeEmail = `e2e-temp-${randomBytes(4).toString('hex')}@test.invalid`;
});

after(async () => {
  if (madeId) {
    await fx.client.query('DELETE FROM pmt_project_members WHERE member_user_id = $1', [madeId]);
    await fx.client.query('DELETE FROM pmt_users WHERE user_id = $1', [madeId]);
  }
  await fx?.cleanup();
});

async function call(jar: Jar | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(jar ? { cookie: jar.header } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    location: res.headers.get('location'),
    body: (await res.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

describe('creating a person with a starting password', () => {
  test('the account is made, with no setup token and the flag raised', async () => {
    const res = await call(admin, 'POST', '/api/users', {
      projectId: fx.projectId, email: madeEmail, name: 'Temp Password', password: given,
    });
    assert.equal(res.status, 200);
    madeId = String(res.body?.id);

    assert.equal(res.body?.token, null, 'there is nothing to claim, so no token is issued');
    assert.equal(res.body?.mustChangePassword, true);

    const { rows } = await fx.client.query(
      `SELECT user_password_hash, user_setup_token, user_must_change_password
         FROM pmt_users WHERE user_id = $1`,
      [madeId],
    );
    assert.equal(rows[0].user_must_change_password, true);
    assert.equal(rows[0].user_setup_token, null);
    assert.notEqual(rows[0].user_password_hash, null);
    assert.ok(
      !String(rows[0].user_password_hash).includes(given),
      'the password is hashed, never stored as given',
    );
  });

  test('a too-short starting password is refused, as any other would be', async () => {
    const res = await call(admin, 'POST', '/api/users', {
      projectId: fx.projectId, email: `e2e-short-${randomBytes(3).toString('hex')}@test.invalid`,
      name: 'Too Short', password: 'short',
    });
    assert.equal(res.status, 422);
  });

  test('inviting without a password still issues a token and raises nothing', async () => {
    const email = `e2e-invite-${randomBytes(4).toString('hex')}@test.invalid`;
    const res = await call(admin, 'POST', '/api/users', {
      projectId: fx.projectId, email, name: 'Invited',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body?.mustChangePassword, false);
    assert.ok(String(res.body?.token).length > 0);

    await fx.client.query('DELETE FROM pmt_users WHERE user_id = $1', [String(res.body?.id)]);
  });
});

describe('what that account can do before it changes the password', () => {
  let held: Jar;

  before(async () => {
    // It can sign in — the password works. That is the whole risk, and why
    // everything below has to be shut.
    held = await signIn(madeEmail, given);
  });

  test('a page redirects to the change-password page', async () => {
    const res = await fetch(`${BASE_URL}/`, {
      redirect: 'manual', headers: { cookie: held.header },
    });
    assert.equal(res.status, 307);
    assert.match(String(res.headers.get('location')), /\/change-password$/);
  });

  test('the change-password page itself is not redirected', async () => {
    const res = await fetch(`${BASE_URL}/change-password`, {
      redirect: 'manual', headers: { cookie: held.header },
    });
    assert.equal(res.status, 200);
  });

  test('an API read is refused', async () => {
    const res = await call(held, 'GET', `/api/projects/${fx.projectId}/ledger`);
    assert.equal(res.status, 403);
  });

  test('an API write is refused', async () => {
    const res = await call(held, 'POST', '/api/nodes', {
      parentId: fx.nodes.module, name: 'Should not exist',
    });
    assert.equal(res.status, 403);
  });

  test('starting a project is refused — the route with no project to authorise against', async () => {
    const res = await call(held, 'POST', '/api/projects', { name: 'Should not exist' });
    assert.equal(res.status, 403);
  });

  test('the wrong current password does not change anything', async () => {
    const res = await call(held, 'POST', '/api/users/change-password', {
      currentPassword: 'not-the-one', newPassword: chosen,
    });
    assert.equal(res.status, 403);

    const { rows } = await fx.client.query(
      'SELECT user_must_change_password FROM pmt_users WHERE user_id = $1', [madeId],
    );
    assert.equal(rows[0].user_must_change_password, true, 'still locked');
  });

  test('re-entering the admin-set password is refused', async () => {
    const res = await call(held, 'POST', '/api/users/change-password', {
      currentPassword: given, newPassword: given,
    });
    assert.equal(res.status, 422);
  });

  test('changing it works, and lowers the flag', async () => {
    const res = await call(held, 'POST', '/api/users/change-password', {
      currentPassword: given, newPassword: chosen,
    });
    assert.equal(res.status, 200);

    const { rows } = await fx.client.query(
      'SELECT user_must_change_password FROM pmt_users WHERE user_id = $1', [madeId],
    );
    assert.equal(rows[0].user_must_change_password, false);
  });
});

describe('afterwards', () => {
  test('the admin-set password no longer signs in', async () => {
    await assert.rejects(() => signIn(madeEmail, given));
  });

  test('the chosen one does, and the account is no longer redirected', async () => {
    const jar = await signIn(madeEmail, chosen);
    const res = await fetch(`${BASE_URL}/`, { redirect: 'manual', headers: { cookie: jar.header } });
    assert.equal(res.status, 200);
  });
});
