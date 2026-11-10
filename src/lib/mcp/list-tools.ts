import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { nodes, projects, type LedgerRow } from '@/db/schema';
import { authorize } from '@/lib/permissions';
import { createNode, moveNode, updateNode } from '@/lib/nodes';
import { loadLedger } from '@/lib/ledger';
import { visibleProjects } from '@/lib/project-access';
import { domainError } from '@/lib/errors';
import { hasGrant, isUuid } from '@/lib/token-rules';
import { filterTasks, listColumns, scopedId, taskPatch, type TaskArgs, type TaskFilter } from '@/lib/mcp-rules';
import { answer, outOfScope, readOnly, writes, type McpContext } from './tool-kit';

/**
 * The List module's tools (central MCP tokens design, Task 5). Reads are on
 * for any token that reaches the List; `create_task` and `update_task` are
 * gated on their grant, and every write still passes the owner's role through
 * `authorize`, as the List's own routes do — a grant never outranks a role.
 *
 * The four dates cross the wire as four fields and are written one by one,
 * exactly as given (`taskPatch`). Nothing here derives an actual from an
 * estimate or the other way round.
 */

type Task = ReturnType<typeof toTask>;

const toTask = (r: LedgerRow) => ({
  id: r.led_node_id,
  parentId: r.led_parent_id,
  depth: r.led_depth,
  name: r.led_name,
  estimateStart: r.led_estimate_start,
  estimateEnd: r.led_estimate_end,
  actualStart: r.led_actual_start,
  actualEnd: r.led_actual_end,
  values: r.led_custom_values,
});

type ScopedNode = { id: string; projectId: string; depth: number; slug: string };

/**
 * A live `pmt_nodes` row in a project the token scopes, or "Not found." —
 * malformed, unknown, archived, a defect (its id is in `pmt_defect_nodes`,
 * never here) and out of scope all answer the same.
 */
async function scopedNode(ctx: McpContext, raw: unknown): Promise<ScopedNode> {
  if (typeof raw !== 'string' || !isUuid(raw)) throw outOfScope();
  const [node] = await db.select({ id: nodes.id, projectId: nodes.projectId, depth: nodes.depth, slug: projects.slug })
    .from(nodes)
    .innerJoin(projects, eq(projects.id, nodes.projectId))
    .where(and(eq(nodes.id, raw.toLowerCase()), isNull(nodes.archivedAt), isNull(projects.archivedAt)))
    .limit(1);
  if (!node || !scopedId(ctx.scope.projectIds, node.projectId)) throw outOfScope();
  return node;
}

/** A task as `list_tasks` lists it: never the project root (depth 1). */
async function scopedTask(ctx: McpContext, raw: unknown): Promise<ScopedNode> {
  const node = await scopedNode(ctx, raw);
  if (node.depth < 2) throw outOfScope();
  return node;
}

/** A node that must sit in the same project as `projectId`; anything across the line is "Not found.". */
async function sameProjectNode(ctx: McpContext, raw: unknown, projectId: string): Promise<ScopedNode> {
  const node = await scopedNode(ctx, raw);
  if (node.projectId !== projectId) throw outOfScope();
  return node;
}

/** `after_id` names a sibling in the same project, or is null (the front, on a move) or absent. */
async function placement(ctx: McpContext, raw: string | null | undefined, projectId: string) {
  return raw == null ? raw : (await sameProjectNode(ctx, raw, projectId)).id;
}

/** The ledger of a live project the token scopes, or "Not found.". */
async function scopedLedger(ctx: McpContext, rawProjectId: unknown) {
  const projectId = scopedId(ctx.scope.projectIds, rawProjectId);
  if (!projectId) throw outOfScope();
  const [project] = await db.select({ slug: projects.slug }).from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.archivedAt))).limit(1);
  if (!project) throw outOfScope();
  return loadLedger(ctx.ownerId, project.slug);
}

