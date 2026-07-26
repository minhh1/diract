-- Some custom tables are pure line-item data (e.g. Time & Fee Entries) --
-- meaningfully edited in place from a dashboard's inline grid (see the Law
-- Firm template's "Time Entry" dashboard, sourced from this same table),
-- never as a full RecordDashboard with tabs. Same shape as is_ledger
-- (company_table_ledger.sql): a structural flag set once per table, read by
-- CustomTableMasterPage.tsx to skip its row-click/post-create navigation to
-- ?id=<recordId>. No admin-facing toggle yet, matching is_ledger's own
-- precedent -- both are set directly via SQL when a table is purpose-built,
-- not something a company admin flips on an arbitrary table today.
ALTER TABLE company_tables ADD COLUMN IF NOT EXISTS disable_record_dashboard boolean NOT NULL DEFAULT false;
