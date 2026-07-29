SET request.jwt.claim.role = 'service_role';

-- Extends the auto-fed engine to a second source table (properties) feeding
-- the SAME Irregularities board -- previously auto_fed_registries had
-- UNIQUE(target_table_id), so only one source could ever watch into a
-- given target. Relaxed to UNIQUE(target_table_id, source_table_name):
-- one registry per (target, source) pair, any number of sources per target.
ALTER TABLE auto_fed_registries DROP CONSTRAINT IF EXISTS auto_fed_registries_target_table_id_key;
ALTER TABLE auto_fed_registries ADD CONSTRAINT auto_fed_registries_target_source_key UNIQUE (target_table_id, source_table_name);

-- Properties dispatch trigger -- mirrors trg_auto_fed_dispatch_entities
-- exactly; auto_fed_dispatch()/auto_fed_recompute() are already fully
-- generic (TG_TABLE_NAME-driven), no engine code changes needed here.
DROP TRIGGER IF EXISTS trg_auto_fed_dispatch_properties ON properties;
CREATE TRIGGER trg_auto_fed_dispatch_properties
AFTER INSERT OR UPDATE ON properties
FOR EACH ROW EXECUTE FUNCTION auto_fed_dispatch();

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_irregularities_table_id uuid;
  v_registry_id uuid;
  v_entity record;
BEGIN
  SELECT id INTO v_irregularities_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;

  -- A second relation column so a property-sourced row has somewhere to
  -- link to, alongside the existing 'entity' column -- auto_fed_upsert_item
  -- picks the field_type matching CASE source_table_name WHEN 'properties'
  -- THEN 'property' (already generic, see 20260729150000).
  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, display_order)
  SELECT v_company_id, v_irregularities_table_id, 'property', 'Property', 'property', 7
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields WHERE table_id = v_irregularities_table_id AND field_key = 'property' AND deleted_at IS NULL);

  INSERT INTO auto_fed_registries (company_id, target_table_id, source_table_name, editable_field_keys)
  SELECT v_company_id, v_irregularities_table_id, 'properties', ARRAY['status']
  WHERE NOT EXISTS (SELECT 1 FROM auto_fed_registries WHERE target_table_id = v_irregularities_table_id AND source_table_name = 'properties')
  RETURNING id INTO v_registry_id;

  IF v_registry_id IS NULL THEN
    SELECT id INTO v_registry_id FROM auto_fed_registries WHERE target_table_id = v_irregularities_table_id AND source_table_name = 'properties';
  END IF;

  INSERT INTO auto_fed_rules (registry_id, rule_key, label, classification, detail, target_field_key, condition_sql, display_order)
  SELECT v_registry_id, 'missing_street_address', 'Missing Street Address', 'Moderate', 'Street address is not set', 'street_address',
    $sql$r.street_address IS NULL OR btrim(r.street_address) = ''$sql$,
    0
  WHERE NOT EXISTS (SELECT 1 FROM auto_fed_rules WHERE registry_id = v_registry_id AND rule_key = 'missing_street_address');

  -- Backfill recompute -- a brand new registry has never evaluated any
  -- existing property, same reasoning as every other backfill this session.
  FOR v_entity IN EXECUTE format(
    'SELECT id FROM properties WHERE company_id = $1%s',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'deleted_at')
      THEN ' AND deleted_at IS NULL' ELSE '' END
  ) USING v_company_id
  LOOP
    PERFORM auto_fed_recompute(v_registry_id, v_entity.id);
  END LOOP;
END $$;
