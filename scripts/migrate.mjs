#!/usr/bin/env node
/**
 * migrate.mjs — apply db/migrations/*.sql in filename order, once each.
 *
 *   node --env-file=.env scripts/migrate.mjs
 *
 * Deliberately tiny. Migrations are plain SQL files, numbered, applied in
 * order, recorded in pmt_migrations. There is no down-migration: reversing a
 * change means writing the next migration, which is the only thing that ever
 * works on a database holding real data.
 *
 * db/schema.sql remains the authoritative shape for a fresh build, and every
 * migration must also be folded into it, so `db:build` and `db:migrate` land
 * on the same schema. The check at the end of this script does not verify
 * that — it is a discipline, and the schema tests are what catch a drift.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const dir = join('db', 'migrations');
const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS pmt_migrations (
    migration_name       text PRIMARY KEY,
    migration_applied_at timestamptz NOT NULL DEFAULT now()
  )`);

const applied = new Set(
  (await client.query('SELECT migration_name FROM pmt_migrations')).rows.map((r) => r.migration_name)
);

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
let ran = 0;

for (const file of files) {
  if (applied.has(file)) {
    console.log(`  skip  ${file}`);
    continue;
  }
  process.stdout.write(`  apply ${file} ... `);
  try {
    await client.query('BEGIN');
    await client.query(readFileSync(join(dir, file), 'utf8'));
    await client.query('INSERT INTO pmt_migrations (migration_name) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log('ok');
    ran++;
  } catch (err) {
    await client.query('ROLLBACK');
    console.log('FAILED');
    console.error(`\n${file}: ${err.message}\n`);
    await client.end();
    process.exit(1);
  }
}

console.log(`\n${ran} applied, ${files.length - ran} already present.`);
await client.end();
