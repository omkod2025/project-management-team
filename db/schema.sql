-- =====================================================================
-- Field Book — PostgreSQL schema
-- Phase A specification artifact. Executable DDL, not yet migrated.
--
-- NAMING CONVENTION (binding)
--   pmt_   tables
--   pmp_   procedures
--   pmf_   functions
--   p_     function / procedure parameters
--
--   Every column carries its own table's entity prefix, so a column name
--   is unambiguous in any join and never needs an alias to be readable:
--
--     pmt_users              -> user_*
--     pmt_projects           -> project_*
--     pmt_project_members    -> member_*
--     pmt_field_definitions  -> field_*
--     pmt_field_options      -> option_*
--     pmt_nodes              -> node_*
--     pmt_holidays           -> holiday_*
--
--   No identifier is an SQL reserved word. Bare `id`, `name`, `type`,
--   `level`, `position`, `role`, `label`, `date`, `end`, `start`, `user`,
--   `order` and `config` appear nowhere in this schema.
--
-- DESIGN CONSTRAINTS THIS SCHEMA ENCODES
--   * node_estimate_* and node_actual_* are four independent columns and
--     no database object ever writes one from the other       (rule D-10)
--   * roll-up values are NEVER stored; they are computed on read (D-20)
--   * there are NO TRIGGERS anywhere. Business rules live in TypeScript;
--     PostgreSQL supplies aggregate computation only
--   * custom field values live in jsonb with no foreign keys; integrity
--     comes from archiving rather than deleting            (D-33, D-34)
--
-- One installation serves one organisation. There is no workspace table,
-- so pmt_holidays is global to the install.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- =====================================================================
-- ENUMS
-- =====================================================================

CREATE TYPE pm_role_kind AS ENUM ('admin', 'member', 'viewer');

CREATE TYPE pm_field_kind AS ENUM (
    'text',
    'long_text',
    'number',
    'money',
    'date',
    'select',
    'multi_select',
    'checkbox',
    'people'
);

-- Lifecycle meaning of a select option. Only the project's designated
-- status field has its stages honoured (D-35).
CREATE TYPE pm_stage_kind AS ENUM ('notStarted', 'inProgress', 'done');

-- How an actual date came to hold its value. 'auto' means captured from a
-- status transition; 'manual' means a human set it, and automatic capture
-- must never touch it again (D-14). Rendered as ink colour in the UI.
CREATE TYPE pm_source_kind AS ENUM ('auto', 'manual');


-- =====================================================================
-- PEOPLE
-- =====================================================================

