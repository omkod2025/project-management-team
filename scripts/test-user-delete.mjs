// Test the protected install identity only in a disposable database.
// Run: node --env-file=.env scripts/test-user-delete.mjs
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, cp, mkdtemp, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
const name = `people_delete_test_${randomBytes(5).toString('hex')}`;
const control = new pg.Client();
await control.connect();
let server;
let appDir;
try {
  await control.query(`CREATE DATABASE "${name}"`);
  const database = new pg.Client({ database: name });
  await database.connect();
  try { await database.query(await readFile('db/schema.sql', 'utf8')); }
  finally { await database.end(); }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  appDir = await mkdtemp(join(tmpdir(), 'fieldbook-people-test-'));
  for (const file of ['src', 'package.json', 'tsconfig.json', 'next-env.d.ts']) {
    await cp(resolve(file), join(appDir, file), { recursive: true });
  }
  await writeFile(join(appDir, 'next.config.mjs'), 'export default { devIndicators: false, allowedDevOrigins: ["127.0.0.1"] };');
  await symlink(resolve('node_modules'), join(appDir, 'node_modules'), 'junction');
  const env = { ...process.env, PEOPLE_TEST_APP_DIR: appDir, PGDATABASE: name, DATABASE_URL: url.toString(), E2E_BASE_URL: 'http://127.0.0.1:3011', AUTH_URL: 'http://127.0.0.1:3011', E2E_ISOLATED_PEOPLE: '1' };
  server = spawn(process.execPath, ['scripts/test-people-server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test server startup timed out')), 60000);
    server.stdout.on('data', chunk => { if (String(chunk).includes('TEST_SERVER_READY')) { clearTimeout(timer); resolve(); } });
    server.stderr.on('data', chunk => process.stderr.write(chunk));
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited ${code}`)); });
  });
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, ['--test', 'tests/e2e/people-delete.browser.test.ts'], { env, stdio: 'inherit', windowsHide: true });
    child.on('exit', resolve);
  });
  process.exitCode = code ?? 1;
} finally {
  if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
  await control.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await control.end();
  if (appDir) {
    const target = await realpath(appDir);
    if (dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() || !basename(target).startsWith('fieldbook-people-test-')) throw new Error('Unexpected test directory');
    await rm(target, { recursive: true, force: true, maxRetries: 3 });
  }
}
