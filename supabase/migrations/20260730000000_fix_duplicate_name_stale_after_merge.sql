SET request.jwt.claim.role = 'service_role';

-- Reported live (Niksen Time): the Irregularities table kept showing
-- "Duplicate Name" rows for entities that had already been merged via the
-- Reconciliation tool. Two compounding bugs:
--
-- 1. merge_duplicate_records() (20260729290000_duplicate_merge_rpc.sql)
--    only ever writes to the merged-AWAY record (p_merge_id) -- the
--    surviving record (p_keep_id) is never touched, so
--    trg_auto_fed_dispatch_entities/_properties never fires for it and its
--    auto-fed items (if any) never get re-evaluated. Since
--    auto_fed_upsert_item links an Irregularities row to whichever entity
--    was being written to when a violation was FIRST detected, that could
--    just as easily be the entity an admin later chooses to KEEP -- in
--    which case the stale row was never going to resolve on its own.
-- 2. Even when recompute DOES run, the duplicate_name rule's own
--    condition_sql (20260729230000_niksen_duplicate_name_rule.sql, re-
--    asserted verbatim by 20260729390000/20260729410000/20260729420000)
--    never excluded a soft-deleted partner -- a merge archives the loser
--    via deleted_at, it doesn't remove the row, so "another entity with
--    this same name" kept matching the archived duplicate forever.
--
-- Fixes both, then backfill-recomputes every entity in every company that
-- has this rule installed (same reasoning as 20260729190000/20260729240000:
-- a rule/engine change alone never touches already-created rows).

-- ── 1. condition_sql: ignore a soft-deleted duplicate partner ───────
UPDATE auto_fed_rules
SET condition_sql = $sql$EXISTS (
  SELECT 1 FROM entities e2 WHERE e2.company_id = r.company_id AND e2.id <> r.id AND e2.deleted_at IS NULL
    AND lower(btrim(e2.name)) = lower(btrim(r.name))
)$sql$
WHERE rule_key = 'duplicate_name';

