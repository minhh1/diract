SET request.jwt.claim.role = 'service_role';

-- New irregularity type, structurally different from the 5 existing rules
-- (all single-record field checks) -- a cross-record uniqueness check: two
-- entities sharing the same name. Demonstrates the auto_fed engine handles
-- arbitrary condition_sql, including correlated subqueries against the
-- watched table itself, with zero engine changes.

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_irregularities_table_id uuid;
  v_registry_id uuid;
BEGIN
  SELECT id INTO v_irregularities_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;
  SELECT id INTO v_registry_id FROM auto_fed_registries WHERE target_table_id = v_irregularities_table_id;

  INSERT INTO auto_fed_rules (registry_id, rule_key, label, classification, detail, target_field_key, condition_sql, display_order)
  SELECT v_registry_id, 'duplicate_name', 'Duplicate Name', 'Moderate', 'Another entity has the exact same name', 'name',
    $sql$EXISTS (
      SELECT 1 FROM entities e2 WHERE e2.company_id = r.company_id AND e2.id <> r.id AND lower(btrim(e2.name)) = lower(btrim(r.name))
    )$sql$,
    5
  WHERE NOT EXISTS (SELECT 1 FROM auto_fed_rules WHERE registry_id = v_registry_id AND rule_key = 'duplicate_name');
END $$;
