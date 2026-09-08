/**
 * The single choke point for authorisation (spec 05 §3).
 *
 * Two rules that are easy to get wrong and expensive to get wrong:
 *
 *   1. A user with no membership row for a project must not learn the project
 *      exists. Reads return 404, never 403 — a 403 confirms existence.
 *   2. Capabilities live in one static table, not in conditionals scattered
 *      through route handlers. Adding an action means adding a row here, and
 *      the type system then forces every call site to use a real action name.
 */

import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { projectMembers, users } from '@/db/schema';
import { domainError } from '@/lib/errors';

export type Role = 'admin' | 'member' | 'viewer';

export const ACTIONS = {
  'node.read': ['admin', 'member', 'viewer'],
  'node.create': ['admin', 'member'],
  'node.rename': ['admin', 'member'],
  'node.editDates': ['admin', 'member'],
  'node.editValues': ['admin', 'member'],
  'node.move': ['admin', 'member'],
  'node.archive': ['admin'],

  'field.define': ['admin'],
  'field.archive': ['admin'],
  'field.setStatusField': ['admin'],
  'option.define': ['admin'],

  'project.rename': ['admin'],
  'project.archive': ['admin'],
  'member.manage': ['admin'],
  'holiday.manage': ['admin'],
  'user.create': ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof ACTIONS;

export function can(role: Role, action: Action): boolean {
  return (ACTIONS[action] as readonly Role[]).includes(role);
}

/**
 * Resolve the acting user's role for a project, or refuse.
 *
 * `kind: 'read'` throws E_NOT_FOUND when there is no membership, so a
 * non-member cannot distinguish "no access" from "does not exist".
 * `kind: 'write'` throws E_FORBIDDEN, because by then the caller has already
 * established the project is visible to this user.
 */
export async function requireProjectRole(
  userId: string,
  projectId: string,
  kind: 'read' | 'write' = 'read',
): Promise<Role> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);

  if (!row) {
    throw kind === 'read'
      ? domainError('E_NOT_FOUND', 'No such project.')
      : domainError('E_FORBIDDEN', 'You do not have access to this project.');
  }
  return row.role;
}

/**
 * Resolve the role and assert one capability in a single step.
 *
 * An account still holding a password its admin chose is refused here whatever
 * its role, and it is refused at the capability check rather than at the
 * membership one so the reason it hears is the true one. This is the choke
 * point every mutation passes through, including the node routes that do not
 * go by way of `handle`.
 */
export async function authorize(
  userId: string,
  projectId: string,
  action: Action,
): Promise<Role> {
  const [account] = await db
    .select({ must: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (account?.must) {
    throw domainError('E_FORBIDDEN', 'Change your password before you do anything else.');
  }

  const isRead = (ACTIONS[action] as readonly Role[]).includes('viewer');
  const role = await requireProjectRole(userId, projectId, isRead ? 'read' : 'write');

  if (!can(role, action)) {
    throw domainError('E_FORBIDDEN', `Your role (${role}) cannot do that.`, { action });
  }
  return role;
}
