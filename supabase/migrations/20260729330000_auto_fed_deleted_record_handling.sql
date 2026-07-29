SET request.jwt.claim.role = 'service_role';

-- Reported live: an Irregularity's "Name" column went blank. Root cause --
-- an entity that still had an open auto-fed item (e.g. "Incomplete
-- Established Date") was removed (a hard delete, or a soft delete via
-- deleted_at -- e.g. the duplicate-merge flow), but nothing ever told the
-- auto-fed engine the watched record was gone:
--   1. auto_fed_recompute() re-evaluates a rule's condition_sql against the
--      record's own columns regardless of deleted_at -- a soft-deleted
--      record (whose UPDATE still fires trg_auto_fed_dispatch_entities)
--      just kept "violating" the same rule it always had, so the item
--      never resolved.
--   2. There was no DELETE trigger at all on entities/properties, so a
--      genuine hard delete didn't fire a recompute in the first place.
-- The frontend fallback for this (lib/clientUpdatePageDetail.ts, this same
-- session) shows "(deleted)" instead of a blank cell when it happens again
-- -- this migration is the backend half: stop it recurring, and clean up
-- the items already stuck this way.

-- ── 1. auto_fed_recompute: a gone (hard-deleted or soft-deleted) watched
-- record force-resolves every rule for it, without evaluating condition_sql
-- at all (a rule's own columns may not even exist anymore to reference).
CREATE OR REPLACE FUNCTION auto_fed_recompute(p_registry_id uuid, p_record_id uuid) RETURNS void AS $$
DECLARE
  v_registry auto_fed_registries;
  v_rule auto_fed_rules;
  v_is_violated boolean;
  v_is_system boolean;
  v_record_gone boolean;
BEGIN
  SELECT * INTO v_registry FROM auto_fed_registries WHERE id = p_registry_id AND is_active;
  IF NOT FOUND THEN RETURN; END IF;

  v_is_system := v_registry.source_table_name IN ('entities', 'projects', 'properties');

  BEGIN
    IF v_is_system THEN
      EXECUTE format('SELECT NOT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND deleted_at IS NULL)', v_registry.source_table_name)
        INTO v_record_gone USING p_record_id;
    ELSE
      SELECT NOT EXISTS (SELECT 1 FROM company_table_records WHERE id = p_record_id AND deleted_at IS NULL) INTO v_record_gone;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_record_gone := false; -- source table doesn't have deleted_at (or some other issue) -- fall back to evaluating rules normally
  END;

  FOR v_rule IN SELECT * FROM auto_fed_rules WHERE registry_id = p_registry_id AND is_active ORDER BY display_order LOOP
    IF v_record_gone THEN
      v_is_violated := false;
    ELSE
      BEGIN
        IF v_is_system THEN
          EXECUTE format('SELECT (%s) FROM %I r WHERE r.id = $1', v_rule.condition_sql, v_registry.source_table_name) INTO v_is_violated USING p_record_id;
        ELSE
          EXECUTE format('SELECT (%s) FROM (SELECT auto_fed_custom_table_row($1, $2) AS r) t', v_rule.condition_sql)
            INTO v_is_violated USING v_registry.source_table_name::uuid, p_record_id;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_is_violated := NULL; -- a malformed rule never blocks the other rules
      END;
    END IF;
    PERFORM auto_fed_upsert_item(v_registry, v_rule, p_record_id, COALESCE(v_is_violated, false));
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Cover genuine hard deletes -- a plain UPDATE (soft delete) already
-- fires trg_auto_fed_dispatch_entities/_properties, but nothing fired for
-- DELETE at all. auto_fed_dispatch() already COALESCEs NEW/OLD, so it needs
-- no change -- just widen the trigger's own event list.
DROP TRIGGER IF EXISTS trg_auto_fed_dispatch_entities ON entities;
CREATE TRIGGER trg_auto_fed_dispatch_entities
AFTER INSERT OR UPDATE OR DELETE ON entities
FOR EACH ROW EXECUTE FUNCTION auto_fed_dispatch();

DROP TRIGGER IF EXISTS trg_auto_fed_dispatch_properties ON properties;
CREATE TRIGGER trg_auto_fed_dispatch_properties
AFTER INSERT OR UPDATE OR DELETE ON properties
FOR EACH ROW EXECUTE FUNCTION auto_fed_dispatch();

-- ── 3. A custom-table record's own soft-delete (company_table_records.
-- deleted_at) previously wasn't dispatched at all -- only writes to its
-- individual company_table_values cells were. Proactively recompute every
-- registry watching that table when the record itself is archived/deleted,
-- rather than waiting for its next cell edit to self-correct.
CREATE OR REPLACE FUNCTION auto_fed_dispatch_custom_table_records() RETURNS trigger AS $$
DECLARE
  v_row company_table_records := COALESCE(NEW, OLD);
  v_registry_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
    RETURN v_row; -- only care about an actual archive/restore, not every field edit (company_table_values already covers those)
  END IF;
  FOR v_registry_id IN
    SELECT id FROM auto_fed_registries WHERE source_table_name = v_row.table_id::text AND company_id = v_row.company_id AND is_active
  LOOP
    PERFORM auto_fed_recompute(v_registry_id, v_row.id);
  END LOOP;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_fed_dispatch_ctr ON company_table_records;
CREATE TRIGGER trg_auto_fed_dispatch_ctr
AFTER INSERT OR UPDATE OF deleted_at OR DELETE ON company_table_records
FOR EACH ROW EXECUTE FUNCTION auto_fed_dispatch_custom_table_records();

-- ── 4. One-time cleanup: currently-open items already stuck pointing at a
-- gone entity/property -- force-resolve them the same way the fixed engine
-- would from here on.
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT DISTINCT reg.id AS registry_id, vl.value_record_id AS record_id
    FROM auto_fed_registries reg
    JOIN company_table_fields fl ON fl.table_id = reg.target_table_id AND fl.field_type IN ('entity', 'property') AND fl.deleted_at IS NULL
    JOIN company_table_values vl ON vl.field_id = fl.id AND vl.value_record_id IS NOT NULL
    JOIN company_table_values vs ON vs.record_id = vl.record_id
    JOIN company_table_fields fstatus ON fstatus.id = vs.field_id AND fstatus.field_key = 'status' AND fstatus.deleted_at IS NULL
    WHERE vs.value_text = 'Open'
      AND reg.source_table_name IN ('entities', 'properties')
      AND NOT EXISTS (
        SELECT 1 FROM entities e WHERE reg.source_table_name = 'entities' AND e.id = vl.value_record_id AND e.deleted_at IS NULL
        UNION ALL
        SELECT 1 FROM properties p WHERE reg.source_table_name = 'properties' AND p.id = vl.value_record_id AND p.deleted_at IS NULL
      )
  LOOP
    PERFORM auto_fed_recompute(v_row.registry_id, v_row.record_id);
  END LOOP;
END $$;
