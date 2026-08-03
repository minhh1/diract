-- company_table_records has no index on table_id at all -- every custom
-- table fetch (`.eq('table_id', X).is('deleted_at', null)`, the exact
-- pattern every custom-table page/dashboard/bootstrap-warm uses) forces a
-- full sequential scan of the table across EVERY company, not just the
-- current one. Small today (a few thousand rows platform-wide), but this
-- only grows -- purely additive and risk-free (an index changes the plan,
-- never the result), unlike the RLS policy rewrite in the preceding
-- migration. Partial (WHERE deleted_at IS NULL) to match the shape of
-- every real call site and stay small as soft-deleted rows accumulate.
CREATE INDEX IF NOT EXISTS company_table_records_table_id_idx
  ON company_table_records (table_id)
  WHERE deleted_at IS NULL;
