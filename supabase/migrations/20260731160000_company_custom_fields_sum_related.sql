SET request.jwt.claim.role = 'service_role';

-- Lets a system-table field (projects/entities/properties, defined in
-- company_custom_fields) be a SUM rollup of a numeric field on a related
-- CUSTOM table -- e.g. a Matter's "Total Fees" = SUM of every Time & Fee
-- Entry's Amount where that entry's own `matter` field (field_type
-- 'project') points at this Matter. Mirrors company_table_fields'
-- sum_related (see supabase/company_table_fields_formula_extend.sql) but
-- deliberately narrower: only 'sum_related' is supported here (not
-- multiply/percentage_of/add -- those stay custom-table-only, unchanged),
-- and the CHILD side of the relationship is always a custom table
-- (formula_field_a_id/formula_relation_field_id reference
-- company_table_fields, not company_custom_fields) -- a system table
-- summing another system table's own custom fields is out of scope.
-- Recomputed by lib/services/customTableService.ts's
-- recomputeRelatedRollups() whenever a related custom-table row is
-- created/edited/deleted, same trigger path as the existing mechanism.
ALTER TABLE company_custom_fields ADD COLUMN IF NOT EXISTS formula_type text
  CHECK (formula_type IN ('sum_related'));
ALTER TABLE company_custom_fields ADD COLUMN IF NOT EXISTS formula_field_a_id uuid
  REFERENCES company_table_fields(id) ON DELETE SET NULL;
ALTER TABLE company_custom_fields ADD COLUMN IF NOT EXISTS formula_relation_field_id uuid
  REFERENCES company_table_fields(id) ON DELETE SET NULL;

-- One-off full recompute for a newly-created rollup field -- a single
-- grouped query per company is far cheaper than replaying
-- recomputeRelatedRollups() per parent record (many sequential round trips
-- for a company with hundreds of matters). Called once, right after
-- SchemaVisualisation.tsx saves a brand-new complete sum_related config.
-- Safe to re-run any time (full recompute, not incremental). A parent with
-- zero live children gets no row written (the inner join drops it before
-- GROUP BY), so it renders blank rather than 0 -- consistent with how an
-- untouched numeric field already renders elsewhere.
CREATE OR REPLACE FUNCTION backfill_system_rollup(p_rollup_field_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_relation_field_id uuid;
  v_sum_field_id uuid;
  v_table_name text;
  v_company_id uuid;
BEGIN
  SELECT formula_relation_field_id, formula_field_a_id, table_name, company_id
    INTO v_relation_field_id, v_sum_field_id, v_table_name, v_company_id
  FROM company_custom_fields WHERE id = p_rollup_field_id;

  IF v_relation_field_id IS NULL OR v_sum_field_id IS NULL THEN RETURN; END IF;

  INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_number)
  SELECT v_company_id, v_table_name, parent_id, p_rollup_field_id, total
  FROM (
    SELECT link.value_record_id AS parent_id, COALESCE(SUM(sumv.value_number), 0) AS total
    FROM (
      SELECT record_id, value_record_id FROM company_table_values WHERE field_id = v_relation_field_id
      UNION ALL
      SELECT record_id, value_record_id FROM company_table_value_links WHERE field_id = v_relation_field_id
    ) link
    JOIN company_table_records ctr ON ctr.id = link.record_id AND ctr.deleted_at IS NULL
    LEFT JOIN company_table_values sumv ON sumv.record_id = link.record_id AND sumv.field_id = v_sum_field_id
    WHERE link.value_record_id IS NOT NULL
    GROUP BY link.value_record_id
  ) totals(parent_id, total)
  ON CONFLICT (field_id, record_id) DO UPDATE SET value_number = EXCLUDED.value_number;
END;
$$;

-- Same backfill, custom-table parent (e.g. a new Invoices-style rollup
-- created via the same new UI) -- writes into company_table_values instead.
CREATE OR REPLACE FUNCTION backfill_table_rollup(p_rollup_field_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_relation_field_id uuid;
  v_sum_field_id uuid;
  v_parent_table_id uuid;
  v_company_id uuid;
BEGIN
  SELECT formula_relation_field_id, formula_field_a_id, table_id, company_id
    INTO v_relation_field_id, v_sum_field_id, v_parent_table_id, v_company_id
  FROM company_table_fields WHERE id = p_rollup_field_id;

  IF v_relation_field_id IS NULL OR v_sum_field_id IS NULL THEN RETURN; END IF;

  INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_number)
  SELECT v_company_id, v_parent_table_id, parent_id, p_rollup_field_id, total
  FROM (
    SELECT link.value_record_id AS parent_id, COALESCE(SUM(sumv.value_number), 0) AS total
    FROM (
      SELECT record_id, value_record_id FROM company_table_values WHERE field_id = v_relation_field_id
      UNION ALL
      SELECT record_id, value_record_id FROM company_table_value_links WHERE field_id = v_relation_field_id
    ) link
    JOIN company_table_records ctr ON ctr.id = link.record_id AND ctr.deleted_at IS NULL
    LEFT JOIN company_table_values sumv ON sumv.record_id = link.record_id AND sumv.field_id = v_sum_field_id
    WHERE link.value_record_id IS NOT NULL
    GROUP BY link.value_record_id
  ) totals(parent_id, total)
  ON CONFLICT (record_id, field_id) DO UPDATE SET value_number = EXCLUDED.value_number;
END;
$$;
