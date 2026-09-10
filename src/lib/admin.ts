import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db, rawQuery } from '@/db/client';
import { fieldDefinitions, fieldOptions, holidays, projectMembers, projects, users } from '@/db/schema';
import { domainError } from '@/lib/errors';
import {
  assertColorIndex, assertEmail, assertFieldKind, assertFieldName, assertFullName,
  assertHolidayDate,
  assertAdminsEveryProjectOf, assertHolidayName, assertKeepsADoneStage, assertKeepsAnAdmin,
  assertKindUnchanged, assertLeavesNoProjectAdminless, assertNotProtectedAccount, assertNotSelf,
  assertNotProtectedReset, assertResetIsNotSelf, assertSharesAnAdministeredProject,
  assertNewPassword, assertOptionLabel, assertPassword, assertProjectName, assertRole,
  assertStage, assertStatusFieldKind, slugFromName,
  type Role, type Stage,
} from '@/lib/admin-rules';
import { hashPassword, verifyPassword } from '@/lib/password';
import type { FieldKind } from '@/lib/node-rules';

/**
 * The administration adapter (T8).
 *
 * As with `nodes.ts`, this module loads rows, hands decisions to
 * `admin-rules.ts`, and writes the result. Two behaviours are worth stating
 * because they are choices rather than plumbing:
 *
 *   - nothing here deletes a field or an option. Archiving is the only removal
 *     (D-33, D-34), because a stored value has no foreign key to protect it;
 *   - the last admin cannot be demoted or removed, so a project cannot be
 *     locked away from everyone.
 */

/* ------------------------------------------------------------------ read */

export type Settings = {
  project: { id: string; name: string; slug: string; statusFieldId: string | null };
  fields: {
    id: string; name: string; kind: FieldKind; position: number;
    settings: Record<string, unknown>; archived: boolean;
    options: { id: string; label: string; colorIndex: number; stage: Stage | null; position: number; archived: boolean }[];
  }[];
  members: { userId: string; name: string; email: string; role: Role }[];
  people: { id: string; name: string; email: string; active: boolean }[];
  holidays: { date: string; name: string }[];
};

export async function loadSettings(projectId: string): Promise<Settings> {
  const [project] = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug, statusFieldId: projects.statusFieldId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw domainError('E_NOT_FOUND', 'No such project.');

  const [defs, opts, members, people, hols] = await Promise.all([
    db.select().from(fieldDefinitions)
      .where(eq(fieldDefinitions.projectId, projectId))
      .orderBy(asc(fieldDefinitions.position)),
    db.select().from(fieldOptions).orderBy(asc(fieldOptions.position)),
    db.select({
      userId: projectMembers.userId, role: projectMembers.role,
      name: users.fullName, email: users.email,
    })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId)),
    db.select({ id: users.id, name: users.fullName, email: users.email, active: users.isActive }).from(users),
    db.select({ date: holidays.date, name: holidays.name }).from(holidays).orderBy(asc(holidays.date)),
  ]);

  return {
    project,
    fields: defs.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind as FieldKind,
      position: d.position,
      settings: (d.settings ?? {}) as Record<string, unknown>,
      archived: d.archivedAt !== null,
      options: opts.filter((o) => o.fieldId === d.id).map((o) => ({
        id: o.id, label: o.label, colorIndex: o.colorIndex,
        stage: o.stage as Stage | null, position: o.position, archived: o.archivedAt !== null,
      })),
    })),
    members: members.map((m) => ({ ...m, role: m.role as Role })),
    people,
    holidays: hols,
  };
}

/* -------------------------------------------------------------- projects */

/**
 * Create a project and make its creator the admin.
 *
 * Both rows in one statement pair rather than one, because a project with no
 * membership row is not merely hidden from the shelf — it is absent from every
 * scoped query (spec 05 §4), so a half-written create would strand it.
 *
 * The root node is written here too, and it is not optional. `pmt_projects` is
 * the container; the tree lives in `pmt_nodes`, where depth 1 with no parent is
 * the project row. A module is a child of that row — so a project without one
 * has nothing for a module to hang off and cannot be added to at all.
 *
 * No status field is designated: D-35 says which column drives automatic
 * actual dates, and that is a choice the admin makes in settings, not one this
 * function guesses on their behalf.
 */
