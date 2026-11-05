-- Owner, 2026-11-05: COMPLETED is green in every project, and CANCEL — ended,
-- not done — is dark grey, so the two never share a colour. Slots are the
-- option palette (DESIGN.md § 9.2): 4 green, 6 dark grey. Labels are matched
-- as written by the default status column (admin-rules DEFAULT_STATUS_OPTIONS);
-- CANCELLED and other look-alikes are left as their owners set them.

UPDATE pmt_field_options
   SET option_color_index = 4
 WHERE upper(btrim(option_label)) = 'COMPLETED' AND option_color_index <> 4;

UPDATE pmt_field_options
   SET option_color_index = 6
 WHERE upper(btrim(option_label)) = 'CANCEL' AND option_color_index <> 6;

UPDATE pmt_defect_field_options
   SET option_color_index = 4
 WHERE upper(btrim(option_label)) = 'COMPLETED' AND option_color_index <> 4;

UPDATE pmt_defect_field_options
   SET option_color_index = 6
 WHERE upper(btrim(option_label)) = 'CANCEL' AND option_color_index <> 6;
