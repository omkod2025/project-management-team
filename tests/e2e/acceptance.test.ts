/**
 * Acceptance criteria (PRD §8).
 *
 *   npm run dev              # in one terminal
 *   npm run test:acceptance  # in another
 *
 * Where a criterion can be checked against the real imported ClickUp project,
 * it is, read-only. Where it cannot, the reason is stated in the test itself
 * rather than hidden behind a fixture — the imported data holds two actual
 * dates and no module baselines, so the two criteria about variance have
 * nothing real to measure yet. That is a finding about the data, not a gap in
 * the product, and it is recorded in `docs/spec/07-extraction-findings.md` §4.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { setup, signIn, patchNode, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';

let fx: Fixture;
let admin: Jar;
let viewer: Jar;

const REAL_SLUG = 'bannayuu-next';

before(async () => {
  fx = await setup();
  admin = await signIn(fx.admin.email, fx.admin.password);
  viewer = await signIn(fx.viewer.email, fx.viewer.password);
});
after(async () => { await fx?.cleanup(); });

async function sql<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await fx.client.query(text, params);
  return rows as T[];
}

/* ================================================== A1 — the real project */

describe('A1 — the imported project renders with every column it had in ClickUp', () => {
  test('every imported task is still present, at the depth it was imported to', async () => {
    // Counted over rows carrying `_clickup_id`, not over the whole project.
    // The first version asserted a total of 175 and broke the moment somebody
    // added a task through the UI — which is normal use, not a regression.
    // What this criterion is actually about is whether the import survived.
    const rows = await sql<{ node_depth: number }>(
      `SELECT node_depth FROM pmt_nodes
        WHERE node_project_id = (SELECT project_id FROM pmt_projects WHERE project_slug = $1)
          AND node_archived_at IS NULL
          AND node_depth > 1
          AND node_custom_values ? '_clickup_id'`,
      [REAL_SLUG],
    );
    assert.equal(rows.length, 174, 'every imported task');

    const byDepth = rows.reduce<Record<number, number>>((acc, r) => {
      acc[r.node_depth] = (acc[r.node_depth] ?? 0) + 1;
      return acc;
    }, {});
    assert.deepEqual(byDepth, { 2: 17, 3: 19, 4: 70, 5: 57, 6: 11 });
  });

  test('and the project root sits above them, carrying the list it came from', async () => {
    const rows = await sql<{ id: string | null }>(
      `SELECT node_custom_values ->> '_clickup_id' AS id FROM pmt_nodes
        WHERE node_project_id = (SELECT project_id FROM pmt_projects WHERE project_slug = $1)
          AND node_depth = 1`,
      [REAL_SLUG],
    );
    assert.equal(rows.length, 1, 'exactly one root');
    // The root is tagged too, which is why the count above excludes depth 1.
    assert.match(String(rows[0]?.id), /^list:/);
  });

  test('every ClickUp column the team used is reproduced, or deliberately absent', async () => {
    // Read the capture itself rather than a list written from memory.
    const base = join('data', 'clickup-raw');
    const latest = readdirSync(base).sort().pop()!;
    const manifest = JSON.parse(readFileSync(join(base, latest, '_manifest.json'), 'utf8')) as {
      lists: { id: string; name: string }[];
    };
    const list = manifest.lists.find((l) => l.name === 'Bannayuu Next')!;
    const source = JSON.parse(
      readFileSync(join(base, latest, `list-${list.id}`, 'fields.json'), 'utf8'),
    ) as { fields: { name: string }[] };

    const here = await sql<{ field_name: string }>(
      `SELECT field_name FROM pmt_field_definitions
        WHERE field_project_id = (SELECT project_id FROM pmt_projects WHERE project_slug = $1)`,
      [REAL_SLUG],
    );
    const names = new Set(here.map((f) => f.field_name));

    // Dropped by decision: zero values across 174 tasks (spec 06 §3.2).
    const dropped = new Set(['Completion Criteria', 'Next Steps']);

    for (const f of source.fields) {
      if (dropped.has(f.name)) {
        assert.ok(!names.has(f.name), `${f.name} was dropped on purpose`);
      } else {
        assert.ok(names.has(f.name), `${f.name} should have been imported`);
      }
    }

    // Added because ClickUp models them as built-ins, not custom fields.
    assert.ok(names.has('Tags'), 'tags were on 118 tasks and would otherwise be lost');
    assert.ok(names.has('Assignee'));
  });

  test('the status column is designated and its stages are assigned', async () => {
    const [row] = await sql<{ field_name: string }>(
      `SELECT f.field_name FROM pmt_projects p
         JOIN pmt_field_definitions f ON f.field_id = p.project_status_field_id
        WHERE p.project_slug = $1`,
      [REAL_SLUG],
    );
    assert.equal(row?.field_name, 'Task Status');

    const stages = await sql<{ option_label: string; option_stage: string | null }>(
      `SELECT option_label, option_stage FROM pmt_field_options
        WHERE option_field_id = (SELECT project_status_field_id FROM pmt_projects WHERE project_slug = $1)
        ORDER BY option_position`,
      [REAL_SLUG],
    );
    assert.deepEqual(
      stages.map((s) => [s.option_label, s.option_stage]),
      [['BACKLOG', 'notStarted'], ['ONPROCESS', 'inProgress'], ['WAIT_TEST', 'done'],
       ['COMPLETED', 'done'], ['CANCELLED', null]],
    );
  });
});

