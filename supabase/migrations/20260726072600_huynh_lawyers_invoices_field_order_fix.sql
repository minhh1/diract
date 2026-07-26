-- Discovered while verifying the previous GST rollup migration: Huynh
-- Lawyers' own Invoices table (unlike Law Firm QA Co's, and unlike the
-- template catalog) has `total_inc_gst` at display_order 5 -- BEFORE
-- subtotal (10) and gst (11), rather than after. Field order is not just
-- cosmetic here: recomputeRelatedRollups() (lib/services/customTableService.ts)
-- fetches a parent's fields ordered by display_order and evaluates
-- computeFormulaFields() as a single forward pass, so a field earlier in
-- that order reads its dependencies' STALE (last-saved) values, not the
-- freshly-recomputed ones a later field in the same pass would see.
-- total_inc_gst = subtotal + gst, both of which are also computed in this
-- same pass -- with total_inc_gst sitting first, it was silently computing
-- one recompute cycle behind subtotal/gst on every invoice save. Fixing
-- this now because it directly affects the correctness of the exact GST
-- chain this pass just reworked, on the one company (the user's own firm)
-- where it matters most.
UPDATE company_table_fields ctf
SET display_order = v.display_order
FROM company_tables ct, (VALUES
  ('invoice_number', 0), ('matter', 1), ('debtor', 2), ('issue_date', 3), ('due_date', 4),
  ('status', 5), ('period_start', 6), ('period_end', 7),
  ('fees_total', 8), ('disbursements_total', 9), ('fees_gst', 10), ('disbursements_gst', 11),
  ('subtotal', 12), ('gst', 13), ('total_inc_gst', 14),
  ('trust_applied', 15), ('payments', 16), ('amount_due', 17), ('template_id', 18)
) AS v(field_key, display_order)
WHERE ctf.table_id = ct.id AND ct.slug = 'invoices'
  AND (SELECT name FROM companies WHERE id = ct.company_id) = 'Huynh Lawyers'
  AND ctf.field_key = v.field_key AND ctf.deleted_at IS NULL;
