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

### 1b. Starting passwords, and the change they force

**Added 2026-09-08, at the owner's instruction and against the recommendation above.** An Admin may now create an account with a starting password instead of a setup link, because a link is no use to somebody who will be told their password across a bench. What it costs is stated here so nobody has to rediscover it: **a password an admin chose is known to two people, and is therefore a way in once, not a credential.** `pmt_users.user_must_change_password` is what pays that cost.

- The API takes the **plain** password and hashes it on the server, exactly as `/set-password` does. A hash is never accepted from a caller: a hash taken at the boundary *is* the credential, and anyone who could read it out of the database could sign in with it directly without ever breaking it.
- Creating with a password raises `user_must_change_password` and issues **no** setup token — there is nothing to claim. Inviting without one is unchanged and never raises the flag, because nobody but the owner ever knows that password.
- While the flag is up the account can sign in and reach **`/change-password` and nothing else**. Every page redirects there; every API call is refused with 403.
- Changing the password requires the current one even though the caller is already signed in. A session cookie proves a session, not knowledge of the credential — without this, a borrowed laptop is enough to lock the owner out of their own account. The replacement may not equal the password it replaces, compared after Unicode normalisation, since scrypt normalises before hashing.
- A successful change **ends the session**: the flag is carried in the JWT and a token already issued cannot be edited, so a surviving session would keep being redirected back to the page it just finished with. The user signs in again with the password only they now know.

Enforcement is in three places on purpose, and only two of them matter:

| Where | What it does |
|---|---|
| `authorize()` in `src/lib/permissions.ts` | Refuses every capability check. The choke point every mutation passes through, including the node routes that do not use `handle`. |
| `handle()` in `src/lib/api.ts` | Refuses every admin route, including `POST /api/projects`, which has no project to authorise against. |
| `src/proxy.ts` | Redirects pages to `/change-password`. **A convenience, not the lock** — a proxy matcher is a list a new route can silently fall off, which is why the two above read the column itself. Delete this file and the product is still safe, merely baffling. |

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
| Arrange the List's columns — everybody sees one order (spec 03 §2.4) | ● | | |
| Add / remove project members, change roles | ● | | |
| _(a project must always keep at least one admin)_ | | | |
| Rename or archive the project | ● | | |
| Edit the holiday calendar | ● | | |
| Create users | ● | | |

Roles are surfaced in two places, which are the same data asked from opposite ends:

| Surface | Question it answers |
|---|---|
| `/p/<slug>/settings` § People | Who is on **this project**, and as what |
| `/people` | Which projects can **this person** reach, and as what |

`/people` (added 2026-09-08) draws a grid of people × projects, one role select per cell, with "no access" as a value of the same control rather than a separate Remove button. It is **scoped to the projects the acting user administers** — a user who admins one project of five sees one column. It grants nothing itself: every change goes through `POST`/`DELETE /api/projects/:id/members`, which runs the same `authorize(..., 'member.manage')` check, so the last-admin rule and the role whitelist are enforced in exactly one place. Inviting from that page is two requests, `POST /api/users` then the membership grant, because creating an account and granting access are two different capabilities.

### 2b. Deleting an account

**Added 2026-09-08 at the owner's instruction.** `DELETE /api/users/:id`, offered as the Account column on `/people`. It is the destructive twin of deactivation and they are not interchangeable: `user_is_active = false` keeps the row, so `node_created_by` still names who filed each task; deleting removes the row, cascades away every membership, and — because `pmt_nodes.node_created_by` is `ON DELETE SET NULL` — **strips the author from every task that person ever created, permanently and install-wide.** There is no undo. Prefer deactivation unless the account was created in error.

Four refusals stand in front of it, all pure functions in `admin-rules.ts`:

| Refusal | Why it is not merely a nicety |
|---|---|
| `admin@cit.com` (`PROTECTED_EMAIL`) | The seeded install account — the way back in when every other route has been lost. A constant, not a `user_is_protected` column, precisely because a column can be cleared. |
| Not yourself | Your memberships cascade with the row; the request would succeed and leave a live session pointing at a user that no longer exists. |
| Not the last admin of any project | Membership cascades, so deletion is otherwise a back door into exactly the adminless project `assertKeepsAnAdmin` refuses to create. |
| Only somebody whose every project you administer | There is no workspace superuser, so admin of one project is no standing to destroy access to four others. |

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
| Invitation flow with email | Admin creates the account and hands over the setup link themselves. `/people` does this in one gesture, but nothing is posted. |
