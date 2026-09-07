# 05 — Authentication and permissions

Three roles, scoped per project, checked in one place.

---

## 1. Authentication

Email + password via Auth.js v5, using a **Credentials provider over `pmt_users`** with JWT sessions.

> **Amended 2026-09-07.** This originally specified database-backed sessions via the Auth.js Drizzle adapter. That adapter brings its own user table, which would split identity across two tables — and Auth.js does not support database sessions with a Credentials provider in any case. `pmt_users` is the single identity table, and `db/migrations/001_user_password.sql` adds the credential columns it was missing.
>
> The cost of JWT sessions is that a token cannot be revoked server-side before it expires. That is mitigated by re-reading `user_is_active` on every token refresh (hourly), so deactivating a user takes effect within the refresh interval rather than instantly. If instant revocation is ever needed, the fix is a session table, not a different auth library.

- No self-registration. An Admin creates the user and hands over a one-time token; the user sets their own password at `/set-password`. **Until the token is claimed the account has no password hash, so it cannot be signed into** — an unclaimed invitation is inert rather than a weak credential. Tokens last seven days and are single-use.
- Sessions are JWTs, 30-day maximum age, refreshed hourly.
- `pmt_users.user_is_active = false` blocks sign-in without deleting the row, so `node_created_by` references survive, and revokes an existing session at its next refresh.
- Passwords are scrypt hashes (`N:r:p:salt:key`, base64) stored in `user_password_hash`. Node's built-in scrypt is used so authentication adds no native dependency. Verification runs even when the email matches no user, so a wrong address and a wrong password fail in the same time.

Out of scope for phase one: SSO, OAuth providers, two-factor, password policy beyond a length minimum.

---

## 2. Roles

Held in `pmt_project_members(member_project_id, member_user_id, member_role)`. A user with no row for a project **cannot see that the project exists** — it is absent from listings, and a direct URL returns 404, not 403.

| Capability | Admin | Member | Viewer |
|---|:--:|:--:|:--:|
| Read nodes, dates, field values | ● | ● | ● |
| Read the timeline | ● | ● | ● |
| Create / rename nodes | ● | ● | |
| Edit estimate dates | ● | ● | |
| Edit actual dates | ● | ● | |
| Edit custom field values | ● | ● | |
| Drag timeline bars | ● | ● | |
| Move nodes within the tree | ● | ● | |
| Archive / restore nodes | ● | | |
| Create, archive, reorder field definitions | ● | | |
| Add / archive select options | ● | | |
| Set the project's status field | ● | | |
| Add / remove project members, change roles | ● | | |
| _(a project must always keep at least one admin)_ | | | |
| Rename or archive the project | ● | | |
| Edit the holiday calendar | ● | | |
| Create users | ● | | |

**There is no workspace-wide superuser.** Admin is per project. Creating the first project and the first user is a seeding operation, documented as a script, not a UI.

Notes on two deliberate choices:

- **Members can edit any field on any node in their project**, including budget figures. There is no per-field permission (that was considered and cut — see PRD §3). If a project holds figures a Member should not see, that project needs a different Member list, not a finer permission model.
- **The holiday calendar is global to the install but Admin-gated per project.** Any project Admin can edit it. With one organisation per install this is acceptable; it is the one place where a per-project role governs global data, and it is noted here so it is not discovered as a surprise.

---

## 3. Enforcement

**One choke point.** Every mutating API route resolves the acting user's role for the target project before doing anything else:

```ts
const role = await requireProjectRole(session.userId, projectId);
// throws E_FORBIDDEN (403) when no membership row exists for a write,
// or returns 404 for a read when no membership row exists at all
```

Capability checks are a static table keyed by role, not scattered conditionals:

```ts
can(role, 'node.archive')        // admin only
can(role, 'node.editDates')      // admin | member
can(role, 'field.define')        // admin only
```

**No PostgreSQL row-level security.** Permission logic lives in TypeScript alongside the other business rules, consistent with the decision recorded in PRODUCT.md. RLS would split enforcement across two languages and make the rules hard to test.

**The client hides what the server refuses.** A Viewer sees no editing affordances, no `+ Add task` rows, and no drag handles — but the server check is the real one, and the UI state is never trusted. `tests/e2e/api.test.ts` asserts this directly: it signs in as a Viewer, writes through the API, and checks both the 403 and that the row is unchanged.

---

## 4. Read scoping

Every read is scoped by membership:

```sql
-- projects visible to a user
SELECT p.*
FROM pmt_projects p
JOIN pmt_project_members m
  ON m.member_project_id = p.project_id
WHERE m.member_user_id = $1
  AND p.project_archived_at IS NULL;
```

`pmf_project_ledger(p_project_id)` performs **no permission filtering of its own** — it is an aggregate function, and the caller has already established access. This is stated explicitly because a future caller might assume otherwise.

---

## 5. What is not built

| Absent | Reason |
|---|---|
| Guest / client role | Clients do not enter the system (PRD §3). |
| Public share links | Would need a second auth path for anonymous visitors, and a URL cannot be un-sent. Client reporting is answered by `/p/<slug>/report` instead (Q4): the same membership check, and what leaves the building is a PDF the sender chose. |
| Per-field visibility (`is_private`) | Considered and rejected: it must be enforced in the API, the grid, filters, sorts, and exports, and a single miss leaks budget figures to the wrong reader. Irreversible if it fails. |
| Audit log of who changed what | Not required by any phase-one feature. `node_actual_source_*` covers the one history question that matters. |
| Workspace-level roles | One organisation per install. |
| Invitation flow with email | Admin creates users directly in phase one. |
