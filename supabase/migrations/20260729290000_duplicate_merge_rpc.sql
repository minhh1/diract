-- Merge RPC for the rebuilt duplicate-records tool
-- (app/dashboard/settings/page.tsx, app/api/duplicates/scan/route.ts).
--
-- Reassigns every known reference FROM the record being merged away TO the
-- one being kept, then archives the merged-away record -- instead of the
-- old tool's plain "archive whichever one you pick" (handleBulkDelete),
-- which left anything that referenced the archived record silently
-- orphaned.
--
-- Deliberately a plain SECURITY INVOKER function (the Postgres default, not
-- specified below), called directly via the browser's normal supabase.rpc()
-- client -- NOT routed through a service-role API route. This way every
-- reassignment UPDATE runs under the calling user's own RLS (company
-- members already have write access to every table touched here), and the
-- final archive step naturally hits trg_prevent_non_admin_delete
-- (supabase/archive_requests.sql) under the REAL calling user: a non-admin's
-- whole merge transaction cleanly aborts (this function body is one
-- transaction) with no partial reassignment ever left behind. Matches this
-- codebase's existing "the trigger, not the UI" enforcement philosophy --
-- see archive_requests.sql's own header comment.
--
-- The reassignment list below mirrors lib/schema/systemTableRelations.ts's
-- SYSTEM_TABLE_RELATION_MAP and lib/relationDefinitions.ts's
-- PROPERTY_RELATIONS/ENTITY_RELATIONS -- keep those and this in sync when
-- either changes. This list is hand-maintained and NOT exhaustive: a new
-- FK-shaped column added to the app later needs a matching addition here,
-- same as any other cross-cutting concern in this codebase. Deliberately
-- not auto-derived from information_schema -- many FK-shaped columns are
-- actually generic polymorphic pointers (e.g. archive_requests.entity_id +
-- a separate entity_table column) that a schema scan can't safely tell
-- apart from a real single-target foreign key.
--
-- record_tabs (per-record tab layout config, not user data) and the
-- merged-away record's own outgoing field values are deliberately NOT
-- reassigned -- the record is simply going away, same mental model as the
-- old tool's "archive one of the pair", just with incoming references now
-- fixed up too.

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
  END IF;

  RETURN jsonb_build_object('reassigned', v_total);
END;
$$;
