SET request.jwt.claim.role = 'service_role';

-- Generalizes 20260729340000 beyond just "Incomplete Established Date" --
-- reported live: 4 more Resolved rows (3x "Missing GST Report Frequency",
-- 1x "Missing Trust Link") pointing at deleted entities were still showing
-- "(deleted)" on the board. Removes every auto-fed item, of any issue type,
-- whose linked record (entity, property, or a custom-table source like
-- Contacts) no longer exists -- same soft-delete-the-record +
-- hard-delete-the-page-item approach as 20260729340000.
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT DISTINCT r.id AS record_id
    FROM company_table_records r
    JOIN company_table_values vl ON vl.record_id = r.id
    JOIN company_table_fields flink ON flink.id = vl.field_id AND flink.field_type IN ('entity', 'property', 'table_relation') AND vl.value_record_id IS NOT NULL
    WHERE r.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM entities e WHERE flink.field_type = 'entity' AND e.id = vl.value_record_id
        UNION ALL
        SELECT 1 FROM properties p WHERE flink.field_type = 'property' AND p.id = vl.value_record_id
        UNION ALL
        SELECT 1 FROM company_table_records ctr WHERE flink.field_type = 'table_relation' AND ctr.id = vl.value_record_id AND ctr.deleted_at IS NULL
      )
  LOOP
    DELETE FROM client_update_page_items WHERE custom_record_id = v_row.record_id;
    UPDATE company_table_records SET deleted_at = now() WHERE id = v_row.record_id;
  END LOOP;
END $$;
