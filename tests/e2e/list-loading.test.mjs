import '../helpers/server-imports.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { setup } from '../helpers/harness.ts';

test('each list and its notification badge read only the selected work store', async () => {
  const fx = await setup();
  const queries = [];
  const original = pg.Pool.prototype.query;
  pg.Pool.prototype.query = function (...args) {
    queries.push(typeof args[0] === 'string' ? args[0] : args[0].text);
    return original.apply(this, args);
  };
  try {
    const { loadLedger } = await import('../../src/lib/ledger.ts');
    const { countUnread } = await import('../../src/lib/notifications.ts');
    const slug = (await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId])).rows[0].project_slug;
    // One-time initialization may read Task definitions to clone their settings.
    await loadLedger(fx.admin.id, slug, 'defect');
    for (const kind of ['task', 'defect']) {
      queries.length = 0;
      const start = performance.now();
      await loadLedger(fx.admin.id, slug, kind);
      await countUnread(fx.admin.id, kind);
      const wrongStore = kind === 'task' ? /\bpmt_defect_|\bpmf_defect_/ : /\bpmt_nodes\b|\bpmt_field_definitions\b|\bpmt_field_options\b|\bpmf_project_ledger\b|\bpmt_notifications\b/;
      console.log(JSON.stringify({ kind, queries: queries.length, ms: Math.round(performance.now()-start), unrelatedQueries: queries.filter(q=>wrongStore.test(q)).length }));
      assert.deepEqual(queries.filter(q=>wrongStore.test(q)), [], `${kind} must not read the other work store`);
      const optionRead = queries.find(q=>/from "pmt_(defect_)?field_options"/.test(q));
      assert.match(optionRead, /where .*field_project_id/, 'load only options for the selected project');
    }
  } finally {
    pg.Pool.prototype.query = original;
    await fx.client.query('DELETE FROM pmt_defect_nodes WHERE node_project_id=$1', [fx.projectId]);
    await fx.cleanup();
    await globalThis.__fieldbookPool?.end();
  }
});
