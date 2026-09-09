import 'server-only';
import { eq } from 'drizzle-orm';
import { db, rawQuery } from '@/db/client';
import { docAssets, fieldDefinitions, fieldOptions, nodes, projects } from '@/db/schema';
import type { CustomValues, LedgerRow } from '@/db/schema';
import { domainError } from '@/lib/errors';
import {
  planDateWrite,
  planAutoCapture,
  assertArchivable,
  assertMoveTarget,
  assertWritableKey,
  childDepth,
  coerceValue,
  planMove,
  type DateWrite,
  type FieldSpec,
  type NodeDates,
  type OptionSpec,
  type Stage,
} from '@/lib/node-rules';

/**
 * The write adapter.
 *
 * This module loads the row, hands the decisions to `node-rules.ts`, and
 * persists the answer. It contains no rules of its own — that separation is
 * what lets `tests/node-rules.test.ts` cover the real logic without a
 * database, rather than testing a parallel copy of it.
 */

export type NodePatch = {
  name?: string;
  estimateStart?: string | null;
  estimateEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  /** Sparse: only the keys being changed. `null` clears one. */
  values?: Record<string, unknown>;
};

/** The today() the rules refer to, in the project's timezone, not the server's. */
function todayInBangkok(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function updateNode(nodeId: string, patch: NodePatch): Promise<LedgerRow> {
  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1);
  if (!node) throw domainError('E_NOT_FOUND', 'No such task.');

  const current: NodeDates = {
    estimateStart: node.estimateStart,
    estimateEnd: node.estimateEnd,
    actualStart: node.actualStart,
    actualEnd: node.actualEnd,
    actualSourceStart: node.actualSourceStart,
    actualSourceEnd: node.actualSourceEnd,
  };

  let dateWrite: DateWrite = planDateWrite(current, patch);
  let values: CustomValues | undefined;

  /* ------------------------------------------------------------ name */
  let name: string | undefined;
  if (patch.name !== undefined) {
    name = patch.name.trim();
    if (!name) throw domainError('E_RANGE_INVERTED', 'A name cannot be empty.');
  }

  /* --------------------------------------------------- custom values */
  if (patch.values) {
    const [defs, opts, project] = await Promise.all([
      db
        .select({
          id: fieldDefinitions.id,
          kind: fieldDefinitions.kind,
          settings: fieldDefinitions.settings,
          archivedAt: fieldDefinitions.archivedAt,
        })
        .from(fieldDefinitions)
        .where(eq(fieldDefinitions.projectId, node.projectId)),
      db
        .select({
          id: fieldOptions.id,
          fieldId: fieldOptions.fieldId,
          stage: fieldOptions.stage,
          archivedAt: fieldOptions.archivedAt,
        })
        .from(fieldOptions),
      db
        .select({ statusFieldId: projects.statusFieldId })
        .from(projects)
        .where(eq(projects.id, node.projectId))
        .limit(1)
        .then((r) => r[0]),
    ]);

    const specs = new Map<string, FieldSpec>(
      defs.map((d) => [
        d.id,
        {
          id: d.id,
          kind: d.kind as FieldSpec['kind'],
          archived: d.archivedAt !== null,
          currency: d.settings?.currency,
        },
      ]),
    );
    const optionSpecs: OptionSpec[] = opts.map((o) => ({
      id: o.id,
      fieldId: o.fieldId,
      archived: o.archivedAt !== null,
    }));

    values = { ...node.customValues };

    for (const [key, raw] of Object.entries(patch.values)) {
      assertWritableKey(key);
      const spec = specs.get(key);
      if (!spec) throw domainError('E_UNKNOWN_FIELD', 'No such column in this project.', { key });

      const value = coerceValue(spec, raw, optionSpecs);
      if (spec.kind === 'image' && Array.isArray(value)) {
        for (const url of value) {
          const [asset] = await db.select().from(docAssets).where(eq(docAssets.id, url.split('/').pop()!)).limit(1);
          if (!asset || asset.projectId !== node.projectId) {
            throw domainError('E_UNKNOWN_FIELD', 'Choose an image uploaded to this project.');
          }
        }
      }
      if (value === null) delete values[key];
      else values[key] = value as CustomValues[string];
    }

    /* ------------------------------------- automatic capture (D-13) */
    const statusFieldId = project?.statusFieldId;
    if (statusFieldId && Object.hasOwn(patch.values, statusFieldId)) {
      const optionId = values[statusFieldId];
      const stage: Stage =
        typeof optionId === 'string'
          ? (opts.find((o) => o.id === optionId)?.stage as Stage) ?? null
          : null;
      dateWrite = planAutoCapture(current, stage, todayInBangkok(), dateWrite);
    }
  }

  /* ----------------------------------------------------------- write */
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (frag: string, value: unknown) => {
    params.push(value);
    sets.push(`${frag} $${params.length}`);
  };

  if (name !== undefined) add('node_name =', name);
  if (dateWrite.estimateStart !== undefined) add('node_estimate_start =', dateWrite.estimateStart);
  if (dateWrite.estimateEnd !== undefined) add('node_estimate_end =', dateWrite.estimateEnd);
  if (values !== undefined) add('node_custom_values =', JSON.stringify(values));

  // Snapped by the database so the holiday calendar stays the single source of
  // truth, with the raw value preserved beside it (D-15).
  if (dateWrite.actualStartRaw !== undefined) {
    params.push(dateWrite.actualStartRaw);
    const i = params.length;
    sets.push(`node_actual_start = pmf_next_workday($${i}::date)`);
    sets.push(`node_actual_start_raw = $${i}::date`);
    add('node_actual_source_start =', dateWrite.actualSourceStart ?? null);
  }
  if (dateWrite.actualEndRaw !== undefined) {
    params.push(dateWrite.actualEndRaw);
    const i = params.length;
    sets.push(`node_actual_end = pmf_next_workday($${i}::date)`);
    sets.push(`node_actual_end_raw = $${i}::date`);
    add('node_actual_source_end =', dateWrite.actualSourceEnd ?? null);
  }

  if (sets.length) {
    sets.push('node_updated_at = now()');
    params.push(nodeId);
    await rawQuery(
      `UPDATE pmt_nodes SET ${sets.join(', ')} WHERE node_id = $${params.length}`,
      params,
    );

    // Snapping can invert a range; collapse it to one working day (D-16).
    await rawQuery(
      `UPDATE pmt_nodes SET node_actual_end = node_actual_start
        WHERE node_id = $1
          AND node_actual_start IS NOT NULL AND node_actual_end IS NOT NULL
          AND node_actual_end < node_actual_start`,
      [nodeId],
    );
  }

  const [row] = await rawQuery<LedgerRow>(
    `SELECT * FROM pmf_project_ledger($1) WHERE led_node_id = $2`,
    [node.projectId, nodeId],
  );
  if (!row) throw domainError('E_NOT_FOUND', 'The task disappeared while saving.');
  return row;
}


