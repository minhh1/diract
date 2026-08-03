"use client";

// The only file in this app that imports react-grid-layout -- a drag-and-
// drop, resizable grid of dashboard widgets. Each grid item wraps the same
// DashboardWidgetRenderer used by the live view page and the Code editor's
// preview pane (see StaticWidgetGrid.tsx), so what you build here is exactly
// what viewers will see; only the interactive drag/resize chrome around it
// is specific to this editor.
//
// react-grid-layout v2 is a from-scratch rewrite of the classic v1 API --
// no WidthProvider HOC (replaced by the useContainerWidth hook) and no flat
// cols/rowHeight/draggableHandle/compactType props (grouped into
// gridConfig/dragConfig/resizeConfig objects instead). Verified against the
// installed v2.2.3 type defs directly rather than assumed from the older,
// far more common v1 API docs.
import { useState, useCallback } from "react";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GripVertical, Settings, Trash2 } from "lucide-react";
import DashboardWidgetRenderer from "../DashboardWidgetRenderer";
import AddWidgetMenu from "./AddWidgetMenu";
import WidgetConfigPanel from "./WidgetConfigPanel";
import { createWidget, TABLE_INDEPENDENT_WIDGET_TYPES, LAW_FIRM_ONLY_WIDGET_TYPES } from "@/lib/dashboardWidgets/defaults";
import type { DashboardWidget, DashboardWidgetType } from "@/lib/dashboardWidgets/types";
import type { CustomTableField, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import type { DashboardSourceKind } from "@/lib/hooks/useDashboardData";
import { useCustomTables } from "@/lib/hooks/useCustomTables";

interface Props {
  widgets: DashboardWidget[];
  onChange: (widgets: DashboardWidget[]) => void;
  fields: CustomTableField[];
  fieldById: Map<string, CustomTableField>;
  records: CustomTableRecord[];
  tableId: string;
  sourceKind: DashboardSourceKind;
  companyId: string;
  userId: string;
}

export default function CanvasEditor({ widgets, onChange, fields, fieldById, records, tableId, sourceKind, companyId, userId }: Props) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [configuringId, setConfiguringId] = useState<string | null>(null);

  // Same "has the Law Firm template" gate Sidebar.tsx/AddTabModal.tsx
  // already use -- trust-accounts only exists for a company that's
  // installed it, so its presence stands in for the template itself.
  const { tables: customTables } = useCustomTables(userId);
  const hasLawFirmTemplate = customTables.some(t => t.slug === 'trust-accounts');

  const layout: Layout = widgets.map(w => ({ i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h }));

  const handleLayoutChange = useCallback((next: Layout) => {
    const byId = new Map(next.map(l => [l.i, l]));
    onChange(widgets.map(w => {
      const l = byId.get(w.id);
      if (!l) return w;
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
    }));
  }, [widgets, onChange]);

  const handleAdd = (type: DashboardWidgetType) => {
    onChange([...widgets, createWidget(type, widgets)]);
  };

  const handleDelete = (id: string) => {
    onChange(widgets.filter(w => w.id !== id));
  };

  const configuringWidget = widgets.find(w => w.id === configuringId) || null;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AddWidgetMenu
          onAdd={handleAdd}
          allowedTypes={sourceKind === 'none' ? TABLE_INDEPENDENT_WIDGET_TYPES : undefined}
          excludedTypes={hasLawFirmTemplate ? undefined : LAW_FIRM_ONLY_WIDGET_TYPES}
        />
      </div>

      {widgets.length === 0 ? (
        <p className="text-center text-[11px] text-slate-300 italic py-16 border border-dashed border-slate-200 rounded-2xl">
          No widgets yet. Click "Add widget" to start building
        </p>
      ) : (
        <div ref={containerRef}>
          {mounted && (
            <GridLayout
              width={width}
              layout={layout}
              gridConfig={{ cols: 12, rowHeight: 40, margin: [12, 12], containerPadding: [0, 0], maxRows: Infinity }}
              dragConfig={{ enabled: true, bounded: false, handle: '.widget-drag-handle', threshold: 3 }}
              resizeConfig={{ enabled: true, handles: ['se'] }}
              onLayoutChange={handleLayoutChange}
            >
              {widgets.map(w => (
                <div key={w.id} className="group relative bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  {/* Always visible, not hover-only -- opacity-0
                      group-hover:opacity-100 is invisible AND unreachable on
                      touch (no persistent :hover), e.g. iPad Safari. */}
                  <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
                    <span className="widget-drag-handle p-1.5 bg-white/95 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 cursor-move shadow-sm">
                      <GripVertical size={12} />
                    </span>
                    <button
                      onClick={() => setConfiguringId(w.id)}
                      className="p-1.5 bg-white/95 border border-slate-200 rounded-lg text-slate-400 hover:text-indigo-600 shadow-sm"
                    >
                      <Settings size={12} />
                    </button>
                    <button
                      onClick={() => handleDelete(w.id)}
                      className="p-1.5 bg-white/95 border border-slate-200 rounded-lg text-slate-400 hover:text-red-500 shadow-sm"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="p-3 h-full overflow-auto">
                    <DashboardWidgetRenderer
                      widget={w}
                      fields={fields}
                      fieldById={fieldById}
                      records={records}
                      allRecords={records}
                      tableId={tableId}
                      sourceKind={sourceKind}
                      companyId={companyId}
                      userId={userId}
                      filters={{}}
                      setFilter={() => {}}
                      onChanged={() => {}}
                      mode="preview"
                    />
                  </div>
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      )}

      {configuringWidget && (
        <WidgetConfigPanel
          widget={configuringWidget}
          fields={fields}
          allWidgets={widgets}
          onClose={() => setConfiguringId(null)}
          onSave={(updated) => {
            onChange(widgets.map(w => w.id === updated.id ? updated : w));
            setConfiguringId(null);
          }}
        />
      )}
    </div>
  );
}
