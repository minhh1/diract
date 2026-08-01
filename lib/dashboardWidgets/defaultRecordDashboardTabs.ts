// Default "Time & Fees" / "Disbursements" / "Invoices" record-dashboard tabs
// for a Project/Matter record -- only added for companies that actually have
// those tables (i.e. installed the Law Firm template; most companies won't
// and get nothing here). Time & Fees/Disbursements are standard
// 'custom_dashboard' record_tabs rows (see
// components/dashboard/tabs/RecordDashboardTab.tsx) pre-configured with a
// quick-add form + a totals-row grid, so the matter it's opened from shows
// every fee/disbursement recorded against it with no further setup -- the
// tab's own auto-link-field detection (lib/dashboardWidgets/linkField.ts)
// locks new entries to that matter, since each table has exactly one
// project-relation field ("Matter"). Invoices is bespoke ('invoice_dashboard'
// tab_type, see components/dashboard/tabs/InvoicesTab.tsx) with no widgets to
// seed.
//
// Every tab this file creates is tagged with `billing_role`
// ('fee_source' | 'invoices') at creation time -- the ONE place a slug
// lookup ('time-fee-entries'/'disbursements'/'invoices') happens.
// CreateInvoiceModal/InvoicesTab/RecordDashboardTab all resolve "this
// matter's invoicing tables" by querying record_tabs for that tag afterward,
// never by slug again -- portable to a company that's since renamed or
// customized these tables.
import { supabase } from "@/lib/supabase";
import { createWidget } from "./defaults";
import type { DashboardWidget, GridWidget, QuickAddFormWidget } from "./types";

interface DefaultDashboardTabSpec {
  slug: string; // company_tables.slug to look up -- skipped entirely if the company has no such table
  title: string;
  icon: string;
  gridFieldKeys: string[]; // display order, left to right
  quickAddFieldKeys: string[]; // 'matter' deliberately omitted from both -- fixedValues locks it, see RecordDashboardTab.tsx
  // Only Time & Fees/Disbursements are real "fee sources" -- CreateInvoiceModal.tsx
  // pulls unbilled line items from every tab tagged 'fee_source' when
  // generating an invoice. Trust and Credits move money but are never
  // themselves billable line items, so they're deliberately left untagged
  // (billing_role stays null) -- tagging them would let trust movements or
  // client credit entries leak onto a client invoice.
  isFeeSource?: boolean;
}

export const DEFAULT_PROJECT_DASHBOARD_TAB_SPECS: DefaultDashboardTabSpec[] = [
  {
    slug: 'time-fee-entries',
    title: 'Time & Fees',
    icon: 'Clock',
    gridFieldKeys: ['date', 'staff', 'type', 'description', 'rate', 'duration_hours', 'billable', 'gst_status', 'amount'],
    quickAddFieldKeys: ['date', 'staff', 'type', 'task_code', 'description', 'activity_code', 'rate', 'duration_hours', 'billable', 'gst_status'],
    isFeeSource: true,
  },
  {
    slug: 'disbursements',
    title: 'Disbursements',
    icon: 'Receipt',
    // Supplier deliberately left off the default grid -- it's still on the
    // quick-add form (so it's always captured), but most firms don't need
    // it as its own column in the everyday summary view. Anyone who wants
    // it there can add it back via the grid's own column customization.
    gridFieldKeys: ['date', 'staff', 'description', 'rate', 'quantity', 'gst_status', 'billable', 'amount'],
    quickAddFieldKeys: ['date', 'staff', 'supplier_name', 'expense_code', 'description', 'rate', 'quantity', 'gst_status', 'billable'],
    isFeeSource: true,
  },
  // Trust used to be seeded here as a generic 'custom_dashboard' grid --
  // superseded by the dedicated 'trust_account' tab_type (see
  // components/dashboard/tabs/TrustAccountTab.tsx and RecordDashboard.tsx's
  // loadTabs, which seeds it directly, same Law-Firm-template gate as
  // Finance Model). Existing matters' old grid tabs were migrated by
  // supabase/migrations/20260802170000_trust_account_tab.sql.
  {
    slug: 'client-credits',
    title: 'Credits',
    icon: 'BadgePercent',
    // Operating-side ledger (NOT trust -- see 20260731100000_trust_account_page.sql).
    // Unlike Trust, there's no multi-matter/shared-receipt or PDF workflow
    // to protect here, so a plain quick-add form (same shape as Time &
    // Fees/Disbursements) is the right size -- no bespoke modal needed.
    gridFieldKeys: ['credit_number', 'date', 'description', 'client', 'invoice', 'amount_in', 'amount_out', 'running_balance'],
    quickAddFieldKeys: ['date', 'client', 'description', 'amount_in', 'amount_out', 'invoice'],
  },
];

