# 06 — ClickUp extraction and import

**This is the first thing built, and it is time-critical.** The Business trial on workspace `36753462` expires 2026-09-09. The free plan removes the Timeline view and restricts custom fields, so date and field data becomes hard to reach after that. Extraction must happen before then; the import can be written at leisure afterwards.

---

## 1. Two phases, deliberately separated

| Phase | When | Output | Re-runnable |
|---|---|---|---|
| **Extract** | Immediately, before the trial lapses | Raw JSON on disk, byte-for-byte as the API returned it | Only while the trial lives |
| **Transform + load** | After the schema settles | Rows in `pmt_*` | Yes, many times, against the captured JSON |

The extract performs **no transformation whatsoever**. Any mapping decision made during extraction is a decision that cannot be revisited, because the source disappears. Capture everything; decide later.

---

## 2. Extraction

### 2.1 Credentials

A personal API token from ClickUp: *Settings → Apps → API Token*.

```
# .env  (git-ignored, never committed)
CLICKUP_TOKEN=pk_...
CLICKUP_TEAM_ID=36753462
```

The token authenticates as the owner and therefore reaches everything the owner can see. It is not scoped; treat it as a password.

### 2.2 What to pull

ClickUp API v2, `Authorization: <token>`. Walk the hierarchy top-down and write every response body untouched.

| Step | Endpoint | Saved as |
|---|---|---|
| 1 | `GET /api/v2/team` | `team.json` |
| 2 | `GET /api/v2/team/{team_id}/space?archived=false` | `spaces.json` |
| 3 | `GET /api/v2/space/{space_id}/folder` | `space-{id}/folders.json` |
| 4 | `GET /api/v2/space/{space_id}/list` (folderless) | `space-{id}/lists.json` |
| 5 | `GET /api/v2/folder/{folder_id}/list` | `folder-{id}/lists.json` |
| 6 | `GET /api/v2/list/{list_id}/field` | `list-{id}/fields.json` |
| 7 | `GET /api/v2/list/{list_id}/task` with `subtasks=true`, `include_closed=true`, `page=n` | `list-{id}/tasks-p{n}.json` |
| 8 | `GET /api/v2/task/{task_id}` for every task id seen | `task/{id}.json` |
| 9 | `GET /api/v2/team/{team_id}/member` | `members.json` |

**Step 8 matters and is easy to skip.** The list endpoint returns a summary; the single-task endpoint returns the full custom-field value set, the complete subtask relationship, and the date fields. Pull every task individually even though it is slower.

**Also pull, cheaply, in case they turn out to matter:**
`GET /api/v2/task/{id}/comment`, `GET /api/v2/list/{id}/view`, and `GET /api/v2/space/{id}/tag`. Comments and views are out of scope for phase one, but they cost one request each and cannot be recovered later.

### 2.3 Script shape

A standalone Node script in `scripts/clickup-extract.mjs`. No database, no dependency on the app, no transformation.

- Rate limit: 100 requests/minute on the free and Business tiers. Throttle to ~90/min with a token bucket, and honour `429` with the `Retry-After` header.
- Retry `5xx` three times with exponential backoff. Fail loudly on `4xx` other than `429`.
- Write each response to disk immediately, before the next request. A crash at request 400 must not lose requests 1–399.
- Output to `data/clickup-raw/{timestamp}/`, and never write into a directory that already exists.
- Log a manifest: every URL, its status, and its output path. The manifest is how we prove the capture is complete.

### 2.4 Verification before the trial lapses

Do not trust the script's exit code.

**Capture of 2026-09-07 — `data/clickup-raw/2026-09-07T04-31-17/` — verified:**

- [x] 619 requests, **zero non-2xx** in `_manifest.json`
- [x] 1 space, 3 lists, 301 tasks; 301 individual task files on disk
- [x] 280 of 301 tasks are parent-linked, deepest chain 5 levels
- [x] `Task Status` carries values on 128 tasks
- [x] 177 tasks carry both `start_date` and `due_date`; zero inverted ranges
- [x] All 9 custom field definitions captured with their option sets