/* ============================================ A2 — capture without a reload */

describe('A2 — a status change records the finish, in the same response', () => {
  test('the write returns the recomputed row, so nothing is refetched', async () => {
    const res = await patchNode(admin, fx.nodes.sub, {
      values: { [fx.statusFieldId]: fx.options.done },
    });
    assert.equal(res.status, 200);

    // Everything the grid needs to repaint comes back with the write.
    assert.ok(res.body?.led_actual_end, 'the end date is in the response');
    assert.equal(res.body?.led_source_end, 'auto');
    assert.ok('led_actual_workdays' in (res.body ?? {}), 'and so is the recomputed duration');
    assert.ok('led_misclosure_end' in (res.body ?? {}), 'and the variance');
  });
});

/* ================================================ A3 — variance, by hand */

describe('A3 — variance matches a hand calculation in working days', () => {
  test('a task that overran by two working days reports +2', async () => {
    // Estimated to end Thursday 10 Sep 2026, actually ended Monday 14 Sep.
    // 11 Sep is the Friday, 12-13 the weekend, 14 the Monday: two working days.
    await patchNode(admin, fx.nodes.task, { estimateStart: '2026-09-01', estimateEnd: '2026-09-10' });
    const res = await patchNode(admin, fx.nodes.task, { actualStart: '2026-09-01', actualEnd: '2026-09-14' });

    assert.equal(res.status, 200);
    assert.equal(res.body?.led_misclosure_end, 2);
    assert.equal(res.body?.led_estimate_workdays, 8, '1-10 Sep is 8 working days');
    assert.equal(res.body?.led_actual_workdays, 10, '1-14 Sep is 10');
  });

  test('finishing early reports a negative figure, not an absolute one', async () => {
    const res = await patchNode(admin, fx.nodes.task, { actualEnd: '2026-09-08' });
    assert.equal(res.body?.led_misclosure_end, -2, 'two working days early');
  });

  test('the imported project cannot demonstrate this yet, and that is a data finding', async () => {
    const rows = await sql<{ n: string }>(
      `SELECT count(*) AS n FROM pmt_nodes
        WHERE node_project_id = (SELECT project_id FROM pmt_projects WHERE project_slug = $1)
          AND node_actual_end IS NOT NULL`,
      [REAL_SLUG],
    );
    assert.equal(Number(rows[0]?.n), 2,
      'ClickUp held two date_done values in 174 tasks; variance data accrues from launch, not before');
  });
});

/* ============================================== A4 — the vermilion overhang */

