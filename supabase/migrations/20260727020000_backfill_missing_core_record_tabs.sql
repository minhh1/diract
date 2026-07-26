-- Backfills a missing 'Details' tab (and, for projects, 'Checklist') onto
-- any record that already has other record_tabs rows but neither of these
-- core ones. Both are normally seeded together the very first time a
-- record is ever opened (RecordDashboard.tsx's loadTabs, empty-tabs
-- branch), but a record can end up with tabs WITHOUT ever taking that
-- path: add_company_record_tab_default (supabase/company_record_tab_defaults_admin.sql,
-- behind Admin > Default Tabs' "Add default tab") eagerly backfills its
-- new tab onto every existing Matter, including ones that had zero tabs --
-- which then never runs the empty-tabs branch again, so it never got a
-- Details tab. RecordDashboard.tsx's loadTabs top-up now does this same
-- backfill lazily on open, so this is the one-off catch-up for records
-- already stuck in that state; new occurrences self-heal without a migration.
--
-- Matched by tab_type, not title, since a user may have renamed their
-- Details tab -- inserting a second one for them would be wrong, not a fix.
-- DISTINCT ON collapses each affected record down to a single insert even
-- though it may have several existing tabs (so several matching rows in
-- the FROM below).

INSERT INTO record_tabs (company_id, record_id, record_table, title, icon, tab_type, display_order)
SELECT DISTINCT ON (rt.record_id, rt.record_table)
  rt.company_id, rt.record_id, rt.record_table, 'Details', 'FileText', 'fields',
  COALESCE((SELECT MAX(rt2.display_order) + 1 FROM record_tabs rt2
            WHERE rt2.record_id = rt.record_id AND rt2.record_table = rt.record_table), 0)
FROM record_tabs rt
WHERE NOT EXISTS (
  SELECT 1 FROM record_tabs rt3
  WHERE rt3.record_id = rt.record_id AND rt3.record_table = rt.record_table AND rt3.tab_type = 'fields'
)
ORDER BY rt.record_id, rt.record_table;

INSERT INTO record_tabs (company_id, record_id, record_table, title, icon, tab_type, display_order)
SELECT DISTINCT ON (rt.record_id, rt.record_table)
  rt.company_id, rt.record_id, rt.record_table, 'Checklist', 'CheckSquare', 'checklist',
  COALESCE((SELECT MAX(rt2.display_order) + 1 FROM record_tabs rt2
            WHERE rt2.record_id = rt.record_id AND rt2.record_table = rt.record_table), 0)
FROM record_tabs rt
WHERE rt.record_table = 'projects'
  AND NOT EXISTS (
    SELECT 1 FROM record_tabs rt3
    WHERE rt3.record_id = rt.record_id AND rt3.record_table = rt.record_table AND rt3.tab_type = 'checklist'
  )
ORDER BY rt.record_id, rt.record_table;
