SET request.jwt.claim.role = 'service_role';

-- Follow-up to 20260731110000_settlement_date_project_property_field.sql --
-- the "Niksen — Matter Update" Detailed Table Page already had two groups
-- with their own "Settlement Date" column, but it was field_source='base',
-- field_key='estimated_completion_date' (a plain column pointed at the
-- matter-wide date, manually labeled "Settlement Date" per group) -- the
-- exact thing this whole change is meant to replace. Repoint those two rows
-- (same UPDATE-in-place pattern as purchase_price's own migration) to the
-- new per-property field instead. The row's own id (what sort/filter/format-
-- rule config elsewhere on the page references) never changes, only what it
-- points to.
DO $$
DECLARE
  v_company_id uuid := 'a49b484d-100d-4c3e-b3b6-69c1a18cc783'; -- Huynh Lawyers
  v_page_id uuid := 'b3c3bc16-e0f2-4950-8d2f-f01347d69211'; -- "Niksen — Matter Update"
BEGIN
  UPDATE client_update_page_fields cupf
  SET field_source = 'project_property', field_key = new_f.id::text
  FROM company_custom_fields new_f
  WHERE cupf.page_id = v_page_id
    AND cupf.field_source = 'base' AND cupf.field_key = 'estimated_completion_date' AND cupf.label = 'Settlement Date'
    AND new_f.company_id = v_company_id AND new_f.table_name = 'project_properties' AND new_f.field_key = 'settlement_date' AND new_f.deleted_at IS NULL;
END $$;
