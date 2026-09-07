-- =====================================================================
-- Field Book — schema tests
--
--   psql -v ON_ERROR_STOP=1 -d fieldbook -f db/tests.sql
--
-- Runs inside a transaction and ROLLBACKs, so the database is unchanged.
-- Every check is an ASSERT: the script either prints PASS lines and rolls
-- back, or aborts on the first failure naming the expectation.
--
-- Calendar facts these tests rely on (Asia/Bangkok, 2026):
--   2026-09-01 is a Tuesday.  Weekends: 5-6, 12-13, 19-20, 26-27 Sep.
--   2026-04-13..15 are the seeded Songkran holidays; 11-12 Apr is a weekend.
-- =====================================================================

BEGIN;

\set QUIET on
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- A. Working-day predicate                                        (D-40)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    ASSERT pmf_is_workday('2026-09-07'),        'Monday is a working day';
    ASSERT pmf_is_workday('2026-09-11'),        'Friday is a working day';
    ASSERT NOT pmf_is_workday('2026-09-05'),    'Saturday is not';
    ASSERT NOT pmf_is_workday('2026-09-06'),    'Sunday is not';
    ASSERT NOT pmf_is_workday('2026-04-13'),    'a seeded holiday is not';
    ASSERT pmf_is_workday(NULL) IS NOT TRUE,    'NULL is not a working day';
    RAISE NOTICE 'PASS  A  pmf_is_workday';
END $$;

-- ---------------------------------------------------------------------
-- B. Forward snapping                                             (D-15)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    ASSERT pmf_next_workday('2026-09-07') = '2026-09-07',
        'an already-working day snaps to itself';
    ASSERT pmf_next_workday('2026-09-05') = '2026-09-07',
        'Saturday snaps forward to Monday';
    ASSERT pmf_next_workday('2026-09-06') = '2026-09-07',
        'Sunday snaps forward to Monday';
    -- Sat 11, Sun 12, Songkran 13-15, so the answer is Thursday 16.
    ASSERT pmf_next_workday('2026-04-11') = '2026-04-16',
        'a weekend plus a holiday run snaps past all of it';
    RAISE NOTICE 'PASS  B  pmf_next_workday';
END $$;

-- ---------------------------------------------------------------------
-- C. Inclusive duration                                           (D-43)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    ASSERT pmf_duration_workdays('2026-09-07','2026-09-07') = 1,
        'a single working day has duration 1';
    ASSERT pmf_duration_workdays('2026-09-07','2026-09-11') = 5,
        'Monday to Friday is 5';
    ASSERT pmf_duration_workdays('2026-09-07','2026-09-14') = 6,
        'Monday to the following Monday is 6, the weekend excluded';
    ASSERT pmf_duration_workdays('2026-09-05','2026-09-06') = 0,
        'a weekend-only range has duration 0';
    ASSERT pmf_duration_workdays('2026-09-11','2026-09-07') = 0,
        'an inverted range is 0, not negative';
    ASSERT pmf_duration_workdays(NULL,'2026-09-07') = 0,
        'a NULL operand yields 0';
    RAISE NOTICE 'PASS  C  pmf_duration_workdays';
END $$;

-- ---------------------------------------------------------------------
-- D. Signed distance — the misclosure primitive                   (D-23)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    ASSERT pmf_workdays_between('2026-09-07','2026-09-11') = 4,
        'exclusive of the start, inclusive of the end';
    ASSERT pmf_workdays_between('2026-09-11','2026-09-07') = -4,
        'the reverse direction is the negation';
    ASSERT pmf_workdays_between('2026-09-07','2026-09-07') = 0,
        'the same day is zero';
    ASSERT pmf_workdays_between('2026-09-11','2026-09-14') = 1,
        'Friday to Monday is one working day, not three';
    ASSERT pmf_workdays_between(NULL,'2026-09-07') IS NULL,
        'a NULL operand yields NULL, not 0';
    RAISE NOTICE 'PASS  D  pmf_workdays_between';
END $$;

-- ---------------------------------------------------------------------
-- Fixture: one project, one module, two tasks, one subtask
-- ---------------------------------------------------------------------
INSERT INTO pmt_projects (project_id, project_name, project_slug)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test', 'test');

INSERT INTO pmt_nodes
    (node_id, node_project_id, node_parent_id, node_depth, node_name,
     node_estimate_start, node_estimate_end, node_actual_start, node_actual_end)