CREATE TABLE pmt_users (
    user_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email       text        NOT NULL,
    user_full_name   text        NOT NULL,
    user_avatar_url  text,
    -- Credentials. See db/migrations/001_user_password.sql for why identity
    -- lives here rather than in an Auth.js adapter table.
    user_password_hash    text,
    user_setup_token      text,
    user_setup_expires_at timestamptz,
    -- True while the current password was chosen by somebody other than its
    -- owner, which is only ever an admin-set starting password. See
    -- db/migrations/006_password_change_required.sql.
    user_must_change_password boolean NOT NULL DEFAULT false,
    user_is_active   boolean     NOT NULL DEFAULT true,
    user_created_at  timestamptz NOT NULL DEFAULT now(),
    user_updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness without requiring the citext extension.
CREATE UNIQUE INDEX pmt_users_email_uq ON pmt_users (lower(user_email));

-- Only one live setup token per user, and none once it is consumed.
CREATE UNIQUE INDEX pmt_users_setup_token_uq
    ON pmt_users (user_setup_token)
    WHERE user_setup_token IS NOT NULL;

-- Sessions are JWTs, not rows: Auth.js runs a Credentials provider over
-- pmt_users, so there is no adapter-owned user table. See spec 05 §1.


-- =====================================================================
-- PROJECTS AND MEMBERSHIP
-- =====================================================================

CREATE TABLE pmt_projects (
    project_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name             text        NOT NULL,
    project_slug             text        NOT NULL,
    project_description      text,
    -- The one select field whose option stages drive automatic actual
    -- dates (D-35). FK added once pmt_field_definitions exists.
    project_status_field_id  uuid,
    project_archived_at      timestamptz,
    project_created_at       timestamptz NOT NULL DEFAULT now(),
    project_updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pmt_projects_slug_uq ON pmt_projects (project_slug);


CREATE TABLE pmt_project_members (
    member_project_id  uuid         NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
    member_user_id     uuid         NOT NULL REFERENCES pmt_users(user_id)       ON DELETE CASCADE,
    member_role        pm_role_kind NOT NULL,
    member_created_at  timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (member_project_id, member_user_id)
);

CREATE INDEX pmt_project_members_user_idx ON pmt_project_members (member_user_id);


-- =====================================================================
-- CUSTOM FIELD DEFINITIONS  (per project, inherited by every node)
-- =====================================================================

CREATE TABLE pmt_field_definitions (
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

CREATE INDEX pmt_field_definitions_project_idx
    ON pmt_field_definitions (field_project_id, field_position)
    WHERE field_archived_at IS NULL;

-- field_kind is immutable (D-31). Enforced in the application layer;
-- stated here so no future migration relaxes it silently.

ALTER TABLE pmt_projects
    ADD CONSTRAINT pmt_projects_status_field_fk
    FOREIGN KEY (project_status_field_id)
    REFERENCES pmt_field_definitions(field_id) ON DELETE SET NULL;


CREATE TABLE pmt_field_options (
    option_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    option_field_id     uuid           NOT NULL
                                       REFERENCES pmt_field_definitions(field_id) ON DELETE CASCADE,
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

CREATE INDEX pmt_field_options_field_idx
    ON pmt_field_options (option_field_id, option_position);


-- =====================================================================
-- THE TREE
-- =====================================================================

CREATE TABLE pmt_nodes (
    node_id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Denormalised onto every node so a list query never walks the tree to
    -- discover which project's field definitions apply.
    node_project_id           uuid        NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
    node_parent_id            uuid        REFERENCES pmt_nodes(node_id) ON DELETE RESTRICT,

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

    -- Custom field values keyed by pmt_field_definitions.field_id. No
    -- foreign keys by design (D-32); see the GIN index below.
    node_custom_values        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    node_archived_at          timestamptz,
    node_created_by           uuid        REFERENCES pmt_users(user_id) ON DELETE SET NULL,
    node_created_at           timestamptz NOT NULL DEFAULT now(),
    node_updated_at           timestamptz NOT NULL DEFAULT now(),

    -- Depth 1 is a project root and has no parent; every other depth does.
    CONSTRAINT pmt_nodes_root_shape CHECK (
        (node_depth = 1 AND node_parent_id IS NULL)
     OR (node_depth > 1 AND node_parent_id IS NOT NULL)
    ),
    CONSTRAINT pmt_nodes_estimate_order CHECK (
        node_estimate_start IS NULL
     OR node_estimate_end   IS NULL
     OR node_estimate_start <= node_estimate_end
    ),
    CONSTRAINT pmt_nodes_actual_order CHECK (
        node_actual_start IS NULL
     OR node_actual_end   IS NULL
     OR node_actual_start <= node_actual_end
    )
);

CREATE INDEX pmt_nodes_project_idx
    ON pmt_nodes (node_project_id, node_depth, node_sort_order)
    WHERE node_archived_at IS NULL;

CREATE INDEX pmt_nodes_parent_idx
    ON pmt_nodes (node_parent_id)
    WHERE node_archived_at IS NULL;

CREATE INDEX pmt_nodes_dates_idx
    ON pmt_nodes (node_project_id, node_estimate_start, node_estimate_end)
    WHERE node_archived_at IS NULL;

-- The index that makes jsonb storage viable: filtering and grouping by any
-- custom field without a values table (D-32).
CREATE INDEX pmt_nodes_custom_gin
    ON pmt_nodes USING gin (node_custom_values jsonb_path_ops);


-- =====================================================================
-- WORKING-DAY CALENDAR
-- =====================================================================

CREATE TABLE pmt_holidays (
    holiday_date        date PRIMARY KEY,
    holiday_name        text        NOT NULL,
    holiday_created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pmt_holidays IS
    'Thai public holidays. Data, not code - they are amended mid-year (D-41).';


-- =====================================================================
-- FUNCTIONS - aggregate computation only, all read-only
-- =====================================================================

-- Is this a working day? Saturday, Sunday, or a listed holiday is not.
CREATE OR REPLACE FUNCTION pmf_is_workday(p_date date)
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT p_date IS NOT NULL
       AND EXTRACT(ISODOW FROM p_date) < 6
       AND NOT EXISTS (
               SELECT 1 FROM pmt_holidays h
               WHERE h.holiday_date = p_date
           );
$$;


-- The first working day on or after p_date. Used for forward-snapping
-- actual dates (D-15). The 30-day window is far beyond any real run of
-- consecutive Thai non-working days.
CREATE OR REPLACE FUNCTION pmf_next_workday(p_date date)
RETURNS date
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT MIN(g.candidate)::date
    FROM generate_series(p_date, p_date + 30, interval '1 day') AS g(candidate)
    WHERE pmf_is_workday(g.candidate::date);
$$;


-- Working days in [p_from, p_to] inclusive. 0 when the range holds none.
CREATE OR REPLACE FUNCTION pmf_duration_workdays(p_from date, p_to date)
RETURNS integer
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT CASE
        WHEN p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN 0
        ELSE (
            SELECT count(*)::integer
            FROM generate_series(p_from, p_to, interval '1 day') AS g(candidate)
            WHERE pmf_is_workday(g.candidate::date)
        )
    END;
$$;


-- Signed working-day distance from p_from to p_to: exclusive of p_from,
-- inclusive of p_to. Positive means later, negative means earlier (D-23).
-- This is the misclosure primitive.
CREATE OR REPLACE FUNCTION pmf_workdays_between(p_from date, p_to date)
RETURNS integer
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT CASE
        WHEN p_from IS NULL OR p_to IS NULL THEN NULL
        WHEN p_to >= p_from THEN  pmf_duration_workdays(p_from + 1, p_to)
        ELSE                     -pmf_duration_workdays(p_to   + 1, p_from)
    END;
$$;


-- Every non-archived descendant of a node, at every depth below it.
CREATE OR REPLACE FUNCTION pmf_descendants(p_node_id uuid)
RETURNS TABLE (
    descendant_id     uuid,
    descendant_depth  smallint
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    WITH RECURSIVE walk AS (
        SELECT n.node_id, n.node_depth
        FROM pmt_nodes n
        WHERE n.node_parent_id = p_node_id
          AND n.node_archived_at IS NULL
        UNION ALL
        SELECT c.node_id, c.node_depth
        FROM pmt_nodes c
        JOIN walk w ON c.node_parent_id = w.node_id
        WHERE c.node_archived_at IS NULL
    )
    SELECT walk.node_id, walk.node_depth FROM walk;
$$;


-- Roll-up extent of one node's descendants, plus the closure check against
-- that node's own baseline (D-20, D-22). Roll-up is never stored.
CREATE OR REPLACE FUNCTION pmf_rollup(p_node_id uuid)
RETURNS TABLE (
    rollup_node_id          uuid,
    rollup_descendant_count integer,
    rollup_estimate_start   date,
    rollup_estimate_end     date,
    rollup_actual_start     date,
    rollup_actual_end       date,
    rollup_overrun_days     integer,   -- children end past the baseline
    rollup_early_start_days integer,   -- children start before the baseline
    rollup_out_of_closure   boolean
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    WITH baseline AS (
        SELECT n.node_estimate_start AS base_start,
               n.node_estimate_end   AS base_end
        FROM pmt_nodes n
        WHERE n.node_id = p_node_id
    ),
    kids AS (
        SELECT
            count(*)::integer          AS kid_count,
            MIN(k.node_estimate_start) AS kid_estimate_start,
            MAX(k.node_estimate_end)   AS kid_estimate_end,
            MIN(k.node_actual_start)   AS kid_actual_start,
            MAX(k.node_actual_end)     AS kid_actual_end
        FROM pmf_descendants(p_node_id) d
        JOIN pmt_nodes k ON k.node_id = d.descendant_id
    )
    SELECT
        p_node_id,
        kids.kid_count,
        kids.kid_estimate_start,
        kids.kid_estimate_end,
        kids.kid_actual_start,
        kids.kid_actual_end,
        GREATEST(COALESCE(pmf_workdays_between(baseline.base_end, kids.kid_estimate_end), 0), 0),
        GREATEST(COALESCE(pmf_workdays_between(kids.kid_estimate_start, baseline.base_start), 0), 0),
        COALESCE(kids.kid_estimate_end   > baseline.base_end,   false)
     OR COALESCE(kids.kid_estimate_start < baseline.base_start, false)
    FROM kids CROSS JOIN baseline;
$$;


-- Signed misclosure of one node's own estimate against its own actual
-- (D-23). Both figures are in working days.
CREATE OR REPLACE FUNCTION pmf_misclosure(p_node_id uuid)
RETURNS TABLE (
    misclosure_node_id  uuid,
    misclosure_start    integer,
    misclosure_end      integer
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT
        n.node_id,
        pmf_workdays_between(n.node_estimate_start, n.node_actual_start),
        pmf_workdays_between(n.node_estimate_end,   n.node_actual_end)
    FROM pmt_nodes n
    WHERE n.node_id = p_node_id;
$$;


-- Set-based ledger for a whole project: one row per node carrying its own
-- dates, durations and misclosure, plus its descendants' roll-up. This is
-- what the List and Timeline views read. It builds the ancestor/descendant
-- closure once instead of calling pmf_rollup N times.
--
-- Output columns are prefixed led_ so nothing in the body can collide with
-- a table column of the same name.
CREATE OR REPLACE FUNCTION pmf_project_ledger(p_project_id uuid)
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


-- =====================================================================
-- PROCEDURES
-- =====================================================================

-- Soft-archive a node and everything beneath it (D-4).
CREATE OR REPLACE PROCEDURE pmp_archive_subtree(p_node_id uuid)
LANGUAGE sql AS $$
    UPDATE pmt_nodes
    SET node_archived_at = now(),
        node_updated_at  = now()
    WHERE node_archived_at IS NULL
      AND (
            node_id = p_node_id
         OR node_id IN (SELECT descendant_id FROM pmf_descendants(p_node_id))
          );
$$;


-- Restore a previously archived subtree.
CREATE OR REPLACE PROCEDURE pmp_restore_subtree(p_node_id uuid)
LANGUAGE sql AS $$
    WITH RECURSIVE walk AS (
        SELECT n.node_id FROM pmt_nodes n WHERE n.node_id = p_node_id
        UNION ALL
        SELECT c.node_id
        FROM pmt_nodes c
        JOIN walk w ON c.node_parent_id = w.node_id
    )
    UPDATE pmt_nodes
    SET node_archived_at = NULL,
        node_updated_at  = now()
    WHERE node_id IN (SELECT walk.node_id FROM walk);
$$;


-- Re-parent a node, moving its whole subtree and shifting every descendant
-- depth to match. Depth validation (D-3) happens in TypeScript before this
-- is called; this procedure performs the move only.
CREATE OR REPLACE PROCEDURE pmp_move_subtree(p_node_id uuid, p_new_parent_id uuid)
LANGUAGE plpgsql AS $$
DECLARE
    v_old_depth  smallint;
    v_new_depth  smallint;
    v_delta      smallint;
BEGIN
    SELECT n.node_depth INTO v_old_depth
    FROM pmt_nodes n WHERE n.node_id = p_node_id;

    SELECT n.node_depth + 1 INTO v_new_depth
    FROM pmt_nodes n WHERE n.node_id = p_new_parent_id;

    v_delta := v_new_depth - v_old_depth;

    UPDATE pmt_nodes
    SET node_parent_id  = p_new_parent_id,
        node_depth      = v_new_depth,
        node_updated_at = now()
    WHERE node_id = p_node_id;

    IF v_delta <> 0 THEN
        UPDATE pmt_nodes
        SET node_depth      = node_depth + v_delta,
            node_updated_at = now()
        WHERE node_id IN (SELECT descendant_id FROM pmf_descendants(p_node_id));
    END IF;
END;
$$;


-- =====================================================================
-- SEED - Thai public holidays, 2026 (B.E. 2569)
--
-- Sourced from the published 2026 Thai public-holiday calendar, including
-- the Cabinet's special holiday on 2 January and the in-lieu days for
-- Visakha Bucha and 5 December.
--
-- Two caveats the operator must act on before relying on this:
--
--   1. VERIFY AGAINST THE ROYAL GAZETTE. Buddhist holidays follow the
--      lunar calendar and substitution days are announced separately;
--      the Cabinet also adds special holidays mid-year. This table is
--      data, not code, precisely so it can be corrected (D-41).
--   2. NOT INCLUDED: Chinese New Year (17 Feb) and End of Ramadan
--      (20 Mar). Those are bank or southern-province holidays, not
--      nationwide public holidays. Add them if this team observes them.
--
-- 2027 is not seeded because it had not been announced at the time of
-- writing. Adding a year is an INSERT, never a migration.
-- =====================================================================

INSERT INTO pmt_holidays (holiday_date, holiday_name) VALUES
    ('2026-01-01', 'New Year''s Day'),
    ('2026-01-02', 'New Year holiday (Cabinet special)'),
    ('2026-03-03', 'Makha Bucha Day'),
    ('2026-04-06', 'Chakri Memorial Day'),
    ('2026-04-13', 'Songkran'),
    ('2026-04-14', 'Songkran'),
    ('2026-04-15', 'Songkran'),
    ('2026-05-01', 'National Labour Day'),
    ('2026-05-04', 'Coronation Day'),
    ('2026-05-11', 'Royal Ploughing Ceremony Day'),
    ('2026-06-01', 'Visakha Bucha Day (in lieu of Sun 31 May)'),
    ('2026-06-03', 'HM Queen Suthida Birthday'),
    ('2026-07-28', 'HM King Vajiralongkorn Birthday'),
    ('2026-07-29', 'Asarnha Bucha Day'),
    ('2026-07-30', 'Buddhist Lent Day'),
    ('2026-08-12', 'HM Queen Mother Birthday'),
    ('2026-10-13', 'HM King Bhumibol Memorial Day'),
    ('2026-10-23', 'Chulalongkorn Day'),
    ('2026-12-07', 'HM King Bhumibol Birthday (in lieu of Sat 5 Dec)'),
    ('2026-12-10', 'Constitution Day'),
    ('2026-12-31', 'New Year''s Eve')
ON CONFLICT (holiday_date) DO NOTHING;

-- Project document containers (spec 10). Pages are a separate document tree.
CREATE TABLE pmt_docs (
    doc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_project_id uuid NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
    doc_title text NOT NULL CHECK (char_length(btrim(doc_title)) BETWEEN 1 AND 200),
    doc_version text NOT NULL DEFAULT '' CHECK (char_length(doc_version) <= 100),
    doc_created_by uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
    doc_archived_at timestamptz,
    doc_created_at timestamptz NOT NULL DEFAULT now(),
    doc_updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pmt_docs_project_idx ON pmt_docs(doc_project_id, doc_updated_at);

CREATE TABLE pmt_doc_pages (
  doc_page_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_page_doc_id uuid NOT NULL REFERENCES pmt_docs(doc_id) ON DELETE CASCADE,
  doc_page_parent_id uuid,
  doc_page_depth smallint NOT NULL CHECK (doc_page_depth BETWEEN 1 AND 3),
  doc_page_title text NOT NULL CHECK (char_length(btrim(doc_page_title)) BETWEEN 1 AND 200),
  doc_page_slug text NOT NULL UNIQUE,
  doc_page_template text NOT NULL CHECK (doc_page_template IN ('free', 'module')),
  doc_page_node_id uuid REFERENCES pmt_nodes(node_id) ON DELETE SET NULL,
  doc_page_content jsonb NOT NULL DEFAULT '{"body":""}',
  doc_page_sort_order double precision NOT NULL DEFAULT 0,
  doc_page_updated_by uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
  doc_page_updated_at timestamptz(3) NOT NULL DEFAULT now(),
  doc_page_archived_at timestamptz,
  UNIQUE (doc_page_id, doc_page_doc_id),
  FOREIGN KEY (doc_page_parent_id, doc_page_doc_id) REFERENCES pmt_doc_pages(doc_page_id, doc_page_doc_id) ON DELETE RESTRICT,
  CHECK (doc_page_parent_id IS DISTINCT FROM doc_page_id),
  CHECK (doc_page_template = 'module' OR doc_page_node_id IS NULL)
);
CREATE INDEX pmt_doc_pages_doc_idx ON pmt_doc_pages(doc_page_doc_id);
CREATE TABLE pmt_doc_page_revisions (
  revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_page_id uuid NOT NULL REFERENCES pmt_doc_pages(doc_page_id) ON DELETE CASCADE,
  revision_editor_id uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
  revision_content jsonb NOT NULL,
  revision_updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX pmt_doc_revisions_page_idx ON pmt_doc_page_revisions(revision_page_id, revision_updated_at);

CREATE TABLE pmt_doc_assets (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_project_id uuid NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
  asset_uploader_id uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
  asset_filename text NOT NULL,
  asset_mime text NOT NULL CHECK (asset_mime IN ('image/png','image/jpeg','image/webp','image/gif','image/svg+xml','application/octet-stream')),
  asset_bytes integer NOT NULL CHECK (asset_bytes BETWEEN 1 AND 5242880),
  asset_created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pmt_doc_pages ADD COLUMN doc_page_settings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE pmt_doc_pages ADD COLUMN doc_page_protected boolean NOT NULL DEFAULT false;
CREATE TABLE pmt_doc_comments (
  comment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_page_id uuid NOT NULL REFERENCES pmt_doc_pages(doc_page_id) ON DELETE CASCADE,
  comment_author_id uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL,
  comment_body text NOT NULL CHECK (char_length(btrim(comment_body)) BETWEEN 1 AND 10000),
  comment_quote text NOT NULL DEFAULT '',
  comment_resolved boolean NOT NULL DEFAULT false,
  comment_created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pmt_doc_comments_page_idx ON pmt_doc_comments(comment_page_id,comment_created_at);
ALTER TABLE pmt_doc_comments ADD COLUMN comment_parent_id uuid REFERENCES pmt_doc_comments(comment_id) ON DELETE SET NULL;
ALTER TABLE pmt_doc_comments ADD COLUMN comment_assignee_id uuid REFERENCES pmt_users(user_id) ON DELETE SET NULL;
CREATE TABLE pmt_doc_templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_project_id uuid NOT NULL REFERENCES pmt_projects(project_id) ON DELETE CASCADE,
  template_title text NOT NULL CHECK (char_length(btrim(template_title)) BETWEEN 1 AND 200),
  template_kind text NOT NULL CHECK (template_kind IN ('free','module')),
  template_content jsonb NOT NULL,
  template_created_at timestamptz NOT NULL DEFAULT now()
);
