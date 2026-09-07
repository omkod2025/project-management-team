/**
 * Fixtures and a session for the end-to-end API tests.
 *
 * The test creates its own throwaway project, fields, nodes and user, signs in
 * through the real Auth.js endpoints, and deletes everything afterwards. It
 * never touches the imported ClickUp project and never uses anyone's real
 * password: the account it signs in with exists only for the length of the run.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../../src/lib/password.ts';

pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export type Fixture = {
  client: pg.Client;
  projectId: string;
  statusFieldId: string;
  budgetFieldId: string;
  options: { backlog: string; running: string; done: string; cancelled: string; archived: string };
  nodes: { root: string; module: string; module2: string; task: string; sub: string };
  admin: { id: string; email: string; password: string };
  viewer: { id: string; email: string; password: string };
  cleanup: () => Promise<void>;
};

const uid = () => randomUUID();

export async function setup(): Promise<Fixture> {
  const client = new pg.Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
  await client.connect();

  const tag = randomBytes(4).toString('hex');
  const projectId = uid();
  const statusFieldId = uid();
  const budgetFieldId = uid();
  const options = {
    backlog: uid(), running: uid(), done: uid(), cancelled: uid(), archived: uid(),
  };
  const nodes = { root: uid(), module: uid(), module2: uid(), task: uid(), sub: uid() };
  const root = nodes.root;

  const admin = {
    id: uid(),
    email: `e2e-admin-${tag}@test.invalid`,
    password: randomBytes(18).toString('base64url'),
  };
  const viewer = {
    id: uid(),
    email: `e2e-viewer-${tag}@test.invalid`,
    password: randomBytes(18).toString('base64url'),
  };

  await client.query('BEGIN');

  for (const u of [admin, viewer]) {
    await client.query(
      `INSERT INTO pmt_users (user_id, user_email, user_full_name, user_password_hash)
       VALUES ($1, $2, $3, $4)`,
      [u.id, u.email, 'E2E', await hashPassword(u.password)],
    );
  }

  await client.query(
    `INSERT INTO pmt_projects (project_id, project_name, project_slug)
     VALUES ($1, $2, $3)`,
    [projectId, `E2E ${tag}`, `e2e-${tag}`],
  );

  await client.query(
    `INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role)
     VALUES ($1, $2, 'admin'), ($1, $3, 'viewer')`,
    [projectId, admin.id, viewer.id],
  );

  await client.query(
    `INSERT INTO pmt_field_definitions (field_id, field_project_id, field_name, field_kind, field_position, field_settings)
     VALUES ($1, $3, 'Task Status', 'select', 0, '{}'),
            ($2, $3, 'Budget', 'money', 1, '{"currency":"USD"}')`,
    [statusFieldId, budgetFieldId, projectId],
  );

  await client.query(
    `INSERT INTO pmt_field_options
       (option_id, option_field_id, option_label, option_stage, option_position, option_archived_at)
     VALUES ($1, $6, 'BACKLOG',   'notStarted', 0, NULL),
            ($2, $6, 'ONPROCESS', 'inProgress', 1, NULL),
            ($3, $6, 'DONE',      'done',       2, NULL),
            ($4, $6, 'CANCELLED', NULL,         3, NULL),
            ($5, $6, 'OLD',       NULL,         4, now())`,
    [options.backlog, options.running, options.done, options.cancelled, options.archived, statusFieldId],
  );

  await client.query(
    `UPDATE pmt_projects SET project_status_field_id = $1 WHERE project_id = $2`,
    [statusFieldId, projectId],
  );

  await client.query(
    `INSERT INTO pmt_nodes (node_id, node_project_id, node_parent_id, node_depth, node_name,
                            node_estimate_start, node_estimate_end)
     VALUES ($1, $6, NULL, 1, 'E2E project',  NULL, NULL),
            ($2, $6, $1,   2, 'Module',       '2026-09-01', '2026-09-18'),
            ($5, $6, $1,   2, 'Other module', NULL, NULL),
            ($3, $6, $2,   3, 'Task',         '2026-09-01', '2026-09-10'),
            ($4, $6, $3,   4, 'Subtask',      '2026-09-01', '2026-09-04')`,
    [root, nodes.module, nodes.task, nodes.sub, nodes.module2, projectId],
  );

  await client.query('COMMIT');

  const cleanup = async () => {
    await client.query('DELETE FROM pmt_nodes WHERE node_project_id = $1', [projectId]);
    await client.query('DELETE FROM pmt_projects WHERE project_id = $1', [projectId]);
    await client.query('DELETE FROM pmt_users WHERE user_id = ANY($1)', [[admin.id, viewer.id]]);
    await client.end();
  };

  return { client, projectId, statusFieldId, budgetFieldId, options, nodes, admin, viewer, cleanup };
}

/* ------------------------------------------------------------------ session */

/** The smallest cookie jar that survives the Auth.js sign-in dance. */
export class Jar {
  private jar = new Map<string, string>();

  absorb(res: Response) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const eq = pair!.indexOf('=');
      if (eq > 0) this.jar.set(pair!.slice(0, eq), pair!.slice(eq + 1));
    }
  }

  get header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  has(name: string) {
    return [...this.jar.keys()].some((k) => k.includes(name));
  }
}

/**
 * Sign in the way a browser does: fetch the CSRF token, then post the
 * credentials to the callback. Nothing here is special-cased for testing —
 * if this stops working, sign-in is broken for real users too.
 */
export async function signIn(email: string, password: string): Promise<Jar> {
  const jar = new Jar();

  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar.header },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE_URL}/` }),
  });
  jar.absorb(res);

  if (!jar.has('session-token')) {
    throw new Error(`sign-in did not return a session (status ${res.status}, location ${res.headers.get('location')})`);
  }
  return jar;
}

export async function patchNode(jar: Jar | null, nodeId: string, body: unknown) {
  const res = await fetch(`${BASE_URL}/api/nodes/${nodeId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(jar ? { cookie: jar.header } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json as Record<string, unknown> | null };
}

export const todayBangkok = () =>
  new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);


export async function moveNode(jar: Jar, nodeId: string, parentId: string) {
  return patchNode(jar, nodeId, { parentId });
}

export async function archiveNode(jar: Jar | null, nodeId: string) {
  const res = await fetch(`${BASE_URL}/api/nodes/${nodeId}`, {
    method: 'DELETE',
    headers: jar ? { cookie: jar.header } : {},
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

export async function restoreNode(jar: Jar, nodeId: string) {
  const res = await fetch(`${BASE_URL}/api/nodes/${nodeId}/restore`, {
    method: 'POST',
    headers: { cookie: jar.header },
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

export async function createNode(jar: Jar, parentId: string, name = 'New') {
  const res = await fetch(`${BASE_URL}/api/nodes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: jar.header },
    body: JSON.stringify({ parentId, name }),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}
