-- Soft-deleting a field goes through trg_prevent_non_admin_delete (see
-- prevent_non_admin_delete()), which only allows deleted_at to change for
-- 'service_role' or a real company-admin auth.uid() session -- neither is
-- present when running raw SQL through the CLI, so impersonate service_role
-- for this migration exactly as the app's own service-role routes would.
SET request.jwt.claim.role = 'service_role';

-- GST redesign, part 1: per-line GST status + a frozen per-line GST amount
-- on both fee-source tables (Time & Fee Entries, Disbursements). See
-- CreateInvoiceModal.tsx's splitGst() for how these two combine at
-- invoice-creation time -- gst_status decides how a line's `amount` splits
-- into ex-GST/GST portions, invoiced_gst_amount freezes that GST portion
-- (a plain field, not a formula -- mirrors invoiced_amount exactly, see
-- supabase/invoiced_amount_field.sql) so fees_gst/disbursements_gst
-- (added in the next migration) can sum_related it onto the invoice.

-- Disbursements' `gst_inclusive` boolean is dead (confirmed unreferenced by
-- any app code) and is replaced by the 3-way gst_status select below --
-- soft-delete it rather than repurpose it, matching this schema's existing
-- soft-delete convention for retired fields.
UPDATE company_table_fields ctf
SET deleted_at = now()
FROM company_tables ct
WHERE ctf.table_id = ct.id AND ct.slug = 'disbursements' AND ctf.field_key = 'gst_inclusive' AND ctf.deleted_at IS NULL;

-- Huynh Lawyers' Time & Fee Entries table also carries two stray,
-- schema-editor-experiment fields (a duplicate "Amount" and a "GST" that's
-- 10% of that duplicate) confirmed unreferenced by any app code, sitting at
-- the same display_order as the real Amount field -- clean them up here so
-- they don't visually collide with the new canonical gst_status field.
UPDATE company_table_fields
SET deleted_at = now()
WHERE id IN ('5ff6a29c-dd02-4a2e-8725-1f135d916685', 'd5c1d825-a2a9-440a-a725-6d3c48a4c3e6') AND deleted_at IS NULL;

-- gst_status (both companies' Time & Fee Entries + Disbursements copies).
INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, select_options, is_required, show_in_table, display_order, default_value)
SELECT ct.company_id, ct.id, 'gst_status', 'GST Status', 'select', '["GST Exclusive","GST Free","GST Inclusive"]'::jsonb,
  false, true,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM company_table_fields WHERE table_id = ct.id AND deleted_at IS NULL),
  'GST Exclusive'
FROM company_tables ct
WHERE ct.slug IN ('time-fee-entries', 'disbursements') AND ct.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = ct.id AND x.field_key = 'gst_status' AND x.deleted_at IS NULL);

-- invoiced_gst_amount (both companies) -- run as its own INSERT so its
-- MAX(display_order) subquery picks up gst_status just inserted above.
INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, show_in_table, display_order)
SELECT ct.company_id, ct.id, 'invoiced_gst_amount', 'Invoiced GST Amount', 'currency', true,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM company_table_fields WHERE table_id = ct.id AND deleted_at IS NULL)
FROM company_tables ct
WHERE ct.slug IN ('time-fee-entries', 'disbursements') AND ct.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = ct.id AND x.field_key = 'invoiced_gst_amount' AND x.deleted_at IS NULL);

-- Mirror both new fields onto the marketplace catalog too (see
-- 20260726070900_template_definition_table_fields_extend.sql for why this
-- matters -- otherwise a brand-new install of the Law Firm template would
-- start without them), and retire the catalog's own gst_inclusive (the
-- catalog has no soft-delete column, so this is a real DELETE).
DELETE FROM template_definition_table_fields tdf
USING template_definition_tables tt
WHERE tdf.template_table_id = tt.id AND tt.slug = 'disbursements' AND tdf.field_key = 'gst_inclusive';

INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, select_options, is_required, show_in_table, display_order, default_value)
SELECT tt.id, 'gst_status', 'GST Status', 'select', '["GST Exclusive","GST Free","GST Inclusive"]'::jsonb,
  false, true,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM template_definition_table_fields WHERE template_table_id = tt.id),
  'GST Exclusive'
FROM template_definition_tables tt
WHERE tt.slug IN ('time-fee-entries', 'disbursements')
  AND NOT EXISTS (SELECT 1 FROM template_definition_table_fields x WHERE x.template_table_id = tt.id AND x.field_key = 'gst_status');

INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, show_in_table, display_order)
SELECT tt.id, 'invoiced_gst_amount', 'Invoiced GST Amount', 'currency', true,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM template_definition_table_fields WHERE template_table_id = tt.id)
FROM template_definition_tables tt
WHERE tt.slug IN ('time-fee-entries', 'disbursements')
  AND NOT EXISTS (SELECT 1 FROM template_definition_table_fields x WHERE x.template_table_id = tt.id AND x.field_key = 'invoiced_gst_amount');
