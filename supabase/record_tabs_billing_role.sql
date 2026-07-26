-- Tags a default project-dashboard tab with the role it plays in invoicing,
-- set once at tab-creation time (see
-- lib/dashboardWidgets/defaultRecordDashboardTabs.ts) so CreateInvoiceModal/
-- InvoicesTab/RecordDashboardTab can find "this matter's Invoices table" and
-- "this matter's fee-source tables" by querying record_tabs instead of
-- hardcoding a slug like 'invoices'/'time-fee-entries'/'disbursements' at
-- runtime -- works unchanged for a company that's since renamed or
-- customized those tables, since the slug lookup only ever happens once,
-- here, at tab creation.
ALTER TABLE record_tabs ADD COLUMN IF NOT EXISTS billing_role text
  CHECK (billing_role IN ('invoices', 'fee_source'));