// Bespoke -- no grid/quick-add widgets to build, InvoicesTab.tsx manages its
// own state entirely.
const INVOICES_TAB_SPEC = { slug: 'invoices', title: 'Invoices', icon: 'Receipt' };

interface RecordTabInsert {
  company_id: string;
  record_id: string;
  record_table: string; // system table name, or company_tables.id for custom-table records
  title: string;
  icon: string;
  tab_type: 'custom_dashboard' | 'invoice_dashboard';
  linked_table_id: string;
  display_order: number;
  billing_role: 'fee_source' | 'invoices' | null;
}

// company_record_tab_defaults only changes when a company (re-)installs a
// template's dashboards opt-in -- a rare, admin-initiated action -- yet
// buildMissingDefaultTabsFromCompanyDefaults was re-querying it on every
// single record-dashboard open (every tab load, not just the first). Cached
// per company+recordTable with a short TTL, same tradeoff as
// useCustomTables' cache: long enough that opening records back-to-back
// never re-hits the network, short enough that a template installed earlier
// in the same session shows up without a full reload.
const RECORD_TAB_DEFAULTS_CACHE_TTL_MS = 60_000;
const recordTabDefaultsCache = new Map<string, { data: any[]; expiresAt: number }>();

async function fetchCompanyRecordTabDefaults(companyId: string, recordTable: string): Promise<any[]> {
  const key = `${companyId}:${recordTable}`;
  const cached = recordTabDefaultsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const { data } = await supabase
    .from('company_record_tab_defaults')
    .select('*')
    .eq('company_id', companyId)
    .eq('record_table', recordTable)
    .order('display_order');
  const result = data || [];
  recordTabDefaultsCache.set(key, { data: result, expiresAt: Date.now() + RECORD_TAB_DEFAULTS_CACHE_TTL_MS });
  return result;
}

// Company-level record-tab defaults (company_record_tab_defaults -- written
// by template installs when the dashboards opt-in is ticked, see
// supabase/template_record_tabs.sql): the data-driven generalization of the
// hardcoded project specs above. Same lazy-materialization contract --
// returns not-yet-inserted record_tabs rows + their widgets for every
// default this record doesn't already have a tab for -- but works for ANY
// record table (system or custom), so any template can ship record
// dashboards, not just the Law Firm one.
export async function buildMissingDefaultTabsFromCompanyDefaults(
  companyId: string,
  recordTable: string,
  recordId: string,
  startDisplayOrder: number,
  existingLinkedTableIds: Set<string>,
): Promise<{ tabs: any[]; widgetsByLinkedTableId: Map<string, DashboardWidget[]> }> {
  const tabs: any[] = [];
  const widgetsByLinkedTableId = new Map<string, DashboardWidget[]>();
  const defaults = await fetchCompanyRecordTabDefaults(companyId, recordTable);

  let order = startDisplayOrder;
  for (const d of defaults) {
    if (existingLinkedTableIds.has(d.linked_table_id) || widgetsByLinkedTableId.has(d.linked_table_id)) continue;
    tabs.push({
      company_id: companyId, record_id: recordId, record_table: recordTable,
      title: d.title, icon: d.icon || 'LayoutGrid', tab_type: 'custom_dashboard',
      linked_table_id: d.linked_table_id, display_order: order++,
    });
    widgetsByLinkedTableId.set(d.linked_table_id, (d.widgets || []) as DashboardWidget[]);
  }
  return { tabs, widgetsByLinkedTableId };
}

