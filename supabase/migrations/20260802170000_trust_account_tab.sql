-- Allow the new 'trust_account' tab_type.
ALTER TABLE record_tabs DROP CONSTRAINT record_tabs_tab_type_check;
ALTER TABLE record_tabs ADD CONSTRAINT record_tabs_tab_type_check
  CHECK (tab_type = ANY (ARRAY['fields', 'sub_projects', 'checklist', 'calendar', 'emails', 'document_templates', 'custom_dashboard', 'precedents', 'invoice_dashboard', 'related_matters', 'finance_model', 'residual_land_solver', 'trust_account']));

-- Matters previously got a generic 'custom_dashboard' grid tab titled
-- "Trust" (the trust-transactions entry in
-- lib/dashboardWidgets/defaultRecordDashboardTabs.ts's
-- DEFAULT_PROJECT_DASHBOARD_TAB_SPECS, now removed from that list). Convert
-- any matter that already has one over to the new dedicated 'trust_account'
-- tab_type (components/dashboard/tabs/TrustAccountTab.tsx) in place, rather
-- than leaving a stale grid tab alongside the new one the next page load
-- would otherwise seed.
UPDATE record_tabs
SET tab_type = 'trust_account', title = 'Trust Account', icon = 'Landmark', linked_table_id = NULL
WHERE tab_type = 'custom_dashboard'
  AND linked_table_id IN (SELECT id FROM company_tables WHERE name = 'Trust Transactions' AND deleted_at IS NULL);
