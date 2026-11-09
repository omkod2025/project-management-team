/**
 * Migration 026: wiki-only tokens become module-neutral access tokens.
 *
 * The test rebuilds the legacy shape — `pmt_wiki_tokens` with its three
 * `wiki_token_can_*` columns and `pmt_wiki_token_scopes`, DDL copied from
 * migrations 021 and 025 — on top of today's schema, seeds it, runs 026, and
 * checks every legacy token kept its secret hash and revocation, gained Wiki
 * read plus one grant per true column, and kept its wiki scope.
 *
 * It creates and drops a disposable database, so it only ever runs against a
 * loopback server; anywhere else (a shared dev or CI database) it skips
 * itself, naming why, rather than failing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const LEGACY_DDL = `
  DROP TABLE pmt_access_token_scopes, pmt_access_token_grants, pmt_access_tokens;

  CREATE TABLE pmt_wiki_tokens (
      wiki_token_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      wiki_token_owner_id      uuid NOT NULL REFERENCES pmt_users(user_id) ON DELETE CASCADE,
      wiki_token_label         text NOT NULL CHECK (char_length(btrim(wiki_token_label)) BETWEEN 1 AND 100),
      wiki_token_hash          text NOT NULL UNIQUE,
      wiki_token_prefix        text NOT NULL,
      wiki_token_created_at    timestamptz NOT NULL DEFAULT now(),
      wiki_token_last_used_at  timestamptz,
      wiki_token_expires_at    timestamptz,
      wiki_token_revoked_at    timestamptz,
      wiki_token_revoked_by    uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL
  );
  CREATE INDEX pmt_wiki_tokens_owner_idx ON pmt_wiki_tokens(wiki_token_owner_id);

  CREATE TABLE pmt_wiki_token_scopes (
      wiki_token_scope_token_id uuid NOT NULL REFERENCES pmt_wiki_tokens(wiki_token_id) ON DELETE CASCADE,
      wiki_token_scope_wiki_id  uuid NOT NULL REFERENCES pmt_wikis(wiki_id) ON DELETE CASCADE,
      PRIMARY KEY (wiki_token_scope_token_id, wiki_token_scope_wiki_id)
  );

  ALTER TABLE pmt_wiki_tokens
    ADD COLUMN wiki_token_can_create_wiki boolean NOT NULL DEFAULT false,
    ADD COLUMN wiki_token_can_create_page boolean NOT NULL DEFAULT false,
    ADD COLUMN wiki_token_can_write_wiki boolean NOT NULL DEFAULT false;
`;

const grantSet = (rows: Array<{ token_grant_module: string; token_grant_permission: string }>) =>
  new Set(rows.map((r) => `${r.token_grant_module}:${r.token_grant_permission}`));

/** Every constraint and index on the three token tables, by name — what a migrated database and a fresh `db:build` must agree on. */
async function constraintAndIndexNames(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT conname AS name FROM pg_constraint
      WHERE conrelid IN ('pmt_access_tokens'::regclass, 'pmt_access_token_grants'::regclass, 'pmt_access_token_scopes'::regclass)
     UNION ALL
     SELECT indexname FROM pg_indexes
      WHERE tablename IN ('pmt_access_tokens', 'pmt_access_token_grants', 'pmt_access_token_scopes')
     ORDER BY 1`,
  );
  assert.ok(rows.length > 0);
  return rows.map((r) => r.name as string);
}

test('026 turns legacy wiki tokens into access tokens with grants and scopes', async (t) => {
  // Only ever create/drop our disposable database on a loopback test server.
  // Anywhere else (a shared dev or CI database in .env), skip rather than
  // fail: this check is a safety guard against a destructive mistake, not a
  // real assertion failure, and `npm run test:mcp` must stay green against
  // the documented .env workflow.
  if (!['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST ?? '')) {
    t.skip('needs a loopback PostgreSQL (creates/drops its own database); set PGHOST=127.0.0.1 and rerun');
    return;
  }
  const database = `mcp_migration_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client();
  await admin.connect();
  let client: pg.Client | undefined;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    client = new pg.Client({ database });
    await client.connect();
    await client.query(await readFile('db/schema.sql', 'utf8'));
    const freshNames = await constraintAndIndexNames(client);
    await client.query(LEGACY_DDL);

    const userId = randomUUID();
    await client.query('INSERT INTO pmt_users (user_id, user_email, user_full_name, user_password_hash) VALUES ($1, $2, $3, $4)', [userId, 'migration@test.invalid', 'Migration test', 'unused']);
    const w1 = (await client.query("INSERT INTO pmt_wikis (wiki_title, wiki_owner_id) VALUES ('W1', $1) RETURNING wiki_id", [userId])).rows[0].wiki_id as string;
    const a = (await client.query(
      `INSERT INTO pmt_wiki_tokens (wiki_token_owner_id, wiki_token_label, wiki_token_hash, wiki_token_prefix, wiki_token_can_create_page)
       VALUES ($1, 'A', 'hash-a', 'prefix-a', true) RETURNING wiki_token_id, wiki_token_revoked_at`, [userId],
    )).rows[0];
    const b = (await client.query(
      `INSERT INTO pmt_wiki_tokens (wiki_token_owner_id, wiki_token_label, wiki_token_hash, wiki_token_prefix, wiki_token_revoked_at, wiki_token_revoked_by)
       VALUES ($1, 'B', 'hash-b', 'prefix-b', now(), $1) RETURNING wiki_token_id`, [userId],
    )).rows[0];
    // A token with an expiry, to check the migration carries it across untouched.
    const expiresAt = new Date('2030-01-01T00:00:00Z');
    const c = (await client.query(
      `INSERT INTO pmt_wiki_tokens (wiki_token_owner_id, wiki_token_label, wiki_token_hash, wiki_token_prefix, wiki_token_expires_at)
       VALUES ($1, 'C', 'hash-c', 'prefix-c', $2) RETURNING wiki_token_id`, [userId, expiresAt],
    )).rows[0];
    await client.query('INSERT INTO pmt_wiki_token_scopes (wiki_token_scope_token_id, wiki_token_scope_wiki_id) VALUES ($1, $2)', [a.wiki_token_id, w1]);

    const migration = await readFile('db/migrations/026_access_tokens.sql', 'utf8');
    await client.query(migration);

    const tokens = await client.query('SELECT * FROM pmt_access_tokens ORDER BY access_token_label');
    assert.equal(tokens.rows.length, 3);
    assert.equal(tokens.rows[0].access_token_id, a.wiki_token_id);
    assert.equal(tokens.rows[0].access_token_hash, 'hash-a');
    assert.equal(tokens.rows[0].access_token_revoked_at, a.wiki_token_revoked_at);
    assert.ok(tokens.rows[1].access_token_revoked_at, 'B stays revoked');
    assert.equal(tokens.rows[1].access_token_revoked_by, userId);
    const cRow = tokens.rows.find((r) => r.access_token_id === c.wiki_token_id);
    assert.ok(cRow, 'C is migrated');
    assert.equal(cRow.access_token_expires_at?.toISOString(), expiresAt.toISOString(), 'C keeps its expiry across the migration');
    // The three legacy boolean columns are not carried onto pmt_access_tokens
    // at all — checked against the catalogue rather than the row object,
    // since `key in row` is true for every column `SELECT *` returns, and
    // would pass even if the columns had never been dropped.
    const legacyColumns = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pmt_access_tokens'
          AND column_name IN ('wiki_token_can_create_wiki', 'wiki_token_can_create_page', 'wiki_token_can_write_wiki')`,
    );
    assert.equal(legacyColumns.rows.length, 0, 'the legacy wiki_token_can_* columns are dropped');

    const grants = async (id: string) => grantSet((await client!.query(
      'SELECT token_grant_module, token_grant_permission FROM pmt_access_token_grants WHERE token_grant_token_id = $1', [id],
    )).rows);
    assert.deepEqual(await grants(a.wiki_token_id), new Set(['wiki:read', 'wiki:create_page']));
    assert.deepEqual(await grants(b.wiki_token_id), new Set(['wiki:read']));
    assert.deepEqual(await grants(c.wiki_token_id), new Set(['wiki:read']));

    const scopes = await client.query('SELECT * FROM pmt_access_token_scopes');
    assert.equal(scopes.rows.length, 1);
    assert.equal(scopes.rows[0].token_scope_token_id, a.wiki_token_id);
    assert.equal(scopes.rows[0].token_scope_wiki_id, w1);
    assert.equal(scopes.rows[0].token_scope_project_id, null);

    const legacy = await client.query("SELECT to_regclass('pmt_wiki_tokens') AS t, to_regclass('pmt_wiki_token_scopes') AS s");
    assert.equal(legacy.rows[0].t, null);
    assert.equal(legacy.rows[0].s, null);

    // The migrated shape is the fresh shape: the constraint and index names match a db:build.
    assert.deepEqual(await constraintAndIndexNames(client), freshNames);

    // Migrations run once: a second run has nothing to rename and fails loudly.
    await assert.rejects(client.query(migration));
  } finally {
    await client?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database}`);
    await admin.end();
  }
});
