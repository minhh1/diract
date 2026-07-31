SET request.jwt.claim.role = 'service_role';

-- Fixes a bug in 20260731180000's backfill functions: a parent whose
-- children NO LONGER qualify under a formula_condition (e.g. every linked
-- Time & Fee Entry just got marked non-billable) simply vanished from the
-- filtered result set, so its OLD sum was never overwritten and stayed
-- stale forever -- confirmed live: a matter whose only fee entry is
-- non-billable still showed its pre-filter Total Fees value after adding
-- the Billable condition and re-backfilling. Restructured to group over
-- every parent with at least one ALIVE child (condition or not), using
-- FILTER to only count qualifying children toward the sum -- a parent with
-- zero qualifying (but 1+ alive) children now correctly gets an explicit 0
-- written, instead of being skipped. A parent with literally zero alive
-- children at all is still left unwritten (blank), same as before -- that
-- case is "never touched yet", not "no longer matches", and blank vs 0
-- reads the same as any other never-set numeric field elsewhere in the app.
CREATE OR REPLACE FUNCTION backfill_system_rollup(p_rollup_field_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_relation_field_id uuid;
  v_sum_field_id uuid;
  v_table_name text;
  v_company_id uuid;
  v_condition_field_id uuid;
  v_condition_value text;
  v_condition_field_type text;
BEGIN
  SELECT formula_relation_field_id, formula_field_a_id, table_name, company_id, formula_condition_field_id, formula_condition_value
    INTO v_relation_field_id, v_sum_field_id, v_table_name, v_company_id, v_condition_field_id, v_condition_value
  FROM company_custom_fields WHERE id = p_rollup_field_id;

  IF v_relation_field_id IS NULL OR v_sum_field_id IS NULL THEN RETURN; END IF;
  IF v_condition_field_id IS NOT NULL THEN
    SELECT field_type INTO v_condition_field_type FROM company_table_fields WHERE id = v_condition_field_id;
  END IF;

  INSERT INTO company_custom_field_values (company_id, table_name, record_id, field_id, value_number)
  WITH link AS (
    SELECT record_id, value_record_id FROM company_table_values WHERE field_id = v_relation_field_id
    UNION ALL
    SELECT record_id, value_record_id FROM company_table_value_links WHERE field_id = v_relation_field_id
  ),
  alive_link AS (
    SELECT l.record_id, l.value_record_id AS parent_id
    FROM link l
    JOIN company_table_records ctr ON ctr.id = l.record_id AND ctr.deleted_at IS NULL
    WHERE l.value_record_id IS NOT NULL
  ),
  qualifies AS (
    SELECT al.record_id
    FROM alive_link al
    WHERE v_condition_field_id IS NULL OR EXISTS (
      SELECT 1 FROM company_table_values condv
      WHERE condv.record_id = al.record_id AND condv.field_id = v_condition_field_id
        AND (
          (v_condition_field_type = 'boolean' AND condv.value_boolean = (v_condition_value = 'true'))
          OR (v_condition_field_type <> 'boolean' AND condv.value_text = v_condition_value)
        )
    )
  )
  SELECT v_company_id, v_table_name, al.parent_id, p_rollup_field_id,
    COALESCE(SUM(sumv.value_number) FILTER (WHERE q.record_id IS NOT NULL), 0)
  FROM alive_link al
  LEFT JOIN qualifies q ON q.record_id = al.record_id
  LEFT JOIN company_table_values sumv ON sumv.record_id = al.record_id AND sumv.field_id = v_sum_field_id
  GROUP BY al.parent_id
  ON CONFLICT (field_id, record_id) DO UPDATE SET value_number = EXCLUDED.value_number;
END;
$$;

CREATE OR REPLACE FUNCTION backfill_table_rollup(p_rollup_field_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_relation_field_id uuid;
  v_sum_field_id uuid;
  v_parent_table_id uuid;
  v_company_id uuid;
  v_condition_field_id uuid;
  v_condition_value text;
  v_condition_field_type text;
BEGIN
  SELECT formula_relation_field_id, formula_field_a_id, table_id, company_id, formula_condition_field_id, formula_condition_value
    INTO v_relation_field_id, v_sum_field_id, v_parent_table_id, v_company_id, v_condition_field_id, v_condition_value
  FROM company_table_fields WHERE id = p_rollup_field_id;

  IF v_relation_field_id IS NULL OR v_sum_field_id IS NULL THEN RETURN; END IF;
  IF v_condition_field_id IS NOT NULL THEN
    SELECT field_type INTO v_condition_field_type FROM company_table_fields WHERE id = v_condition_field_id;
  END IF;

  INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_number)
  WITH link AS (
    SELECT record_id, value_record_id FROM company_table_values WHERE field_id = v_relation_field_id
    UNION ALL
    SELECT record_id, value_record_id FROM company_table_value_links WHERE field_id = v_relation_field_id
  ),
  alive_link AS (
    SELECT l.record_id, l.value_record_id AS parent_id
    FROM link l
    JOIN company_table_records ctr ON ctr.id = l.record_id AND ctr.deleted_at IS NULL
    WHERE l.value_record_id IS NOT NULL
  ),
  qualifies AS (
    SELECT al.record_id
    FROM alive_link al
    WHERE v_condition_field_id IS NULL OR EXISTS (
      SELECT 1 FROM company_table_values condv
      WHERE condv.record_id = al.record_id AND condv.field_id = v_condition_field_id
        AND (
          (v_condition_field_type = 'boolean' AND condv.value_boolean = (v_condition_value = 'true'))
          OR (v_condition_field_type <> 'boolean' AND condv.value_text = v_condition_value)
        )
    )
  )
  SELECT v_company_id, v_parent_table_id, al.parent_id, p_rollup_field_id,
    COALESCE(SUM(sumv.value_number) FILTER (WHERE q.record_id IS NOT NULL), 0)
  FROM alive_link al
  LEFT JOIN qualifies q ON q.record_id = al.record_id
  LEFT JOIN company_table_values sumv ON sumv.record_id = al.record_id AND sumv.field_id = v_sum_field_id
  GROUP BY al.parent_id
  ON CONFLICT (record_id, field_id) DO UPDATE SET value_number = EXCLUDED.value_number;
END;
$$;

-- Re-run for Billable Fees now that the fix is live -- corrects any parent
-- (like the one confirmed live above) left stale by the buggy version.
SELECT backfill_system_rollup('7d2690cd-f658-4217-889c-00a6c0e66199');
