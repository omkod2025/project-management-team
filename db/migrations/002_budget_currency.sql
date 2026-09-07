-- 002 — Budget Allocation is Thai baht, not US dollars
--
-- ClickUp had the field's `currency_type` set to USD, which is its default and
-- was never changed. The import carried that through faithfully rather than
-- guessing (spec 06 §3.2). The owner confirmed on 2026-09-07 that the amounts
-- are baht.
--
-- Only the label changes. The stored amounts are untouched: they were always
-- the same numbers, described wrongly.
--
-- Idempotent: safe to run against a database that has already been corrected,
-- and a no-op where no such field exists.

-- The field's own setting, which is what new values inherit.
UPDATE pmt_field_definitions
   SET field_settings = jsonb_set(field_settings, '{currency}', '"THB"'),
       field_updated_at = now()
 WHERE field_name = 'Budget Allocation'
   AND field_settings ->> 'currency' = 'USD';

-- The values already stored. Each is {"amount": n, "currency": "USD"} and
-- keeps its amount; only the currency is relabelled.
UPDATE pmt_nodes n
   SET node_custom_values = jsonb_set(
         n.node_custom_values,
         ARRAY[f.field_id::text, 'currency'],
         '"THB"'
       ),
       node_updated_at = now()
  FROM pmt_field_definitions f
 WHERE f.field_project_id = n.node_project_id
   AND f.field_name = 'Budget Allocation'
   AND n.node_custom_values -> f.field_id::text ->> 'currency' = 'USD';