// Builds the record_tabs rows (not yet inserted) + matching widgets array
// for every spec this company has a live table for AND doesn't already have
// a tab for (existingLinkedTableIds) -- idempotent by design, so it's safe
// to call every time a project's tabs load, not just once on first open.
//
// `customTables` is the company's already-loaded company_tables list (see
// useCustomTables' shared, warmed cache) -- this used to re-query
// company_tables by slug on every single project-dashboard open (up to 3
// sequential round trips: two specs + invoices), even though every caller
// already has this exact list sitting in memory from useCustomTables().
// Looking it up locally instead means the common case (all default tabs
// already exist) costs zero network calls here.
export async function buildMissingDefaultProjectDashboardTabs(
  companyId: string,
  recordId: string,
  startDisplayOrder: number,
  existingLinkedTableIds: Set<string>,
  customTables: { id: string; slug: string }[],
): Promise<{ tabs: RecordTabInsert[]; widgetsByLinkedTableId: Map<string, DashboardWidget[]> }> {
  const tabs: RecordTabInsert[] = [];
  const widgetsByLinkedTableId = new Map<string, DashboardWidget[]>();
  let order = startDisplayOrder;
  const findTable = (slug: string) => customTables.find(t => t.slug === slug);

  for (const spec of DEFAULT_PROJECT_DASHBOARD_TAB_SPECS) {
    const table = findTable(spec.slug);
    if (!table || existingLinkedTableIds.has(table.id)) continue;

    const { data: fields } = await supabase
      .from('company_table_fields').select('id, field_key').eq('table_id', table.id).is('deleted_at', null);
    const idByKey = new Map((fields || []).map(f => [f.field_key, f.id]));
    const resolve = (keys: string[]) => keys.map(k => idByKey.get(k)).filter((id): id is string => !!id);

    // A spec with no quickAddFieldKeys (Trust) gets NO quick_add_form widget
    // at all -- view/print-only, see its own doc comment above.
    const widgets: DashboardWidget[] = [];
    if (spec.quickAddFieldKeys.length) {
      const quickAdd = createWidget('quick_add_form', []) as QuickAddFormWidget;
      quickAdd.config.fieldIds = resolve(spec.quickAddFieldKeys);
      widgets.push(quickAdd);
    }
    const grid = createWidget('grid', widgets) as GridWidget;
    grid.config.fieldIds = resolve(spec.gridFieldKeys);
    grid.config.showTotalsRow = true;
    widgets.push(grid);

    tabs.push({
      company_id: companyId, record_id: recordId, record_table: 'projects',
      title: spec.title, icon: spec.icon, tab_type: 'custom_dashboard',
      linked_table_id: table.id, display_order: order++, billing_role: spec.isFeeSource ? 'fee_source' : null,
    });
    widgetsByLinkedTableId.set(table.id, widgets);
  }

  // Invoices -- bespoke tab_type, no widgets to seed.
  const invoicesTable = findTable(INVOICES_TAB_SPEC.slug);
  if (invoicesTable && !existingLinkedTableIds.has(invoicesTable.id)) {
    tabs.push({
      company_id: companyId, record_id: recordId, record_table: 'projects',
      title: INVOICES_TAB_SPEC.title, icon: INVOICES_TAB_SPEC.icon, tab_type: 'invoice_dashboard',
      linked_table_id: invoicesTable.id, display_order: order++, billing_role: 'invoices',
    });
  }

  return { tabs, widgetsByLinkedTableId };
}
