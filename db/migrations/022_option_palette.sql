-- The option palette (DESIGN.md § 9.2): status and select options take eight
-- colours of their own — red, yellow, sky, green, grey, dark grey, orange,
-- pink — apart from the six module hues. Existing indices 1..6 stay valid and
-- simply repaint; 7 and 8 become legal.

ALTER TABLE pmt_field_options
    DROP CONSTRAINT pmt_field_options_option_color_index_check,
    ADD  CONSTRAINT pmt_field_options_option_color_index_check
         CHECK (option_color_index BETWEEN 1 AND 8);

ALTER TABLE pmt_defect_field_options
    DROP CONSTRAINT pmt_defect_field_options_option_color_index_check,
    ADD  CONSTRAINT pmt_defect_field_options_option_color_index_check
         CHECK (option_color_index BETWEEN 1 AND 8);