/** The project's tasks, narrowed by the same rules as the List's filter (`filterTasks`). */
async function tasksOf(ctx: McpContext, rawProjectId: unknown, filters?: TaskFilter[]): Promise<Task[]> {
  const { project, rows, fields, people } = await scopedLedger(ctx, rawProjectId);
  return filterTasks(rows, { fields, people, statusFieldId: project.statusFieldId }, filters).map(toTask);
}

async function columnsOf(ctx: McpContext, rawProjectId: unknown) {
  const { project, rows, fields, people } = await scopedLedger(ctx, rawProjectId);
  const modules = rows.filter((r) => r.led_depth === 2).map((r) => ({ id: r.led_node_id, name: r.led_name }));
  return listColumns(fields, people, project.statusFieldId, modules);
}

async function readTask(ctx: McpContext, taskId: unknown) {
  const node = await scopedTask(ctx, taskId);
  const { rows } = await loadLedger(ctx.ownerId, node.slug);
  const row = rows.find((r) => r.led_node_id === node.id);
  if (!row) throw outOfScope();
  return { ...toTask(row), projectId: node.projectId };
}

async function createTask(ctx: McpContext, args: { parent_id: string; name: string; after_id?: string }) {
  const parent = await scopedNode(ctx, args.parent_id);
  const afterId = await placement(ctx, args.after_id, parent.projectId);
  await authorize(ctx.ownerId, parent.projectId, 'node.create');
  return { ...toTask(await createNode(parent.id, args.name, afterId ?? null)), projectId: parent.projectId };
}

type UpdateArgs = TaskArgs & { task_id: string; parent_id?: string; after_id?: string | null };

/**
 * Move or edit, never both in one call. A move is its own capability
 * (`node.move`) and stays inside the task's project; an edit is authorised by
 * what it touches — dates, values, name — as `PATCH /api/nodes/[id]` does,
 * then written through `updateNode` with the owner as actor, so an
 * assignment notifies (spec 11).
 */
async function updateTask(ctx: McpContext, args: UpdateArgs) {
  const { task_id, parent_id, after_id, ...fields } = args;
  const node = await scopedTask(ctx, task_id);
  const patch = taskPatch(fields);
  const moving = parent_id !== undefined || after_id !== undefined;
  const editing = Object.keys(patch).length > 0;

  if (moving && editing) throw domainError('E_INVALID_DOC', 'Move and edit a task in separate calls.');
  if (!moving && !editing) throw domainError('E_INVALID_DOC', 'Give a field to change, or parent_id/after_id to move.');

  if (moving) {
    const parentId = parent_id === undefined ? undefined : (await sameProjectNode(ctx, parent_id, node.projectId)).id;
    const afterId = await placement(ctx, after_id, node.projectId);
    await authorize(ctx.ownerId, node.projectId, 'node.move');
    return { ...toTask(await moveNode(node.id, { parentId, afterId })), projectId: node.projectId };
  }

  const touchesDates = patch.estimateStart !== undefined || patch.estimateEnd !== undefined
    || patch.actualStart !== undefined || patch.actualEnd !== undefined;
  if (touchesDates) await authorize(ctx.ownerId, node.projectId, 'node.editDates');
  if (patch.values !== undefined) await authorize(ctx.ownerId, node.projectId, 'node.editValues');
  if (patch.name !== undefined) await authorize(ctx.ownerId, node.projectId, 'node.rename');
  return { ...toTask(await updateNode(node.id, patch, ctx.ownerId)), projectId: node.projectId };
}

const date = z.string().nullable().optional();

/** `list_projects`: shared by the List and Docs modules, so it is registered once for either. */
export function registerProjectTools(server: McpServer, ctx: McpContext): void {
  server.registerTool('list_projects', {
    description: 'List the projects this token can reach: id, name, slug and the token owner’s role.',
    annotations: readOnly,
  }, () => answer('list_projects', async () =>
    (await visibleProjects(ctx.ownerId)).filter((p) => ctx.scope.projectIds.includes(p.id))));
}

