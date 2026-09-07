#!/usr/bin/env node
/**
 * seed.mjs — make the imported project reachable by a person.
 *
 *   node --env-file=.env scripts/seed.mjs <email> <password>
 *
 * Creates or updates one user, then grants them `admin` on every existing
 * project. Idempotent: running it again resets that user's password and
 * leaves everything else alone.
 *
 * This is the bootstrap that spec 05 §2 refers to when it says creating the
 * first user is a script, not a UI. There is no self-registration.
 */

import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scryptAsync = promisify(scrypt);

async function hashPassword(plain) {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const key = await scryptAsync(plain.normalize('NFKC'), salt, 64, { N, r, p });
  return [N, r, p, salt.toString('base64'), key.toString('base64')].join(':');
}

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node --env-file=.env scripts/seed.mjs <email> <password>');
  console.error('Pass the password as an argument rather than typing it into a file.');
  process.exit(1);
}
// Kept in step with MIN_PASSWORD_LENGTH in src/lib/admin-rules.ts. This
// script cannot import it: it runs without the bundler that resolves `@/`.
const MIN_PASSWORD_LENGTH = 10;
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});
await client.connect();

const hash = await hashPassword(password);

const { rows: [user] } = await client.query(
  `INSERT INTO pmt_users (user_email, user_full_name, user_password_hash)
   VALUES ($1, $2, $3)
   ON CONFLICT (user_id) DO NOTHING
   RETURNING user_id, user_email`,
  [email, email.split('@')[0], hash],
).catch(() => ({ rows: [] }));

let userId = user?.user_id;

if (!userId) {
  // The email index is a functional unique index on lower(user_email), which
  // ON CONFLICT cannot target by column name — so update by hand.
  const { rows } = await client.query(
    `UPDATE pmt_users
        SET user_password_hash = $2, user_is_active = true, user_updated_at = now()
      WHERE lower(user_email) = lower($1)
      RETURNING user_id`,
    [email, hash],
  );
  if (rows.length) {
    userId = rows[0].user_id;
    console.log(`Updated existing user ${email}`);
  } else {
    const { rows: ins } = await client.query(
      `INSERT INTO pmt_users (user_email, user_full_name, user_password_hash)
       VALUES ($1, $2, $3) RETURNING user_id`,
      [email, email.split('@')[0], hash],
    );
    userId = ins[0].user_id;
    console.log(`Created user ${email}`);
  }
} else {
  console.log(`Created user ${email}`);
}

const { rowCount } = await client.query(
  `INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role)
   SELECT project_id, $1, 'admin' FROM pmt_projects
   ON CONFLICT (member_project_id, member_user_id)
     DO UPDATE SET member_role = 'admin'`,
  [userId],
);

console.log(`Granted admin on ${rowCount} project(s).`);
await client.end();
