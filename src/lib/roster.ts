import 'server-only';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, rawQuery } from '@/db/client';
import { fieldDefinitions, holidays, projects, projectMembers, users } from '@/db/schema';
import type { LedgerRow } from '@/db/schema';

/**
 * The roster read: every dated node the user can see, across every project they
 * are a member of, filed under the people it is assigned to.
 *
 * This is the one read in the product that crosses a project boundary. The
 * project ledger is deliberately project-scoped — a node's dates only mean
 * something beside its siblings' — but the question this surface answers
 * ("who is holding what, and when do their runs collide?") cannot be asked
 * inside one project, because a person's collisions are mostly with themselves
 * in a different project.
 *
 * Assignment is read from *any* `people`-kind field in a project, not from a
 * field named "Assignee". Custom fields are defined per project (spec 02), so
 * no single field id exists across the shelf; a project may name its people
 * field "ผู้รับผิดชอบ", "Owner" or nothing at all, and two projects may each
 * have several. A node is on a person's lane when that person's id appears in
 * any of them.
 */

export type RosterItem = {
  nodeId: string;
  name: string;
  /** Which project it belongs to, and that project's hue index on this page. */
  projectSlug: string;
  projectName: string;
  projectIndex: number;
  /** The top-level block inside its project — its module, when it has one. */
  moduleName: string | null;
  moduleId: string | null;
  estimateStart: string | null;
  estimateEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  /** Signed working days; positive is late. Null when either end is missing. */
  misclosureEnd: number | null;
  outOfClosure: boolean;
  /** Which people fields put it here — carried so a lane can explain itself. */
  fieldNames: string[];
};

export type RosterLane = {
  /** The user id, or `null` for the lane of work nobody holds. */
  personId: string | null;
  personName: string;
  items: RosterItem[];
  /** Assigned to this person but carrying neither an estimate nor an actual. */
  undatedCount: number;
  undatedItems: { projectSlug: string; moduleId: string | null }[];
};

export type RosterProject = {
  id: string;
  slug: string;
  name: string;
  /** 1–6, the hue index. See the note on `HUE_COUNT` below. */
  index: number;
  /** True when the project defines no people-kind field at all. */
  unassignable: boolean;
};

export type Roster = {
  lanes: RosterLane[];
  projects: RosterProject[];
  modules: { id: string; name: string; projectSlug: string }[];
  holidays: string[];
};

/**
 * DESIGN.md assigns `tab-1…6` to modules. At the shelf the hue is re-let to
 * the *project*, because two projects' modules would otherwise collide on the
 * same six hues with nothing to separate them — and across a project boundary
 * "which project" is the identity a reader needs first. Inside a project the
 * old meaning is untouched. The rule that survives both readings is the one
 * that matters: hue says whose work it is, never how it is going.
 */
const HUE_COUNT = 6;

