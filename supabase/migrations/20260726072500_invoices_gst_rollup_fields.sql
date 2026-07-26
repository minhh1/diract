-- GST redesign, part 2: replace the invoice's flat 10%-of-subtotal `gst`
-- formula with two new sum_related rollups (fees_gst, disbursements_gst,
-- summing the invoiced_gst_amount fields added in the previous migration)
-- and repoint `gst` to add them. subtotal/total_inc_gst are unchanged --
-- fees_total/disbursements_total already sum each line's ex-GST amount
-- (invoiced_amount), so subtotal was already correct; only gst was ever
-- assuming every line was GST Exclusive at a flat 10%.

-- fees_gst
INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, show_in_table, display_order, formula_type, formula_field_a_id, formula_relation_field_id)
SELECT inv.company_id, inv.id, 'fees_gst', 'Fees GST', 'currency', false,
  (SELECT display_order FROM company_table_fields WHERE table_id = inv.id AND field_key = 'disbursements_total' AND deleted_at IS NULL),
  'sum_related',
  (SELECT id FROM company_table_fields WHERE table_id = fee.id AND field_key = 'invoiced_gst_amount' AND deleted_at IS NULL),
  (SELECT id FROM company_table_fields WHERE table_id = fee.id AND field_key = 'invoice' AND deleted_at IS NULL)
FROM company_tables inv
JOIN company_tables fee ON fee.company_id = inv.company_id AND fee.slug = 'time-fee-entries' AND fee.deleted_at IS NULL
WHERE inv.slug = 'invoices' AND inv.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = inv.id AND x.field_key = 'fees_gst' AND x.deleted_at IS NULL);

-- disbursements_gst
INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, show_in_table, display_order, formula_type, formula_field_a_id, formula_relation_field_id)
SELECT inv.company_id, inv.id, 'disbursements_gst', 'Disbursements GST', 'currency', false,
  (SELECT display_order FROM company_table_fields WHERE table_id = inv.id AND field_key = 'disbursements_total' AND deleted_at IS NULL),
  'sum_related',
  (SELECT id FROM company_table_fields WHERE table_id = disb.id AND field_key = 'invoiced_gst_amount' AND deleted_at IS NULL),
  (SELECT id FROM company_table_fields WHERE table_id = disb.id AND field_key = 'invoice' AND deleted_at IS NULL)
FROM company_tables inv
JOIN company_tables disb ON disb.company_id = inv.company_id AND disb.slug = 'disbursements' AND disb.deleted_at IS NULL
WHERE inv.slug = 'invoices' AND inv.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = inv.id AND x.field_key = 'disbursements_gst' AND x.deleted_at IS NULL);

-- gst: percentage_of(subtotal, 10%) -> add(fees_gst, disbursements_gst)
UPDATE company_table_fields gst
SET formula_type = 'add', formula_percent = NULL,
    formula_field_a_id = (SELECT id FROM company_table_fields WHERE table_id = gst.table_id AND field_key = 'fees_gst' AND deleted_at IS NULL),
    formula_field_b_id = (SELECT id FROM company_table_fields WHERE table_id = gst.table_id AND field_key = 'disbursements_gst' AND deleted_at IS NULL)
FROM company_tables ct
WHERE gst.table_id = ct.id AND ct.slug = 'invoices' AND ct.deleted_at IS NULL AND gst.field_key = 'gst' AND gst.deleted_at IS NULL;

-- Mirror onto the marketplace catalog (formula_field_a_key/b_key/formula_relation_field_key,
-- not ids -- install_company_template resolves these by key at install time).
INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, show_in_table, display_order, formula_type, formula_field_a_key, formula_related_table_slug, formula_relation_field_key)
SELECT inv.id, 'fees_gst', 'Fees GST', 'currency', false,
  (SELECT display_order FROM template_definition_table_fields WHERE template_table_id = inv.id AND field_key = 'disbursements_total'),
  'sum_related', 'invoiced_gst_amount', 'time-fee-entries', 'invoice'
FROM template_definition_tables inv
WHERE inv.slug = 'invoices'
  AND NOT EXISTS (SELECT 1 FROM template_definition_table_fields x WHERE x.template_table_id = inv.id AND x.field_key = 'fees_gst');

INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, show_in_table, display_order, formula_type, formula_field_a_key, formula_related_table_slug, formula_relation_field_key)
SELECT inv.id, 'disbursements_gst', 'Disbursements GST', 'currency', false,
  (SELECT display_order FROM template_definition_table_fields WHERE template_table_id = inv.id AND field_key = 'disbursements_total'),
  'sum_related', 'invoiced_gst_amount', 'disbursements', 'invoice'
FROM template_definition_tables inv
WHERE inv.slug = 'invoices'
  AND NOT EXISTS (SELECT 1 FROM template_definition_table_fields x WHERE x.template_table_id = inv.id AND x.field_key = 'disbursements_gst');

UPDATE template_definition_table_fields gst
SET formula_type = 'add', formula_percent = NULL, formula_field_a_key = 'fees_gst', formula_field_b_key = 'disbursements_gst'
FROM template_definition_tables tt
WHERE gst.template_table_id = tt.id AND tt.slug = 'invoices' AND gst.field_key = 'gst';
