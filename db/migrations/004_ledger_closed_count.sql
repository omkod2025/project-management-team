-- 004 — how many descendants are closed
--
-- Q3, decided 2026-09-07: progress is counted, not claimed.
--
-- A `%` field that somebody types into is the classic field that reads 90% for
-- three months. This project already has the evidence for that: `Completion
-- Criteria` and `Next Steps` held zero values across 174 tasks. So progress is
-- derived from the status column the team already changes — a fact, not an
-- assertion — and it is reported as `12 / 41`, because a count can be checked
-- and a percentage invites false precision.
--
-- Adds two columns to the ledger. The return type changes, so the function is
-- dropped and recreated rather than replaced.

DROP FUNCTION IF EXISTS pmf_project_ledger(uuid);

CREATE FUNCTION pmf_project_ledger(p_project_id uuid)
RETURNS TABLE (
    led_node_id             uuid,
    led_parent_id           uuid,
    led_depth               smallint,
    led_name                text,
    led_sort_order          double precision,
    led_estimate_start      date,
    led_estimate_end        date,
    led_actual_start        date,
    led_actual_end          date,
    led_actual_start_raw    date,
    led_actual_end_raw      date,
    led_source_start        pm_source_kind,
    led_source_end          pm_source_kind,
    led_custom_values       jsonb,
    led_estimate_workdays   integer,
    led_actual_workdays     integer,
    led_misclosure_start    integer,
    led_misclosure_end      integer,
    led_rollup_est_start    date,
    led_rollup_est_end      date,
    led_rollup_act_start    date,
    led_rollup_act_end      date,
    led_out_of_closure      boolean,
    -- Q3: descendants at a `done` stage, and how many there are in total.
    -- Both are 0 for a leaf, so the caller can tell "no children" from
    -- "no children finished" by looking at the total.
    led_descendant_count    integer,
    led_closed_count        integer
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    WITH RECURSIVE live AS (
        SELECT n.*
        FROM pmt_nodes n
        WHERE n.node_project_id = p_project_id
          AND n.node_archived_at IS NULL
    ),
    -- The project's status column, and the options on it that mean finished.
    status_field AS (
        SELECT project_status_field_id AS field_id
        FROM pmt_projects WHERE project_id = p_project_id
    ),
    done_options AS (
        SELECT o.option_id::text AS option_id
        FROM pmt_field_options o, status_field s
        WHERE s.field_id IS NOT NULL
          AND o.option_field_id = s.field_id
          AND o.option_stage = 'done'
    ),
    -- one row per (ancestor, descendant) pair at any distance
    closure AS (
        SELECT l.node_parent_id AS ancestor_id,
               l.node_id        AS descendant_id
        FROM live l
        WHERE l.node_parent_id IS NOT NULL
        UNION ALL
        SELECT c.ancestor_id,
               k.node_id
        FROM closure c
        JOIN live k ON k.node_parent_id = c.descendant_id
    ),
    rolled AS (
        SELECT
            c.ancestor_id                AS rolled_id,
            MIN(d.node_estimate_start)   AS rolled_est_start,
            MAX(d.node_estimate_end)     AS rolled_est_end,
            MIN(d.node_actual_start)     AS rolled_act_start,
            MAX(d.node_actual_end)       AS rolled_act_end,
            count(*)::integer            AS rolled_total,
            count(*) FILTER (
              WHERE d.node_custom_values ->> (SELECT field_id::text FROM status_field)
                    IN (SELECT option_id FROM done_options)
            )::integer                   AS rolled_closed
        FROM closure c
        JOIN live d ON d.node_id = c.descendant_id
        GROUP BY c.ancestor_id
    )
    SELECT
        l.node_id,
        l.node_parent_id,
        l.node_depth,
        l.node_name,
        l.node_sort_order,
        l.node_estimate_start,
        l.node_estimate_end,
        l.node_actual_start,
        l.node_actual_end,
        l.node_actual_start_raw,
        l.node_actual_end_raw,
        l.node_actual_source_start,
        l.node_actual_source_end,
        l.node_custom_values,
        pmf_duration_workdays(l.node_estimate_start, l.node_estimate_end),
        pmf_duration_workdays(l.node_actual_start,   l.node_actual_end),
        pmf_workdays_between(l.node_estimate_start,  l.node_actual_start),
        pmf_workdays_between(l.node_estimate_end,    l.node_actual_end),
        r.rolled_est_start,
        r.rolled_est_end,
        r.rolled_act_start,
        r.rolled_act_end,
        COALESCE(r.rolled_est_end   > l.node_estimate_end,   false)
     OR COALESCE(r.rolled_est_start < l.node_estimate_start, false),
        COALESCE(r.rolled_total, 0),
        COALESCE(r.rolled_closed, 0)
    FROM live l
    LEFT JOIN rolled r ON r.rolled_id = l.node_id
    ORDER BY l.node_depth, l.node_sort_order, l.node_created_at;
$$;
