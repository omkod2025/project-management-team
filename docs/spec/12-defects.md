# Defect list

Each project's List has Task and Defect tabs. Task remains at `/p/:slug`;
Defect is `/p/:slug/defects`, with its column settings at
`/p/:slug/defects/settings`.

Defects use the same list component, editors, tree rules, calendar, permission
capabilities and attachment storage as tasks. They have their own groups,
descendants, field definitions, options, status designation, column order and
assignment records. No Task relationship is required.

The first authorized open copies the project's current field definitions,
options and column arrangement with fresh IDs, preserving status designation
and option stages. It creates only a root, never copies tasks or groups.
Initialization is transactional and serialized per project. Later Task
configuration changes do not overwrite Defect settings.

Physical tables:

- `pmt_defect_nodes`
- `pmt_defect_field_definitions`
- `pmt_defect_field_options`
- `pmt_defect_settings`
- `pmt_defect_notifications`

The `pmf_defect_project_ledger` function and Defect subtree procedures read and
write only the Defect tree. Task Timeline, Report, roster and project progress
continue using the Task ledger. Defect assignments appear in the shared bell
and link directly to the Defect tab. Asset cleanup retains files referenced by
either tree, including archived items that can be restored.

Reads and writes use `/api/defects/nodes`, `/api/defects/fields`,
`/api/defects/options` and `/api/defects/projects`. Existing Task endpoints never
resolve a Defect ID. Members can edit either list; only admins configure fields,
rearrange columns or archive items. Viewers read either list. Saved filters,
sorts and expansion state are isolated by list kind.

List navigation uses client-side links with prefetch disabled: the other tab is
requested only when selected. The list ledger reads only the selected store,
and option reads are restricted to this project. The notification badge and
inbox on project work pages use `kind=task` or `kind=defect`; leaving the page
cancels pending notification requests. Other pages retain the combined inbox.
Image previews load lazily instead of blocking the initial page load.

Both lists render individual rows within 600px of the visible scroll area.
Offscreen rows retain measured-height placeholders while their cells unmount;
scrolling back mounts them again. A single observer tracks all rows. Focused,
editing, dragged and navigation-target rows remain mounted, preserving drafts.
There is no batch boundary or Load more button.
Newly visible rows commit one at a time on successive animation frames, with
on-screen rows prioritized over the overscan buffer. Leaving the viewport
cancels queued work. Focused/edited rows bypass the queue for immediate input.
Keyboard navigation, module links and notification targets reveal their rows
before scrolling. Detail and archive-confirmation components load their code
only when opened. The active list still fetches its complete ledger: windowing
reduces DOM/rendering work, not database reads, so search, sorting, tree moves
and roll-up totals continue to operate across all records.

`tests/e2e/list-lazy.browser.test.ts` verifies bounded mounted rows, scrolling
back to unmounted rows, preserving unsaved edits, searching unmounted rows,
jumping to a distant module and opening its detail panel in both lists.

The authorized project header and Task/Defect tabs remain visible while the
ledger streams into the page. Loading indicators for tab navigation and ledger
refreshes after moves or restores cover only the table area, never the header
or tabs. Lazy detail dialogs show their own loading state. Reduced-motion
preferences stop the spin, and the inactive list is never prefetched.

`tests/e2e/list-loading.test.mjs` captures actual database queries to verify
that neither list nor its badge reads the other store. The browser test checks
both directions for unwanted prefetch and ensures switching keeps one document.

Apply `npm run db:migrate` before starting this version. Migration
`020_defects.sql` adds the independent storage without copying or changing Task
rows. The same DDL is included in `db/schema.sql` for a fresh database.

Validation: `tests/e2e/defects.test.ts` covers concurrent initialization,
storage isolation, permissions, dates, roll-up, movement, configuration,
notifications, archive and restore. `tests/e2e/defects.browser.test.ts` covers
tab navigation, inline editing, attachment upload, settings, search and Undo.
Both use disposable projects; set `E2E_BASE_URL` when the app is not on port 3010.
Run both with `npm run test:defects` while the app is running (Edge is required
for the browser test).
