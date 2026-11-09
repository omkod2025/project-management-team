import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

test('fresh schema and migrated legacy tokens default to baseline reads', async () => {
  // Only ever create/drop our disposable database on a loopback test server.
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST ?? ''), 'Run migration verification against an isolated local database.');
  const database = `mcp_migration_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client();
  await admin.connect();
  let client: pg.Client | undefined;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    client = new pg.Client({ database });
    await client.connect();
    await client.query(await readFile('db/schema.sql', 'utf8'));
    const userId = randomUUID();
    await client.query('INSERT INTO pmt_users (user_id, user_email, user_full_name, user_password_hash) VALUES ($1, $2, $3, $4)', [userId, 'migration@test.invalid', 'Migration test', 'unused']);
    const fresh = await client.query("INSERT INTO pmt_wiki_tokens (wiki_token_owner_id, wiki_token_label, wiki_token_hash, wiki_token_prefix) VALUES ($1, 'fresh', 'fresh', 'fresh') RETURNING *", [userId]);
    for (const key of ['wiki_token_can_create_wiki', 'wiki_token_can_create_page', 'wiki_token_can_write_wiki']) assert.equal(fresh.rows[0][key], false);
    await client.query('ALTER TABLE pmt_wiki_tokens DROP COLUMN wiki_token_can_create_wiki, DROP COLUMN wiki_token_can_create_page, DROP COLUMN wiki_token_can_write_wiki');
    await client.query(await readFile('db/migrations/025_wiki_token_permissions.sql', 'utf8'));
    const migrated = await client.query('SELECT * FROM pmt_wiki_tokens');
    assert.equal(migrated.rows[0].wiki_token_hash, 'fresh');
    for (const key of ['wiki_token_can_create_wiki', 'wiki_token_can_create_page', 'wiki_token_can_write_wiki']) assert.equal(migrated.rows[0][key], false);
  } finally {
    await client?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database}`);
    await admin.end();
  }
});