describe('A4 — a module whose children exceed its baseline is out of closure', () => {
  test('children inside the baseline leave it closed', async () => {
    await patchNode(admin, fx.nodes.module, { estimateStart: '2026-09-01', estimateEnd: '2026-09-30' });
    const res = await patchNode(admin, fx.nodes.module, {});
    assert.equal(res.body?.led_out_of_closure, false);
  });

  test('pushing a child past it flags the module', async () => {
    await patchNode(admin, fx.nodes.task, { estimateEnd: '2026-10-15' });
    const res = await patchNode(admin, fx.nodes.module, {});

    assert.equal(res.body?.led_out_of_closure, true);
    assert.equal(res.body?.led_rollup_est_end, '2026-10-15', 'the roll-up reaches past the baseline');
    assert.equal(res.body?.led_estimate_end, '2026-09-30', 'D-21 — the baseline itself did not move');
  });

  test('not one imported module carries a baseline, so none can be out of closure', async () => {
    // Counting only depth-2 nodes that actually have children. The other eight
    // are loose ClickUp root tasks the import promoted to module level, and
    // three of those do carry dates — they are tasks wearing a module's depth.
    const rows = await sql<{ with_kids: string; dated: string }>(
      `SELECT count(*) AS with_kids,
              count(*) FILTER (WHERE n.node_estimate_end IS NOT NULL) AS dated
         FROM pmt_nodes n
        WHERE n.node_depth = 2
          AND n.node_project_id = (SELECT project_id FROM pmt_projects WHERE project_slug = $1)
          AND EXISTS (SELECT 1 FROM pmt_nodes k WHERE k.node_parent_id = n.node_id)`,
      [REAL_SLUG],
    );
    assert.equal(Number(rows[0]?.with_kids), 8, 'eight of the seventeen roots are real modules');
    assert.equal(Number(rows[0]?.dated), 0,
      'ClickUp had no module level, so no module dates came with the import — these are for the owner to enter');
  });
});

/* ======================================================= A5 — morning triage */

describe('A5 — twenty status changes, no modal, no reload', () => {
  test('twenty consecutive writes all succeed and all return fresh rows', async () => {
    const ids = await sql<{ node_id: string }>(
      `SELECT node_id FROM pmt_nodes WHERE node_project_id = $1 AND node_depth >= 3 LIMIT 4`,
      [fx.projectId],
    );
    assert.ok(ids.length > 0);

    const cycle = [fx.options.backlog, fx.options.running, fx.options.done, fx.options.backlog];
    const started = Date.now();

    for (let i = 0; i < 20; i++) {
      const target = ids[i % ids.length]!.node_id;
      const res = await patchNode(admin, target, {
        values: { [fx.statusFieldId]: cycle[i % cycle.length] },
      });
      assert.equal(res.status, 200, `write ${i + 1} of 20`);
      assert.equal(res.body?.led_node_id, target, 'each response carries the row that changed');
    }

    const elapsed = Date.now() - started;
    // Generous: this is a correctness check with a sanity bound, not a benchmark.
    assert.ok(elapsed < 20_000, `twenty writes took ${elapsed}ms`);
  });
});

/* ================================================ A6 — a new column appears */

describe('A6 — a select column added at project level appears everywhere in it', () => {
  test('it shows up on every node in the project, with its options', async () => {
    const created = await fetch(`${BASE_URL}/api/projects/${fx.projectId}/fields`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.header },
      body: JSON.stringify({ name: 'Acceptance Column', kind: 'select' }),
    });
    assert.equal(created.status, 200);
    const { id } = (await created.json()) as { id: string };

    const opt = await fetch(`${BASE_URL}/api/fields/${id}/options`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.header },
      body: JSON.stringify({ label: 'Yes' }),
    });
    assert.equal(opt.status, 200);
    const option = ((await opt.json()) as { id: string }).id;

    // The column is defined once for the project (D-30), so any node can hold it.
    for (const nodeId of [fx.nodes.module2, fx.nodes.task, fx.nodes.sub]) {
      const res = await patchNode(admin, nodeId, { values: { [id]: option } });
      assert.equal(res.status, 200, 'every depth accepts the new column');
      assert.equal((res.body?.led_custom_values as Record<string, unknown>)[id], option);
    }
  });
});

/* ============================================= A7 — a viewer cannot write */

