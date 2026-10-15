# Project Calendar

Route: `/p/<slug>/calendar`. Linked from the project List and Timeline.

The calendar uses Google Calendar's month navigation, mini calendar, module sidebar,
weekly rows, and compact multi-day bars. Its rounded white surface and cool palette
are a deliberate, view-scoped exception to DESIGN.md, following the user's Google
Calendar reference. It does not alter the other views' visual tokens.

## Shared data

Calendar reads the same authorized `loadLedger` result as List (the Estimate/Actual
columns) and Timeline. There is no separate calendar record or synchronization job.
The project baseline is omitted; modules, tasks, and subtasks with their own dates
are included. Descendant rollups never replace a node's own dates.

- **Estimate:** `led_estimate_start` through `led_estimate_end`, inclusive.
- **Actual:** `led_actual_start` through `led_actual_end`, inclusive.
- **Both:** separate E and A bars for each task, even when the ranges coincide.
- An incomplete pair appears on its one known date with a hollow-circle marker.
  This does not fill the missing database value or imply that the task ended.
- No dates for the selected mode: the task appears in **Unscheduled**.
- Dates are date-only values. Today is calculated in Asia/Bangkok. Actual dates
  already reflect the existing working-day rules; Calendar does not resnap them.

## Interaction

Month and Week views, Today, previous/next period, mini calendar, case-insensitive
task search, and module checkboxes. Mode and view are remembered per project.
Three overlapping lanes are shown per month row; Week shows up to twelve. Extra
entries remain available through each day's “more” control. Cross-week ranges
continue onto the next row. A day or Unscheduled opens an agenda panel.

Clicking any bar or agenda item opens the existing Task details dialog. It reads
and writes through the existing authorized task endpoints. Estimate and Actual
remain independent patches. Successful saves refresh the ledger; focus and the
Refresh control also refresh it. This is refresh-on-return, not push synchronization.
The selected node is carried in the URL and in sibling List/Timeline links.

The sidebar starts collapsed on narrow screens. The calendar grid scrolls within
its own container rather than widening the document. Loading and retry states retain
a Home link. Viewers use the same calendar with read-only task controls.

## Verification

- `tests/calendar-model.test.ts`: independent dates, missing boundaries, omitted
  project baseline, leap/month boundaries, inclusive packing and cross-week clipping.
- `tests/e2e/calendar.browser.test.ts`: real authenticated Edge session with isolated
  database fixtures; modes, search, module filters, navigation, saving without changing
  Actual, Unscheduled, Week, List navigation, viewer permissions, and mobile overflow.
