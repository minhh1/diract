-- Removes the Supplier column from every existing Disbursements
-- record-dashboard tab's grid widget. Verified live before writing this:
-- every existing Disbursements tab's grid fieldIds array was identical
-- across all matters within a company (one of two variants, differing only
-- by a pre/post GST-status-field-rename extra column) -- confirming none
-- had been individually customized, so it's safe to strip Supplier from
-- all of them rather than needing a narrower match.
--
-- Companion to the defaultRecordDashboardTabs.ts spec change (removes
-- 'supplier_name' from gridFieldKeys) -- that change only affects NEW
-- matters going forward; this backfills existing ones.
DO $$
DECLARE
  v_field RECORD;
BEGIN
  FOR v_field IN
    SELECT ctf.id AS field_id, ctf.company_id
    FROM company_table_fields ctf
    JOIN company_tables ct ON ct.id = ctf.table_id
    WHERE ct.slug = 'disbursements' AND ctf.field_key = 'supplier_name' AND ctf.deleted_at IS NULL
  LOOP
    UPDATE record_tab_dashboard_widgets rtdw
    SET widgets = (
      SELECT jsonb_agg(
        CASE
          WHEN w->>'type' = 'grid' AND (w->'config'->'fieldIds') @> to_jsonb(v_field.field_id::text) THEN
            jsonb_set(w, '{config,fieldIds}',
              (SELECT jsonb_agg(fid) FROM jsonb_array_elements_text(w->'config'->'fieldIds') fid
               WHERE fid <> v_field.field_id::text)
            )
          ELSE w
        END
      )
      FROM jsonb_array_elements(rtdw.widgets) w
    )
    WHERE tab_id IN (
      SELECT rt.id FROM record_tabs rt WHERE rt.title = 'Disbursements' AND rt.company_id = v_field.company_id
    );
  END LOOP;
END $$;
