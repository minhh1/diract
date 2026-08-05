"use client";

// Renders ONE Quick Glance widget -- the piece that resolves per-widget data
// before delegating to the existing, shared DashboardWidgetRenderer (every
// other dashboard in this app's one rendering dispatch point), since Quick
// Glance widgets each carry their own source table instead of inheriting one
// shared dashboard-level table (see lib/dashboardWidgets/quickGlanceTypes.ts's
// header comment for why). Both `useCustomTable`/`useSystemTableAsCustomTable`
// are always called (Rules of Hooks) -- each tolerates a null table
// identifier by no-op'ing, mirroring DashboardBuilderPage.tsx's identical
// pattern -- since this component renders exactly one widget per instance,
// that's safe (no conditional hook calls between renders of the SAME cell).
import { useMemo } from "react";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { useSystemTableAsCustomTable, SYSTEM_TABLE_NAMES, type SystemTableName } from "@/lib/hooks/useSystemTableAsCustomTable";
import DashboardWidgetRenderer from "../DashboardWidgetRenderer";
import SetupChecklist from "./SetupChecklist";
import UnpaidInvoicesWidget from "./UnpaidInvoicesWidget";
import QuickGlanceStatWidget from "./widgets/QuickGlanceStatWidget";
import PropertyProjectsPanelWidget from "./widgets/PropertyProjectsPanelWidget";
import type { QuickGlanceWidget, QuickGlanceStatKey } from "@/lib/dashboardWidgets/quickGlanceTypes";

export default function QuickGlanceWidgetCell({ widget, mode }: { widget: QuickGlanceWidget; mode: "view" | "preview" }) {
  const { companyId, userId, isAdmin } = useCompany();
  const { tables } = useCustomTables(userId);

  const isGeneric = widget.kind === "generic";
  const isSystemSource = isGeneric && (SYSTEM_TABLE_NAMES as readonly string[]).includes(widget.sourceTableType);
  const sourceSlug = useMemo(() => {
    if (!isGeneric || widget.sourceTableType !== "custom" || !widget.sourceTableId) return null;
    return tables.find(t => t.id === widget.sourceTableId)?.slug || null;
  }, [isGeneric, widget, tables]);

  const customTableResult = useCustomTable(isGeneric && widget.sourceTableType === "custom" ? sourceSlug : null);
  const systemTableResult = useSystemTableAsCustomTable(
    isSystemSource ? (widget.sourceTableType as SystemTableName) : null,
    companyId
  );
  const source = isSystemSource ? systemTableResult : customTableResult;
  const fieldById = useMemo(() => new Map(source.fields.map(f => [f.id, f])), [source.fields]);

  if (widget.kind === "bespoke") {
    switch (widget.type) {
      case "setup_checklist":
        return <SetupChecklist />;
      case "unpaid_invoices":
        return <UnpaidInvoicesWidget />;
      case "quick_glance_stat":
        return <QuickGlanceStatWidget statKey={(widget.config.statKey as QuickGlanceStatKey) || "trust_balance"} />;
      case "property_projects_panel":
        return <PropertyProjectsPanelWidget />;
      default:
        return null;
    }
  }

  const tableId = isSystemSource ? (widget.sourceTableType as string) : (widget.sourceTableId || "");

  if (!companyId || !userId) return null;

  return (
    <DashboardWidgetRenderer
      widget={widget.widget}
      sourceKind={widget.sourceTableType}
      fields={source.fields}
      fieldById={fieldById}
      records={source.records}
      recordsLoading={source.recordsLoading}
      allRecords={source.records}
      tableId={tableId}
      companyId={companyId}
      userId={userId}
      filters={{}}
      setFilter={() => {}}
      onChanged={source.refetch}
      onOptimisticAdd={source.addRecordOptimistic}
      isAdmin={mode === "view" ? isAdmin : undefined}
      mode={mode}
    />
  );
}
