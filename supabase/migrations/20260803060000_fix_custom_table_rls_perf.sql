-- Performance fix for company_table_fields/company_table_records/
-- company_table_values RLS: every one of these 12 policies checked
-- permission via a CORRELATED `EXISTS (SELECT 1 FROM company_tables ct
-- WHERE ct.id = <table>.table_id AND (...))`. Postgres cannot cache/hash a
-- correlated subquery like this across rows -- it's re-evaluated (with its
-- several function calls: is_current_user_admin(), user_resource_role(),
-- resource_has_explicit_permissions(), company_restricts_new_resources_by_
-- default()) once per row of the OUTER table, even though every row
-- belonging to the same custom table shares the exact same answer.
-- Confirmed via EXPLAIN ANALYZE on a company_table_values fetch for a
-- 434-row/19-field custom table: the correlated subplan ran
-- `loops=3472` (once per joined value row), costing ~1.1s of a ~3.7s
-- request that takes 6ms with RLS bypassed entirely -- almost the entire
-- cost was this one repeated per-row permission check, not the join itself.
--
-- Fix: rewrite each as `<table>.table_id IN (SELECT ct.id FROM
-- company_tables ct WHERE (...))` -- logically identical (same permission
-- tiers per policy, unchanged), but the subquery no longer references the
-- outer row at all, so Postgres can and does evaluate it once and hash-probe
-- it per row instead of re-running the whole permission check per row. This
-- is the standard fix for this exact anti-pattern (see Supabase's own RLS
-- performance guidance: prefer IN over correlated EXISTS/joins in policies).
-- Every WHERE clause below is copied verbatim from the original policies
-- (see the migration history / pg_policy for the pre-fix text) -- only the
-- correlation shape changed, not any permission tier.

-- ── company_table_fields ─────────────────────────────────────────────
ALTER POLICY ctf_select ON company_table_fields
  USING (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) IS NOT NULL
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  );

ALTER POLICY ctf_insert ON company_table_fields
  WITH CHECK (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
      )
    )
  );

ALTER POLICY ctf_update ON company_table_fields
  USING (
    company_id = active_company_id()
    AND NOT is_from_template
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
      )
    )
  )
  WITH CHECK (
    company_id = active_company_id()
    AND NOT is_from_template
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
      )
    )
  );

ALTER POLICY ctf_delete ON company_table_fields
  USING (
    company_id = active_company_id()
    AND NOT is_from_template
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = 'admin'
      )
    )
  );

-- ── company_table_records ────────────────────────────────────────────
ALTER POLICY ctr_select ON company_table_records
  USING (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) IS NOT NULL
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  );

ALTER POLICY ctr_insert ON company_table_records
  WITH CHECK (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  );

ALTER POLICY ctr_update ON company_table_records
  USING (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  )
  WITH CHECK (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  );

ALTER POLICY ctr_delete ON company_table_records
  USING (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  );

-- ── company_table_values ─────────────────────────────────────────────
ALTER POLICY ctv_select ON company_table_values
  USING (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) IS NOT NULL
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  );

ALTER POLICY ctv_insert ON company_table_values
  WITH CHECK (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  );

ALTER POLICY ctv_update ON company_table_values
  USING (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  )
  WITH CHECK (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  );

ALTER POLICY ctv_delete ON company_table_values
  USING (
    company_id = active_company_id()
    AND table_id IN (
      SELECT ct.id FROM company_tables ct WHERE (
        ct.owner_user_id = auth.uid()
        OR is_current_user_admin()
        OR user_resource_role('table', ct.id) = ANY (ARRAY['editor', 'admin'])
        OR (ct.owner_user_id IS NULL AND NOT resource_has_explicit_permissions('table', ct.id) AND NOT company_restricts_new_resources_by_default(ct.company_id))
      )
    )
  );
