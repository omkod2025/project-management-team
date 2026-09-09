# Document editor

Run `node --env-file=.env scripts/migrate.mjs` before starting the updated app.
Migration 008 adds page content, editing-session revisions and private image records.

Open **Project → Docs → document title → New page**. Admins create Free or Module
pages (up to three levels). Members and admins use **Edit page** to write; viewers
read the server-rendered page. Content autosaves after one second of inactivity.
**Done editing** waits for pending content to save. A stale save is refused and
the local draft remains available through **Copy Markdown**. History groups
continuous saves by the same editor with a 30-minute inactivity threshold.

Image uploads accept PNG, JPEG, WebP, GIF and SVG up to 50 MB per file. SVG supports CSS, HTML labels, animation and embedded assets; its sandbox blocks scripts and external resource loading. Image URLs require project
membership. Files live in `data/doc-assets` or the absolute `DOC_ASSET_DIR` path.
GitHub release deployments and production Compose bind `/mnt/fieldbook-files`
on the server to `/app/data/doc-assets` in the container, and set `DOC_ASSET_DIR`
to that container path. The directory must be writable by UID/GID 1001:1001;
the release workflow sets ownership automatically. When an existing container
does not yet use this mount, the workflow stops it, backs up its assets under
`$DEPLOY_PATH/doc-assets-backup.*`, and copies them into the mount without
overwriting existing files. Back up `/mnt/fieldbook-files` together with PostgreSQL.
Removing an image from a page
does not remove its stored file. Orphan collection is not part of the editor.

Validation commands:

- `npm run typecheck`
- `npm test`
- `npm run test:docs` (running local app and database)
- `npm run test:docs-browser` (running local app, database and Microsoft Edge)

The editor includes create/read/edit, optional node binding, private assets and
revision inspection/restore. The follow-up below extends the original Markdown
editor contract; full-content search is still separate work.
# File attachments

Apply `db/migrations/009_doc_attachments.sql` after migration 008, and `014_doc_asset_50mb.sql` for the current size limit. The Attachment command (search `/file` or `/attachment`) uploads one file, maximum 50 MB (52,428,800 bytes), to the existing document asset volume. Admins and Members can upload; project members can download. Files are forced downloads, not rendered inline, with the original filename supplied in the download header. Files are not malware-scanned: only open attachments from trusted sources. Removing a download link does not remove the stored file.

## Rich Docs follow-up

Migrations 010 and 011 add page settings/protection, project templates and comment
threads/assignment. Apply migrations once, in numeric order. These two migrations
were applied directly to the development database during implementation; check
the database and migration ledger before rerunning them there.

Legacy page-slot strings remain Markdown until edited. Rich strings use the
`fieldbook-rich-v1:` prefix and a validated JSON node tree. Renderers accept only
known nodes, marks, styles and safe URLs; embeds use an HTTPS host allowlist.
Do not strip the prefix or treat rich strings as plain Markdown. JSON draft
download preserves formatting when a save fails; Markdown copy/export cannot
preserve colors, columns or merged-cell structure. History restore requires
confirmation and creates a separate revision.

Page tools provide comments and replies, assignments, relationships, templates,
settings and page actions. Members/admins may write comments and edit unprotected
pages; structural actions, templates and protection require admin. Protected
pages reject content changes. Archived pages remain recoverable through the
sidebar, including when no active page remains. Moves retain the three-level
tree constraint for active and archived descendants.

HTML, Markdown and JSON export support this page or the whole document. PDF uses
the browser print dialog. Exports do not package attachment files, revisions or
full hierarchy/settings and are not backups. Attachment URLs still require an
authenticated project member. Browser handoff does not prove a download completed.

Import creates new pages, never overwrites an existing page. Supported inputs are
Markdown/text, HTML, Fieldbook JSON and DOCX, up to 5 MB per input and 100 pages per
import. Unsupported source formatting may be omitted. DOCX conversion runs in a
worker with a timeout, validates ZIP entry counts and streamed expanded sizes
(25 MB total), blocks external file access and limits imported images. Uploaded
images can remain stored if a later import step fails; orphan collection is not
implemented. Direct authenticated Notion/Confluence import is not available.

AI is explicitly out of scope. Public links are not enabled: project membership
is still required for documents, comments and assets. Real-time collaborative
editing is not implemented; concurrent edits use optimistic conflict detection.
# SVG image uploads

Migration `012_doc_svg.sql` adds `image/svg+xml` to the asset registry. The editor and cover picker accept SVG up to 50 MB after migration `014_doc_asset_50mb.sql`. Server-side XML validation rejects malformed documents, custom entity definitions and excessive complexity. SVG responses use a sandboxed CSP; project membership checks remain unchanged. See `docs/spec/10-docs.md` for the rendering contract.

The 50 MB limit applies to uploaded assets, including attachments, covers and task image columns. Document import/conversion retains its separate 5 MB input and DOCX expansion budgets. A reverse proxy in front of the app must allow at least 51 MB request bodies to accommodate multipart form overhead.

The Docs sidebar now exposes a trash icon next to each page for project admins. Deletion uses the existing recoverable archive action, requires confirmation, blocks during editing, respects protection and stale-save checks, and requires subpages to be archived first. Restore remains available under Archived pages.
