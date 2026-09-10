# 11 — Notifications

Being told when somebody puts your name on a task.

Related: [01-domain](01-domain.md) · [05-permissions](05-permissions.md) · [09-roster](09-roster.md) · [03-list-view](03-list-view.md)

---

## 1. What this is for

The roster (spec 09) answers *what is on my plate*. It does not answer *what was
just put there*, and on a project of two hundred tasks nobody rereads their lane
looking for a change. This is the other half: a record of the moment a name was
added, addressed to the person whose name it was.

It is deliberately small. It notifies **one thing** — assignment — and it does
not notify on dates moving, status changing, comments, or documents. Every one
of those is visible in a view that already exists; being assigned is the only
event that is invisible until somebody happens to look.

---

## 2. What counts as an assignment

**There is no assignee column in this product.** A project defines its own
custom fields; any number of them may be of kind `people`; and they are named
whatever that project calls them — `Owner`, `Assignee`, `ผู้ตรวจ`. The roster
already reads *every* people field rather than a blessed one, and so does this.

> **N-1.** An assignment is an id appearing in any `people`-kind field of a
> node, where it was not before. The notification names the field it came
> through.

Hardcoding a field name was the alternative and was rejected for the reason
that makes it dangerous rather than merely wrong: a project whose field is
called something else would silently receive nothing, and no test, constraint or
error would report it.

Three consequences, all of them tested in `tests/notification-rules.test.ts`:

| Situation | Result |
|---|---|
| One write names three people | three notifications |
| One write names you in `Owner` **and** `Review` | two notifications — the sentence names the field, so collapsing them would print the same line twice |
| You put your own name on something | nothing. Enforced in the rule *and* by a `CHECK` constraint |
| The name was already there | nothing — an assignment is a difference, not a state |
| A name is removed | nothing new; see §3 |

**A people field stores bare ids with no foreign key (D-32)**, so it can name
somebody who is not a member of the project — the imported ClickUp data is full
of these. Such a name is not notified. Writing to them would disclose that a
project they cannot open exists, which §05 rule 1 forbids.

---

## 3. An event log, not a mirror

> **N-2.** A notification records that something happened. Nothing that happens
> afterwards deletes it.

Taking your name back off a task leaves the notification standing. You were
asked; being able to see that you were asked, and by whom, is the whole value of
a log, and All Timeline already answers the *current* question.

What a notification does not outlive is **reach**. Three things put a row out of
reach, and all three are applied as filters on read — the row is never deleted,
so restoring any of them brings it straight back:

| No longer reachable when | Because |
|---|---|
| you are removed from the project | §05 rule 1 — a non-member must not learn the project exists, and a bell listing its task names is exactly that disclosure spelled out |
| the project is archived | it is off the shelf |
| the task is archived | the count means "work I have not gone and looked at", and there is nothing to go and look at |

Every read joins `pmt_project_members`. The stored `notification_project_id` is
**not** treated as authority for whether the reader may see it.

---

## 4. How the reader finds out

Polled, every 60 seconds, from `GET /api/notifications?count=1`, which returns
one integer.

There is no realtime anything in this codebase. A socket would mean a long-lived
connection per reader and a reverse proxy configured not to buffer it (spec 08),
in exchange for turning a worst case of one minute into one of zero. The trade
was not worth it for a message that says "somebody would like you to do
something this week".

Three signals, in increasing order of how hard they are to miss:

1. the count on the bell;
2. the browser tab title, `(2) T-Timeline`, for a reader working elsewhere;
3. the **slip** — see §6.

---

## 5. The API

| | |
|---|---|
| `GET /api/notifications` | the leaf's contents: up to 50, newest first, plus the unread count |
| `GET /api/notifications?count=1` | the polled form — the count alone |
| `POST /api/notifications/:id` | mark one read; sent when the reader follows it |
| `POST /api/notifications` | mark all read |

None of these takes a project id, and none calls `authorize()`. That is not an
omission: a notification belongs to a person, not to a project, and there is no
role that can read somebody else's — not even an admin, who would have to become
a different person to have one. Scoping is by the caller's own id, joined to
membership, inside every query.

`POST /api/notifications/:id` scopes its `UPDATE` by user rather than checking
ownership first. An id belonging to somebody else and an id that never existed
both change nothing and both answer `200`, so the endpoint cannot be used to
find out whether an id is real.

---

## 6. What it looks like

**It follows the restyled pages, not the field book.** `list.css`, `shelf.css`
and `people.css` all departed to the ClickUp/dashboard language by instruction
on 2026-09-08 — white grounds, cool grey hairlines, 4–6px radii, a soft hover
ground, indigo `--brand` as the base pair. The bell is drawn on every one of
those pages, so it speaks their language; the first version of it was cream
paper on a white toolbar and read as a control borrowed from another product.
The palette is redeclared locally, as `people.css` does, so this depends on no
other sheet loading first. `tokens.css` is untouched.

