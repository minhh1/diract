SET request.jwt.claim.role = 'service_role';

-- Moves properties.folio_identifier off a native hardcoded column onto the
-- generic company_custom_fields/company_custom_field_values system, for
-- Huynh Lawyers and Niksen Time Pty Ltd (the only two companies with any
-- `properties` rows at all -- the other two companies in this database are
-- test tenants with zero properties, confirmed via `supabase db query
-- --linked` before writing this file), then drops the native column.
-- Mirrors supabase/migrations/20260729310000_entities_finance_fields_to_custom.sql's
-- approach for the entities table.

-- 1. New custom field, for these two companies only (guarded so re-running
-- this file is a no-op).
INSERT INTO company_custom_fields (company_id, table_name, field_key, label, field_type, select_options, display_order)
SELECT c.id, 'properties', 'folio_identifier', 'Folio Identifier', 'text', NULL::jsonb,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM company_custom_fields WHERE company_id = c.id AND table_name = 'properties')
FROM companies c
WHERE c.id IN ('a49b484d-100d-4c3e-b3b6-69c1a18cc783', '32d4fb0e-007d-41e7-bc5e-638163c28e3d')
AND NOT EXISTS (
  SELECT 1 FROM company_custom_fields x
  WHERE x.company_id = c.id AND x.table_name = 'properties' AND x.field_key = 'folio_identifier' AND x.deleted_at IS NULL
);

-- 2. Copy any existing native-column data into company_custom_field_values
-- before the column is dropped.
INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_text)
SELECT p.company_id, 'properties', p.id, f.id, p.folio_identifier
FROM properties p
JOIN company_custom_fields f ON f.company_id = p.company_id AND f.table_name = 'properties' AND f.field_key = 'folio_identifier' AND f.deleted_at IS NULL
WHERE p.folio_identifier IS NOT NULL AND p.folio_identifier <> ''
ON CONFLICT (field_id, record_id) DO UPDATE SET value_text = EXCLUDED.value_text;

-- 3. get_duplicate_clusters() reads p.folio_identifier directly for its
-- completeness_score -- resolve it from the new custom-field storage
-- instead (scoped to target_company_id, already a function param).
CREATE OR REPLACE FUNCTION public.get_duplicate_clusters(target_company_id uuid)
 RETURNS TABLE(record_id uuid, street_address text, suburb text, purchase_price numeric, purchase_date date, completeness_score integer, cluster_key text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH folio_field AS (
      SELECT id FROM company_custom_fields WHERE company_id = target_company_id AND table_name = 'properties' AND field_key = 'folio_identifier' AND deleted_at IS NULL
    )
    SELECT
        p.id,
        p.street_address,
        p.suburb,
        p.purchase_price,
        p.purchase_date,
        -- Calculate how many fields are filled (Max 10)
        (
          (CASE WHEN p.street_address IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN p.suburb IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN p.purchase_price > 0 THEN 1 ELSE 0 END) +
          (CASE WHEN p.purchase_date IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN EXISTS (SELECT 1 FROM company_custom_field_values v WHERE v.field_id = (SELECT id FROM folio_field) AND v.record_id = p.id AND v.value_text IS NOT NULL) THEN 1 ELSE 0 END) +
          (CASE WHEN p.insurer_name IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN p.policy_number IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN p.insurance_expiry IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN p.project_manager IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN p.holding_entity_id IS NOT NULL THEN 1 ELSE 0 END)
        ) as completeness_score,
        -- Create a "Fuzzy Key" to group them (First 5 chars of address + Price + Date)
        lower(substring(p.street_address from 1 for 5)) || COALESCE(p.purchase_price::text, '0') || COALESCE(p.purchase_date::text, 'none') as cluster_key
    FROM properties p
    WHERE p.company_id = target_company_id
    AND p.deleted_at IS NULL;
END;
$function$;

-- 4. Drop the native column -- safe for every company (only the two above
-- have any `properties` rows).
ALTER TABLE properties DROP COLUMN IF EXISTS folio_identifier;