-- ── 2. merge_duplicate_records: recompute BOTH sides after a merge ──
-- Identical body to 20260729290000_duplicate_merge_rpc.sql, plus a
-- recompute pass (mirrors auto_fed_dispatch()'s own registry loop) for
-- whichever registries watch the merged table, run against both p_keep_id
-- and p_merge_id -- not just relying on the archive UPDATE's trigger firing
-- for p_merge_id alone, which is what left p_keep_id's items stale.
CREATE OR REPLACE FUNCTION merge_duplicate_records(
  p_company_id uuid,
  p_table_kind text,   -- 'system' | 'custom'
  p_table text,        -- system table name (table_kind = 'system')
  p_table_id uuid,     -- company_tables.id (table_kind = 'custom'), null otherwise
  p_keep_id uuid,
  p_merge_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_found int;
  v_n int;
  v_total int := 0;
  v_source_key text;
  v_reg_id uuid;
BEGIN
  IF p_keep_id = p_merge_id THEN
    RAISE EXCEPTION 'Cannot merge a record into itself';
  END IF;
  IF p_table_kind NOT IN ('system', 'custom') THEN
    RAISE EXCEPTION 'Invalid table kind: %', p_table_kind;
  END IF;

  IF p_table_kind = 'system' THEN
    IF p_table NOT IN ('properties', 'entities', 'projects', 'tasks') THEN
      RAISE EXCEPTION 'Unknown system table: %', p_table;
    END IF;

    EXECUTE format('SELECT 1 FROM %I WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL', p_table)
      INTO v_found USING p_keep_id, p_company_id;
    IF v_found IS NULL THEN RAISE EXCEPTION 'Record to keep not found in this company'; END IF;

    EXECUTE format('SELECT 1 FROM %I WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL', p_table)
      INTO v_found USING p_merge_id, p_company_id;
    IF v_found IS NULL THEN RAISE EXCEPTION 'Record to merge not found in this company'; END IF;

    IF p_table = 'entities' THEN
      UPDATE properties SET holding_entity_id = p_keep_id WHERE holding_entity_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE properties SET purchase_entity_id = p_keep_id WHERE purchase_entity_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE properties SET council_entity_id = p_keep_id WHERE council_entity_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE properties SET insurer_entity_id = p_keep_id WHERE insurer_entity_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      -- entity_officeholders has no company_id column of its own (scoped
      -- via entities.company_id, see supabase/rls_fix.sql's RLS policy) --
      -- p_merge_id was already verified above to belong to this company,
      -- so filtering on entity_id alone is safe.
      UPDATE entity_officeholders SET entity_id = p_keep_id WHERE entity_id = p_merge_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

    ELSIF p_table = 'properties' THEN
      -- project_properties junction (project_id, property_id) is UNIQUE --
      -- repoint rows that don't already collide with an existing
      -- (project_id, keep) pair, then drop whatever's left pointing at the
      -- merged property (exact duplicates of a pair the UPDATE skipped).
      UPDATE project_properties pp SET property_id = p_keep_id
        WHERE pp.property_id = p_merge_id
          AND NOT EXISTS (
            SELECT 1 FROM project_properties pp2
            WHERE pp2.project_id = pp.project_id AND pp2.property_id = p_keep_id
          );
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      DELETE FROM project_properties WHERE property_id = p_merge_id;

      -- Property sub-tables (lib/relationDefinitions.ts PROPERTY_RELATIONS)
      -- -- none of these have their own company_id column (predate tracked
      -- migrations); property_id alone is safe for the same reason as
      -- entity_officeholders above.
      UPDATE property_valuations SET property_id = p_keep_id WHERE property_id = p_merge_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE property_bills_local_government SET property_id = p_keep_id WHERE property_id = p_merge_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE property_bills_electricity SET property_id = p_keep_id WHERE property_id = p_merge_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE property_bills_water SET property_id = p_keep_id WHERE property_id = p_merge_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE property_bills_gas SET property_id = p_keep_id WHERE property_id = p_merge_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE property_bills_land_tax SET property_id = p_keep_id WHERE property_id = p_merge_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE property_credentials SET property_id = p_keep_id WHERE property_id = p_merge_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

    ELSIF p_table = 'projects' THEN
      UPDATE tasks SET project_id = p_keep_id WHERE project_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE projects SET parent_project_id = p_keep_id WHERE parent_project_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE properties SET project_id = p_keep_id WHERE project_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE document_templates SET project_id = p_keep_id WHERE project_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE precedent_settings SET project_id = p_keep_id WHERE project_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE precedent_issuances SET project_id = p_keep_id WHERE project_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
      UPDATE client_update_pages SET project_id = p_keep_id WHERE project_id = p_merge_id AND company_id = p_company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

    ELSIF p_table = 'tasks' THEN
      NULL; -- no known incoming references today -- generic sweep + archive only
    END IF;

    -- Generic sweeps, every system-table merge: a custom field (on any
    -- table) of type entity/property/project pointing at the merged record.
    UPDATE company_custom_field_values SET value_record_id = p_keep_id
      WHERE value_record_id = p_merge_id AND company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

    UPDATE company_table_values SET value_record_id = p_keep_id
      WHERE value_record_id = p_merge_id AND company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

    UPDATE company_table_value_links l SET value_record_id = p_keep_id
      WHERE l.value_record_id = p_merge_id AND l.company_id = p_company_id
        AND NOT EXISTS (
          SELECT 1 FROM company_table_value_links l2
          WHERE l2.record_id = l.record_id AND l2.field_id = l.field_id AND l2.value_record_id = p_keep_id
        );
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    DELETE FROM company_table_value_links WHERE value_record_id = p_merge_id AND company_id = p_company_id;

    -- Archive the loser. trg_prevent_non_admin_delete enforces admin-only
    -- here, under the real calling user -- see this file's header comment.
    EXECUTE format('UPDATE %I SET deleted_at = now() WHERE id = $1 AND company_id = $2', p_table)
      USING p_merge_id, p_company_id;

    v_source_key := p_table;

  ELSE -- 'custom'
    IF p_table_id IS NULL THEN
      RAISE EXCEPTION 'p_table_id is required for a custom-table merge';
    END IF;

    SELECT 1 INTO v_found FROM company_table_records
      WHERE id = p_keep_id AND table_id = p_table_id AND company_id = p_company_id AND deleted_at IS NULL;
    IF v_found IS NULL THEN RAISE EXCEPTION 'Record to keep not found in this table'; END IF;

    SELECT 1 INTO v_found FROM company_table_records
      WHERE id = p_merge_id AND table_id = p_table_id AND company_id = p_company_id AND deleted_at IS NULL;
    IF v_found IS NULL THEN RAISE EXCEPTION 'Record to merge not found in this table'; END IF;

    -- Covers table_relation/entity/property/project-type fields on ANY
    -- other record (system or custom) pointing at this custom-table record.
    UPDATE company_custom_field_values SET value_record_id = p_keep_id
      WHERE value_record_id = p_merge_id AND company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

    UPDATE company_table_values SET value_record_id = p_keep_id
      WHERE value_record_id = p_merge_id AND company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

    UPDATE company_table_value_links l SET value_record_id = p_keep_id
      WHERE l.value_record_id = p_merge_id AND l.company_id = p_company_id
        AND NOT EXISTS (
          SELECT 1 FROM company_table_value_links l2
          WHERE l2.record_id = l.record_id AND l2.field_id = l.field_id AND l2.value_record_id = p_keep_id
        );
    GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    DELETE FROM company_table_value_links WHERE value_record_id = p_merge_id AND company_id = p_company_id;

    UPDATE company_table_records SET deleted_at = now()
      WHERE id = p_merge_id AND table_id = p_table_id AND company_id = p_company_id;

    v_source_key := p_table_id::text;
  END IF;

  -- Recompute every active registry watching this table, for BOTH the
  -- surviving and the archived record -- see this migration's header. Not
  -- gated on whether either side even has an existing auto-fed item;
  -- auto_fed_recompute/auto_fed_upsert_item are idempotent no-ops when a
  -- registry has nothing to say about a given record.
  FOR v_reg_id IN
    SELECT id FROM auto_fed_registries WHERE company_id = p_company_id AND is_active AND source_table_name = v_source_key
  LOOP
    PERFORM auto_fed_recompute(v_reg_id, p_keep_id);
    PERFORM auto_fed_recompute(v_reg_id, p_merge_id);
  END LOOP;

  RETURN jsonb_build_object('reassigned', v_total);
END;
$$;

-- ── 3. Backfill: recompute every entity in every company that already
-- has the duplicate_name rule installed, so already-stale rows created
-- before this fix (like Niksen's) resolve immediately rather than waiting
-- on the next unrelated edit to that entity. ──
DO $$
DECLARE
  v_registry record;
  v_entity record;
BEGIN
  FOR v_registry IN
    SELECT DISTINCT reg.id, reg.company_id
    FROM auto_fed_registries reg
    JOIN auto_fed_rules ru ON ru.registry_id = reg.id AND ru.rule_key = 'duplicate_name'
    WHERE reg.is_active
  LOOP
    FOR v_entity IN SELECT id FROM entities WHERE company_id = v_registry.company_id AND deleted_at IS NULL LOOP
      PERFORM auto_fed_recompute(v_registry.id, v_entity.id);
    END LOOP;
  END LOOP;
END $$;