export async function loadRoster(userId: string): Promise<Roster> {
  const mine = await db
    .select({ id: projects.id, slug: projects.slug, name: projects.name })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.userId, userId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.name));

  if (mine.length === 0) return { lanes: [], projects: [], modules: [], holidays: [] };

  const projectIds = mine.map((p) => p.id);

  const [peopleFields, everyone, hols, ...ledgers] = await Promise.all([
    db
      .select({ id: fieldDefinitions.id, projectId: fieldDefinitions.projectId, name: fieldDefinitions.name })
      .from(fieldDefinitions)
      .where(and(eq(fieldDefinitions.kind, 'people'), inArray(fieldDefinitions.projectId, projectIds))),
    db.select({ id: users.id, name: users.fullName }).from(users),
    db.select({ date: holidays.date }).from(holidays),
    // One call per project rather than a union: pmf_project_ledger takes a
    // single project and computes roll-ups within it. Six projects is the
    // observed ceiling, and the alternative is a function that would have to
    // learn what a project boundary means.
    ...projectIds.map((id) => rawQuery<LedgerRow>('SELECT * FROM pmf_project_ledger($1)', [id])),
  ]);

  const nameOf = new Map(everyone.map((u) => [u.id, u.name] as const));

  const rosterProjects: RosterProject[] = mine.map((p, i) => ({
    ...p,
    index: (i % HUE_COUNT) + 1,
    unassignable: !peopleFields.some((f) => f.projectId === p.id),
  }));

  /** personId (or null for unassigned) → lane under construction */
  const lanes = new Map<string | null, RosterLane>();
  const modules: Roster['modules'] = [];
  const lane = (id: string | null): RosterLane => {
    let l = lanes.get(id);
    if (!l) {
      l = {
        personId: id,
        personName: id === null ? 'Unassigned' : nameOf.get(id) ?? 'Unknown person',
        items: [],
        undatedCount: 0,
        undatedItems: [],
      };
      lanes.set(id, l);
    }
    return l;
  };

  // A lane exists because somebody is named on a node, not because they are a
  // member. Membership used to seed a lane for every member of every visible
  // project, so that an empty lane could answer "who is free?"; by explicit
  // instruction on 2026-09-08 the page shows assigned people only. The cost is
  // named rather than hidden: a member holding nothing is now absent from this
  // page, and idleness has to be read from the access board instead.
  //
  // Assignment, not dated assignment: a person carrying only undated work
  // still keeps a lane, which draws as "n assigned, none dated". They have
  // been given work — the work simply has no dates yet.

  mine.forEach((project, pi) => {
    const rows = ledgers[pi] ?? [];
    const fields = peopleFields.filter((f) => f.projectId === project.id);
    const byId = new Map(rows.map((r) => [r.led_node_id, r] as const));
    const rosterProject = rosterProjects[pi]!;
    for (const row of rows) {
      if (row.led_depth === 2) {
        modules.push({ id: row.led_node_id, name: row.led_name, projectSlug: project.slug });
      }
    }

    for (const row of rows) {
      // Depth 1 is the project's own root node — it is the project, not work
      // inside it, and it carries no assignee.
      if (row.led_depth <= 1) continue;
      const module = moduleOf(row, byId);

      const assigned = new Set<string>();
      const fieldNames: string[] = [];
      for (const f of fields) {
        const raw = row.led_custom_values[f.id];
        if (!Array.isArray(raw) || raw.length === 0) continue;
        fieldNames.push(f.name);
        for (const v of raw) assigned.add(String(v));
      }

      const dated =
        row.led_estimate_start || row.led_estimate_end || row.led_actual_start || row.led_actual_end;

      const targets: (string | null)[] = assigned.size ? [...assigned] : [null];
      for (const personId of targets) {
        const l = lane(personId);
        if (!dated) {
          l.undatedCount += 1;
          l.undatedItems.push({ projectSlug: project.slug, moduleId: module?.led_node_id ?? null });
          continue;
        }
        l.items.push({
          nodeId: row.led_node_id,
          name: row.led_name,
          projectSlug: project.slug,
          projectName: project.name,
          projectIndex: rosterProject.index,
          moduleName: module && module.led_node_id !== row.led_node_id ? module.led_name : null,
          moduleId: module?.led_node_id ?? null,
          estimateStart: row.led_estimate_start,
          estimateEnd: row.led_estimate_end,
          actualStart: row.led_actual_start,
          actualEnd: row.led_actual_end,
          misclosureEnd: row.led_misclosure_end,
          outOfClosure: row.led_out_of_closure,
          fieldNames,
        });
      }
    }
  });

  const ordered = [...lanes.values()].sort(byLoadThenName);
  return { lanes: ordered, projects: rosterProjects, modules, holidays: hols.map((h) => h.date) };
}

/**
 * Busiest first, then alphabetical, and the unassigned lane last regardless.
 *
 * Unassigned is pinned to the foot rather than sorted with the rest because it
 * is not a person: work nobody holds is a finding to read after the roster,
 * not a competitor for the top of it. It is never hidden — a page about who
 * holds what that omits the work nobody holds is answering a smaller question
 * than the one asked.
 */
function byLoadThenName(a: RosterLane, b: RosterLane): number {
  if (a.personId === null) return 1;
  if (b.personId === null) return -1;
  if (a.items.length !== b.items.length) return b.items.length - a.items.length;
  return a.personName.localeCompare(b.personName);
}

/** Find the depth-2 module, including the module row itself. */
function moduleOf(row: LedgerRow, byId: Map<string, LedgerRow>): LedgerRow | null {
  let cur: LedgerRow | undefined = row;
  while (cur && cur.led_depth > 2) {
    cur = cur.led_parent_id ? byId.get(cur.led_parent_id) : undefined;
  }
  return cur && cur.led_depth === 2 ? cur : null;
}
