import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// No 'server-only' marker: these are pure crypto functions that touch no
// request context and no secret. Marking them would only make them
// unreachable from the test suite and from scripts/seed.mjs.

// promisify() loses scrypt's options overload, so the signature is restated.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

// Stored as N:r:p:salt:key, salt and key base64. Node's scrypt is used rather
// than bcrypt/argon2 so the project takes no native dependency for auth.
const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(plain.normalize('NFKC'), salt, KEYLEN, { N, r, p });
  return [N, r, p, salt.toString('base64'), key.toString('base64')].join(':');
}

export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split(':');
  if (parts.length !== 5) return false;
  const [sn, sr, sp, saltB64, keyB64] = parts as [string, string, string, string, string];

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(plain.normalize('NFKC'), salt, expected.length, {
    N: Number(sn), r: Number(sr), p: Number(sp),
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
