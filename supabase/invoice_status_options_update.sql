-- Invoice status vocabulary: Under Review, Sent, Paid, Overdue, Void
-- (was Draft, Under Review, Sent, Paid, Overdue) -- drops Draft as its own
-- state since Under Review already serves that pre-issue role, and adds
-- Void (voiding an invoice releases its line items back to unbilled -- see
-- InvoicesTab.tsx's void action). Deliberately a separate migration from
-- supabase/template_law_firm_seed.sql (which has unrelated content actively
-- changing) rather than editing that file in place -- same "never touch an
-- installed company's copy from the seed file itself" convention as
-- supabase/trust_reporting_widgets_backfill.sql.
UPDATE company_table_fields SET select_options = '["Under Review","Sent","Paid","Overdue","Void"]'::jsonb
  WHERE field_key = 'status'
    AND table_id IN (SELECT id FROM company_tables WHERE slug = 'invoices' AND deleted_at IS NULL);

UPDATE template_definition_table_fields SET select_options = '["Under Review","Sent","Paid","Overdue","Void"]'::jsonb
  WHERE field_key = 'status'
    AND template_table_id IN (SELECT id FROM template_definition_tables WHERE slug = 'invoices');
