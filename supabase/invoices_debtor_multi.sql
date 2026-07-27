-- Allows more than one Entity as the Debtor on an invoice (e.g. joint
-- purchasers, co-borrowers) -- flips the existing "debtor" field to the
-- generic allow_multiple relation mechanism (company_table_value_links,
-- see supabase/company_table_field_allow_multiple.sql) rather than
-- inventing a second field. Every existing invoice's single debtor value
-- (stored the old way, in company_table_values.value_record_id) is copied
-- into company_table_value_links first, then the old scalar row is
-- cleared -- once allow_multiple is set, downstream reads (useCustomTable.ts,
-- customTableService.ts) only ever look at company_table_value_links for
-- this field, so skipping the migration would silently lose every
-- existing invoice's debtor.
DO $$
DECLARE
  v_field_id uuid;
BEGIN
  FOR v_field_id IN
    SELECT ctf.id
    FROM company_table_fields ctf
    JOIN company_tables ct ON ct.id = ctf.table_id
    WHERE ct.slug = 'invoices' AND ctf.field_key = 'debtor' AND ctf.deleted_at IS NULL AND ctf.allow_multiple = false
  LOOP
    INSERT INTO company_table_value_links (company_id, record_id, field_id, value_record_id)
    SELECT ctv.company_id, ctv.record_id, ctv.field_id, ctv.value_record_id
    FROM company_table_values ctv
    WHERE ctv.field_id = v_field_id AND ctv.value_record_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    DELETE FROM company_table_values WHERE field_id = v_field_id;

    UPDATE company_table_fields SET allow_multiple = true WHERE id = v_field_id;
  END LOOP;
END $$;