What the restyle does not get to change, and what the bell therefore still
obeys:

- **Vermilion means out of closure and nothing else.** The unread badge is
  indigo. An unread count is not a variance, and acceptance test A8 measures
  the distance.
- Hue says *whose*, never how it is going. Nothing is tinted by a verdict.
- Figures are set in the figure face.
- Thai is never letter-spaced, upper-cased, or set below 13px. The small caps
  in the leaf's head are English chrome only.

**The bell** stands inside each page's own header, immediately before its view
nav (`List · Timeline · Report · Docs · Settings`), so notice and navigation
sit together in the one cluster that head already uses for "where do I go from
here". On the shelf, which navigates from a vertical rail and has no view nav,
it joins the head beside `+ New project`; on the two account pages it joins the
`‹ Home` / `Sign out` pair. It takes its height from whatever those neighbours
use — 26px on the project heads, 34px on the shelf and the account pages.

It was a fixed overlay in the corner first, and that was wrong twice over: it
landed on top of the List's "Sign out" button, and even once given a reserved
gutter it read as a control belonging to no page. The state behind it still
lives in the layout — see §8 — but the control itself is the page's.

**The leaf** is a white sheet with a hairline border, a 6px radius and the
lifted-sheet shadow `people.css` uses, tinted toward the base rather than
neutral grey. It opens in two frames over 90ms; nothing in this product eases,
and the restyle did not change that. An unread line carries an indigo dot in
the margin and full-strength ink; a read one is the same sentence, quieter.
Weight and ink carry the difference, so nothing moves when a line changes
state.

**The slip** is a washed-indigo band in normal flow at the top of the layout —
so it moves the page down rather than covering anything — with one sentence and
two buttons, the primary taking the base fill as every primary action on the
restyled pages does. It is information, not a fault, so it is not red and it is
not a floating toast. It does not fade and it does not dismiss itself.

Sentences are interface chrome and are English. The task and project names
inside them are content and usually Thai, and arrive as they were typed.

## 7. Following one through

The link is `/p/<slug>?node=<id>` — the same parameter the List and the Timeline
already use to carry a selection between them, so this needed no new road.

> **N-3.** Arriving from a notification wins over the reader's saved view.

The reader's own state may well be hiding the row: the module may be collapsed,
and a search typed an hour ago is still in the box. So arriving clears the
search and opens every ancestor of the target, then brings the row into view and
selects it.

It deliberately **leaves the sort alone**. A sort does not hide a row, it only
decides where the row sits, and rearranging the page under somebody because they
followed a link would be the larger surprise.

Two things about the implementation are worth keeping, because both were got
wrong first and neither was caught by any test:

- the target is read from the **router**, not from `window.location`. Following
  a notification into the project already on screen is a client-side
  navigation, and a component that reads the URL once at mount never notices.
- the scroll waits for the row to appear in the rendered run, rather than after
  a fixed number of frames. On the real project, revealing a couple of hundred
  rows takes a little over two seconds; every timer-based guess expired first
  and failed silently, leaving the right row selected below the fold.

---

## 8. Where it is written

In `updateNode`, inside the same transaction as the write, so a save that fails
cannot leave a notification claiming it succeeded. That is the only path a
people field can change through.

The client side is split the same way, for the same reason — different owners:
`NotificationsProvider`, rendered once by the signed-in group's layout, owns the
poll, the count, the tab title and the slip, all of which have to survive
navigating between pages; `Bell`, placed by each page, is only the button and
its leaf. `Bell` renders nothing without the provider above it, which is what
keeps the published `/d/[token]` page bell-free by construction rather than by
anyone remembering.

**Not a trigger.** Business rules live in TypeScript (CLAUDE.md § No triggers),
and there is a second reason here: `scripts/clickup-load.mjs` writes
`node_custom_values` with raw SQL, so a trigger would hand every migrated
project's members several hundred notifications for work that predates the app.
Placed where it is, the importer is silent and nothing had to be excluded by
name.

---

## 9. What is not built

- No email, and no infrastructure for it. Deliberate: this install has no mail
  configuration at all, and adding one for a badge is a larger decision than
  this feature.
- No preferences — no per-project mute, no digest. There is one event type; the
  place to add a switch is when there is a second.
- No pagination. The leaf shows the latest 50 and there is no pruning. A reader
  who has scrolled past fifty is looking for a task, not a notification, and
  the List is the tool for that.
- Nothing is notified except assignment. See §1.
