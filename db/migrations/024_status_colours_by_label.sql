-- Owner, 2026-11-05: a status reads by the same colour in every project. A
-- project set up while the option wheel had six colours still holds the slots
-- it was dealt then — RE_PROCESS on 1 (red, like BACKLOG), RETEST on 2 (yellow,
-- like ONPROCESS), CANCELLED and HOLD swapped. This repaints the designated
-- status field's options by label to the new-project defaults
-- (admin-rules DEFAULT_STATUS_OPTIONS, DESIGN.md § 9.2). Colour only: no
-- option is added, removed, renamed or re-staged, and other select fields
-- keep their colours.

WITH palette(label, slot) AS (VALUES
    ('BACKLOG', 1), ('ONPROCESS', 2), ('WAIT_TEST', 3), ('COMPLETED', 4),
    ('HOLD', 5), ('CANCELLED', 6), ('CANCEL', 6), ('RE_PROCESS', 7), ('RETEST', 8))
UPDATE pmt_field_options o
   SET option_color_index = p.slot
  FROM palette p, pmt_projects pr
 WHERE pr.project_status_field_id = o.option_field_id
   AND upper(btrim(o.option_label)) = p.label
   AND o.option_color_index <> p.slot;

WITH palette(label, slot) AS (VALUES
    ('BACKLOG', 1), ('ONPROCESS', 2), ('WAIT_TEST', 3), ('COMPLETED', 4),
    ('HOLD', 5), ('CANCELLED', 6), ('CANCEL', 6), ('RE_PROCESS', 7), ('RETEST', 8))
UPDATE pmt_defect_field_options o
   SET option_color_index = p.slot
  FROM palette p, pmt_defect_settings s
 WHERE s.defect_status_field_id = o.option_field_id
   AND upper(btrim(o.option_label)) = p.label
   AND o.option_color_index <> p.slot;
