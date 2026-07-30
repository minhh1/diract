-- Adds a "Receipts" ledger table to the Law Firm template catalog (payments
-- and waivers recorded against the operating/office account, as opposed to
-- Trust Transactions which is the trust-account ledger) -- plus a
-- waived_amount field on Invoices so a waiver actually reduces amount_due
-- everywhere (the invoice PDF's totals block, EditInvoiceModal's recompute).
--
-- Receipts is_ledger=true (see company_table_ledger.sql), same append-only/
-- gap-free/audited mechanism as Trust Transactions: each part-payment or
-- waiver against an invoice becomes one immutable row, atomically assigned a
-- consecutive "OA-" (operating account) receipt number by
-- insert_ledger_record() -- distinct from Trust Transactions' "TR-" trust
-- receipt numbers. Deliberately doesn't use the amount_in/amount_out/
-- running_balance field-key convention: this ledger has no per-matter trust
-- balance/overdraw concept, it's a flat log of receipts against invoices,
-- so those special columns are simply absent and insert_ledger_record()'s
-- balance logic no-ops (it only engages when both a matter and a
-- running_balance field exist).
--
-- After extending the catalog, upgrades every company that has already
-- installed this template (including Huynh Lawyers, the owner) via
-- upgrade_company_template() -- see supabase/template_marketplace_upgrade.sql
-- -- so this migration alone is what actually creates the live table/fields,
-- not just the catalog entry.
DO $$
DECLARE
  v_template_id uuid;
  v_invoices_table_id uuid;
  v_receipts_table_id uuid;
  v_install RECORD;
  v_member_id uuid;
BEGIN
  SELECT id INTO v_template_id FROM template_definitions WHERE name = 'Law Firm';
  IF v_template_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_invoices_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'invoices';

  -- ── Invoices: waived_amount ──────────────────────────────────────────
  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_display_field, display_order)
  SELECT v_invoices_table_id, 'waived_amount', 'Waived', 'currency', NULL::jsonb, NULL::text, NULL::text, 15
  WHERE v_invoices_table_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_invoices_table_id AND field_key = 'waived_amount'
  );
  UPDATE template_definition_table_fields SET display_order = 16
    WHERE template_table_id = v_invoices_table_id AND field_key = 'amount_due' AND display_order = 15;

  -- ── Receipts (operating account ledger) ──────────────────────────────
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger)
  SELECT v_template_id, 'receipts', 'Receipts', 'HandCoins', '#b45309', 'receipt_number', 6, true
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'receipts');

  SELECT id INTO v_receipts_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'receipts';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order, auto_number_prefix, help_text)
  SELECT v_receipts_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order, v.auto_number_prefix, v.help_text
  FROM (VALUES
    ('receipt_number',   'Receipt No.',       'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 0, 'OA-'::text, 'Assigned automatically in consecutive sequence -- operating account receipt number -- leave blank'::text),
    ('date',             'Date',              'date',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 1, NULL, NULL),
    ('invoice',          'Invoice',           'table_relation', NULL::jsonb, NULL::text, v_invoices_table_id, 'invoice_number', 2, NULL, NULL),
    ('matter',           'Matter',            'project',  NULL::jsonb, 'projects'::text, NULL::uuid,          'name'::text, 3, NULL, NULL),
    ('payor',            'Received From',     'entity',   NULL::jsonb, 'entities'::text, NULL::uuid,          'name'::text, 4, NULL, NULL),
    ('amount_received',  'Amount Received',   'currency', NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 5, NULL, NULL),
    ('payment_method',   'Payment Method',    'select',   to_jsonb(ARRAY['Cash','EFT','Cheque','Card','Other']), NULL::text, NULL::uuid, NULL::text, 6, NULL, NULL),
    ('bank_reference',   'Reference',         'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 7, NULL, 'Cheque number, EFT reference, or transaction ID'),
    ('waived_amount',    'Amount Waived',     'currency', NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 8, NULL, NULL),
    ('waived_reason',    'Waiver Reason',     'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 9, NULL, 'Required if an amount is waived'),
    ('received_by',      'Received By',       'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 10, NULL, NULL),
    ('balance_after',    'Balance Remaining', 'currency', NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 11, NULL, 'Invoice balance remaining after this receipt -- computed automatically')
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order, auto_number_prefix, help_text)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_receipts_table_id AND field_key = v.field_key
  );

  -- ── Roll out to every company that installed this template ───────────
  -- upgrade_company_template() checks auth.uid() is a member of the target
  -- company (it's a normal client-callable RPC, not migration-only) -- a
  -- migration has no request-scoped JWT, so auth.uid() is null here.
  -- Impersonating one real member (transaction-local, via request.jwt.claims)
  -- satisfies that check without weakening the function itself.
  FOR v_install IN SELECT company_id FROM company_template_installs WHERE template_id = v_template_id LOOP
    SELECT user_id INTO v_member_id FROM company_memberships WHERE company_id = v_install.company_id LIMIT 1;
    CONTINUE WHEN v_member_id IS NULL;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_id)::text, true);
    PERFORM upgrade_company_template(v_install.company_id, v_template_id);
  END LOOP;
END $$;
