-- Defects are independent trees, fields, settings and assignments. Task reads remain unchanged.

CREATE TABLE pmt_defect_field_definitions (
    field_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    field_project_id   uuid          NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
    field_name         text          NOT NULL,
    field_kind         pm_field_kind NOT NULL,
    field_position     integer       NOT NULL DEFAULT 0,
    -- Kind-specific settings. Examples:
    --   money      {"currency":"THB"}
    --   number     {"precision":0}
    --   long_text  {"rows":3}
    --   people     {"multiple":true}
    field_settings     jsonb         NOT NULL DEFAULT '{}'::jsonb,
    field_archived_at  timestamptz,
    field_created_at   timestamptz   NOT NULL DEFAULT now(),
    field_updated_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE pmt_defect_field_options (
    option_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    option_field_id     uuid           NOT NULL
                                       REFERENCES pmt_defect_field_definitions(field_id) ON DELETE CASCADE,
    option_label        text           NOT NULL,
    -- Tab-wheel index 1..6 from DESIGN.md, not a raw hex value. Keeping the
    -- palette in one place means a token change repaints every option.
    option_color_index  smallint       NOT NULL DEFAULT 1
                                       CHECK (option_color_index BETWEEN 1 AND 6),
    -- NULL for select fields that are not the project's status field.
    option_stage        pm_stage_kind,
    option_position     integer        NOT NULL DEFAULT 0,
    -- Options are archived, never deleted (D-33).
    option_archived_at  timestamptz,
    option_created_at   timestamptz    NOT NULL DEFAULT now()
);

CREATE TABLE pmt_defect_nodes (
    node_id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Denormalised onto every node so a list query never walks the tree to
    -- discover which project's field definitions apply.
    node_project_id           uuid        NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
    node_parent_id            uuid        REFERENCES pmt_defect_nodes(node_id) ON DELETE RESTRICT,

    -- 1 project, 2 module, 3 task, 4..6 subtask (subtasks nest). The real
    -- limit is the application constant MAX_DEPTH = 6; this CHECK mirrors it
    -- (D-1, D-2). Raised from 4 on 2026-09-07 after the ClickUp capture
    -- showed parent chains five task levels deep.
    node_depth                smallint    NOT NULL CHECK (node_depth BETWEEN 1 AND 6),

    node_name                 text        NOT NULL,
    node_sort_order           double precision NOT NULL DEFAULT 0,

    -- ---- the four dates (D-10) --------------------------------------
    node_estimate_start       date,
    node_estimate_end         date,
    node_actual_start         date,
    node_actual_end           date,

    -- Unsnapped, as-recorded actual dates. Written once at capture, never
    -- modified (D-15). The audit trail behind forward-snapping.
    node_actual_start_raw     date,
    node_actual_end_raw       date,

    node_actual_source_start  pm_source_kind,
    node_actual_source_end    pm_source_kind,
    -- -----------------------------------------------------------------

    -- Custom field values keyed by pmt_defect_field_definitions.field_id. No
    -- foreign keys by design (D-32); see the GIN index below.
    node_custom_values        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    node_archived_at          timestamptz,
    node_created_by           uuid        REFERENCES pmt_users(user_id) ON DELETE SET NULL,
    node_created_at           timestamptz NOT NULL DEFAULT now(),
    node_updated_at           timestamptz NOT NULL DEFAULT now(),

    -- Depth 1 is a project root and has no parent; every other depth does.
    CONSTRAINT pmt_defect_nodes_root_shape CHECK (
        (node_depth = 1 AND node_parent_id IS NULL)
     OR (node_depth > 1 AND node_parent_id IS NOT NULL)
    ),
    CONSTRAINT pmt_defect_nodes_estimate_order CHECK (
        node_estimate_start IS NULL
     OR node_estimate_end   IS NULL
     OR node_estimate_start <= node_estimate_end
    ),
    CONSTRAINT pmt_defect_nodes_actual_order CHECK (
        node_actual_start IS NULL
     OR node_actual_end   IS NULL
     OR node_actual_start <= node_actual_end
    )
);

CREATE TABLE pmt_defect_notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who is being told. CASCADE: a deleted account takes its unread bell with it.
  notification_user_id uuid NOT NULL REFERENCES pmt_users(user_id) ON DELETE CASCADE,

  -- Who did it. SET NULL rather than CASCADE — the event still happened after
  -- the person who caused it is gone, and the row reads "somebody" instead of
  -- vanishing.
  notification_actor_id uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,

  notification_project_id uuid NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
  notification_node_id uuid NOT NULL REFERENCES pmt_defect_nodes(node_id) ON DELETE CASCADE,

  -- Which people field carried the name. There is no assignee column in this
  -- product: a project may define several people fields under any names it
  -- likes, and the roster reads all of them (spec 09). So the notification has
  -- to say which one, or "Owner" and "Reviewer" become the same sentence.
  notification_field_id uuid REFERENCES pmt_defect_field_definitions(field_id) ON DELETE SET NULL,

  -- The field's name as it read at the time, copied rather than joined. A
  -- field can be renamed or archived, and an event log that silently rewrites
  -- its own past is not a log.
  notification_field_name text NOT NULL
    CHECK (char_length(btrim(notification_field_name)) BETWEEN 1 AND 200),

  notification_created_at timestamptz NOT NULL DEFAULT now(),

  -- NULL until the reader follows it through to the task. Per row, not a
  -- single "last opened the bell" watermark, because the bell's count is meant
  -- to mean "work I have not gone and looked at" — opening the panel to glance
  -- at it is not the same as having dealt with anything.
  notification_read_at timestamptz,

  -- Assigning yourself is not news. Enforced here as well as in the rule so a
  -- future caller cannot reintroduce it.
  CONSTRAINT pmt_defect_notifications_not_self_ck CHECK (notification_user_id <> notification_actor_id)
);

