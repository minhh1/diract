// Default "Time & Fees" / "Disbursements" record-dashboard tabs for a
// Project/Matter record -- only added for companies that actually have
// those tables (i.e. installed the Law Firm template; most companies won't
// and get nothing here). Each is a standard 'custom_dashboard' record_tabs
// row (see components/dashboard/tabs/RecordDashboardTab.tsx) pre-configured
// with a quick-add form + a totals-row grid, so the matter it's opened from
// shows every fee/disbursement recorded against it with no further setup --
// the tab's own auto-link-field detection (lib/dashboardWidgets/linkField.ts)
// locks new entries to that matter, since each table has exactly one
// project-relation field ("Matter").
import { supabase } from "@/lib/supabase";
import { createWidget } from "./defaults";
import type { DashboardWidget, GridWidget, QuickAddFormWidget } from "./types";

interface DefaultDashboardTabSpec {
  slug: string; // company_tables.slug to look up -- skipped entirely if the company has no such table
  title: string;
  icon: string;
  gridFieldKeys: string[]; // display order, left to right
  quickAddFieldKeys: string[]; // 'matter' deliberately omitted from both -- fixedValues locks it, see RecordDashboardTab.tsx
}

export const DEFAULT_PROJECT_DASHBOARD_TAB_SPECS: DefaultDashboardTabSpec[] = [
  {
    slug: 'time-fee-entries',
    title: 'Time & Fees',
    icon: 'Clock',
    gridFieldKeys: ['date', 'staff', 'type', 'description', 'rate', 'duration_hours', 'billable', 'amount'],
    quickAddFieldKeys: ['date', 'staff', 'type', 'task_code', 'description', 'activity_code', 'rate', 'duration_hours', 'billable'],
  },
  {
    slug: 'disbursements',
    title: 'Disbursements',
    icon: 'Receipt',
    gridFieldKeys: ['date', 'staff', 'supplier_name', 'description', 'rate', 'quantity', 'gst_inclusive', 'billable', 'amount'],
    quickAddFieldKeys: ['date', 'staff', 'supplier_name', 'expense_code', 'description', 'rate', 'quantity', 'gst_inclusive', 'billable'],
  },
];

interface RecordTabInsert {
  company_id: string;
  record_id: string;
  record_table: 'projects';
  title: string;
  icon: string;
  tab_type: 'custom_dashboard';
  linked_table_id: string;
  display_order: number;
}

// Builds the record_tabs rows (not yet inserted) + matching widgets array
// for every spec this company has a live table for AND doesn't already have
// a tab for (existingLinkedTableIds) -- idempotent by design, so it's safe
// to call every time a project's tabs load, not just once on first open.
export async function buildMissingDefaultProjectDashboardTabs(
  companyId: string,
  recordId: string,
  startDisplayOrder: number,
  existingLinkedTableIds: Set<string>,
): Promise<{ tabs: RecordTabInsert[]; widgetsByLinkedTableId: Map<string, DashboardWidget[]> }> {
  const tabs: RecordTabInsert[] = [];
  const widgetsByLinkedTableId = new Map<string, DashboardWidget[]>();
  let order = startDisplayOrder;

  for (const spec of DEFAULT_PROJECT_DASHBOARD_TAB_SPECS) {
    const { data: table } = await supabase
      .from('company_tables').select('id').eq('company_id', companyId).eq('slug', spec.slug).is('deleted_at', null).maybeSingle();
    if (!table || existingLinkedTableIds.has(table.id)) continue;

    const { data: fields } = await supabase
      .from('company_table_fields').select('id, field_key').eq('table_id', table.id).is('deleted_at', null);
    const idByKey = new Map((fields || []).map(f => [f.field_key, f.id]));
    const resolve = (keys: string[]) => keys.map(k => idByKey.get(k)).filter((id): id is string => !!id);

    const quickAdd = createWidget('quick_add_form', []) as QuickAddFormWidget;
    quickAdd.config.fieldIds = resolve(spec.quickAddFieldKeys);
    const grid = createWidget('grid', [quickAdd]) as GridWidget;
    grid.config.fieldIds = resolve(spec.gridFieldKeys);
    grid.config.showTotalsRow = true;

    tabs.push({
      company_id: companyId, record_id: recordId, record_table: 'projects',
      title: spec.title, icon: spec.icon, tab_type: 'custom_dashboard',
      linked_table_id: table.id, display_order: order++,
    });
    widgetsByLinkedTableId.set(table.id, [quickAdd, grid]);
  }

  return { tabs, widgetsByLinkedTableId };
}
