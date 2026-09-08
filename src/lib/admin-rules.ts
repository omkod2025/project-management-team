/**
 * Administration rules, as pure functions.
 *
 * Same split as `node-rules.ts` and for the same reason: these are decisions,
 * so they live where a test can reach them without a database.
 *
 * The rules here are mostly about refusing things, and each refusal exists
 * because the alternative is silent data damage rather than an error message.
 */

import { domainError } from './errors.ts';
import type { FieldKind } from './node-rules.ts';

export type Role = 'admin' | 'member' | 'viewer';
export const ROLES: Role[] = ['admin', 'member', 'viewer'];

export const FIELD_KINDS: FieldKind[] = [
  'text', 'long_text', 'number', 'money', 'date',
  'select', 'multi_select', 'checkbox', 'people',
];

export const STAGES = ['notStarted', 'inProgress', 'done'] as const;
export type Stage = (typeof STAGES)[number];

/* -------------------------------------------------------------- projects */

export function assertProjectName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw domainError('E_UNKNOWN_FIELD', 'A project needs a name.');
  if (trimmed.length > 120) throw domainError('E_UNKNOWN_FIELD', 'That project name is too long.');
  return trimmed;
}

/**
 * A slug for the URL, derived from the name.
 *
 * Content is Thai, and Thai does not survive a Latin slugifier — so anything
 * outside `a-z0-9` is dropped and a name that reduces to nothing gets no slug
 * at all. The caller supplies the fallback, because uniqueness is a database
 * question and this function has no database.
 */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

/* ----------------------------------------------------------- definitions */

export function assertFieldKind(kind: unknown): FieldKind {
  if (typeof kind !== 'string' || !FIELD_KINDS.includes(kind as FieldKind)) {
    throw domainError('E_UNKNOWN_FIELD', 'That is not a column type this product has.', { kind });
  }
  return kind as FieldKind;
}

/**
 * D-31 — a field's kind is immutable.
 *
 * Values already stored in `jsonb` are shaped for the original kind, and there
 * is no foreign key that would stop a re-typed field from reading them back as
 * nonsense. Changing meaning means a new field and archiving the old one.
 */
export function assertKindUnchanged(existing: FieldKind, incoming: unknown): void {
  if (incoming === undefined || incoming === null) return;
  if (incoming !== existing) {
    throw domainError(
      'E_FIELD_TYPE_IMMUTABLE',
      'A column keeps the type it was created with. Add a new column and archive this one.',
      { from: existing, to: incoming },
    );
  }
}

export function assertFieldName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw domainError('E_UNKNOWN_FIELD', 'A column needs a name.');
  if (trimmed.length > 80) throw domainError('E_UNKNOWN_FIELD', 'That column name is too long.');
  return trimmed;
}

/** D-35 — only a select field can drive automatic actual dates. */
export function assertStatusFieldKind(kind: FieldKind | null): void {
  if (kind === null) return;                       // clearing the designation
  if (kind !== 'select') {
    throw domainError(
      'E_STATUS_FIELD_TYPE',
      'Only a single-select column can be the status column.',
      { kind },
    );
  }
}

/* --------------------------------------------------------------- options */

export function assertStage(stage: unknown): Stage | null {
  if (stage === null || stage === undefined || stage === '') return null;
  if (!STAGES.includes(stage as Stage)) {
    throw domainError('E_UNKNOWN_FIELD', 'That is not a stage.', { stage });
  }
  return stage as Stage;
}

export function assertOptionLabel(label: unknown): string {
  const trimmed = typeof label === 'string' ? label.trim() : '';
  if (!trimmed) throw domainError('E_UNKNOWN_FIELD', 'An option needs a label.');
  return trimmed;
}

/** The tab wheel in DESIGN.md has six hues; anything else is not a colour we own. */
export function assertColorIndex(index: unknown): number {
  const n = Number(index ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 6) {
    throw domainError('E_UNKNOWN_FIELD', 'A colour must be one of the six tab hues.', { index });
  }
  return n;
}

/**
 * A select field that is the project's status field must keep at least one
 * option carrying the `done` stage, otherwise automatic capture can never
 * record an end date and the product's headline feature quietly stops working.
 */
export function assertKeepsADoneStage(
  isStatusField: boolean,
  stagesAfterChange: (Stage | null)[],
): void {
  if (!isStatusField) return;
  if (!stagesAfterChange.includes('done')) {
    throw domainError(
      'E_STATUS_FIELD_TYPE',
      'The status column needs at least one option marked done, or finished work is never recorded.',
    );
  }
}

/* --------------------------------------------------------------- members */

export function assertRole(role: unknown): Role {
  if (typeof role !== 'string' || !ROLES.includes(role as Role)) {
    throw domainError('E_FORBIDDEN', 'That is not a role.', { role });
  }
  return role as Role;
}

/**
 * A project must keep at least one admin.
 *
 * Without this an admin can demote or remove themselves and lock the project
 * permanently: nobody left can add a member, and there is no workspace-level
 * superuser to appeal to (spec 05 §2).
 */