CREATE TABLE pmt_defect_settings (
  defect_project_id uuid PRIMARY KEY REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
  defect_status_field_id uuid REFERENCES pmt_defect_field_definitions(field_id) ON DELETE SET NULL,
  defect_column_order jsonb NOT NULL DEFAULT '[]',
  defect_updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pmt_defect_nodes_root_uq ON pmt_defect_nodes(node_project_id) WHERE node_depth = 1;
CREATE INDEX pmt_defect_nodes_parent_idx ON pmt_defect_nodes(node_parent_id);
CREATE INDEX pmt_defect_nodes_project_idx ON pmt_defect_nodes(node_project_id, node_depth, node_sort_order);
CREATE INDEX pmt_defect_nodes_custom_gin ON pmt_defect_nodes USING gin(node_custom_values jsonb_path_ops);
CREATE INDEX pmt_defect_fields_project_idx ON pmt_defect_field_definitions(field_project_id, field_position);
CREATE INDEX pmt_defect_options_field_idx ON pmt_defect_field_options(option_field_id, option_position);
CREATE INDEX pmt_defect_notifications_user_idx ON pmt_defect_notifications(notification_user_id, notification_created_at);


CREATE OR REPLACE FUNCTION pmf_defect_descendants(p_node_id uuid)
RETURNS TABLE (
    descendant_id     uuid,
    descendant_depth  smallint
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    WITH RECURSIVE walk AS (
        SELECT n.node_id, n.node_depth
        FROM pmt_defect_nodes n
        WHERE n.node_parent_id = p_node_id
          AND n.node_archived_at IS NULL
        UNION ALL
        SELECT c.node_id, c.node_depth
        FROM pmt_defect_nodes c
        JOIN walk w ON c.node_parent_id = w.node_id
        WHERE c.node_archived_at IS NULL
    )
    SELECT walk.node_id, walk.node_depth FROM walk;
$$;

CREATE OR REPLACE FUNCTION pmf_defect_project_ledger(p_project_id uuid)
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
        FROM pmt_defect_nodes n
        WHERE n.node_project_id = p_project_id
          AND n.node_archived_at IS NULL
    ),
    -- The project's status column, and the options on it that mean finished.
    status_field AS (
        SELECT defect_status_field_id AS field_id
        FROM pmt_defect_settings WHERE defect_project_id = p_project_id
    ),
    done_options AS (
        SELECT o.option_id::text AS option_id
        FROM pmt_defect_field_options o, status_field s
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

CREATE OR REPLACE PROCEDURE pmp_defect_archive_subtree(p_node_id uuid)
LANGUAGE sql AS $$
    UPDATE pmt_defect_nodes
    SET node_archived_at = now(),
        node_updated_at  = now()
    WHERE node_archived_at IS NULL
      AND (
            node_id = p_node_id
         OR node_id IN (SELECT descendant_id FROM pmf_defect_descendants(p_node_id))
          );
$$;

CREATE OR REPLACE PROCEDURE pmp_defect_restore_subtree(p_node_id uuid)
LANGUAGE sql AS $$
    WITH RECURSIVE walk AS (
        SELECT n.node_id FROM pmt_defect_nodes n WHERE n.node_id = p_node_id
        UNION ALL
        SELECT c.node_id
        FROM pmt_defect_nodes c
        JOIN walk w ON c.node_parent_id = w.node_id
    )
    UPDATE pmt_defect_nodes
    SET node_archived_at = NULL,
        node_updated_at  = now()
    WHERE node_id IN (SELECT walk.node_id FROM walk);
$$;

CREATE OR REPLACE PROCEDURE pmp_defect_move_subtree(p_node_id uuid, p_new_parent_id uuid)
LANGUAGE plpgsql AS $$
DECLARE
    v_old_depth  smallint;
    v_new_depth  smallint;
    v_delta      smallint;
BEGIN
    SELECT n.node_depth INTO v_old_depth
    FROM pmt_defect_nodes n WHERE n.node_id = p_node_id;

    SELECT n.node_depth + 1 INTO v_new_depth
    FROM pmt_defect_nodes n WHERE n.node_id = p_new_parent_id;

    v_delta := v_new_depth - v_old_depth;

    UPDATE pmt_defect_nodes
    SET node_parent_id  = p_new_parent_id,
        node_depth      = v_new_depth,
        node_updated_at = now()
    WHERE node_id = p_node_id;

    IF v_delta <> 0 THEN
        UPDATE pmt_defect_nodes
        SET node_depth      = node_depth + v_delta,
            node_updated_at = now()
        WHERE node_id IN (SELECT descendant_id FROM pmf_defect_descendants(p_node_id));
    END IF;
END;
$$;
