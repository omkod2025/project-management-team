-- 003 — Budget Allocation is recorded in millions of baht
--
-- Migration 002 relabelled this field from USD to THB. The owner then
-- confirmed the amounts are millions: the stored `2.5` means 2.5 million baht,
-- not 2.5 baht.
--
-- Two ways to represent that, and the choice matters:
--
--   a) multiply every amount by 1,000,000 and keep the unit as THB;
--   b) leave the amounts alone and let the field declare its unit.
--
-- (b) is used here. Under (a) somebody typing `3` into the cell would store
-- three baht while meaning three million, and the mistake would look exactly
-- like a correct entry. Under (b) the number in the cell is the number the
-- person means, and the unit is the field's business.
--
-- `field_settings.currency` is therefore a display unit, not an ISO code. That
-- is stated in docs/spec/02-data-model.md rather than left to be inferred.
--
-- Idempotent, and a no-op where no such field exists.

UPDATE pmt_field_definitions
   SET field_settings = jsonb_set(field_settings, '{currency}', '"M฿"'),
       field_updated_at = now()
 WHERE field_name = 'Budget Allocation'
   AND field_settings ->> 'currency' = 'THB';

UPDATE pmt_nodes n
   SET node_custom_values = jsonb_set(
         n.node_custom_values,
         ARRAY[f.field_id::text, 'currency'],
         '"M฿"'
       ),
       node_updated_at = now()
  FROM pmt_field_definitions f
 WHERE f.field_project_id = n.node_project_id
   AND f.field_name = 'Budget Allocation'
   AND n.node_custom_values -> f.field_id::text ->> 'currency' = 'THB';