VALUES
    -- project: baseline to the end of September
    ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
      NULL, 1, 'Test project', '2026-09-01','2026-09-30', NULL, NULL),
    -- module: baseline to the 18th — its children will overrun it
    ('a0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
     'a0000000-0000-0000-0000-000000000001', 2, 'Web Report', '2026-09-01','2026-09-18', NULL, NULL),
    -- task 1: estimated to the 10th, actually ran to the 14th
    ('a0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111',
     'a0000000-0000-0000-0000-000000000002', 3, 'Build API', '2026-09-01','2026-09-10','2026-09-01','2026-09-14'),
    -- task 2: estimated past the module baseline
    ('a0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111',
     'a0000000-0000-0000-0000-000000000002', 3, 'Report UI', '2026-09-11','2026-09-22', NULL, NULL),
    -- subtask of task 1
    ('a0000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111',
     'a0000000-0000-0000-0000-000000000003', 4, 'Endpoint', '2026-09-01','2026-09-04', NULL, NULL);

-- ---------------------------------------------------------------------
-- E. Descendant walk                                               (D-20)
-- ---------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n FROM pmf_descendants('a0000000-0000-0000-0000-000000000002');
    ASSERT n = 3, format('module has 3 descendants at any depth, got %s', n);

    SELECT count(*) INTO n FROM pmf_descendants('a0000000-0000-0000-0000-000000000001');
    ASSERT n = 4, format('project has 4 descendants, got %s', n);

    SELECT count(*) INTO n FROM pmf_descendants('a0000000-0000-0000-0000-000000000005');
    ASSERT n = 0, format('a leaf has none, got %s', n);
    RAISE NOTICE 'PASS  E  pmf_descendants';
END $$;

-- ---------------------------------------------------------------------
-- F. Roll-up and closure                                    (D-20, D-22)
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM pmf_rollup('a0000000-0000-0000-0000-000000000002');

    ASSERT r.rollup_estimate_start = '2026-09-01', 'roll-up start is the earliest child';
    ASSERT r.rollup_estimate_end   = '2026-09-22', 'roll-up end is the latest child';
    ASSERT r.rollup_actual_end     = '2026-09-14', 'actual roll-up ignores NULL children';
    ASSERT r.rollup_out_of_closure, 'children past the baseline put the module out of closure';
    -- 18 Sep is a Friday; 19-20 is the weekend; so 21 and 22 are the overrun.
    ASSERT r.rollup_overrun_days = 2,
        format('overrun is 2 working days, got %s', r.rollup_overrun_days);
    ASSERT r.rollup_early_start_days = 0, 'no child starts before the baseline';

    -- A parent whose children sit inside its baseline is closed.
    SELECT * INTO r FROM pmf_rollup('a0000000-0000-0000-0000-000000000003');
    ASSERT NOT r.rollup_out_of_closure, 'the task contains its own subtask';
    RAISE NOTICE 'PASS  F  pmf_rollup';
END $$;

-- ---------------------------------------------------------------------
-- G. Misclosure of a leaf                                          (D-23)
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM pmf_misclosure('a0000000-0000-0000-0000-000000000003');
    ASSERT r.misclosure_start = 0, 'started on plan';
    -- estimated Thu 10th, actual Mon 14th: Fri 11 and Mon 14 = 2 working days late.
    ASSERT r.misclosure_end = 2, format('2 working days late, got %s', r.misclosure_end);

    SELECT * INTO r FROM pmf_misclosure('a0000000-0000-0000-0000-000000000004');
    ASSERT r.misclosure_end IS NULL, 'no actual means no misclosure, not zero';
    RAISE NOTICE 'PASS  G  pmf_misclosure';
END $$;

-- ---------------------------------------------------------------------
-- H. The ledger read
-- ---------------------------------------------------------------------
DO $$
DECLARE n integer; r record;
BEGIN
    SELECT count(*) INTO n
    FROM pmf_project_ledger('11111111-1111-1111-1111-111111111111');
    ASSERT n = 5, format('one row per live node, got %s', n);

    SELECT * INTO r
    FROM pmf_project_ledger('11111111-1111-1111-1111-111111111111')
    WHERE led_node_id = 'a0000000-0000-0000-0000-000000000002';

    -- the set-based ledger must agree with the per-node function
    ASSERT r.led_rollup_est_end = '2026-09-22', 'ledger roll-up matches pmf_rollup';
    ASSERT r.led_out_of_closure,               'ledger closure matches pmf_rollup';

    SELECT * INTO r
    FROM pmf_project_ledger('11111111-1111-1111-1111-111111111111')
    WHERE led_node_id = 'a0000000-0000-0000-0000-000000000003';
    ASSERT r.led_estimate_workdays = 8,  format('1-10 Sep is 8 working days, got %s', r.led_estimate_workdays);
    ASSERT r.led_actual_workdays   = 10, format('1-14 Sep is 10 working days, got %s', r.led_actual_workdays);
    ASSERT r.led_misclosure_end    = 2,  'ledger misclosure matches pmf_misclosure';
    RAISE NOTICE 'PASS  H  pmf_project_ledger';