/**
 * Create a child of `parentId`.
 *
 * `afterId` is the sibling the new node should follow; omit it to append. Sort
 * order is a float placed midway between neighbours, so inserting between two
 * rows never rewrites the rest of the list (D-5).
 */
export async function createNode(
  parentId: string,
  name: string,
  afterId?: string | null,
): Promise<LedgerRow> {
  const [parent] = await db.select().from(nodes).where(eq(nodes.id, parentId)).limit(1);
  if (!parent) throw domainError('E_NOT_FOUND', 'No such parent.');

  const depth = childDepth(parent.depth);            // throws E_MAX_DEPTH at the ceiling

  const siblings = await rawQuery<{ node_id: string; node_sort_order: number }>(
    `SELECT node_id, node_sort_order FROM pmt_nodes
      WHERE node_parent_id = $1 AND node_archived_at IS NULL
      ORDER BY node_sort_order`,
    [parentId],
  );

  let sortOrder: number;
  const at = afterId ? siblings.findIndex((s) => s.node_id === afterId) : siblings.length - 1;
  const before = at >= 0 ? siblings[at] : undefined;
  const after = at >= 0 ? siblings[at + 1] : siblings[0];

  if (before && after) sortOrder = (before.node_sort_order + after.node_sort_order) / 2;
  else if (before) sortOrder = before.node_sort_order + 1;
  else if (after) sortOrder = after.node_sort_order - 1;
  else sortOrder = 0;

  const [created] = await rawQuery<{ node_id: string }>(
    `INSERT INTO pmt_nodes (node_project_id, node_parent_id, node_depth, node_name, node_sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING node_id`,
    [parent.projectId, parentId, depth, name.trim() || 'Untitled', sortOrder],
  );

  const [row] = await rawQuery<LedgerRow>(
    `SELECT * FROM pmf_project_ledger($1) WHERE led_node_id = $2`,
    [parent.projectId, created!.node_id],
  );
  if (!row) throw domainError('E_NOT_FOUND', 'The task vanished as it was created.');
  return row;
}