export function assertKeepsAnAdmin(adminIdsAfterChange: string[]): void {
  if (adminIdsAfterChange.length === 0) {
    throw domainError(
      'E_FORBIDDEN',
      'A project must keep at least one admin. Promote someone else first.',
    );
  }
}

/* -------------------------------------------------------------- calendar */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertHolidayDate(date: unknown): string {
  const s = String(date ?? '');
  if (!ISO_DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw domainError('E_UNKNOWN_FIELD', 'A holiday needs a real date, as YYYY-MM-DD.', { date });
  }
  return s;
}

export function assertHolidayName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw domainError('E_UNKNOWN_FIELD', 'A holiday needs a name.');
  return trimmed;
}

/* ----------------------------------------------------------------- users */

export function assertEmail(email: unknown): string {
  const s = typeof email === 'string' ? email.trim().toLowerCase() : '';
  // Deliberately permissive: the only thing worth refusing here is something
  // that cannot be an address at all. Deliverability is not our business.
  if (!s || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    throw domainError('E_UNKNOWN_FIELD', 'That is not an email address.', { email });
  }
  return s;
}

/* ------------------------------------------------------- deleting a user */

/**
 * The one account that cannot be deleted, at the owner's instruction
 * (2026-09-08).
 *
 * It is the seeded install admin: the account that exists before any project
 * does, and the one somebody signs in as when every other route in has been
 * lost. Compared case-insensitively because `assertEmail` lowercases on the
 * way in but this address may be typed by hand anywhere.
 *
 * A constant rather than a column. A `user_is_protected` flag would be a
 * better long-term shape — but a flag can be cleared, and the whole point of
 * this rule is that it cannot be. When the install grows a second protected
 * account, that is the moment to move it into the schema.
 */
export const PROTECTED_EMAIL = 'admin@cit.com';

export function assertNotProtectedAccount(email: string): void {
  if (email.trim().toLowerCase() === PROTECTED_EMAIL) {
    throw domainError(
      'E_FORBIDDEN',
      `${PROTECTED_EMAIL} is the install account and cannot be deleted.`,
    );
  }
}

/**
 * Nobody deletes themselves.
 *
 * Not paternalism: the acting user's own membership rows cascade away with the
 * account, so the request would succeed and then leave a live session pointing
 * at a user that no longer exists. Deactivation is the reversible thing; this
 * is not.
 */
export function assertNotSelf(targetUserId: string, actingUserId: string): void {
  if (targetUserId === actingUserId) {
    throw domainError('E_FORBIDDEN', 'You cannot delete your own account.');
  }
}

/**
 * Deleting a user must not leave a project with no admin.
 *
 * `pmt_project_members.member_user_id` cascades on delete, so removing an
 * account silently removes every membership it held — which makes deletion a
 * back door to exactly the state `assertKeepsAnAdmin` exists to prevent. The
 * role select refuses to demote the last admin; this refuses to delete them.
 */
export function assertLeavesNoProjectAdminless(orphanedProjectNames: string[]): void {
  if (orphanedProjectNames.length > 0) {
    throw domainError(
      'E_FORBIDDEN',
      `They are the only admin of ${orphanedProjectNames.join(', ')}. `
      + 'Promote someone else there first.',
      { projects: orphanedProjectNames },
    );
  }
}

/**
 * You may only delete somebody whose every project you administer.
 *
 * There is no workspace-wide superuser (spec 05 §2), so an admin of one
 * project has no standing to destroy that person's access to four others.
 */
export function assertAdminsEveryProjectOf(unadministeredCount: number): void {
  if (unadministeredCount > 0) {
    throw domainError(
      'E_FORBIDDEN',
      'They belong to projects you do not administer, so you cannot delete them.',
      { projects: unadministeredCount },
    );
  }
}

/**
 * The only password rule: length.
 *
 * Composition rules (a digit, a symbol, a capital) push people towards
 * predictable substitutions and shorter secrets. Length is the property that
 * actually resists guessing, so it is the only one enforced.
 *
 * Lowered from 12 to 10 on 2026-09-07 at the owner's instruction, so it is a
 * decision rather than an oversight. What it costs, for whoever reads this
 * next: ten characters is roughly a thousand times easier to search than
 * twelve, and the accounts here are per project with no rate limiting in
 * front of them. That is tolerable for an internal tool on a private network
 * and is the thing to revisit first if this is ever exposed to the internet.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function assertPassword(password: unknown): string {
  const s = typeof password === 'string' ? password : '';
  if (s.length < MIN_PASSWORD_LENGTH) {
    throw domainError(
      'E_UNKNOWN_FIELD',
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return s;
}

/**
 * A replacement password may not be the one being replaced.
 *
 * This exists for the forced change after an admit-set starting password. The
 * whole point of that change is that the password stops being one two people
 * know — re-entering the same string would clear the flag while leaving the
 * admin holding a working credential, which is worse than not asking at all
 * because the record would then say the account was secured.
 */
export function assertNewPassword(current: unknown, next: unknown): string {
  const fresh = assertPassword(next);
  if (typeof current === 'string' && current.normalize('NFKC') === fresh.normalize('NFKC')) {
    throw domainError('E_UNKNOWN_FIELD', 'Choose a password you have not been given.');
  }
  return fresh;
}
