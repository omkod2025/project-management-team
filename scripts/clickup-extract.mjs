#!/usr/bin/env node
/**
 * clickup-extract.mjs — capture an entire ClickUp workspace as raw JSON.
 *
 * See docs/spec/06-clickup-migration.md.
 *
 * This script performs NO transformation. Every response body is written to
 * disk exactly as the API returned it. Any mapping decision made here would
 * be a decision that cannot be revisited once the trial lapses and the source
 * disappears, so: capture everything, decide later.
 *
 *   node --env-file=.env scripts/clickup-extract.mjs
 *
 * Environment:
 *   CLICKUP_TOKEN     personal API token (pk_...)
 *   CLICKUP_TEAM_ID   workspace id — ClickUp's UI calls it Workspace,
 *                     the v2 API still calls it team
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const TOKEN = process.env.CLICKUP_TOKEN;
const TEAM_ID = process.env.CLICKUP_TEAM_ID;

if (!TOKEN || !TEAM_ID) {
  console.error('Missing CLICKUP_TOKEN or CLICKUP_TEAM_ID.');
  console.error('Run with: node --env-file=.env scripts/clickup-extract.mjs');
  process.exit(1);
}

const API = 'https://api.clickup.com/api/v2';

// Rate limit is 100 req/min on Free and Business. Stay under it rather than
// discovering the ceiling: 90/min = one request every ~667ms.
const MIN_INTERVAL_MS = 700;

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join('data', 'clickup-raw', stamp);

const manifest = [];
let lastCall = 0;
let requestCount = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Throttled, retrying GET. Returns parsed JSON, or null on a tolerated 4xx. */
async function get(path, { tolerate404 = false } = {}) {
  const url = path.startsWith('http') ? path : API + path;

  for (let attempt = 1; attempt <= 4; attempt++) {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    requestCount++;

    let res;
    try {
      res = await fetch(url, { headers: { Authorization: TOKEN } });
    } catch (err) {
      if (attempt === 4) throw err;
      await sleep(2 ** attempt * 1000);
      continue;
    }

    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? 30);
      console.warn(`  429 — waiting ${retry}s`);
      await sleep((retry + 1) * 1000);
      continue;
    }

    if (res.status === 404 && tolerate404) {
      manifest.push({ url, status: 404, path: null, note: 'tolerated' });
      return null;
    }

    if (res.status >= 500) {
      if (attempt === 4) throw new Error(`${res.status} on ${url}`);
      await sleep(2 ** attempt * 1000);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} on ${url}\n${body.slice(0, 400)}`);
    }

    return { url, body: await res.json() };
  }
  throw new Error(`exhausted retries on ${url}`);
}

/** Fetch and persist in one step. Nothing is held in memory beyond the call. */
async function capture(path, outfile, opts) {
  const got = await get(path, opts);
  if (!got) return null;
  const full = join(OUT, outfile);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, JSON.stringify(got.body, null, 2), 'utf8');
  manifest.push({ url: got.url, status: 200, path: outfile });
  return got.body;
}

/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`Extracting workspace ${TEAM_ID} → ${OUT}\n`);

  // 1 — teams (workspaces)
  const teams = await capture('/team', 'team.json');
  const team = teams?.teams?.find((t) => String(t.id) === String(TEAM_ID));
  console.log(team ? `Workspace: ${team.name}` : `WARNING: ${TEAM_ID} not in /team response`);

  // 9 — members
  await capture(`/team/${TEAM_ID}`, 'members.json');

  // 2 — spaces
  const spaces = (await capture(`/team/${TEAM_ID}/space?archived=false`, 'spaces.json'))?.spaces ?? [];
  console.log(`Spaces: ${spaces.length}`);

  const listIds = [];

  for (const space of spaces) {
    const sDir = `space-${space.id}`;
    console.log(`\n[space] ${space.name}`);

    await capture(`/space/${space.id}/tag`, `${sDir}/tags.json`, { tolerate404: true });

    // 3 — folders in this space
    const folders = (await capture(`/space/${space.id}/folder`, `${sDir}/folders.json`))?.folders ?? [];

    // 4 — folderless lists
    const loose = (await capture(`/space/${space.id}/list`, `${sDir}/lists.json`))?.lists ?? [];
    loose.forEach((l) => listIds.push({ id: l.id, name: l.name, space: space.name, folder: null }));

    // 5 — lists inside each folder
    for (const folder of folders) {
      const fLists =
        (await capture(`/folder/${folder.id}/list`, `folder-${folder.id}/lists.json`))?.lists ?? [];
      fLists.forEach((l) =>
        listIds.push({ id: l.id, name: l.name, space: space.name, folder: folder.name })
      );
    }
  }

  console.log(`\nLists: ${listIds.length}`);

  const taskIds = new Set();

  for (const list of listIds) {
    const lDir = `list-${list.id}`;
    console.log(`\n[list] ${list.folder ? list.folder + ' / ' : ''}${list.name}`);

    // 6 — custom field definitions for this list
    await capture(`/list/${list.id}/field`, `${lDir}/fields.json`);

    // 7 — tasks, paged. subtasks=true and include_closed=true are essential;
    // without them the capture silently omits most of the real work.
    for (let page = 0; page < 200; page++) {
      const q = new URLSearchParams({
        page: String(page),
        subtasks: 'true',
        include_closed: 'true',
        archived: 'false',
      });
      const body = await capture(`/list/${list.id}/task?${q}`, `${lDir}/tasks-p${page}.json`);
      const tasks = body?.tasks ?? [];
      tasks.forEach((t) => taskIds.add(t.id));
      process.stdout.write(`  page ${page}: ${tasks.length} tasks\n`);
      if (body?.last_page || tasks.length === 0) break;
    }

    // list views — cheap, and unrecoverable later
    await capture(`/list/${list.id}/view`, `${lDir}/views.json`, { tolerate404: true });
  }

  // 8 — every task individually. The list endpoint returns a summary; only
  // this returns the full custom-field value set and the subtask tree.
  console.log(`\nTasks to fetch individually: ${taskIds.size}`);
  let n = 0;
  for (const id of taskIds) {
    n++;
    await capture(`/task/${id}?include_subtasks=true`, `task/${id}.json`);
    await capture(`/task/${id}/comment`, `task/${id}.comments.json`, { tolerate404: true });
    if (n % 10 === 0) console.log(`  ${n}/${taskIds.size}`);
  }

  await writeFile(
    join(OUT, '_manifest.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        teamId: TEAM_ID,
        requests: requestCount,
        counts: { spaces: spaces.length, lists: listIds.length, tasks: taskIds.size },
        lists: listIds,
        entries: manifest,
      },
      null,
      2
    ),
    'utf8'
  );

  const bad = manifest.filter((m) => m.status !== 200);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Requests:   ${requestCount}`);
  console.log(`Spaces:     ${spaces.length}`);
  console.log(`Lists:      ${listIds.length}`);
  console.log(`Tasks:      ${taskIds.size}`);
  console.log(`Non-200:    ${bad.length}`);
  console.log(`Output:     ${OUT}`);
  console.log(`${'='.repeat(60)}`);
  if (bad.length) console.log('Non-200 entries are listed in _manifest.json — check before trusting this capture.');
}

main().catch((err) => {
  console.error('\nEXTRACTION FAILED');
  console.error(err.message);
  console.error(`\nPartial capture is in ${OUT} — re-run to start a fresh directory.`);
  process.exit(1);
});
