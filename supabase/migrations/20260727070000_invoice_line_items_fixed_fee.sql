-- Fixed Fee time entries (Time & Fee Entries' 'type' select -- see
-- lib/dashboardWidgets/defaultRecordDashboardTabs.ts) don't have a
-- meaningful hours figure (Duration (Hours) is pinned to a synthetic 1 so
-- Amount = Rate x Duration still resolves to Rate -- see
-- DashboardQuickAddForm.tsx/DashboardGrid.tsx). Snapshotted here so an
-- issued invoice's PDF/Word template can print "Fixed Fee" in place of an
-- hours figure that was never real, without needing to re-derive it from
-- the (possibly since-edited) source entry.
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS is_fixed_fee boolean NOT NULL DEFAULT false;
