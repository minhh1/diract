"use client";

// Quick Glance's drag/resize grid -- modeled closely on
// components/dashboard/builder/CanvasEditor.tsx (same react-grid-layout
// gridConfig/dragConfig/resizeConfig shape), but usable in two modes off one
// component instead of a separate builder route: `editable=false` (the
// normal landing-page view -- drag/resize disabled, no chrome) and
// `editable=true` (toggled by a page-level "Edit layout" button) shows the
// same grip/settings/trash overlay CanvasEditor.tsx already established.
//
// Each grid item renders through QuickGlanceWidgetCell, which resolves that
// widget's OWN source table before delegating to the shared
// DashboardWidgetRenderer -- see quickGlanceTypes.ts's header comment for
// why (Quick Glance mixes several tables, unlike a normal single-table
// dashboard).
import { useState, useCallback, useMemo } from "react";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GripVertical, Settings, Trash2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { useSystemTableAsCustomTable, SYSTEM_TABLE_NAMES, type SystemTableName } from "@/lib/hooks/useSystemTableAsCustomTable";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import WidgetConfigPanel from "../builder/WidgetConfigPanel";
import QuickGlanceWidgetCell from "./QuickGlanceWidgetCell";
import AddQuickGlanceWidgetMenu from "./AddQuickGlanceWidgetMenu";
import { QUICK_GLANCE_STAT_LABELS, type QuickGlanceWidget, type QuickGlanceStatKey } from "@/lib/dashboardWidgets/quickGlanceTypes";

interface Props {
  widgets: QuickGlanceWidget[];
  onChange: (widgets: QuickGlanceWidget[]) => void;
  editable: boolean;
  hasLawFirmTemplate: boolean;
  hasPropertyDeveloperTemplate: boolean;
}

const STAT_KEYS: QuickGlanceStatKey[] = ["trust_balance", "dormant_trust_count", "matters_with_trust_count"];

export default function QuickGlanceCanvas({ widgets, onChange, editable, hasLawFirmTemplate, hasPropertyDeveloperTemplate }: Props) {
  const { width, containerRef, mounted } = useContainerWidth();
  const { userId, companyId } = useCompany();
  const { tables } = useCustomTables(userId);
  const [configuringId, setConfiguringId] = useState<string | null>(null);

  const layout: Layout = widgets.map(w => ({ i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h }));

  const handleLayoutChange = useCallback((next: Layout) => {
    const byId = new Map(next.map(l => [l.i, l]));
    onChange(widgets.map(w => {
      const l = byId.get(w.id);
      if (!l) return w;
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
    }));
  }, [widgets, onChange]);

  const handleDelete = (id: string) => onChange(widgets.filter(w => w.id !== id));

  const configuringWidget = widgets.find(w => w.id === configuringId) || null;

  // Resolves fields for whichever widget is currently being configured (at
  // most one at a time) -- same custom-vs-system table resolution
  // QuickGlanceWidgetCell.tsx does per-cell, scoped here to just the open
  // config panel so the grip/settings/trash overlay can stay together at
  // this level (matching CanvasEditor.tsx's own chrome position) instead of
  // needing every cell to also own a save-callback.
  const isConfiguringGeneric = configuringWidget?.kind === "generic";
  const isSystemSource = isConfiguringGeneric && (SYSTEM_TABLE_NAMES as readonly string[]).includes(configuringWidget.sourceTableType);
  const sourceSlug = useMemo(() => {
    if (!isConfiguringGeneric || configuringWidget.sourceTableType !== "custom" || !configuringWidget.sourceTableId) return null;
    return tables.find(t => t.id === configuringWidget.sourceTableId)?.slug || null;
  }, [isConfiguringGeneric, configuringWidget, tables]);
  const customTableResult = useCustomTable(isConfiguringGeneric && configuringWidget.sourceTableType === "custom" ? sourceSlug : null);
  const systemTableResult = useSystemTableAsCustomTable(isSystemSource ? (configuringWidget!.sourceTableType as SystemTableName) : null, companyId);
  const configuringFields = isSystemSource ? systemTableResult.fields : customTableResult.fields;

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex justify-end">
          <AddQuickGlanceWidgetMenu
            onAdd={(w) => onChange([...widgets, w])}
            existing={widgets}
            hasLawFirmTemplate={hasLawFirmTemplate}
            hasPropertyDeveloperTemplate={hasPropertyDeveloperTemplate}
          />
        </div>
      )}

      {widgets.length === 0 ? (
        <p className="text-center text-[11px] text-slate-300 italic py-16 border border-dashed border-slate-200 rounded-2xl">
          No widgets yet. {editable ? 'Click "Add widget" to start building.' : ""}
        </p>
      ) : (
        <div ref={containerRef}>
          {mounted && (
            <GridLayout
              width={width}
              layout={layout}
              gridConfig={{ cols: 12, rowHeight: 40, margin: [12, 12], containerPadding: [0, 0], maxRows: Infinity }}
              dragConfig={{ enabled: editable, bounded: false, handle: '.widget-drag-handle', threshold: 3 }}
              resizeConfig={{ enabled: editable, handles: ['se'] }}
              onLayoutChange={handleLayoutChange}
            >
              {widgets.map(w => (
                <div key={w.id} className={editable ? "group relative bg-white border border-slate-200 rounded-2xl overflow-hidden" : "relative overflow-hidden"}>
                  {editable && (
                    <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
                      <span className="widget-drag-handle p-1.5 bg-white/95 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 cursor-move shadow-sm">
                        <GripVertical size={12} />
                      </span>
                      {w.kind === "generic" || (w.kind === "bespoke" && w.type === "quick_glance_stat") ? (
                        <button
                          onClick={() => setConfiguringId(w.id)}
                          className="p-1.5 bg-white/95 border border-slate-200 rounded-lg text-slate-400 hover:text-indigo-600 shadow-sm"
                        >
                          <Settings size={12} />
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleDelete(w.id)}
                        className="p-1.5 bg-white/95 border border-slate-200 rounded-lg text-slate-400 hover:text-red-500 shadow-sm"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                  <div className={editable ? "p-3 h-full overflow-auto" : "h-full overflow-auto"}>
                    <QuickGlanceWidgetCell widget={w} mode={editable ? "preview" : "view"} />
                  </div>
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      )}

      {configuringWidget?.kind === "generic" && (
        <WidgetConfigPanel
          widget={configuringWidget.widget}
          fields={configuringFields}
          allWidgets={[]}
          onClose={() => setConfiguringId(null)}
          onSave={(updated) => {
            onChange(widgets.map(w => w.id === configuringWidget.id && w.kind === "generic" ? { ...w, widget: updated } : w));
            setConfiguringId(null);
          }}
        />
      )}

      {configuringWidget?.kind === "bespoke" && configuringWidget.type === "quick_glance_stat" && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/20 p-4" onClick={() => setConfiguringId(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs space-y-2" onClick={e => e.stopPropagation()}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Which stat?</p>
            {STAT_KEYS.map(key => (
              <button
                key={key}
                onClick={() => {
                  onChange(widgets.map(w => w.id === configuringWidget.id ? { ...w, config: { statKey: key } } : w));
                  setConfiguringId(null);
                }}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all ${
                  configuringWidget.config.statKey === key ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {QUICK_GLANCE_STAT_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