/**
 * Re-parent a node, taking its whole subtree with it (D-3).
 *
 * Three checks, in the order that makes the failure message useful: the target
 * must be in the same project, it must not be inside the node's own subtree,
 * and it must sit exactly one level above (which today means the depth cannot
 * change — see `planMove`).
 */
export async function moveNode(nodeId: string, newParentId: string): Promise<LedgerRow> {
  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1);
  if (!node) throw domainError('E_NOT_FOUND', 'No such task.');

  const [target] = await db.select().from(nodes).where(eq(nodes.id, newParentId)).limit(1);
  if (!target) throw domainError('E_NOT_FOUND', 'No such parent.');

  if (target.projectId !== node.projectId) {
    throw domainError('E_LEVEL_MISMATCH', 'A task cannot move to another project.');
  }
  if (node.parentId === newParentId) {
    // Nothing to do, but returning the row keeps the caller's code simple.
    return readLedgerRow(node.projectId, nodeId);
  }

  const ancestors = await rawQuery<{ ancestor_id: string }>(
    `WITH RECURSIVE up AS (
       SELECT node_id, node_parent_id FROM pmt_nodes WHERE node_id = $1
       UNION ALL
       SELECT p.node_id, p.node_parent_id
         FROM pmt_nodes p JOIN up ON p.node_id = up.node_parent_id
     )
     SELECT node_id AS ancestor_id FROM up WHERE node_id <> $1`,
    [newParentId],
  );
  assertMoveTarget(nodeId, newParentId, ancestors.map((a) => a.ancestor_id));

  const [deepest] = await rawQuery<{ max_depth: number | null }>(
    `SELECT max(descendant_depth) AS max_depth FROM pmf_descendants($1)`,
    [nodeId],
  );
  const subtreeHeight = deepest?.max_depth ? deepest.max_depth - node.depth : 0;

  planMove(node.depth, target.depth, subtreeHeight);   // throws on a bad level or the ceiling

  await rawQuery('CALL pmp_move_subtree($1, $2)', [nodeId, newParentId]);
  return readLedgerRow(node.projectId, nodeId);
}

/**
 * Soft-archive a node and everything beneath it (D-4).
 *
 * Returns how many rows went with it, because "archive this module" quietly
 * taking 57 subtasks along is exactly the kind of thing a person should be
 * told after the fact, and asked about before it.
 */
export async function archiveNode(nodeId: string): Promise<{ projectId: string; archived: number }> {
  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1);
  if (!node) throw domainError('E_NOT_FOUND', 'No such task.');
  if (node.archivedAt) return { projectId: node.projectId, archived: 0 };

  assertArchivable(node.depth);

  const before = await rawQuery<{ n: string }>(
    `SELECT count(*) AS n FROM pmt_nodes
      WHERE node_archived_at IS NULL
        AND (node_id = $1 OR node_id IN (SELECT descendant_id FROM pmf_descendants($1)))`,
    [nodeId],
  );

  await rawQuery('CALL pmp_archive_subtree($1)', [nodeId]);
  return { projectId: node.projectId, archived: Number(before[0]?.n ?? 0) };
}

/** Undo an archive, restoring the whole subtree (D-4). */
export async function restoreNode(nodeId: string): Promise<LedgerRow> {
  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1);
  if (!node) throw domainError('E_NOT_FOUND', 'No such task.');

  await rawQuery('CALL pmp_restore_subtree($1)', [nodeId]);
  return readLedgerRow(node.projectId, nodeId);
}

async function readLedgerRow(projectId: string, nodeId: string): Promise<LedgerRow> {
  const [row] = await rawQuery<LedgerRow>(
    `SELECT * FROM pmf_project_ledger($1) WHERE led_node_id = $2`,
    [projectId, nodeId],
  );
  if (!row) throw domainError('E_NOT_FOUND', 'The task is not in this project.');
  return row;
}
