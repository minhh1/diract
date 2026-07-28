SET request.jwt.claim.role = 'service_role';

-- One-time backfill: the previous migration changed/added auto_fed rules,
-- but the auto_fed_dispatch trigger only fires on writes to the watched
-- source table (entities) -- a rule change alone never touches existing
-- rows. Without this, already-open "Incomplete Established Date" items for
-- Individual entities would sit stale until someone happened to edit that
-- entity again, and the new "Incomplete Name" rule would never retroactively
-- catch any entity that existed before it did.
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

  -- entities predates tracked migrations -- confirm deleted_at actually
  -- exists on it before filtering on it, rather than assuming.
  FOR v_entity IN EXECUTE format(
    'SELECT id FROM entities WHERE company_id = $1%s',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entities' AND column_name = 'deleted_at')
      THEN ' AND deleted_at IS NULL' ELSE '' END
  ) USING v_company_id
  LOOP
    PERFORM auto_fed_recompute(v_registry_id, v_entity.id);
  END LOOP;
END $$;
