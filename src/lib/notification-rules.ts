/**
 * Who has just been assigned something (spec 11 §2).
 *
 * Pure, and free of any import that needs a bundler, so
 * `tests/notification-rules.test.ts` can reach it without a database — the
 * same split `node-rules.ts` and `admin-rules.ts` keep. The adapter is
 * `notifications.ts`.
 *
 * The whole difficulty is that **this product has no assignee column**. A
 * project defines its own custom fields, any number of them may be of kind
 * `people`, and they are named whatever that project calls them: "Owner",
 * "ผู้ตรวจ", "Reviewer". The roster (spec 09) already reads every one of them
 * rather than picking a blessed field, and this does the same, for the same
 * reason: hardcoding a field name would silently switch notifications off for
 * every project that names its field differently, and nothing would fail
 * loudly enough to notice.
 *
 * So an assignment is not a state, it is a *difference*: an id that was not in
 * a people field before the write and is in it after.
 */

/** A people-kind field, as the project defines it. */
export type PeopleField = {
  id: string;
  /** Copied into the notification, because a field can be renamed later. */
  name: string;
};

export type Assignment = {
  recipientId: string;
  fieldId: string;
  fieldName: string;
};

/**
 * The ids a people field holds.
 *
 * Defensive about shape rather than trusting it: these values come out of a
 * jsonb column with no foreign keys (D-32), and a field that used to be
 * `text` and was changed to `people` leaves a bare string behind. A malformed
 * value means "nobody is named here", never a crash on a write path that was
 * only trying to save somebody's typing.
 */
export function peopleIn(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

/**
 * What changed, as notifications to write.
 *
 * Three rules, each of which a reasonable person would otherwise get wrong:
 *
 *   - **Added only.** Being taken off something is not news you need a badge
 *     for, and the row already written for the original assignment stays
 *     (spec 11 §3) — the log records that it happened, which remains true.
 *   - **Never yourself.** Putting your own name on a task is not somebody
 *     telling you anything. The database refuses it too, so a future caller
 *     cannot reintroduce it by going round this function.
 *   - **Per field, not per node.** If one write puts you in both "Owner" and
 *     "Reviewer", that is two things you have been asked to do and it reads as
 *     two lines. The bell says which field carried your name, so collapsing
 *     them would produce two identical sentences instead of one.
 *
 * `after` is the node's complete values *after* the write, not the sparse
 * patch: a patch that does not mention a field has not cleared it, and diffing
 * against the sparse form would report everybody as removed.
 */
export function assignmentsAdded(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  peopleFields: readonly PeopleField[],
  actorId: string | null,
): Assignment[] {
  const out: Assignment[] = [];

  for (const field of peopleFields) {
    const had = new Set(peopleIn(before[field.id]));
    for (const recipientId of peopleIn(after[field.id])) {
      if (had.has(recipientId)) continue;
      if (recipientId === actorId) continue;
      out.push({ recipientId, fieldId: field.id, fieldName: field.name });
    }
  }

  return out;
}

/**
 * The sentence the bell shows.
 *
 * Interface chrome is English (CLAUDE.md § Language) and the names inside it
 * are content, so they arrive as they were typed — Thai names are not
 * transformed, and nothing here upper-cases or letter-spaces anything.
 */
export function describeAssignment(
  actorName: string | null,
  fieldName: string,
  nodeName: string,
): string {
  // A null actor is an account that has since been deleted. "Somebody" is the
  // honest word for it; inventing a name or dropping the row would both be
  // worse.
  return `${actorName ?? 'Somebody'} put you in ${fieldName} on ${nodeName}`;
}
