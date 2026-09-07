/**
 * The depth ceiling (D-1, D-2). Raised from 4 to 6 on 2026-09-07 when the
 * ClickUp capture showed real parent chains five task levels deep.
 *
 * Raising it further also needs the CHECK in db/schema.sql widened. It is
 * deliberately not unbounded: roll-up cost and UI indentation both grow with
 * depth, and an unbounded tree makes neither answerable.
 */
export const MAX_DEPTH = 6;

/** Depth 1-3 are named roles; every depth below is a subtask (D-1). */
export function depthName(depth: number): string {
  return depth === 1 ? 'project' : depth === 2 ? 'module' : depth === 3 ? 'task' : 'subtask';
}

/** Keys the API refuses from clients. `_clickup_id` is written by the importer. */
export const isReservedKey = (key: string) => key.startsWith('_');

export const TIME_ZONE = 'Asia/Bangkok';
