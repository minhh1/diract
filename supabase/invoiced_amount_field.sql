-- Adds an `invoiced_amount` field to Time & Fee Entries and Disbursements,
-- and repoints the Invoices table's fees_total/disbursements_total
-- sum_related formulas to sum THAT instead of `amount`. `amount` stays the
-- live formula (rate x duration_hours / rate x quantity) that changes if
-- someone edits an entry later; `invoiced_amount` is the frozen, apportioned
-- value CreateInvoiceModal writes once at invoice creation -- see
-- recomputeRelatedRollups in lib/services/customTableService.ts, which
-- already recomputes the invoice's total automatically whenever
-- invoiced_amount changes on a linked entry (keyed on formula_field_a_id +
-- formula_relation_field_id), so no new aggregation code is needed, just
-- this field + repoint. Idempotent -- guarded by natural-key existence
-- checks, safe to re-run.
DO $$
DECLARE
  r RECORD;
  v_field_id uuid;
BEGIN
  FOR r IN
    SELECT
      ct_line.id AS line_table_id, ct_line.company_id,
      ct_inv.id AS invoices_table_id,
      CASE ct_line.slug WHEN 'time-fee-entries' THEN 'fees_total' ELSE 'disbursements_total' END AS invoice_field_key
    FROM company_tables ct_line
    JOIN company_tables ct_inv
      ON ct_inv.company_id = ct_line.company_id AND ct_inv.slug = 'invoices' AND ct_inv.deleted_at IS NULL
    WHERE ct_line.slug IN ('time-fee-entries', 'disbursements') AND ct_line.deleted_at IS NULL
  LOOP
    -- Add invoiced_amount if this table doesn't already have it.
    SELECT id INTO v_field_id FROM company_table_fields
      WHERE table_id = r.line_table_id AND field_key = 'invoiced_amount' AND deleted_at IS NULL;

    IF v_field_id IS NULL THEN
      INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, display_order)
      SELECT r.company_id, r.line_table_id, 'invoiced_amount', 'Invoiced Amount', 'currency',
        COALESCE((SELECT MAX(display_order) + 1 FROM company_table_fields WHERE table_id = r.line_table_id), 0)
      RETURNING id INTO v_field_id;
    END IF;

    -- Repoint the matching invoice total's formula_field_a_id to it.
    UPDATE company_table_fields
      SET formula_field_a_id = v_field_id
      WHERE table_id = r.invoices_table_id AND field_key = r.invoice_field_key
        AND formula_type = 'sum_related' AND formula_field_a_id IS DISTINCT FROM v_field_id;
  END LOOP;
END $$;

-- Catalog (template_definition_*) -- so future installs get invoiced_amount
-- and the correct formula target from the start, not just already-installed
-- companies. Guarded the same way the seed file itself guards inserts.
DO $$
DECLARE
  v_timefees_table_id uuid;
  v_disb_table_id uuid;
BEGIN
  SELECT id INTO v_timefees_table_id FROM template_definition_tables WHERE slug = 'time-fee-entries';
  SELECT id INTO v_disb_table_id FROM template_definition_tables WHERE slug = 'disbursements';

  IF v_timefees_table_id IS NOT NULL THEN
    INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, display_order)
    SELECT v_timefees_table_id, 'invoiced_amount', 'Invoiced Amount', 'currency',
      COALESCE((SELECT MAX(display_order) + 1 FROM template_definition_table_fields WHERE template_table_id = v_timefees_table_id), 0)
    WHERE NOT EXISTS (
      SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_timefees_table_id AND field_key = 'invoiced_amount'
    );
  END IF;

  IF v_disb_table_id IS NOT NULL THEN
    INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, display_order)
    SELECT v_disb_table_id, 'invoiced_amount', 'Invoiced Amount', 'currency',
      COALESCE((SELECT MAX(display_order) + 1 FROM template_definition_table_fields WHERE template_table_id = v_disb_table_id), 0)
    WHERE NOT EXISTS (
      SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_disb_table_id AND field_key = 'invoiced_amount'
    );
  END IF;

  UPDATE template_definition_table_fields SET formula_field_a_key = 'invoiced_amount'
    WHERE field_key = 'fees_total' AND formula_type = 'sum_related' AND formula_field_a_key = 'amount';
  UPDATE template_definition_table_fields SET formula_field_a_key = 'invoiced_amount'
    WHERE field_key = 'disbursements_total' AND formula_type = 'sum_related' AND formula_field_a_key = 'amount';
END $$;