describe('A7 — a viewer is refused by every writing endpoint', () => {
  const cases: [string, string, unknown?][] = [];

  before(() => {
    cases.push(
      ['PATCH', `/api/nodes/${fx.nodes.task}`, { estimateEnd: '2026-12-01' }],
      ['PATCH', `/api/nodes/${fx.nodes.task}`, { values: {} }],
      ['PATCH', `/api/nodes/${fx.nodes.task}`, { parentId: fx.nodes.module2 }],
      ['DELETE', `/api/nodes/${fx.nodes.task}`],
      ['POST', `/api/nodes/${fx.nodes.task}/restore`],
      ['POST', '/api/nodes', { parentId: fx.nodes.module, name: 'nope' }],
      ['POST', `/api/projects/${fx.projectId}/fields`, { name: 'nope', kind: 'text' }],
      ['PATCH', `/api/projects/${fx.projectId}`, { statusFieldId: null }],
      ['PATCH', `/api/fields/${fx.statusFieldId}`, { name: 'nope' }],
      ['POST', `/api/fields/${fx.statusFieldId}/options`, { label: 'nope' }],
      ['PATCH', `/api/options/${fx.options.backlog}`, { label: 'nope' }],
      ['POST', `/api/projects/${fx.projectId}/members`, { userId: fx.admin.id, role: 'viewer' }],
      ['DELETE', `/api/projects/${fx.projectId}/members?userId=${fx.admin.id}`],
      ['POST', '/api/holidays', { projectId: fx.projectId, date: '2031-01-01', name: 'nope' }],
      ['DELETE', `/api/holidays?projectId=${fx.projectId}&date=2031-01-01`],
      ['POST', '/api/users', { projectId: fx.projectId, email: 'nope@test.invalid' }],
    );
  });

  test('every one returns 403, and none of them changes anything', async () => {
    const before = await sql<{ digest: string }>(
      `SELECT md5(string_agg(node_id::text || coalesce(node_estimate_end::text,'') ||
                             coalesce(node_name,'') || node_custom_values::text, '|' ORDER BY node_id)) AS digest
         FROM pmt_nodes WHERE node_project_id = $1`,
      [fx.projectId],
    );

    for (const [method, path, body] of cases) {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          cookie: viewer.header,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(res.status, 403, `${method} ${path}`);
    }

    const after = await sql<{ digest: string }>(
      `SELECT md5(string_agg(node_id::text || coalesce(node_estimate_end::text,'') ||
                             coalesce(node_name,'') || node_custom_values::text, '|' ORDER BY node_id)) AS digest
         FROM pmt_nodes WHERE node_project_id = $1`,
      [fx.projectId],
    );
    assert.equal(after[0]?.digest, before[0]?.digest, 'the project is byte-identical afterwards');
  });
});

/* ===================================== A8 — the bars survive without colour */

