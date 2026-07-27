-- Guarantees a record_tabs row pointing at a company's Time & Fee Entries/
-- Disbursements/Invoices table is always tagged with the right
-- billing_role, no matter which code path created it.
--
-- billing_role is how CreateInvoiceModal/InvoicesTab find "this matter's
-- fee sources" (never by title or table slug directly -- both are freely
-- renamed). Confirmed live: a manually-added "+ Add tab" pointing at Time &
-- Fee Entries never set it (lib/dashboardWidgets/defaultRecordDashboardTabs.ts's
-- auto-created defaults do, but that was the only path that did), so that
-- matter's Create Invoice silently found nothing to bill. Fixed the one
-- affected matter's data and the app-code gap in RecordDashboard.tsx's
-- handleAddTab, but a single client-side fix only covers that one insert
-- path -- this trigger is the actual guarantee: ANY insert or
-- linked-table-id change on record_tabs, from any current or future code
-- path (manual add, template install, a bulk-import script, an admin tool),
-- gets corrected before it's written.
CREATE OR REPLACE FUNCTION enforce_record_tabs_billing_role()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_slug text;
BEGIN
  IF NEW.linked_table_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT slug INTO v_slug FROM company_tables WHERE id = NEW.linked_table_id;

  IF v_slug IN ('time-fee-entries', 'disbursements') THEN
    NEW.billing_role := 'fee_source';
  ELSIF v_slug = 'invoices' THEN
    NEW.billing_role := 'invoices';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_tabs_billing_role ON record_tabs;
CREATE TRIGGER record_tabs_billing_role
  BEFORE INSERT OR UPDATE OF linked_table_id ON record_tabs
  FOR EACH ROW EXECUTE FUNCTION enforce_record_tabs_billing_role();

-- One-off backfill for any company/matter already affected the same way as
-- the one found live -- a tab linked to one of these 3 tables with the
-- wrong (including null) billing_role. Safe to re-run; matches the
-- trigger's own logic exactly.
UPDATE record_tabs rt
SET billing_role = CASE ct.slug WHEN 'invoices' THEN 'invoices' ELSE 'fee_source' END
FROM company_tables ct
WHERE ct.id = rt.linked_table_id
  AND ct.slug IN ('time-fee-entries', 'disbursements', 'invoices')
  AND rt.billing_role IS DISTINCT FROM (CASE ct.slug WHEN 'invoices' THEN 'invoices' ELSE 'fee_source' END);
