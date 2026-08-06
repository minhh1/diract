// Quick Glance's own widget shape -- deliberately separate from
// DashboardWidget/DashboardWidgetRenderer.tsx (used by every real dashboard
// in this app) rather than extending that shared union, because Quick
// Glance's fundamental constraint is different: a normal dashboard is bound
// to exactly one source table, with fields/records fetched once and handed
// identically to every widget on it (see useDashboardData.ts). Quick Glance
// mixes several tables at once (trust-transactions/time-fee-entries/
// invoices for a Law Firm; properties/finance-model-loans/tasks for a
// Property Developer), so each widget instance here carries its own table
// reference instead of inheriting one shared context.
//
// Two widget kinds:
//   'generic'  -- wraps an existing DashboardWidget as-is (grid/summary_tile/
//                 chart/time_fees_report/...), rendered through the SAME
//                 DashboardWidgetRenderer every other dashboard uses, just
//                 fed THIS widget's own resolved table data (see
//                 QuickGlanceWidgetCell.tsx) instead of one shared set.
//   'bespoke'  -- Quick-Glance-only, self-fetching (same "own Supabase calls
//                 internally" shape SetupChecklist.tsx already has) -- for
//                 content that joins multiple tables or has no equivalent
//                 generic widget shape (trust stats, unpaid invoices, the
//                 property map+list panel, the setup checklist itself).
import type { DashboardWidget, WidgetLayout } from "./types";
import type { DashboardSourceKind } from "@/lib/hooks/useDashboardData";

export interface GenericQuickGlanceWidget {
  kind: "generic";
  id: string;
  layout: WidgetLayout;
  sourceTableType: DashboardSourceKind;
  // company_tables.id when sourceTableType === 'custom', otherwise null.
  sourceTableId: string | null;
  widget: DashboardWidget;
}

export type QuickGlanceStatKey = "trust_balance" | "dormant_trust_count" | "matters_with_trust_count";

export type QuickGlanceBespokeType = "setup_checklist" | "quick_glance_stat" | "unpaid_invoices" | "property_projects_panel" | "ai_assistant";

export interface BespokeQuickGlanceWidget {
  kind: "bespoke";
  id: string;
  layout: WidgetLayout;
  type: QuickGlanceBespokeType;
  // { statKey: QuickGlanceStatKey } for quick_glance_stat, {} for the rest.
  config: Record<string, unknown>;
}

export type QuickGlanceWidget = GenericQuickGlanceWidget | BespokeQuickGlanceWidget;

export const QUICK_GLANCE_BESPOKE_TYPE_META: Record<QuickGlanceBespokeType, { label: string; icon: string }> = {
  setup_checklist: { label: "Setup checklist", icon: "ListChecks" },
  quick_glance_stat: { label: "Trust stat card", icon: "Landmark" },
  unpaid_invoices: { label: "Unpaid invoices", icon: "Receipt" },
  property_projects_panel: { label: "Projects map & list", icon: "MapPin" },
  ai_assistant: { label: "AI assistant", icon: "Sparkles" },
};

// Same "only means anything on a company with the Law Firm template
// installed" gate as lib/dashboardWidgets/defaults.ts's LAW_FIRM_ONLY_WIDGET_TYPES.
export const LAW_FIRM_ONLY_BESPOKE_TYPES: QuickGlanceBespokeType[] = ["quick_glance_stat", "unpaid_invoices"];
export const PROPERTY_DEVELOPER_ONLY_BESPOKE_TYPES: QuickGlanceBespokeType[] = ["property_projects_panel"];

export const DEFAULT_LAYOUT_BY_BESPOKE_TYPE: Record<QuickGlanceBespokeType, Omit<WidgetLayout, "x" | "y">> = {
  setup_checklist: { w: 12, h: 3 },
  quick_glance_stat: { w: 3, h: 2 },
  unpaid_invoices: { w: 5, h: 8 },
  property_projects_panel: { w: 12, h: 14 },
  ai_assistant: { w: 6, h: 12 },
};

export const QUICK_GLANCE_STAT_LABELS: Record<QuickGlanceStatKey, string> = {
  trust_balance: "Trust balance",
  dormant_trust_count: "Dormant trust",
  matters_with_trust_count: "Matters with trust",
};

export function createBespokeQuickGlanceWidget(type: QuickGlanceBespokeType, existing: QuickGlanceWidget[]): BespokeQuickGlanceWidget {
  const y = existing.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
  const layout: WidgetLayout = { x: 0, y, ...DEFAULT_LAYOUT_BY_BESPOKE_TYPE[type] };
  const config = type === "quick_glance_stat" ? { statKey: "trust_balance" as QuickGlanceStatKey } : {};
  return { kind: "bespoke", id: crypto.randomUUID(), layout, type, config };
}

export function createGenericQuickGlanceWidget(
  widget: DashboardWidget,
  sourceTableType: DashboardSourceKind,
  sourceTableId: string | null,
  existing: QuickGlanceWidget[],
  layout: Omit<WidgetLayout, "x" | "y">
): GenericQuickGlanceWidget {
  const y = existing.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
  const fullLayout: WidgetLayout = { x: 0, y, ...layout };
  return { kind: "generic", id: crypto.randomUUID(), layout: fullLayout, sourceTableType, sourceTableId, widget: { ...widget, layout: fullLayout } };
}