**Second capture, 2026-09-07 (`2026-09-07T09-40-46`) — also verified**, and compared with the first by `npm run clickup:diff`:

```
Added: 0   Removed: 0   Changed: 0
Field definitions added: 0   removed: 0   Option sets changed: 0
Identical. The first capture is complete and current.
```

Both captures are retained. They are 9.2 MB each and hold the only surviving copy of the workspace, so neither is deleted.

**Note for the second run:** the interview-era assumption of "six modules and a few dozen tasks" was wrong — the ClickUp view had been filtered. Verify against the API's counts, not the screen's.

---

## 3. Transform and load

Written after the schema settles. Reads the captured JSON, writes `pmt_*` rows.

### 3.1 Structural mapping

**Decided 2026-09-07 against the captured data, replacing an earlier guess.**

The original plan was to synthesise the module level from the Module custom field, because the interview's filtered view suggested the owner had faked that level with a dropdown. The capture showed otherwise: the 17 root tasks of `Bannayuu Next` **are** the modules (`หุ่นยนต์ปกป้อง`, `App BNext Guard`, `Web Property`, `Web Report`, `Web Portal`, …). The hierarchy is already there as real parent links; nothing needs synthesising.

**One list becomes one project.** The list name is a CLI argument:

```bash
node scripts/clickup-load.mjs <capture-dir> "Bannayuu Next"
node scripts/clickup-load.mjs <capture-dir> "Bannayuu Task"
```

| ClickUp list | Tasks | Decision |
|---|---|---|
| `Bannayuu Next` | 174 | → project `bannayuu-next`, the only live project |
| `Bannayuu Task` | 126 | imported 2026-09-07, **archived the same day** — ClickUp's own template data |
| `Bannayuu Module` | 1 | not imported — a single junk task named `r` |

### `Bannayuu Task` is ClickUp's onboarding template

It was imported on the strength of a count and archived after someone read it.

The count said: `start_date` and `due_date` on **126 of 126** tasks, against 52 of 174 in `Bannayuu Next`. That looked like the schedule data the product exists to compare.

The content said otherwise. Three identical roots of 41 children each, and the children are `Pay bills`, `Chest workout`, `Do 3 sets of 20 reps sit-ups`, `Read Atomic Habits Book`, `Date night with partner`, `Plan son's birthday party`. Every date falls between **2023-01-01 and 2023-03-25** — not one task in the year the team is working in.

It is the personal-goals template ClickUp seeds a new workspace with.

**The correction this forces:** there is no larger set of schedule data hiding anywhere. `Bannayuu Next` holds 52 dated tasks out of 174, and that is all there is. Estimate history begins where the team starts using this product.

Archived rather than deleted, so it is reversible, and the raw JSON is in both captures regardless. `tests/e2e/acceptance.test.ts` A9 asserts it stays off the shelf and that its dates are all from 2023 — the check that would have caught this before the import.

> The lesson, since it cost an import and a correction: **a count is not a description.** Three roots with exactly 41 children each was visible in the very first analysis and read as "a duplicated template" — then imported anyway on the strength of the date coverage.

| ClickUp | Field Book | Notes |
|---|---|---|
| Space | — | not modeled |
| List `Bannayuu Next` | `pmt_nodes` depth 1 (**project**) | one project, created by the loader |
| Root task (17 of them) | `pmt_nodes` depth 2 (**module**) | the module level already exists — do not synthesise it |
| Child of a root | `pmt_nodes` depth 3 (**task**) | |
| Deeper descendants | `pmt_nodes` depth 4–6 (**subtask**) | |

Depth arithmetic: the deepest real chain is five task levels, so 1 project + 5 = **6**, exactly `MAX_DEPTH`. Nothing is truncated. A chain that would exceed 6 must be reported, never silently collapsed (§3.4).

The Module custom field becomes redundant once roots are modules. Import it as an ordinary select field for the record, then archive it — never delete, per D-33.

