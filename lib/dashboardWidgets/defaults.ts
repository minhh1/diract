import type { DashboardWidget, DashboardWidgetType, WidgetLayout } from "./types";

export const WIDGET_TYPE_META: Record<DashboardWidgetType, { label: string; icon: string }> = {
  heading: { label: 'Heading', icon: 'Heading1' },
  text: { label: 'Text', icon: 'AlignLeft' },
  filter_bar: { label: 'Filter bar', icon: 'Filter' },
  quick_add_form: { label: 'Quick-add form', icon: 'Plus' },
  grid: { label: 'Data grid', icon: 'Table2' },
  summary_tile: { label: 'Summary tile', icon: 'Hash' },
  chart: { label: 'Activity chart', icon: 'BarChart2' },
  trust_reconciliation: { label: 'Trust reconciliation', icon: 'Landmark' },
  ledes_export: { label: 'LEDES export', icon: 'FileDown' },
  trust_ledger_statement: { label: 'Trust ledger statement', icon: 'FileText' },
  trust_cash_book: { label: 'Trust cash book', icon: 'BookOpen' },
  trust_aged_balances: { label: 'Dormant trust balances', icon: 'AlertTriangle' },
  public_task_page: { label: 'Public task page', icon: 'Share2' },
  public_document_page: { label: 'Public document page', icon: 'FileSignature' },
  public_client_update_page: { label: 'Detailed table page', icon: 'Newspaper' },
  my_tasks_button: { label: 'My Tasks button', icon: 'ListChecks' },
  finance_model_search: { label: 'Finance Model search', icon: 'TrendingUp' },
  residual_land_solver: { label: 'Residual Land Solver', icon: 'Landmark' },
  auto_time_recording_button: { label: 'Auto Time Recording button', icon: 'Sparkles' },
};

// Sensible default size (grid units) for a freshly-added widget of each type;
// x/y are assigned by createWidget based on what's already on the canvas.
export const DEFAULT_LAYOUT_BY_TYPE: Record<DashboardWidgetType, Omit<WidgetLayout, 'x' | 'y'>> = {
  heading: { w: 12, h: 1 },
  text: { w: 12, h: 2 },
  filter_bar: { w: 12, h: 2 },
  quick_add_form: { w: 12, h: 2 },
  grid: { w: 12, h: 6 },
  summary_tile: { w: 3, h: 2 }, // 4 fit per 12-col row
  chart: { w: 12, h: 4 },
  trust_reconciliation: { w: 12, h: 10 },
  ledes_export: { w: 12, h: 6 },
  trust_ledger_statement: { w: 12, h: 8 },
  trust_cash_book: { w: 12, h: 8 },
  trust_aged_balances: { w: 12, h: 6 },
  // Both render a full page's worth of UI now (task table / document-fill
  // form, see PublicTaskPageWidget.tsx/DocumentPublicPageWidget.tsx), not a
  // small link card -- sized like the other full-featured widgets above.
  public_task_page: { w: 12, h: 12 },
  public_document_page: { w: 12, h: 12 },
  public_client_update_page: { w: 12, h: 12 },
  my_tasks_button: { w: 3, h: 2 },
  finance_model_search: { w: 12, h: 12 },
  residual_land_solver: { w: 12, h: 12 },
  auto_time_recording_button: { w: 3, h: 2 },
};

// The only widget types that render meaningfully with no bound source table
// at all (DashboardSourceKind 'none' -- see
// components/dashboard/DashboardBuilderPage.tsx's "No table" option) --
// everything else reads `fields`/`records` from a real table, which a
// tableless dashboard never has. Used by AddWidgetMenu to hide the rest
// rather than let someone add a grid/chart/etc. that can never do anything.
export const TABLE_INDEPENDENT_WIDGET_TYPES: DashboardWidgetType[] = [
  'heading', 'text', 'public_task_page', 'public_document_page', 'public_client_update_page',
  'finance_model_search', 'residual_land_solver', 'auto_time_recording_button',
];

export function createWidget(type: DashboardWidgetType, existingWidgets: DashboardWidget[]): DashboardWidget {
  const y = existingWidgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
  const layout: WidgetLayout = { x: 0, y, ...DEFAULT_LAYOUT_BY_TYPE[type] };
  const base = { id: crypto.randomUUID(), layout };
  switch (type) {
    case 'heading': return { ...base, type, config: { text: '', level: 2 } };
    case 'text': return { ...base, type, config: { text: '' } };
    case 'filter_bar': return { ...base, type, config: { fieldIds: [] } };
    case 'quick_add_form': return { ...base, type, config: { fieldIds: [] } };
    case 'grid': return { ...base, type, config: { fieldIds: [] } };
    case 'summary_tile': return { ...base, type, config: { label: '', fieldId: null, aggregate: 'sum', conditions: [] } };
    case 'chart': return { ...base, type, config: { dateFieldId: '', valueFieldId: null, aggregate: 'sum', granularity: 'day', series: [] } };
    case 'trust_reconciliation': return { ...base, type, config: {} };
    case 'ledes_export': return { ...base, type, config: {} };
    case 'trust_ledger_statement': return { ...base, type, config: {} };
    case 'trust_cash_book': return { ...base, type, config: {} };
    case 'trust_aged_balances': return { ...base, type, config: { dormantDays: 365 } };
    case 'public_task_page': return { ...base, type, config: { pageId: null } };
    case 'public_document_page': return { ...base, type, config: { pageId: null } };
    case 'public_client_update_page': return { ...base, type, config: { slug: null } };
    case 'my_tasks_button': return { ...base, type, config: { label: '', descriptionFieldId: null, matterFieldId: null } };
    case 'finance_model_search': return { ...base, type, config: {} };
    case 'residual_land_solver': return { ...base, type, config: {} };
    case 'auto_time_recording_button': return { ...base, type, config: { label: '' } };
  }
}
