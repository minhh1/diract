SET request.jwt.claim.role = 'service_role';

-- Backfill recompute for the new duplicate_name rule -- same reasoning as
-- 20260729190000: a rule change alone never touches existing rows.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_irregularities_table_id uuid;
  v_registry_id uuid;
  v_entity record;
BEGIN
  SELECT id INTO v_irregularities_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;
  SELECT id INTO v_registry_id FROM auto_fed_registries WHERE target_table_id = v_irregularities_table_id;
  IF v_registry_id IS NULL THEN RETURN; END IF;

  FOR v_entity IN EXECUTE format(
    'SELECT id FROM entities WHERE company_id = $1%s',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entities' AND column_name = 'deleted_at')
      THEN ' AND deleted_at IS NULL' ELSE '' END
  ) USING v_company_id
  LOOP
    PERFORM auto_fed_recompute(v_registry_id, v_entity.id);
  END LOOP;
END $$;
