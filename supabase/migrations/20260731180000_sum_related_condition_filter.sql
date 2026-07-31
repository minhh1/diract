SET request.jwt.claim.role = 'service_role';

-- Lets a sum_related rollup filter which related rows count toward the sum
-- -- e.g. a Matter's "Billable Fees" should only sum Time & Fee Entries
-- where Billable = Yes, not every entry regardless of billable status.
-- formula_condition_field_id is a field on the SAME related (child) table
-- the sum itself reads from (e.g. Time & Fee Entries' own Billable field);
-- formula_condition_value is the required value, as text ('true'/'false'
-- for a boolean field, the option's own text for anything else) -- both
-- null means "no filter, sum every linked row", the existing behaviour.
ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS formula_condition_field_id uuid
  REFERENCES company_table_fields(id) ON DELETE SET NULL;
ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS formula_condition_value text;
ALTER TABLE company_custom_fields ADD COLUMN IF NOT EXISTS formula_condition_field_id uuid
  REFERENCES company_table_fields(id) ON DELETE SET NULL;
ALTER TABLE company_custom_fields ADD COLUMN IF NOT EXISTS formula_condition_value text;

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
      AND (
        v_condition_field_id IS NULL
        OR EXISTS (
          SELECT 1 FROM company_table_values condv
          WHERE condv.record_id = link.record_id AND condv.field_id = v_condition_field_id
            AND (
              (v_condition_field_type = 'boolean' AND condv.value_boolean = (v_condition_value = 'true'))
              OR (v_condition_field_type <> 'boolean' AND condv.value_text = v_condition_value)
            )
        )
      )
    GROUP BY link.value_record_id
  ) totals(parent_id, total)
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
      AND (
        v_condition_field_id IS NULL
        OR EXISTS (
          SELECT 1 FROM company_table_values condv
          WHERE condv.record_id = link.record_id AND condv.field_id = v_condition_field_id
            AND (
              (v_condition_field_type = 'boolean' AND condv.value_boolean = (v_condition_value = 'true'))
              OR (v_condition_field_type <> 'boolean' AND condv.value_text = v_condition_value)
            )
        )
      )
    GROUP BY link.value_record_id
  ) totals(parent_id, total)
  ON CONFLICT (record_id, field_id) DO UPDATE SET value_number = EXCLUDED.value_number;
END;
$$;

-- Existing "Total Fees" field (created earlier this session) -- switch it
-- to the requested billable-only tracking and rename to match. Huynh
-- Lawyers only.
UPDATE company_custom_fields
SET label = 'Billable Fees',
    formula_condition_field_id = '0a67b692-b800-4859-b003-1ecf32a09e95', -- Time & Fee Entries' Billable field
    formula_condition_value = 'true'
WHERE id = '7d2690cd-f658-4217-889c-00a6c0e66199';

SELECT backfill_system_rollup('7d2690cd-f658-4217-889c-00a6c0e66199');
