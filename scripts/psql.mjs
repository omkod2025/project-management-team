#!/usr/bin/env node
/**
 * psql.mjs — run a .sql file against the database named in .env.
 *
 *   node --env-file=.env scripts/psql.mjs db/schema.sql
 *
 * A wrapper rather than a bare psql invocation in package.json, for two
 * reasons that only show up on Windows: npm runs scripts through cmd.exe,
 * where `$PGDATABASE` is not a variable, and npm does not load `.env` at all.
 * Going through node gives both, identically on every platform.
 */

import { spawnSync } from 'node:child_process';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node --env-file=.env scripts/psql.mjs <file.sql>');
  process.exit(1);
}

/**
 * Pin the client encoding.
 *
 * Without this, psql picks an encoding from the environment, and on Windows it
 * falls back to the console codepage (WIN1252) whenever stdout is not a
 * terminal — redirected to a file, piped, or run from CI. Every Thai task name
 * then fails with "byte sequence 0x81 has no equivalent in encoding UTF8", and
 * whether a load works depends on how it happened to be invoked.
 *
 * Observed on 2026-09-07: the same load exited 0 to a terminal and 3 to
 * /dev/null.
 */
const { status, error } = spawnSync(
  'psql',
  ['-w', '-v', 'ON_ERROR_STOP=1', '-f', file],
  {
    stdio: 'inherit',
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    shell: process.platform === 'win32',
  },
);

if (error) {
  console.error(`Could not run psql: ${error.message}`);
  console.error('Is the PostgreSQL client on PATH?');
  process.exit(1);
}
process.exit(status ?? 1);
