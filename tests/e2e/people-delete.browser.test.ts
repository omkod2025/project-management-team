import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, BASE_URL, type Jar } from '../helpers/harness.ts';
import { hashPassword } from '../../src/lib/password.ts';

test('only the install admin deletes people across projects, including without project memberships', {
  skip: process.env.E2E_ISOLATED_PEOPLE !== '1',
  timeout: 90000,
}, async () => {
  assert.match(process.env.PGDATABASE ?? '', /^people_delete_test_[a-f0-9]+$/);
  const fx = await setup();
  const installId = randomUUID();
  let browser;
  try {
    const password = randomUUID();
    await fx.client.query('INSERT INTO pmt_users (user_id,user_email,user_full_name,user_password_hash) VALUES ($1,$2,$3,$4)',
      [installId, 'admin@cit.com', 'Install admin', await hashPassword(password)]);
    const install = await signIn('admin@cit.com', password);
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const viewer = await signIn(fx.viewer.email, fx.viewer.password);
    const remove = (jar: Jar | null, id: string) => fetch(`${BASE_URL}/api/users/${id}`, { method: 'DELETE', headers: jar ? { cookie: jar.header } : {} });
    assert.equal((await remove(null, fx.viewer.id)).status, 401);
    assert.equal((await remove(viewer, fx.admin.id)).status, 403);
    assert.equal((await remove(admin, fx.viewer.id)).status, 403);
    // Even a target with no projects needs the install admin: the old
    // every-project check was vacuously true for an unassigned account.
    const unassigned = randomUUID();
    await fx.client.query('INSERT INTO pmt_users (user_id,user_email,user_full_name) VALUES ($1,$2,$3)', [unassigned, 'unassigned@test.invalid', 'Unassigned']);
    assert.equal((await remove(viewer, unassigned)).status, 403);
    assert.equal((await remove(install, unassigned)).status, 200);
    assert.equal((await remove(install, installId)).status, 403);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    async function pageFor(jar: Jar) {
      const context = await browser!.newContext();
      await context.addCookies(jar.header.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at+1), url: BASE_URL }; }));
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      await page.goto(`${BASE_URL}/people`);
      return page;
    }
    const ordinary = await pageFor(admin);
    await expect(ordinary.getByRole('button', { name: /^Delete .*account$/ })).toHaveCount(0);
    const page = await pageFor(install);
    await page.getByRole('searchbox', { name: 'Find a person' }).fill(fx.viewer.email);
    await expect(page.getByRole('button', { name: "Delete E2E's account", exact: true })).toHaveCount(1);
    await page.getByRole('row').filter({ hasText: fx.viewer.email }).getByRole('button', { name: "Delete E2E's account", exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(fx.viewer.email, { exact: true })).toHaveCount(0);
    assert.equal((await fx.client.query('SELECT user_id FROM pmt_users WHERE user_id=$1', [fx.viewer.id])).rowCount, 0);
    assert.equal((await fx.client.query('SELECT member_user_id FROM pmt_project_members WHERE member_user_id=$1', [fx.viewer.id])).rowCount, 0);
    assert.equal((await remove(install, fx.viewer.id)).status, 404);
    // Deleting the last admin transfers their project in the same transaction.
    assert.equal((await remove(install, fx.admin.id)).status, 200);
    assert.equal((await fx.client.query('SELECT user_id FROM pmt_users WHERE user_id=$1', [fx.admin.id])).rowCount, 0);
    const replacement = await fx.client.query('SELECT member_role FROM pmt_project_members WHERE member_project_id=$1 AND member_user_id=$2', [fx.projectId, installId]);
    assert.equal(replacement.rows[0]?.member_role, 'admin');
  } finally {
    await browser?.close();
    await fx.client.query('DELETE FROM pmt_users WHERE user_id=$1', [installId]);
    await fx.cleanup();
  }
});
