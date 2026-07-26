-- Immutable snapshot of what was actually billed on an invoice -- a plain
-- table, not another EAV custom table, since it needs fixed structure and
-- fast sums without going through the formula engine. Deliberately
-- company/table-agnostic: invoice_record_id/source_record_id are bare
-- company_table_records.id references, so this works unchanged for any
-- company's own copy of an Invoices/fee-source table however it's been
-- renamed or customized -- see lib/dashboardWidgets/defaultRecordDashboardTabs.ts's
-- record_tabs.billing_role for how the app locates those tables generically
-- at runtime instead of hardcoding slugs.
--
-- The source Time & Fee Entry/Disbursement row stays the live, ever-editable
-- record of work done (its own `amount` keeps recomputing from rate/hours);
-- original_amount/billed_amount here are frozen at the moment the invoice
-- was created, so a later edit to the source entry never silently changes an
-- already-issued invoice's total.
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_record_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('fee', 'disbursement')),
  source_record_id uuid NOT NULL,
  description text,
  original_amount numeric NOT NULL,
  billed_amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Snapshotted alongside the amounts (not read live off source_record_id at
  -- PDF-render time) so an already-issued invoice's PDF never changes if the
  -- source entry is later edited, reassigned to a different staff member, or
  -- soft-deleted. rate/hours are fee-only (null on disbursement lines).
  entry_date date,
  staff_name text,
  rate numeric,
  hours numeric
);

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON invoice_line_items (invoice_record_id);
CREATE INDEX IF NOT EXISTS invoice_line_items_source_idx ON invoice_line_items (source_record_id);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_line_items_active_company ON invoice_line_items;
CREATE POLICY invoice_line_items_active_company ON invoice_line_items
  FOR ALL
  USING (company_id = active_company_id())
  WITH CHECK (company_id = active_company_id());
