SET request.jwt.claim.role = 'service_role';

-- "Sold" flag on properties -- drives the Quick Glance property-developer
-- map widget's "current projects" filter (a project counts as current if
-- any linked property is unsold, see PropertyDeveloperQuickGlance.tsx).
-- Custom field rather than a native column, same mechanism/pattern as
-- supabase/migrations/20260730100000_property_folio_identifier_to_custom.sql,
-- scoped to Niksen only for now (the only company using this dashboard).
INSERT INTO company_custom_fields (company_id, table_name, field_key, label, field_type, select_options, display_order)
SELECT c.id, 'properties', 'sold', 'Sold', 'boolean', NULL::jsonb,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM company_custom_fields WHERE company_id = c.id AND table_name = 'properties')
FROM companies c
WHERE c.id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d'
AND NOT EXISTS (
  SELECT 1 FROM company_custom_fields x
  WHERE x.company_id = c.id AND x.table_name = 'properties' AND x.field_key = 'sold' AND x.deleted_at IS NULL
);
