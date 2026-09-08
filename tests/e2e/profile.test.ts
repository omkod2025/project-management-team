/**
 * Your own account, and somebody else's password.
 *
 * Two routes that look similar and are not: `PATCH /api/users/me` needs no
 * standing at all because it can only ever reach the caller, and
 * `POST /api/users/:id/password` needs more standing than any single capability
 * check can express — there is no workspace superuser (spec 05 §2), so the test
 * is over every project the target holds.
 *
 * What these tests are really defending is the bargain a reset makes: the new
 * password is one two people know, so the account must come out of it able to
 * reach nothing but the change-password page. A reset that left the account
 * usable would be an admin quietly holding a working credential, with the
 * record saying the account was fine.
 *
 * Signs in through the real Auth.js endpoints like the rest of the suite.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setup, signIn, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';

let fx: Fixture;
let admin: Jar;

/** An account on no project at all, made to prove the sharing rule. */
let strangerId = '';

const fresh = `Reset-${randomBytes(6).toString('base64url')}`;

before(async () => {
  fx = await setup();
  admin = await signIn(fx.admin.email, fx.admin.password);
});

after(async () => {
  if (strangerId) {
    await fx.client.query('DELETE FROM pmt_project_members WHERE member_user_id = $1', [strangerId]);
    await fx.client.query('DELETE FROM pmt_users WHERE user_id = $1', [strangerId]);
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
    body: (await res.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

const nameOf = async (id: string) => {
  const { rows } = await fx.client.query(
    'SELECT user_full_name FROM pmt_users WHERE user_id = $1', [id],
  );
  return rows[0]?.user_full_name as string;
};

describe('renaming yourself', () => {
  test('the name is stored, trimmed, and given back as stored', async () => {
    const res = await call(admin, 'PATCH', '/api/users/me', { name: '  Ouan Wattana  ' });
    assert.equal(res.status, 200);
    assert.equal(res.body?.name, 'Ouan Wattana');
    assert.equal(await nameOf(fx.admin.id), 'Ouan Wattana');
  });

  test('Thai survives the boundary unchanged', async () => {
    // Content is Thai (CLAUDE.md § Language). Anything that case-folds or
    // transliterates on the way through would corrupt real names silently.
    const thai = 'อ้วน วัฒนา';
    const res = await call(admin, 'PATCH', '/api/users/me', { name: thai });
    assert.equal(res.status, 200);
    assert.equal(res.body?.name, thai);
    assert.equal(await nameOf(fx.admin.id), thai);
  });

  test('an empty name is refused and nothing is written', async () => {
    const before = await nameOf(fx.admin.id);
    for (const name of ['', '   ', null, 7]) {
      const res = await call(admin, 'PATCH', '/api/users/me', { name });
      assert.equal(res.status, 422, `refused: ${JSON.stringify(name)}`);
    }
    assert.equal(await nameOf(fx.admin.id), before);
  });

  test('and a signed-out caller has no “me” to rename', async () => {
    const res = await call(null, 'PATCH', '/api/users/me', { name: 'Nobody' });
    assert.equal(res.status, 401);
  });

  test('renaming yourself cannot rename anybody else', async () => {
    // There is no id in the path, which is the point: the route resolves the
    // target from the session and has no way to be pointed elsewhere.
    const before = await nameOf(fx.viewer.id);
    await call(admin, 'PATCH', '/api/users/me', { name: 'Ouan', userId: fx.viewer.id });
    assert.equal(await nameOf(fx.viewer.id), before);
  });
});

describe('resetting somebody else’s password', () => {
  test('an admin may not reset their own — the profile asks for the current one', async () => {
    const res = await call(admin, 'POST', `/api/users/${fx.admin.id}/password`);
    assert.equal(res.status, 403);
  });

  test('nor somebody they share no administered project with', async () => {
    const made = await call(admin, 'POST', '/api/users', {
      projectId: fx.projectId,
      email: `e2e-stranger-${randomBytes(4).toString('hex')}@test.invalid`,
      name: 'Stranger',
    });
    assert.equal(made.status, 200);
    strangerId = String(made.body?.id);

    // Created but never granted a membership. `assertAdminsEveryProjectOf`
    // passes vacuously for such an account; the sharing rule is what refuses.
    const res = await call(admin, 'POST', `/api/users/${strangerId}/password`);
    assert.equal(res.status, 403);
  });

  test('a viewer on the project has no standing over its admin', async () => {
    const viewer = await signIn(fx.viewer.email, fx.viewer.password);
    const res = await call(viewer, 'POST', `/api/users/${fx.admin.id}/password`);
    assert.equal(res.status, 403);
  });

  test('a refused reset leaves the password it was aimed at untouched', async () => {
    const { rows } = await fx.client.query(
      'SELECT user_password_hash FROM pmt_users WHERE user_id = $1', [fx.admin.id],
    );
    assert.notEqual(rows[0].user_password_hash, null);
    // And the admin can still sign in with it, which is the fact the column
    // only implies.
    await signIn(fx.admin.email, fx.admin.password);
  });

  /* The whole bargain, in one test: the old password dies here, the link is the
     only way back in, and the password chosen through it was never known to the
     admin who issued it. */
  test('the reset revokes the old password and issues a claimable link', async () => {
    const res = await call(admin, 'POST', `/api/users/${fx.viewer.id}/password`);
    assert.equal(res.status, 200);
    const token = String(res.body?.token);
    assert.ok(token.length > 20, 'a token is returned, once');

    const { rows } = await fx.client.query(
      `SELECT user_password_hash, user_must_change_password,
              user_setup_token, user_setup_expires_at
         FROM pmt_users WHERE user_id = $1`,
      [fx.viewer.id],
    );
    assert.equal(rows[0].user_password_hash, null, 'the password they held is gone');
    assert.equal(rows[0].user_setup_token, token);
    assert.ok(new Date(rows[0].user_setup_expires_at) > new Date(), 'and it is live');
    assert.equal(
      rows[0].user_must_change_password, false,
      'there is no password to be made to change',
    );

    // The old password no longer signs in — and neither does anything else,
    // until the link is claimed.
    await assert.rejects(() => signIn(fx.viewer.email, fx.viewer.password));

    const claimed = await call(null, 'POST', '/api/users/set-password', {
      token, password: fresh,
    });
    assert.equal(claimed.status, 200);

    // The token is spent, and the account is theirs again.
    const again = await call(null, 'POST', '/api/users/set-password', {
      token, password: `Other-${randomBytes(6).toString('base64url')}`,
    });
    assert.equal(again.status, 404, 'a claimed link cannot be claimed twice');

    const jar = await signIn(fx.viewer.email, fresh);
    const free = await call(jar, 'PATCH', '/api/users/me', { name: 'Back In' });
    assert.equal(free.status, 200, 'and nothing is forced on them afterwards');
  });

  test('a second reset replaces the first link rather than adding one', async () => {
    const first = await call(admin, 'POST', `/api/users/${fx.viewer.id}/password`);
    const second = await call(admin, 'POST', `/api/users/${fx.viewer.id}/password`);
    assert.equal(second.status, 200);
    assert.notEqual(first.body?.token, second.body?.token);

    // The earlier link is dead. Otherwise an admin who reset twice would have
    // left a way in they are no longer thinking about.
    const stale = await call(null, 'POST', '/api/users/set-password', {
      token: String(first.body?.token), password: `Stale-${randomBytes(6).toString('base64url')}`,
    });
    assert.equal(stale.status, 404);
  });
});