END $$;

-- ---------------------------------------------------------------------
-- I. Constraints                                            (D-11, D-1)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO pmt_nodes (node_project_id, node_depth, node_name,
                               node_estimate_start, node_estimate_end)
        VALUES ('11111111-1111-1111-1111-111111111111', 1, 'inverted',
                '2026-09-10','2026-09-01');
        ASSERT false, 'an inverted estimate range must be rejected';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO pmt_nodes (node_project_id, node_parent_id, node_depth, node_name)
        VALUES ('11111111-1111-1111-1111-111111111111', NULL, 3, 'orphan');
        ASSERT false, 'a non-root node without a parent must be rejected';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO pmt_nodes (node_project_id, node_parent_id, node_depth, node_name)
        VALUES ('11111111-1111-1111-1111-111111111111',
                'a0000000-0000-0000-0000-000000000005', 7, 'too deep');
        ASSERT false, 'depth 7 must be rejected by the CHECK';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    RAISE NOTICE 'PASS  I  constraints';
END $$;

-- ---------------------------------------------------------------------
-- J. Subtree move                                                   (D-3)
-- ---------------------------------------------------------------------
DO $$
DECLARE d_task smallint; d_sub smallint;
BEGIN
    -- promote the task from under the module to directly under the project
    CALL pmp_move_subtree('a0000000-0000-0000-0000-000000000003',
                          'a0000000-0000-0000-0000-000000000001');

    SELECT node_depth INTO d_task FROM pmt_nodes
     WHERE node_id = 'a0000000-0000-0000-0000-000000000003';
    SELECT node_depth INTO d_sub  FROM pmt_nodes
     WHERE node_id = 'a0000000-0000-0000-0000-000000000005';

    ASSERT d_task = 2, format('moved node takes the new depth, got %s', d_task);
    ASSERT d_sub  = 3, format('its descendant shifts with it, got %s', d_sub);
    RAISE NOTICE 'PASS  J  pmp_move_subtree';
END $$;