export function registerListTools(server: McpServer, ctx: McpContext): void {
  server.registerTool('list_tasks', {
    description: 'The tasks in one project, in List order: id, parentId, depth (2 = module, 3+ = task), name, estimateStart, estimateEnd, actualStart, actualEnd (YYYY-MM-DD or null) and custom field values. Estimate and actual are separate records; neither is derived from the other. Without filters every task comes back; with filters only the matching rows do (their ancestors are not added — follow parentId). Filters combine with AND; the values inside one filter combine with OR. Column ids and option ids come from list_columns, whose filter says which kind each column takes: values (option ids, user ids, module ids; null = empty cell; true/false for a checkbox), contains (text, case-insensitive, % = any run of characters) or range (from and/or to, YYYY-MM-DD, both inclusive; an empty cell is never in range).',
    inputSchema: z.object({
      project_id: z.string().describe('A project id from list_projects.'),
      filters: z.array(z.object({
        column: z.string().describe('A column id from list_columns, e.g. name, estimateEnd, module, or a field id.'),
        values: z.array(z.union([z.string(), z.boolean(), z.null()])).optional()
          .describe('For a values column: any of these ids (OR). null matches an empty cell; a checkbox takes true or false.'),
        contains: z.string().optional().describe('For a contains column: text the cell must contain. % stands for any run of characters.'),
        from: z.string().optional().describe('For a range column: the earliest day, YYYY-MM-DD, inclusive.'),
        to: z.string().optional().describe('For a range column: the latest day, YYYY-MM-DD, inclusive.'),
      }).strict()).max(20).optional().describe('Narrow the tasks returned. Omit for every task.'),
    }).strict(),
    annotations: readOnly,
  }, ({ project_id, filters }) => answer('list_tasks', () => tasksOf(ctx, project_id, filters)));

  server.registerTool('list_columns', {
    description: 'Every column of one project\'s List, to read or filter list_tasks rows by: id (the key a row carries it under — name, estimateStart, estimateEnd, actualStart, actualEnd at the top level; any other id is a key of values), name, kind (text, long_text, number, money, date, select, multi_select, checkbox, people, image, file), builtIn, status (true on the project\'s status column), filter (how list_tasks filters it: values, contains or range; absent = cannot be filtered) and options — for select and multi_select the option id, label, stage and archived; for people the project roster (id = user id); for module the modules (depth-2 rows). A select value is one option id, multi_select and people a list of ids, checkbox true/false, date YYYY-MM-DD.',
    inputSchema: z.object({ project_id: z.string().describe('A project id from list_projects.') }).strict(),
    annotations: readOnly,
  }, ({ project_id }) => answer('list_columns', () => columnsOf(ctx, project_id)));

  server.registerTool('read_task', {
    description: 'One task, in the list_tasks shape, plus its projectId.',
    inputSchema: z.object({ task_id: z.string().describe('A task id from list_tasks.') }).strict(),
    annotations: readOnly,
  }, ({ task_id }) => answer('read_task', () => readTask(ctx, task_id)));

  if (hasGrant(ctx.grants, 'list', 'create_task')) server.registerTool('create_task', {
    description: 'Create a task under parent_id (a module or task from list_tasks), after the sibling after_id or at the end. Retrying may create another task.',
    inputSchema: z.object({ parent_id: z.string(), name: z.string(), after_id: z.string().optional() }).strict(),
    annotations: writes,
  }, (args) => answer('create_task', () => createTask(ctx, args)));

  if (hasGrant(ctx.grants, 'list', 'write_task')) server.registerTool('update_task', {
    description: 'Edit a task: any of name, estimate_start, estimate_end, actual_start, actual_end (YYYY-MM-DD, null clears) and values (custom field id → value, null clears). Only what you give is written; an estimate never changes an actual. Or move it with parent_id and/or after_id (null = first) within its project. Move and edit in separate calls.',
    inputSchema: z.object({
      task_id: z.string(),
      name: z.string().optional(),
      estimate_start: date,
      estimate_end: date,
      actual_start: date,
      actual_end: date,
      values: z.record(z.string(), z.unknown()).optional(),
      parent_id: z.string().optional(),
      after_id: z.string().nullable().optional(),
    }).strict(),
    annotations: { ...writes, destructiveHint: true },
  }, (args) => answer('update_task', () => updateTask(ctx, args)));
}