### 3.2 Field mapping

| ClickUp field type | `pm_field_kind` | Notes |
|---|---|---|
| `text`, `short_text` | `text` | |
| `text_area` | `long_text` | |
| `number` | `number` | |
| `currency` | `money` | `field_settings.currency` from the ClickUp config, default `THB`, unless overridden in `CURRENCY_OVERRIDES`. **`Budget Allocation` is overridden to `M฿`**: ClickUp had it on its untouched USD default, and the owner confirmed the amounts are millions of baht. The override lives in the loader so a re-import cannot undo the correction |
| `date` | `date` | ClickUp stores ms epoch strings; convert in `Asia/Bangkok`, keep the date part |
| `drop_down` | `select` | options become `pmt_field_options` preserving order and colour. **Values are stored by `orderindex`, not by option id** — the captured Module field holds `'0'`…`'11'`. Map on `orderindex` or nothing resolves. Note also that two distinct Module definitions exist across the workspace with identical option labels |
| `labels` | `multi_select` | |
| `checkbox` | `checkbox` | |
| `users` | `people` | mapped via `members.json` email → `pmt_users.user_email` |
| ClickUp built-in `Status` | `select` | becomes a normal select field. **It is NOT the status field** — ten of its thirteen values are module or team names (§07 §3). Import it for the record and archive it |
| anything else | — | logged as unmapped, not imported |

Field definitions are created **per project**. Where the same field name and type appear in several ClickUp lists that become one project, they merge into one definition; where types differ, they become separate definitions with a suffix and the collision is logged.

#### Fields not imported

Decided 2026-09-07:

| Field | Reason |
|---|---|
| `Completion Criteria` | zero values across 174 tasks |
| `Next Steps` | zero values across 174 tasks |
| ClickUp built-in `Status` | a module tag, not a lifecycle (§07 §3). Imported as an archived select for the record only |
| Module | redundant once root tasks are the modules. Imported as an archived select for the record only |

`Completion Criteria` and `Next Steps` are dropped outright rather than archived, because there is nothing to preserve — no task has ever carried a value. Nothing is lost that the raw capture does not still hold.

This is the same evidence that drove automatic actual capture (D-13): a manual field nobody is required to fill stays empty. Re-adding either later is a one-row insert into `pmt_field_definitions`, so the decision costs nothing to reverse.

### 3.2b The status field and its stages

`project_status_field_id` points at the **`Task Status`** custom dropdown, not ClickUp's built-in Status. Stages, decided 2026-09-07:

| `orderindex` | Label | Stage | Used on |
|---|---|---|---|
| 0 | `BACKLOG` | `notStarted` | 48 |
| 1 | `ONPROCESS` | `inProgress` | 29 |
| 2 | `WAIT_TEST` | **`done`** | 51 |
| 3 | `COMPLETED` | `done` | 0 |
| 4 | `CANCLE` → relabelled `CANCELLED` | **none (NULL)** | 0 |

Two of these need their reasoning on the record.

**`WAIT_TEST` is `done`.** It is not obviously correct — the work is awaiting test, not accepted. But `COMPLETED` has been used **zero** times in 174 tasks while `WAIT_TEST` holds 51, so making `COMPLETED` the only terminal stage would capture no actual end dates at all, reproducing exactly the ClickUp failure this product exists to fix. The same evidence that justified automatic capture over hand entry (D-13) applies here: record from what people already do.

The consequence, stated plainly: **`node_actual_end` means "development finished and was handed off", not "passed testing"**. If both moments are needed, the right fix is a new `TESTED` option carrying the `done` stage, not a redefinition of `actual_end`.

**`CANCLE` carries no stage.** A cancelled task never finished; writing `actual_end` for it would be a false record and would distort every estimate-accuracy figure derived from it. A NULL stage means the option has no effect on dates (D-35).

The label typo is corrected to `CANCELLED` on import. Labels are display text, not keys, so this is safe.

