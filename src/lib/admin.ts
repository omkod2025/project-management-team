import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, rawQuery } from '@/db/client';
import { fieldDefinitions, fieldOptions, holidays, projectMembers, projects, users } from '@/db/schema';
import { domainError } from '@/lib/errors';
import {
  assertColorIndex, assertEmail, assertFieldKind, assertFieldName, assertHolidayDate,
  assertHolidayName, assertKeepsADoneStage, assertKeepsAnAdmin, assertKindUnchanged,
  assertOptionLabel, assertPassword, assertRole, assertStage, assertStatusFieldKind,
  type Role, type Stage,
} from '@/lib/admin-rules';
import { hashPassword } from '@/lib/password';
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
 * Create a person and return a one-time setup link token.
 *
 * The admin never sets anybody's password: they hand over the token, and the
 * new user chooses their own. That is why `user_password_hash` is left null —
 * an account with no hash cannot sign in at all (see `auth.ts`).
 */
export async function createUser(
  emailInput: unknown,
  nameInput: unknown,
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const email = assertEmail(emailInput);
  const name = String(nameInput ?? '').trim() || email.split('@')[0]!;

  const existing = await rawQuery<{ user_id: string }>(
    `SELECT user_id FROM pmt_users WHERE lower(user_email) = $1`,
    [email],
  );
  if (existing.length) throw domainError('E_UNKNOWN_FIELD', 'Someone already has that address.');

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const [row] = await db.insert(users).values({
    email, fullName: name, setupToken: token, setupExpiresAt: expiresAt,
  }).returning({ id: users.id });

  return { id: row!.id, token, expiresAt };
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
