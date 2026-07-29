SET request.jwt.claim.role = 'service_role';

-- Removes "Incomplete Established Date" irregularity items for Individual
-- entities and for entities that no longer exist -- both are stale, no
-- longer meaningful clutter: the rule itself was scoped away from
-- Individual entities in 20260729180000 (a person never has an
-- established date), and a deleted entity's items were already force-
-- resolved to "Resolved" in 20260729330000 -- these are just the leftover
-- Resolved history rows for both cases, not real open issues.
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT r.id AS record_id
    FROM company_table_records r
    JOIN company_table_values vi ON vi.record_id = r.id
    JOIN company_table_fields fissue ON fissue.id = vi.field_id AND fissue.field_key = 'issue_type'
    JOIN company_table_values vl ON vl.record_id = r.id
    JOIN company_table_fields flink ON flink.id = vl.field_id AND flink.field_type = 'entity'
    LEFT JOIN entities e ON e.id = vl.value_record_id
    WHERE vi.value_text = 'Incomplete Established Date'
      AND (e.id IS NULL OR e.entity_type = 'Individual')
      AND r.deleted_at IS NULL
  LOOP
    DELETE FROM client_update_page_items WHERE custom_record_id = v_row.record_id;
    UPDATE company_table_records SET deleted_at = now() WHERE id = v_row.record_id;
  END LOOP;
END $$;