### 3.3 Date mapping

This is where judgement is required, and where the import must not guess quietly.

| ClickUp | Field Book | Confidence |
|---|---|---|
| `start_date` | `node_estimate_start` | high — it is the planned start |
| `due_date` | `node_estimate_end` | high |
| `date_done` | `node_actual_end`, `node_actual_source_end = 'auto'` | high, when present |
| `date_closed` | fallback for `node_actual_end` when `date_done` is absent | medium |
| — | `node_actual_start` | **no source exists** |

**ClickUp has no actual-start concept.** There is nothing to import. Three options, and the operator must choose explicitly rather than have the script pick:

1. Leave `node_actual_start` null everywhere. Honest, and start misclosure is simply unavailable for historical work.
2. Derive it from the first status-change activity per task, pulled from `GET /api/v2/task/{id}` activity — accurate where activity history survives on the plan, absent where it does not.
3. Set it equal to `node_estimate_start` for closed tasks. **Rejected**: it fabricates a record and would silently report zero start misclosure across all historical work, which is precisely the false confidence this product exists to eliminate.

Recommendation: **option 1**, with option 2 attempted best-effort during extraction so the data exists if wanted later. Historical start variance is not worth inventing.

Every imported actual date is forward-snapped per D-15, with the raw value preserved.

### 3.4 Import report

The load writes a report alongside the rows. It is not optional — an import that cannot state what it dropped is not trustworthy.

- Counts: projects, modules synthesised, tasks, subtasks, field definitions, options, users
- Every unmapped field type, with the tasks that carried a value for it
- Every task whose Module value did not match a known option
- **Every node that would exceed depth 6**, with its full path — this is where the depth ceiling (D-2) meets real data, and it must be a visible operator decision, never a silent truncation
- Every ClickUp user without a matching `pmt_users` row
- Every task with `due_date` before `start_date`, which our `CHECK` will reject

#### Synthesised column ids must be scoped to their list

`ClickUp Status`, `Tags` and `Assignee` do not exist as ClickUp custom fields; the loader synthesises them. Their ids are derived deterministically from a key, and that key originally did not include the list.

Importing a second list therefore produced the **same ids** as the first, and `ON CONFLICT (field_id) DO UPDATE` rewrote the first project's columns instead of creating new ones for the second: positions were overwritten, and the second project silently ended up with one column instead of three.

Caught on 2026-09-07 by checking the loaded field layout rather than trusting the report. The fix is one line — the key now carries the list id — but the class of bug is worth remembering: **a deterministic id must be unique across the workspace, not merely within one run.**

The three orphaned rows were deleted rather than archived. Archiving exists to protect stored values (D-34), and these held none in any node; they were artefacts of a buggy run that should never have existed.

### 3.5 Idempotency

The load is re-runnable. It records the ClickUp id for every created node inside `node_custom_values` under the reserved key `_clickup_id`, and derives each row's UUID deterministically from it, so a re-run upserts rather than duplicating.

**Verified on 2026-09-07**: generating the load from the second capture produced a byte-identical `load.sql`, and running it left the project's digest unchanged across all 175 nodes.

> **The re-run overwrites `node_custom_values` wholesale.** Any value edited in the app since the last import is replaced by whatever ClickUp held. That is correct while the import is still the source of truth, and wrong the moment the team starts working in Field Book. Before re-running the load after go-live, either stop or narrow it to the columns the import actually owns.

> `_clickup_id` is the one reserved key in `node_custom_values`. The underscore prefix marks it as system-owned; the API rejects writes to underscore-prefixed keys from clients.

---

## 4. Interim working arrangement

The trial expires before the new system is usable. The owner will fall back to ClickUp's free plan, which drops the Timeline view and restricts custom fields.

Practical consequence: **schedule data stops being maintained in ClickUp from that day.** The extraction snapshot is therefore the last complete record of estimates, and any planning done in the gap happens outside both systems. Worth knowing when the imported data later looks stale — it is stale by design, from a known date.
