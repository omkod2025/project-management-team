# 08 — Running and backing it up

The product is self-hosted; data ownership was one of the reasons for building it rather than buying (PRODUCT.md § Positioning). That makes backup an owner's responsibility rather than a vendor's, so it is written down here.

---

## 1. What must be backed up

| | Why |
|---|---|
| **The PostgreSQL database** | Everything. There is no other store. |
| `.env` | Credentials and `AUTH_SECRET`. Losing `AUTH_SECRET` signs everybody out; losing the database credentials locks you out entirely. **Never committed.** |
| `data/clickup-raw/` | The only surviving copy of the ClickUp workspace — two captures, 9.2 MB each, verified identical. Irreplaceable once the trial lapses. |

Everything else is in git and can be rebuilt.

`data/clickup-raw/` deserves emphasis: it is git-ignored because it holds client data, which means nothing is protecting it. Copy it somewhere durable now, not later.

---

## 1b. Where it is, as of 2026-09-07

| | |
|---|---|
| Local | `C:\citackupsieldbook\` — archive, database dump, checksums, README |
| Off-machine | Google Drive |

Both artefacts were verified on creation, not merely written:

- the ClickUp archive was extracted and compared byte-for-byte against the source (`diff -r`, zero differences, 1,240 files);
- the database dump was restored into a scratch database, `db/tests.sql` was run against **the restored copy** and passed all fourteen groups, and Thai text was confirmed intact across 95 names.

Two things this does not yet cover:

- **A synced folder is a mirror, not a history.** If Google Drive for desktop is syncing the folder rather than holding an uploaded copy, deleting the local file deletes the remote one, and so does a corruption that syncs before anyone notices. Drive keeps deleted files for 30 days and file versions for 100, which is a safety net rather than a backup policy. If this is a sync folder, one periodic copy somewhere Drive does not touch is worth having.
- **The database changes daily; this dump does not.** The ClickUp archive is a fixed historical artefact and one copy is enough forever. The dump is a snapshot of live work, and needs the recurring job described below.

It is also worth naming plainly: data ownership was one of the reasons for leaving a third-party SaaS, and the backup now sits with a different third party. That is a reasonable trade for durability, and it is a choice rather than an oversight.

## 2. Backup

A logical dump is enough at this scale, and it restores onto any PostgreSQL 18:

```bash
pg_dump --format=custom --file=fieldbook-$(date +%F).dump fieldbook
```

To restore into an empty database:

```bash
createdb fieldbook
pg_restore --dbname=fieldbook fieldbook-2026-09-07.dump
```

Two things worth knowing before trusting a restore:

- **`pg_restore` succeeding is not a verified backup.** Restore into a scratch database and run `npm run db:test` against it. The suite runs in a transaction and rolls back, so it is safe to point at a copy.
- **The dump contains client budget figures and delivery commitments.** Encrypt it at rest, and keep it off any location a client could reach.

Frequency: the data changes as fast as the team works. Daily is proportionate; hourly is not, given a handful of writers.

---

## 3. Deployment

Not yet done, and deliberately out of scope while the product is being built. The shape it should take:

- **The application** is a standard Next.js server (`npm run build && npm start`). It holds no state, so it can be replaced at will.
- **The database** is the only stateful part. Its volume is the thing to protect, snapshot and monitor.
- **`AUTH_SECRET` must be stable** across restarts, or every session ends on each deploy.
- **`TZ` on the server does not matter** for correctness — every date is stored as a `date`, and `pg` is configured to return it as a string precisely so no server timezone can shift it (`src/db/client.ts`). Application code that needs "today" computes it in `Asia/Bangkok` explicitly.
- **Run behind TLS.** Session cookies and passwords cross the wire.

`docker-compose.yml` in the repo brings up PostgreSQL 18 for development only. It is not a production topology: no backups, no TLS, a password in plain text in the file.

---

## 4. Health checks worth having

None of these exist yet. In rough order of value:

1. `SELECT 1` against the database — the app is useless without it.
2. A daily count of nodes whose `node_actual_end` was captured, which is the signal that automatic capture is still working. A sudden zero means the status field lost its `done` stage, or nobody is using the tool.
3. Backup age. A backup nobody notices has stopped is worse than no backup, because it is believed.

---

## 5. Upgrading the schema

`db/schema.sql` builds a fresh database. `db/migrations/*.sql` moves an existing one forward, once each, recorded in `pmt_migrations`.

Every migration must also be folded into `db/schema.sql`, so a fresh build and a migrated database land on the same shape. Nothing enforces that automatically — `npm run db:test` against both is what catches a drift.

There are no down-migrations. Reversing a change means writing the next migration, which is the only thing that ever works against a database holding real data.
