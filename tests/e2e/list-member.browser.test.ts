import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, BASE_URL, archiveNode, restoreNode, createNode, patchNode } from '../helpers/harness.ts';

test('Members manage List modules and tasks, while Viewer and membership boundaries hold', async () => {
  const fx = await setup();
  let browser;
  try {
    await fx.client.query("UPDATE pmt_project_members SET member_role='member' WHERE member_project_id=$1 AND member_user_id=$2", [fx.projectId, fx.viewer.id]);
    const member = await signIn(fx.viewer.email, fx.viewer.password);
    const slug = (await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId])).rows[0].project_slug;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.addCookies(member.header.split('; ').map(pair => {
      const at = pair.indexOf('=');
      return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
    }));
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/p/${slug}`);
    async function created(click: () => Promise<void>) {
      const response = page.waitForResponse(r => r.url().endsWith('/api/nodes') && r.request().method() === 'POST');
      await click();
      const result = await response;
      assert.equal(result.status(), 200);
      return (await result.json()).led_node_id as string;
    }
    async function rename(id: string, name: string) {
      const row = page.locator(`#row-${id}`);
      await row.getByRole('button', { name: /^Rename / }).click();
      await row.locator('input.cell-input').fill(name);
      await row.locator('input.cell-input').press('Enter');
      await expect(row.locator('.name-text')).toHaveText(name);
    }
    const moduleId = await created(() => page.getByRole('button', { name: '+ Module', exact: true }).click());
    await rename(moduleId, 'Member module');
    const taskId = await created(() => page.locator(`#row-${moduleId}`).getByRole('button', { name: 'Add a subtask under Member module', exact: true }).click());
    await rename(taskId, 'Member task');
    assert.equal((await patchNode(member, taskId, { estimateStart: '2026-10-15', actualStart: '2026-10-16' })).status, 200);
    await page.reload();
    await expect(page.locator(`#row-${moduleId} .name-text`)).toHaveText('Member module');
    await expect(page.locator(`#row-${taskId} .name-text`)).toHaveText('Member task');
    await page.getByRole('button', { name: 'Delete Member task', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete task', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator(`#row-${taskId}`)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator(`#row-${taskId}`)).toBeVisible();
    await page.locator(`#row-${moduleId} td.nm`).click();
    await page.keyboard.press('Delete');
    await page.getByRole('dialog', { name: 'Delete task', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator(`#row-${moduleId}`)).toHaveCount(0);
    const archived = await fx.client.query('SELECT node_archived_at FROM pmt_nodes WHERE node_id=ANY($1)', [[moduleId, taskId]]);
    assert.ok(archived.rows.every(r => r.node_archived_at));
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator(`#row-${taskId}`)).toBeVisible();
    assert.equal((await archiveNode(member, fx.nodes.root)).status, 422);
    const settings = await fetch(`${BASE_URL}/api/projects/${fx.projectId}`, {
      method: 'PATCH', headers: { cookie: member.header, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Not permitted' }),
    });
    assert.equal(settings.status, 403);
    await fx.client.query("UPDATE pmt_project_members SET member_role='viewer' WHERE member_project_id=$1 AND member_user_id=$2", [fx.projectId, fx.viewer.id]);
    await page.reload();
    await expect(page.getByRole('button', { name: '+ Module', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Rename / })).toHaveCount(0);
    for (const id of [moduleId, taskId]) {
      assert.equal((await archiveNode(member, id)).status, 403);
      assert.equal((await restoreNode(member, id)).status, 403);
      assert.equal((await patchNode(member, id, { name: 'Forbidden' })).status, 403);
    }
    assert.equal((await createNode(member, moduleId)).status, 403);
    await fx.client.query('DELETE FROM pmt_project_members WHERE member_project_id=$1 AND member_user_id=$2', [fx.projectId, fx.viewer.id]);
    assert.equal((await archiveNode(member, moduleId)).status, 403);
    assert.equal((await restoreNode(member, moduleId)).status, 403);
  } finally {
    await browser?.close();
    await fx.cleanup();
  }
});
