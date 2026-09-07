import 'server-only';
import pg, { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * Return `date` columns as the plain 'YYYY-MM-DD' strings they are.
 *
 * By default node-postgres parses OID 1082 into a JavaScript Date, which
 * silently attaches a time and a timezone to a value that has neither. A
 * `2026-09-18` estimate then becomes midnight in the server's zone, and any
 * server west of Bangkok renders it as the 17th. Every date in this product
 * is a calendar date — there is nothing to convert, so nothing should try.
 */
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

/**
 * One pool per process. Next's dev server reloads modules on every edit, so
 * the pool is cached on globalThis — without this, a few minutes of editing
 * exhausts PostgreSQL's connection limit.
 */
const globalForDb = globalThis as unknown as { __fieldbookPool?: Pool };

const pool =
  globalForDb.__fieldbookPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__fieldbookPool = pool;

export const db = drizzle(pool, { schema });

/**
 * Escape hatch for the things Drizzle should not express: the `pmf_` set
 * functions. Business logic stays in TypeScript; these are aggregate reads.
 */
export async function rawQuery<T>(text: string, values: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, values);
  return res.rows as T[];
}