-- put it back so the next test reads the original shape
CALL pmp_move_subtree('a0000000-0000-0000-0000-000000000003',
                      'a0000000-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------------
-- K. Archive and restore                                            (D-4)
-- ---------------------------------------------------------------------
DO $$
DECLARE n integer; r record;
BEGIN
    CALL pmp_archive_subtree('a0000000-0000-0000-0000-000000000003');

    SELECT count(*) INTO n FROM pmt_nodes
     WHERE node_archived_at IS NOT NULL;
    ASSERT n = 2, format('the task and its subtask are archived, got %s', n);

    -- archived nodes leave the roll-up, so the module's actual end disappears
    SELECT * INTO r FROM pmf_rollup('a0000000-0000-0000-0000-000000000002');
    ASSERT r.rollup_actual_end IS NULL,
        'an archived child no longer contributes to the roll-up';
    ASSERT r.rollup_estimate_end = '2026-09-22',
        'the surviving child still does';

    SELECT count(*) INTO n
      FROM pmf_project_ledger('11111111-1111-1111-1111-111111111111');
    ASSERT n = 3, format('the ledger excludes archived nodes, got %s', n);

    CALL pmp_restore_subtree('a0000000-0000-0000-0000-000000000003');
    SELECT count(*) INTO n FROM pmt_nodes WHERE node_archived_at IS NOT NULL;
    ASSERT n = 0, format('restore is a clean round trip, got %s', n);
    RAISE NOTICE 'PASS  K  archive / restore';
END $$;

-- ---------------------------------------------------------------------
-- L. Custom values in jsonb                                        (D-32)
-- ---------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
    UPDATE pmt_nodes
       SET node_custom_values = '{"fld_status":"opt_run","fld_budget":{"amount":50000,"currency":"THB"}}'
     WHERE node_id = 'a0000000-0000-0000-0000-000000000003';

    SELECT count(*) INTO n FROM pmt_nodes
     WHERE node_custom_values @> '{"fld_status":"opt_run"}';
    ASSERT n = 1, format('containment lookup finds the row, got %s', n);

    SELECT count(*) INTO n FROM pmt_nodes
     WHERE node_custom_values #>> '{fld_budget,amount}' = '50000';
    ASSERT n = 1, 'nested extraction works';
    RAISE NOTICE 'PASS  L  jsonb custom values';
END $$;

-- ---------------------------------------------------------------------
-- M. The rule the product exists for                        (D-10, D-21)
-- ---------------------------------------------------------------------
DO $$
DECLARE est_s date; est_e date; par_s date; par_e date;
BEGIN
    -- writing an actual must not disturb the estimate on the same row
    UPDATE pmt_nodes SET node_actual_end = '2026-09-25'
     WHERE node_id = 'a0000000-0000-0000-0000-000000000003';
    SELECT node_estimate_start, node_estimate_end INTO est_s, est_e
      FROM pmt_nodes WHERE node_id = 'a0000000-0000-0000-0000-000000000003';
    ASSERT est_s = '2026-09-01' AND est_e = '2026-09-10',
        'writing an actual left the estimate untouched';

    -- and must not disturb the parent's baseline either
    SELECT node_estimate_start, node_estimate_end INTO par_s, par_e
      FROM pmt_nodes WHERE node_id = 'a0000000-0000-0000-0000-000000000002';
    ASSERT par_s = '2026-09-01' AND par_e = '2026-09-18',
        'the parent baseline is never recomputed from a child';
    RAISE NOTICE 'PASS  M  estimate and actual stay independent';
END $$;

-- ---------------------------------------------------------------------
-- N. Progress is counted from the status column                    (Q3)
-- ---------------------------------------------------------------------
DO $$
DECLARE r record; f uuid; o_done uuid; o_open uuid;
BEGIN
    -- a status column with one finished option and one unfinished one
    INSERT INTO pmt_field_definitions (field_project_id, field_name, field_kind, field_position)
    VALUES ('11111111-1111-1111-1111-111111111111', 'Status', 'select', 0)
    RETURNING field_id INTO f;

    INSERT INTO pmt_field_options (option_field_id, option_label, option_stage, option_position)
    VALUES (f, 'DONE', 'done', 0) RETURNING option_id INTO o_done;
    INSERT INTO pmt_field_options (option_field_id, option_label, option_stage, option_position)
    VALUES (f, 'OPEN', 'inProgress', 1) RETURNING option_id INTO o_open;

    UPDATE pmt_projects SET project_status_field_id = f
     WHERE project_id = '11111111-1111-1111-1111-111111111111';

    -- one child finished, one not
    UPDATE pmt_nodes SET node_custom_values = jsonb_build_object(f::text, o_done::text)
     WHERE node_id = 'a0000000-0000-0000-0000-000000000003';
    UPDATE pmt_nodes SET node_custom_values = jsonb_build_object(f::text, o_open::text)
     WHERE node_id = 'a0000000-0000-0000-0000-000000000004';

    SELECT * INTO r FROM pmf_project_ledger('11111111-1111-1111-1111-111111111111')
     WHERE led_node_id = 'a0000000-0000-0000-0000-000000000002';

    ASSERT r.led_descendant_count = 3, format('the module has 3 descendants, got %s', r.led_descendant_count);
    ASSERT r.led_closed_count = 1, format('one of them is closed, got %s', r.led_closed_count);

    -- a leaf reports zero of zero, so a caller can tell it apart from a
    -- parent with nothing finished
    SELECT * INTO r FROM pmf_project_ledger('11111111-1111-1111-1111-111111111111')
     WHERE led_node_id = 'a0000000-0000-0000-0000-000000000005';
    ASSERT r.led_descendant_count = 0 AND r.led_closed_count = 0, 'a leaf counts nothing';

    -- an archived child leaves the count, like everything else (D-4)
    CALL pmp_archive_subtree('a0000000-0000-0000-0000-000000000003');
    SELECT * INTO r FROM pmf_project_ledger('11111111-1111-1111-1111-111111111111')
     WHERE led_node_id = 'a0000000-0000-0000-0000-000000000002';
    ASSERT r.led_closed_count = 0, 'the archived child stopped counting';
    ASSERT r.led_descendant_count = 1, format('and left the total, got %s', r.led_descendant_count);

    RAISE NOTICE 'PASS  N  progress counted from status';
END $$;

ROLLBACK;

\echo ''
\echo 'All checks passed. Database unchanged (transaction rolled back).'