describe('A8 — estimate and actual are distinguishable without colour', () => {
  test('the two bars differ in position, height and fill, not only ink', () => {
    const css = readFileSync(join('src', 'app', 'p', '[slug]', 'timeline', 'timeline.css'), 'utf8');

    const est = css.match(/\.bar\.est\s*\{([^}]*)\}/)?.[1] ?? '';
    const act = css.match(/\.bar\.act\s*\{([^}]*)\}/)?.[1] ?? '';
    assert.ok(est && act, 'both bar rules exist');

    const top = (block: string) => block.match(/top:\s*(\d+)px/)?.[1];
    const height = (block: string) => block.match(/height:\s*(\d+)px/)?.[1];

    assert.notEqual(top(est), top(act), 'different vertical position');
    assert.notEqual(height(est), height(act), 'different height');
    assert.ok(est.includes('background-image'), 'the estimate is hatched, the actual is solid');
    assert.ok(!act.includes('background-image'));
  });

  test('vermilion is reserved for being out of tolerance', () => {
    const css = readFileSync(join('src', 'app', 'p', '[slug]', 'list.css'), 'utf8');
    const uses = [...css.matchAll(/([.\w-]+)\s*\{[^}]*--color-vermilion[^}]*\}/g)].map((m) => m[1]);
    // The slip is the misclosure marker; the failed cell is a save that did not land.
    for (const selector of uses) {
      assert.ok(
        /slip|failed|errata/.test(String(selector)),
        `vermilion appears on ${selector}, which is not an out-of-tolerance state`,
      );
    }
  });

  /**
   * Module colour was added after the ClickUp reference screenshots, and it put
   * the colour law at real risk for the first time: `--color-tab-1` is a brick
   * red, and a filled Timeline bar is a far larger area of it than the 3px tab
   * that carried it before. If a bar can be mistaken for an overrun at a
   * glance, vermilion has stopped meaning one thing.
   *
   * The defence is that both bar fills are mixed toward the ink before they are
   * drawn. This test does that arithmetic rather than trusting the comment.
   */
  test('no module hue, once mixed into a bar, can be mistaken for vermilion', () => {
    const tokens = readFileSync(join('src', 'app', 'tokens.css'), 'utf8');
    const hex = (name: string) => {
      const m = tokens.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`));
      assert.ok(m, `token --color-${name} is defined`);
      return m![1]!;
    };
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const mix = (a: string, b: string, pct: number) =>
      rgb(a).map((v, i) => v * pct + rgb(b)[i]! * (1 - pct));
    const distance = (a: number[], b: number[]) =>
      Math.sqrt(a.reduce((n, v, i) => n + (v - b[i]!) ** 2, 0));

    const vermilion = rgb(hex('vermilion'));
    const inkBlue = hex('ink-blue');

    // Read the mix ratios out of the stylesheets so the test tracks the CSS
    // rather than restating numbers that could drift away from it.
    //
    // Both fields are checked, and the roster is the one that matters most:
    // there the hue is let to the *project* rather than the module and is the
    // page's primary read, so its share is deliberately the higher of the two.
    // A ceiling that only binds on the lower one is not a ceiling.
    const fields: Array<[string, string]> = [
      ['timeline.css', readFileSync(join('src', 'app', 'p', '[slug]', 'timeline', 'timeline.css'), 'utf8')],
      ['roster.css', readFileSync(join('src', 'app', 'timeline', 'roster.css'), 'utf8')],
    ];

    for (const [where, css] of fields) {
      // `.bar.act {` in either file. `.bar.act.rs-late {` cannot match: the
      // brace does not follow `.act` there, and that rule sets no fill anyway.
      const act = css.match(/bar\.act\s*\{([^}]*)\}/)?.[1] ?? '';
      const ratio = act.match(/background:\s*color-mix\(in srgb, var\(--bar-hue\) (\d+)%/)?.[1];
      assert.ok(ratio, `${where}: the actual bar mixes its hue toward the ink rather than using it raw`);

      for (let i = 1; i <= 6; i++) {
        const raw = hex(`tab-${i}`);
        const drawn = mix(raw, inkBlue, Number(ratio) / 100);
        const d = distance(drawn, vermilion);
        assert.ok(
          d > 60,
          `${where}: tab-${i} (${raw}) draws as rgb(${drawn.map(Math.round)}) at ${ratio}%, only ` +
          `${d.toFixed(0)} from vermilion — too close for a filled bar. Lower the ratio or move the hue.`,
        );
      }
    }
  });
});

/* ============================ A9 — two projects, kept apart (D-30) */

describe('A9 — a second imported project does not disturb the first', () => {
  test('the sample-data project is archived and cannot be reached', async () => {
    const rows = await sql<{ archived: string | null; description: string | null }>(
      `SELECT project_archived_at::text AS archived, project_description AS description
         FROM pmt_projects WHERE project_slug = 'bannayuu-task'`,
    );
    assert.ok(rows[0]?.archived, 'archived, not deleted — reversible if it is ever wanted');
    assert.match(String(rows[0]?.description), /sample|template/i,
      'and the row says what it is, so nobody has to rediscover it');

    // The views filter on project_archived_at, so it is gone from the shelf.
    //
    // Asked of the two imported slugs only. This used to assert that
    // `bannayuu-next` was the *sole* live project, which was true of a
    // database that could only be filled by the importer; since projects can
    // be started from the shelf, that assertion tested how much the team had
    // done rather than what the import did with the sample data.
    const live = await sql<{ project_slug: string }>(
      `SELECT project_slug FROM pmt_projects
        WHERE project_archived_at IS NULL
          AND project_slug IN ('bannayuu-next', 'bannayuu-task')`,
    );
    assert.deepEqual(live.map((r) => r.project_slug), ['bannayuu-next'],
      'the imported sample data is not on the shelf');
  });

  test('each project owns its own columns, with no id shared between them', async () => {
    const rows = await sql<{ project_slug: string; field_id: string; field_name: string }>(
      `SELECT p.project_slug, f.field_id::text, f.field_name
         FROM pmt_field_definitions f
         JOIN pmt_projects p ON p.project_id = f.field_project_id
        ORDER BY p.project_slug, f.field_position`,
    );

    const ids = rows.map((r) => r.field_id);
    assert.equal(new Set(ids).size, ids.length, 'no field id appears in two projects');

    // Both imports synthesise columns with the same names. They must be
    // distinct rows: a shared id once let a second import silently rewrite the
    // first project's columns.
    const shared = ['ClickUp Status', 'Assignee'];
    for (const name of shared) {
      const matching = rows.filter((r) => r.field_name === name);
      assert.ok(matching.length >= 2, `${name} exists in more than one project`);
      assert.equal(new Set(matching.map((m) => m.field_id)).size, matching.length,
        `${name} has a distinct id per project`);
    }
  });

  test('no column is left without values in either project', async () => {
    const orphans = await sql<{ project_slug: string; field_name: string }>(
      `SELECT p.project_slug, f.field_name
         FROM pmt_field_definitions f
         JOIN pmt_projects p ON p.project_id = f.field_project_id
        WHERE NOT EXISTS (
                SELECT 1 FROM pmt_nodes n
                 WHERE n.node_project_id = f.field_project_id
                   AND n.node_custom_values ? f.field_id::text)
          AND f.field_name IN ('ClickUp Status', 'Assignee', 'Tags')`,
    );
    assert.deepEqual(orphans, [], 'a synthesised column with no values is the fingerprint of a colliding import');
  });

  test('the second project has no status column, and that is recorded not assumed', async () => {
    const rows = await sql<{ status_field_id: string | null }>(
      `SELECT project_status_field_id::text AS status_field_id
         FROM pmt_projects WHERE project_slug = 'bannayuu-task'`,
    );
    assert.equal(rows[0]?.status_field_id, null,
      'the list had no Task Status column, so automatic capture is inert there (D-35)');
  });

  test('every task in the second project carries dates \u2014 which the first mostly does not', async () => {
    const rows = await sql<{ slug: string; total: string; dated: string }>(
      `SELECT p.project_slug AS slug,
              count(*) FILTER (WHERE n.node_depth > 1) AS total,
              count(*) FILTER (WHERE n.node_depth > 1 AND n.node_estimate_end IS NOT NULL) AS dated
         FROM pmt_projects p JOIN pmt_nodes n ON n.node_project_id = p.project_id
        GROUP BY p.project_slug ORDER BY p.project_slug`,
    );
    const task = rows.find((r) => r.slug === 'bannayuu-task');
    assert.equal(Number(task?.total), 126);
    assert.equal(Number(task?.dated), 126, 'this is where the schedule data actually lived');
  });
});

/* ================================= A10 — the client report cannot leak (Q4) */

describe('A10 — the client report is a document, not a door', () => {
  test('it needs a session, like every other view', async () => {
    const res = await fetch(`${BASE_URL}/p/bannayuu-next/report`, { redirect: 'manual' });
    assert.equal(res.status, 307, 'signed out is sent to sign-in');
    assert.match(String(res.headers.get('location')), /sign-in/);
  });

  test('no unauthenticated path returns project data', async () => {
    // Q12 and spec 05 §5: no guest role, no share links. The property that
    // matters is not which status code comes back — it is that no request
    // without a session ever carries project content. If a share link is ever
    // added, this is where the decision has to be reopened rather than slipped
    // in unnoticed.
    for (const path of [
      '/p/bannayuu-next/report?token=anything',
      '/p/bannayuu-next',
      '/api/projects/share',
      '/share/bannayuu-next',
      '/api/nodes',
    ]) {
      const res = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' });
      const body = await res.text();

      assert.notEqual(res.status, 200, `${path} answered 200 without a session`);
      assert.ok(
        !/Bannayuu|หุ่นยนต์|led_node_id|node_custom_values/.test(body),
        `${path} returned project content without a session`,
      );
    }
  });

  test('no money field is on by default anywhere in the report code', () => {
    const src = readFileSync(join('src', 'app', 'p', '[slug]', 'report', 'report-view.tsx'), 'utf8');
    // The default is computed from the field's kind, not its name, so the next
    // money column added is safe without anybody remembering this rule.
    assert.match(src, /f\.kind !== 'money'/,
      'the default must be derived from the field kind');
    assert.doesNotMatch(src, /'Budget Allocation'/,
      'guarding one field by name would leave the next one exposed');
  });
});
