// Default Quick Glance widget arrangement per company type -- mirrors
// today's original hardcoded layout (LawFirmQuickGlance.tsx/
// PropertyDeveloperQuickGlance.tsx before they became movable/resizable
// widgets). Used two places: the migration backfill seeds this for every
// EXISTING company (see supabase/migrations/20260805120000_company_quick_glance_layout.sql,
// same shape expressed in SQL), and QuickGlanceDashboard.tsx calls this
// client-side as a fallback for a company created AFTER that migration ran,
// which has no company_quick_glance_layout row yet.
import type { QuickGlanceWidget } from "./quickGlanceTypes";

export function defaultQuickGlanceWidgets(
  companyType: string | null,
  timeFeeEntriesTableId: string | null
): QuickGlanceWidget[] {
  const uid = () => crypto.randomUUID();

  if (companyType === "Law Firm") {
    const widgets: QuickGlanceWidget[] = [
      { kind: "bespoke", id: uid(), type: "setup_checklist", layout: { x: 0, y: 0, w: 12, h: 3 }, config: {} },
      { kind: "bespoke", id: uid(), type: "quick_glance_stat", layout: { x: 0, y: 3, w: 3, h: 2 }, config: { statKey: "trust_balance" } },
      { kind: "bespoke", id: uid(), type: "quick_glance_stat", layout: { x: 0, y: 5, w: 3, h: 2 }, config: { statKey: "dormant_trust_count" } },
      { kind: "bespoke", id: uid(), type: "quick_glance_stat", layout: { x: 0, y: 7, w: 3, h: 2 }, config: { statKey: "matters_with_trust_count" } },
      { kind: "bespoke", id: uid(), type: "unpaid_invoices", layout: { x: 0, y: 9, w: 3, h: 8 }, config: {} },
    ];
    if (timeFeeEntriesTableId) {
      const feesLayout = { x: 3, y: 3, w: 9, h: 8 };
      widgets.push({
        kind: "generic", id: uid(), layout: feesLayout, sourceTableType: "custom", sourceTableId: timeFeeEntriesTableId,
        widget: { id: uid(), type: "time_fees_report", config: {}, layout: feesLayout },
      });
      const agingLayout = { x: 3, y: 11, w: 9, h: 8 };
      widgets.push({
        kind: "generic", id: uid(), layout: agingLayout, sourceTableType: "custom", sourceTableId: timeFeeEntriesTableId,
        widget: { id: uid(), type: "time_aging_report", config: { agingDays: 30 }, layout: agingLayout },
      });
    }
    return widgets;
  }

  if (companyType === "Property Developer") {
    return [
      { kind: "bespoke", id: uid(), type: "setup_checklist", layout: { x: 0, y: 0, w: 12, h: 3 }, config: {} },
      { kind: "bespoke", id: uid(), type: "property_projects_panel", layout: { x: 0, y: 3, w: 12, h: 14 }, config: {} },
    ];
  }

  // Templateless (no Law Firm/Property Developer template installed) --
  // lead with the setup checklist and the AI assistant so there's always
  // somewhere to go build the schema out from, instead of an empty canvas.
  // See QuickGlanceDashboard.tsx's is_from_template gating for why this
  // company still lands on the normal Quick Glance canvas (not a dead end)
  // even before it's built anything.
  return [
    { kind: "bespoke", id: uid(), type: "setup_checklist", layout: { x: 0, y: 0, w: 12, h: 3 }, config: {} },
    { kind: "bespoke", id: uid(), type: "ai_assistant", layout: { x: 0, y: 3, w: 6, h: 12 }, config: {} },
  ];
}
