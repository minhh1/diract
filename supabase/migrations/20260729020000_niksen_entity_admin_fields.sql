SET request.jwt.claim.role = 'service_role';

-- Niksen Time Pty Ltd entity-admin schema, part 1: native column fixes +
-- new company-scoped custom fields on entities. See lib/import/parseImportFile.ts's
-- established_date comment for why this column stops being a strict date.

-- entities.established_date currently requires a full day/month/year, but
-- real-world source records (an entity register export) frequently only
-- have a month/year, or just a month -- switch to free text so those can be
-- entered as-is (e.g. "Feb 2019" or "22 Jun") instead of failing/forcing a
-- fabricated day. Existing values round-trip through ::text unchanged.
ALTER TABLE entities ALTER COLUMN established_date TYPE text USING established_date::text;

-- Lets an officeholder row (see components/dashboard/FieldLayoutEditor.tsx's
-- RELATED_TABLES.entities 'Officeholders' related-table editor) optionally
-- link to a real entities row for that person, instead of only ever holding
-- a free-text name. Nullable/optional -- existing officeholder rows with no
-- linked entity keep working exactly as before.
ALTER TABLE entity_officeholders ADD COLUMN IF NOT EXISTS officeholder_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL;

-- New custom fields on entities, scoped to Niksen Time Pty Ltd only (this
-- is company-specific entity-register data, not something every company
-- using this app needs). ACN/ABN/TFN/GST registered/established date/trust
-- deed date/bank name/BSB/account number/NAB Connect id all already exist
-- as native entities columns (see NewEntityModal.tsx) so aren't duplicated
-- here.
INSERT INTO company_custom_fields (company_id, table_name, field_key, label, field_type, select_options, display_order)
SELECT '32d4fb0e-007d-41e7-bc5e-638163c28e3d', 'entities', v.field_key, v.label, v.field_type, v.select_options,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM company_custom_fields WHERE company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND table_name = 'entities')
FROM (VALUES
  ('gst_report_frequency', 'GST Report Frequency', 'select', '["Monthly","Quarterly","Annually"]'::jsonb),
  -- Distinct from the native entities.bank_name column, which holds the
  -- financial institution's name (e.g. "NAB") -- this is the name on the
  -- account itself (e.g. "ASIF Australia Limited"), which can differ from
  -- the entity's own legal name.
  ('bank_account_name', 'Bank Account Name', 'text', NULL::jsonb),
  ('xero_bank_feed', 'Xero Bank Feed', 'text', NULL::jsonb),
  ('service_agreement_with_niksen', 'Service Agreement with Niksen Time Pty Ltd', 'text', NULL::jsonb)
) AS v(field_key, label, field_type, select_options)
WHERE NOT EXISTS (
  SELECT 1 FROM company_custom_fields x
  WHERE x.company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND x.table_name = 'entities'
    AND x.field_key = v.field_key AND x.deleted_at IS NULL
);