export async function createProject(
  userId: string,
  input: { name?: unknown },
): Promise<{ id: string; slug: string }> {
  const name = assertProjectName(input.name);

  const base = slugFromName(name);
  let slug = base || `p-${randomBytes(4).toString('hex')}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const clash = await db.select({ id: projects.id }).from(projects)
      .where(eq(projects.slug, slug)).limit(1);
    if (!clash.length) break;
    slug = `${base || 'p'}-${randomBytes(3).toString('hex')}`;
  }

  const [row] = await db.insert(projects).values({ name, slug })
    .returning({ id: projects.id, slug: projects.slug });

  await db.insert(projectMembers).values({ projectId: row!.id, userId, role: 'admin' });

  await rawQuery(
    `INSERT INTO pmt_nodes (node_project_id, node_parent_id, node_depth, node_name,
                            node_sort_order, node_created_by)
     VALUES ($1, NULL, 1, $2, 0, $3)`,
    [row!.id, name, userId],
  );

  return { id: row!.id, slug: row!.slug };
}

/**
 * Set the List's column arrangement for the whole project (spec 03 §2.4).
 *
 * Stored as block keys, not positions, and validated for shape only — which
 * keys exist is a question about field definitions that change constantly, and
 * an order that named a since-archived field would then be a write that
 * refuses. The read side ignores what it cannot resolve and keeps what it has
 * never heard of, so a stale key is harmless and a strict check here would buy
 * nothing but failures.
 */
export async function setColumnOrder(projectId: string, input: unknown): Promise<{ columnOrder: string[] }> {
  if (!Array.isArray(input) || input.some((k) => typeof k !== 'string' || !k || k.length > 100)) {
    throw domainError('E_UNKNOWN_FIELD', 'A column order is a list of column keys.');
  }
  if (input.length > 100) throw domainError('E_UNKNOWN_FIELD', 'That is more columns than a project has.');

  const columnOrder = [...new Set(input as string[])];
  const [row] = await db
    .update(projects)
    .set({ columnOrder, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning({ columnOrder: projects.columnOrder });
  if (!row) throw domainError('E_NOT_FOUND', 'No such project.');

  return { columnOrder: row.columnOrder };
}

/**
 * Rename a project.
 *
 * Two rows change, because the name is displayed from two places: the project
 * row titles the page, and the root node titles the breadcrumb in the detail
 * panel. Renaming only the first leaves the old name showing above every task,
 * which reads as a bug rather than as a distinction nobody asked for.
 *
 * **The slug does not follow.** It is in every link anybody has pasted into a
 * chat, a ticket or a bookmark, and a rename is a change of label, not a move.
 * A project renamed six times still answers on the URL it was created with.
 */
export async function renameProject(projectId: string, nameInput: unknown): Promise<{ name: string }> {
  const name = assertProjectName(nameInput);

  const [row] = await db
    .update(projects)
    .set({ name, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning({ name: projects.name });
  if (!row) throw domainError('E_NOT_FOUND', 'No such project.');

  await rawQuery(
    `UPDATE pmt_nodes SET node_name = $2, node_updated_at = now()
      WHERE node_project_id = $1 AND node_depth = 1`,
    [projectId, name],
  );

  return { name: row.name };
}

/* ----------------------------------------------------------- definitions */

export async function createField(
  projectId: string,
  input: { name?: unknown; kind?: unknown; currency?: unknown },
): Promise<string> {
  const name = assertFieldName(input.name);
  const kind = assertFieldKind(input.kind);

  const settings: Record<string, unknown> = {};
  // A display unit, not an ISO code: a field may record millions (`M฿`) or
  // any other unit its numbers are actually in. Not uppercased, because `M฿`
  // and `k$` mean something and `M฿` shouted does not.
  if (kind === 'money') settings.currency = String(input.currency ?? 'THB').trim().slice(0, 8) || 'THB';

  const [{ next }] = await rawQuery<{ next: number }>(
    `SELECT COALESCE(max(field_position), -1) + 1 AS next
       FROM pmt_field_definitions WHERE field_project_id = $1`,
    [projectId],
  ) as [{ next: number }];

  const [row] = await db
    .insert(fieldDefinitions)
    .values({ projectId, name, kind: kind as never, position: next, settings })
    .returning({ id: fieldDefinitions.id });

  return row!.id;
}

export async function updateField(
  fieldId: string,
  patch: { name?: unknown; kind?: unknown; position?: unknown; archived?: unknown },
): Promise<void> {
  const [field] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId)).limit(1);
  if (!field) throw domainError('E_UNKNOWN_FIELD', 'No such column.');

  assertKindUnchanged(field.kind as FieldKind, patch.kind);

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = assertFieldName(patch.name);
  if (patch.position !== undefined) set.position = Number(patch.position);

  if (patch.archived !== undefined) {
    const archiving = patch.archived === true;
    if (archiving) {
      // Archiving the status field would silently stop automatic capture, so
      // the designation has to be cleared deliberately first.
      const [project] = await db
        .select({ statusFieldId: projects.statusFieldId })
        .from(projects)
        .where(eq(projects.id, field.projectId))
        .limit(1);
      if (project?.statusFieldId === fieldId) {
        throw domainError(
          'E_STATUS_FIELD_TYPE',
          'This is the status column. Choose a different one before archiving it.',
        );
      }
    }
    set.archivedAt = archiving ? new Date() : null;
  }

  await db.update(fieldDefinitions).set(set).where(eq(fieldDefinitions.id, fieldId));
}

export async function setStatusField(projectId: string, fieldId: string | null): Promise<void> {
  if (fieldId === null) {
    assertStatusFieldKind(null);
    await db.update(projects).set({ statusFieldId: null, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    return;
  }

  const [field] = await db
    .select()
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.id, fieldId), eq(fieldDefinitions.projectId, projectId)))
    .limit(1);
  if (!field) throw domainError('E_UNKNOWN_FIELD', 'No such column in this project.');
  if (field.archivedAt) throw domainError('E_UNKNOWN_FIELD', 'That column is archived.');

  assertStatusFieldKind(field.kind as FieldKind);

  const opts = await db.select({ stage: fieldOptions.stage })
    .from(fieldOptions).where(eq(fieldOptions.fieldId, fieldId));
  assertKeepsADoneStage(true, opts.map((o) => o.stage as Stage | null));

  await db.update(projects).set({ statusFieldId: fieldId, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

/* --------------------------------------------------------------- options */

export async function createOption(
  fieldId: string,
  input: { label?: unknown; stage?: unknown; colorIndex?: unknown },
): Promise<string> {
  const [field] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId)).limit(1);
  if (!field) throw domainError('E_UNKNOWN_FIELD', 'No such column.');
  if (field.kind !== 'select' && field.kind !== 'multi_select') {
    throw domainError('E_UNKNOWN_FIELD', 'Only a select column has options.');
  }

  const [{ next }] = await rawQuery<{ next: number }>(
    `SELECT COALESCE(max(option_position), -1) + 1 AS next
       FROM pmt_field_options WHERE option_field_id = $1`,
    [fieldId],
  ) as [{ next: number }];

  const [row] = await db.insert(fieldOptions).values({
    fieldId,
    label: assertOptionLabel(input.label),
    stage: assertStage(input.stage) as never,
    colorIndex: assertColorIndex(input.colorIndex),
    position: next,
  }).returning({ id: fieldOptions.id });

  return row!.id;
}

export async function updateOption(
  optionId: string,
  patch: { label?: unknown; stage?: unknown; colorIndex?: unknown; archived?: unknown },
): Promise<void> {
  const [option] = await db.select().from(fieldOptions).where(eq(fieldOptions.id, optionId)).limit(1);
  if (!option) throw domainError('E_UNKNOWN_FIELD', 'No such option.');

  const [field] = await db.select().from(fieldDefinitions)
    .where(eq(fieldDefinitions.id, option.fieldId)).limit(1);
  const [project] = await db.select({ statusFieldId: projects.statusFieldId })
    .from(projects).where(eq(projects.id, field!.projectId)).limit(1);
  const isStatusField = project?.statusFieldId === option.fieldId;

  const set: Record<string, unknown> = {};
  if (patch.label !== undefined) set.label = assertOptionLabel(patch.label);
  if (patch.colorIndex !== undefined) set.colorIndex = assertColorIndex(patch.colorIndex);
  if (patch.stage !== undefined) set.stage = assertStage(patch.stage);
  if (patch.archived !== undefined) set.archivedAt = patch.archived === true ? new Date() : null;

  // Work out what the field's stages would be afterwards, and refuse a change
  // that leaves the status column with no way to record a finish.
  if (isStatusField && (patch.stage !== undefined || patch.archived !== undefined)) {
    const siblings = await db.select({ id: fieldOptions.id, stage: fieldOptions.stage, archivedAt: fieldOptions.archivedAt })
      .from(fieldOptions).where(eq(fieldOptions.fieldId, option.fieldId));

    const after = siblings.map((o) => {
      if (o.id !== optionId) return o.archivedAt ? null : (o.stage as Stage | null);
      const archived = patch.archived !== undefined ? patch.archived === true : o.archivedAt !== null;
      if (archived) return null;
      return (patch.stage !== undefined ? assertStage(patch.stage) : (o.stage as Stage | null));
    });
    assertKeepsADoneStage(true, after);
  }

  if (Object.keys(set).length) {
    await db.update(fieldOptions).set(set).where(eq(fieldOptions.id, optionId));
  }
}

/* --------------------------------------------------------------- members */

export async function setMember(projectId: string, userId: string, roleInput: unknown): Promise<void> {
  const role = assertRole(roleInput);

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw domainError('E_NOT_FOUND', 'No such person.');

  const admins = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'admin')));

  const after = role === 'admin'
    ? [...new Set([...admins.map((a) => a.userId), userId])]
    : admins.map((a) => a.userId).filter((id) => id !== userId);
  assertKeepsAnAdmin(after);

  await rawQuery(
    `INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role)
     VALUES ($1, $2, $3)
     ON CONFLICT (member_project_id, member_user_id)
       DO UPDATE SET member_role = EXCLUDED.member_role`,
    [projectId, userId, role],
  );
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  const admins = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'admin')));

  assertKeepsAnAdmin(admins.map((a) => a.userId).filter((id) => id !== userId));

  await db.delete(projectMembers).where(
    and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
  );
}

/**
 * Delete an account outright.
 *
 * The destructive counterpart to deactivation, and the two are not
 * interchangeable — this is written down because the difference is the whole
 * reason both exist:
 *
 *   - `user_is_active = false` blocks sign-in and keeps the row, so
 *     `node_created_by` still names who filed each task (spec 05 §1).
 *   - deleting removes the row. `pmt_project_members` cascades away with it,
 *     and `pmt_nodes.node_created_by` is `ON DELETE SET NULL` — so every task
 *     they ever created loses its author, permanently and for the whole
 *     install. Nothing here restores that.
 *
 * Four refusals stand in front of it, each in `admin-rules.ts` where a test can
 * reach it without a database. The order matters: identity first, then
 * standing, then consequences.
 */
export async function deleteUser(actingUserId: string, targetUserId: string): Promise<void> {
  const [target] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) throw domainError('E_NOT_FOUND', 'No such person.');

  assertNotProtectedAccount(target.email);
  assertNotSelf(target.id, actingUserId);

  /*
   * Every project the target belongs to, answered in one pass: how many admins
   * it has, whether the target is one of them, and whether the acting user is
   * one of them. Three separate queries would have to be reconciled afterwards
   * and could disagree with each other under concurrent edits.
   */
  const rows = await rawQuery<{
    project_name: string;
    target_is_only_admin: boolean;
    actor_is_admin: boolean;
  }>(
    `SELECT p.project_name,
            (tm.member_role = 'admin'
              AND (SELECT count(*) FROM pmt_project_members a
                    WHERE a.member_project_id = p.project_id
                      AND a.member_role = 'admin') = 1)          AS target_is_only_admin,
            (am.member_role = 'admin')                           AS actor_is_admin
       FROM pmt_project_members tm
       JOIN pmt_projects p        ON p.project_id = tm.member_project_id
       LEFT JOIN pmt_project_members am
              ON am.member_project_id = p.project_id
             AND am.member_user_id    = $2
      WHERE tm.member_user_id = $1`,
    [targetUserId, actingUserId],
  );

  assertAdminsEveryProjectOf(rows.filter((r) => !r.actor_is_admin).length);
  assertLeavesNoProjectAdminless(
    rows.filter((r) => r.target_is_only_admin).map((r) => r.project_name),
  );

  await db.delete(users).where(eq(users.id, targetUserId));
}

/* -------------------------------------------------------------- calendar */

export async function addHoliday(dateInput: unknown, nameInput: unknown): Promise<void> {
  const date = assertHolidayDate(dateInput);
  const name = assertHolidayName(nameInput);
  await rawQuery(
    `INSERT INTO pmt_holidays (holiday_date, holiday_name) VALUES ($1, $2)
     ON CONFLICT (holiday_date) DO UPDATE SET holiday_name = EXCLUDED.holiday_name`,
    [date, name],
  );
}

export async function removeHoliday(dateInput: unknown): Promise<void> {
  await db.delete(holidays).where(eq(holidays.date, assertHolidayDate(dateInput)));
}

/* ----------------------------------------------------------------- users */

/**
 * Create a person, either by invitation or with a starting password.
 *
 * Two ways in, and they are not equivalent:
 *
 *   - **no password given** — `user_password_hash` stays null and a one-time
 *     token is issued. An account with no hash cannot sign in at all, so an
 *     unclaimed invitation is inert rather than a weak credential, and the
 *     password the person ends up with was never known to anybody else.
 *   - **a password given** — the admin chose it, so two people know it. It is
 *     hashed like any other (never stored or transmitted as the admin typed
 *     it), but `user_must_change_password` is raised with it: the account can
 *     reach the change-password page and nothing else until the person has
 *     replaced it. No token is issued, because there is nothing to claim.
 *
 * The plain string is accepted here and hashed here. A caller may not pass a
 * hash: a hash accepted at the boundary *is* the password, and anyone reading
 * it out of the database could sign in with it directly.
 */
export async function createUser(
  emailInput: unknown,
  nameInput: unknown,
  passwordInput?: unknown,
): Promise<{ id: string; token: string | null; expiresAt: Date | null; mustChangePassword: boolean }> {
  const email = assertEmail(emailInput);
  const name = String(nameInput ?? '').trim() || email.split('@')[0]!;
  const wantsPassword = typeof passwordInput === 'string' && passwordInput.length > 0;

  const existing = await rawQuery<{ user_id: string }>(
    `SELECT user_id FROM pmt_users WHERE lower(user_email) = $1`,
    [email],
  );
  if (existing.length) throw domainError('E_UNKNOWN_FIELD', 'Someone already has that address.');

  if (wantsPassword) {
    const [row] = await db.insert(users).values({
      email,
      fullName: name,
      passwordHash: await hashPassword(assertPassword(passwordInput)),
      mustChangePassword: true,
    }).returning({ id: users.id });

    return { id: row!.id, token: null, expiresAt: null, mustChangePassword: true };
  }

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const [row] = await db.insert(users).values({
    email, fullName: name, setupToken: token, setupExpiresAt: expiresAt,
  }).returning({ id: users.id });

  return { id: row!.id, token, expiresAt, mustChangePassword: false };
}

/**
 * Replace your own password, which is the only way the forced-change flag ever
 * comes down.
 *
 * The current password is required even though the caller is already signed
 * in. A session cookie is not proof of the credential — a borrowed laptop is
 * enough for one — and without this a walk-up attacker could lock the owner
 * out of their own account.
 */
export async function changeOwnPassword(
  userId: string,
  currentInput: unknown,
  nextInput: unknown,
): Promise<void> {
  const [user] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw domainError('E_NOT_FOUND', 'No such person.');

  const current = typeof currentInput === 'string' ? currentInput : '';
  if (!(await verifyPassword(current, user.hash))) {
    throw domainError('E_FORBIDDEN', 'That is not your current password.');
  }

  const next = assertNewPassword(current, nextInput);

  await rawQuery(
    `UPDATE pmt_users
        SET user_password_hash = $2,
            user_must_change_password = false,
            user_setup_token = NULL,
            user_setup_expires_at = NULL,
            user_updated_at = now()
      WHERE user_id = $1`,
    [userId, await hashPassword(next)],
  );
}

/** Whether this account is holding a password somebody else chose. */
export async function mustChangePassword(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ must: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.must === true;
}

/* --------------------------------------------------------------- profile */

export type Profile = {
  id: string;
  name: string;
  email: string;
  /** True while the current password was chosen by somebody else. */
  mustChangePassword: boolean;
  since: string;
  /** Every project they hold, with the role they hold it as. */
  memberships: { id: string; name: string; slug: string; role: Role }[];
};

/**
 * What a person may see and change about themselves.
 *
 * Read by user id from the session rather than taken from the URL: there is no
 * `/profile/:id`, because a page that can address somebody else's profile is a
 * page that has to decide who may open it, and this one never has to.
 *
 * The memberships are here as fact, not as controls. Access is granted per
 * project by an admin of that project (spec 05 §2), so this list is the answer
 * to "what can I reach", which until now could only be assembled by reading the
 * shelf. Nothing on the profile page changes a role.
 */
export async function loadProfile(userId: string): Promise<Profile> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.fullName,
      email: users.email,
      must: users.mustChangePassword,
      since: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw domainError('E_NOT_FOUND', 'No such person.');

  const memberships = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.name));

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mustChangePassword: row.must,
    since: row.since.toISOString(),
    memberships: memberships.map((m) => ({ ...m, role: m.role as Role })),
  };
}

/**
 * Rename yourself.
 *
 * Only the name. An address is what an account is identified by — it is the
 * sign-in credential's first half and the key the ClickUp import matched people
 * on — so changing it is an admin's act with consequences beyond the person
 * doing it, and it is not offered here. The name is the opposite: it is how
 * everybody else reads this person on a roster lane, and its owner is the one
 * who knows what it should say.
 *
 * The session carries a stale name until it next refreshes. That is cosmetic —
 * nothing is authorised by the name — and the alternative, ending the session
 * on a rename the way a password change does, would be a sign-out as the price
 * of fixing a typo.
 */
export async function updateOwnName(userId: string, nameInput: unknown): Promise<{ name: string }> {
  const name = assertFullName(nameInput);
  const [row] = await db
    .update(users)
    .set({ fullName: name, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ name: users.fullName });
  if (!row) throw domainError('E_NOT_FOUND', 'No such person.');
  return { name: row.name };
}

/**
 * Reset somebody's password, for the person who has lost theirs.
 *
 * This issues a one-time setup link rather than a password. It is the same
 * mechanism `createUser` uses for an invitation, and it is the mechanism
 * because of what the alternative costs: a password an admin types is a
 * password two people know, and it has to be said out loud or typed into a chat
 * window to be delivered at all. A link delivers itself, and the password the
 * person ends up with was never known to anybody else.
 *
 * Two writes, and both matter:
 *
 *   - `user_password_hash` is set to null. The old password stops working the
 *     moment the reset is issued. Anything else leaves a lost or shared
 *     credential live alongside a fresh link, which is two ways in where the
 *     admin believes there is one.
 *   - `user_must_change_password` comes down. It means "you hold a password
 *     somebody else chose", and after this the account holds no password at
 *     all; leaving it up would send the claimed account straight back to the
 *     change-password page it has just come through.
 *
 * The cost, stated because it is real: between the reset and the claim the
 * account cannot sign in, and if the link is lost the only way forward is
 * another reset. That is recoverable by any admin of their projects, which is
 * the point of scoping it that way.
 *
 * Three refusals stand in front of it, all in `admin-rules.ts`: the install
 * account, yourself, and anybody you share no administered project with.
 */
export async function issuePasswordReset(
  actingUserId: string,
  targetUserId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const [target] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) throw domainError('E_NOT_FOUND', 'No such person.');

  assertNotProtectedReset(target.email);
  assertResetIsNotSelf(target.id, actingUserId);

  /*
   * How many projects the caller administers that this person is also on.
   *
   * One project is enough, at the owner's instruction (2026-09-08). Deletion
   * asks for more — `deleteUser` refuses unless the caller administers *every*
   * project the target holds — and the two are deliberately not the same test:
   *
   *   - deletion is irreversible and takes the person off projects the caller
   *     has no standing over, so it asks for standing over all of them;
   *   - a reset is the everyday act of somebody who has lost their password,
   *     and the stricter rule made it unusable: on an install where people sit
   *     on several projects, only an admin of all of them could help, which in
   *     practice means one person for the whole company.
   *
   * What it costs, for whoever reads this next: an admin of project A can hand
   * a login link to somebody who is also on project B, and that link opens B
   * too. The mitigation is that it is not silent — the old password stops
   * working, so the person finds out the moment they next sign in.
   */
  const rows = await rawQuery<{ actor_is_admin: boolean }>(
    `SELECT (am.member_role = 'admin') AS actor_is_admin
       FROM pmt_project_members tm
       LEFT JOIN pmt_project_members am
              ON am.member_project_id = tm.member_project_id
             AND am.member_user_id    = $2
      WHERE tm.member_user_id = $1`,
    [targetUserId, actingUserId],
  );

  assertSharesAnAdministeredProject(rows.filter((r) => r.actor_is_admin).length);

  // A fresh token every time, which replaces any token already outstanding —
  // an earlier link that still worked would be a second way in that whoever
  // issued this one does not know about.
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  await rawQuery(
    `UPDATE pmt_users
        SET user_password_hash = NULL,
            user_must_change_password = false,
            user_setup_token = $2,
            user_setup_expires_at = $3,
            user_updated_at = now()
      WHERE user_id = $1`,
    [targetUserId, token, expiresAt],
  );

  return { token, expiresAt };
}

/** Which projects a person may administer — used to scope the settings page. */
export async function isProjectAdmin(userId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return row?.role === 'admin';
}

export { sql };


/**
 * Claim a setup token and set a password.
 *
 * Unauthenticated by necessity — the person doing this has no account yet.
 * The token is the credential, so it is single-use and time limited, and an
 * expired or already-claimed token is indistinguishable from a wrong one.
 */
export async function claimSetupToken(token: unknown, password: unknown): Promise<void> {
  const t = typeof token === 'string' ? token : '';
  const plain = assertPassword(password);

  const rows = await rawQuery<{ user_id: string }>(
    `SELECT user_id FROM pmt_users
      WHERE user_setup_token = $1
        AND user_setup_expires_at > now()
        AND user_is_active`,
    [t],
  );
  if (!rows.length) {
    throw domainError('E_NOT_FOUND', 'That link is not valid any more. Ask for a new one.');
  }

  await rawQuery(
    `UPDATE pmt_users
        SET user_password_hash = $2,
            user_setup_token = NULL,
            user_setup_expires_at = NULL,
            user_updated_at = now()
      WHERE user_id = $1`,
    [rows[0]!.user_id, await hashPassword(plain)],
  );
}

/** Whether a token could still be claimed, without saying whose it is. */
export async function setupTokenIsLive(token: string): Promise<boolean> {
  const rows = await rawQuery<{ n: string }>(
    `SELECT count(*) AS n FROM pmt_users
      WHERE user_setup_token = $1 AND user_setup_expires_at > now() AND user_is_active`,
    [token],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}
