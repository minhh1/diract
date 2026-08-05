"use client";

// "Add widget" for Quick Glance -- two kinds to pick from (see
// lib/dashboardWidgets/quickGlanceTypes.ts): a bespoke Quick-Glance-only
// type (added immediately, no further config needed -- quick_glance_stat
// defaults to Trust balance and is reconfigurable afterward via the gear
// icon) or one of the existing generic DashboardWidgetTypes, which then
// needs a source table picked (same system-table-or-custom-table picker
// DashboardBuilderPage.tsx's "Source table" <select> already uses -- one
// flat list, no visual distinction between the two kinds of table).
import { useState, useRef, useEffect } from "react";
import * as LucideIcons from "lucide-react";
import { Plus, ChevronLeft } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { SYSTEM_TABLE_NAMES, type SystemTableName } from "@/lib/hooks/useSystemTableAsCustomTable";
import { WIDGET_TYPE_META, TABLE_INDEPENDENT_WIDGET_TYPES, LAW_FIRM_ONLY_WIDGET_TYPES, createWidget, DEFAULT_LAYOUT_BY_TYPE } from "@/lib/dashboardWidgets/defaults";
import type { DashboardWidgetType } from "@/lib/dashboardWidgets/types";
import type { DashboardSourceKind } from "@/lib/hooks/useDashboardData";
import {
  QUICK_GLANCE_BESPOKE_TYPE_META, LAW_FIRM_ONLY_BESPOKE_TYPES, PROPERTY_DEVELOPER_ONLY_BESPOKE_TYPES,
  createBespokeQuickGlanceWidget, createGenericQuickGlanceWidget,
  type QuickGlanceWidget, type QuickGlanceBespokeType,
} from "@/lib/dashboardWidgets/quickGlanceTypes";

const ALL_BESPOKE_TYPES = Object.keys(QUICK_GLANCE_BESPOKE_TYPE_META) as QuickGlanceBespokeType[];
const ALL_GENERIC_TYPES = Object.keys(WIDGET_TYPE_META) as DashboardWidgetType[];
const DEFAULT_SYSTEM_TABLE_LABELS: Record<SystemTableName, string> = { projects: 'Projects', properties: 'Properties', entities: 'Entities' };

interface Props {
  onAdd: (widget: QuickGlanceWidget) => void;
  existing: QuickGlanceWidget[];
  hasLawFirmTemplate: boolean;
  hasPropertyDeveloperTemplate: boolean;
}

type Step = "closed" | "pick-type" | "pick-table";

export default function AddQuickGlanceWidgetMenu({ onAdd, existing, hasLawFirmTemplate, hasPropertyDeveloperTemplate }: Props) {
  const { userId, tableLabelOverrides } = useCompany();
  const { tables } = useCustomTables(userId);
  const [step, setStep] = useState<Step>("closed");
  const [pendingType, setPendingType] = useState<DashboardWidgetType | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step === "closed") return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [step]);

  const close = () => { setStep("closed"); setPendingType(null); };

  const bespokeTypes = ALL_BESPOKE_TYPES.filter(t => {
    if (LAW_FIRM_ONLY_BESPOKE_TYPES.includes(t) && !hasLawFirmTemplate) return false;
    if (PROPERTY_DEVELOPER_ONLY_BESPOKE_TYPES.includes(t) && !hasPropertyDeveloperTemplate) return false;
    return true;
  });
  const genericTypes = ALL_GENERIC_TYPES.filter(t => !(LAW_FIRM_ONLY_WIDGET_TYPES.includes(t) && !hasLawFirmTemplate));

  const addBespoke = (type: QuickGlanceBespokeType) => {
    onAdd(createBespokeQuickGlanceWidget(type, existing));
    close();
  };

  const pickGenericType = (type: DashboardWidgetType) => {
    if (TABLE_INDEPENDENT_WIDGET_TYPES.includes(type)) {
      onAdd(createGenericQuickGlanceWidget(createWidget(type, []), "none", null, existing, DEFAULT_LAYOUT_BY_TYPE[type]));
      close();
      return;
    }
    setPendingType(type);
    setStep("pick-table");
  };

  const pickTable = (sourceKind: DashboardSourceKind, sourceTableId: string | null) => {
    if (!pendingType) return;
    onAdd(createGenericQuickGlanceWidget(createWidget(pendingType, []), sourceKind, sourceTableId, existing, DEFAULT_LAYOUT_BY_TYPE[pendingType]));
    close();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setStep(s => s === "closed" ? "pick-type" : "closed")}
        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all"
      >
        <Plus size={13} /> Add widget
      </button>

      {step === "pick-type" && (
        <div className="absolute right-0 z-20 mt-2 w-64 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5">
          <p className="px-3 pt-2 pb-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Quick Glance</p>
          {bespokeTypes.map(type => {
            const meta = QUICK_GLANCE_BESPOKE_TYPE_META[type];
            const Icon = (LucideIcons as any)[meta.icon] || Plus;
            return (
              <button
                key={type}
                onClick={() => addBespoke(type)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-all text-left"
              >
                <Icon size={15} className="text-slate-400 shrink-0" />
                {meta.label}
              </button>
            );
          })}
          <p className="px-3 pt-3 pb-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-100 mt-1">Any table</p>
          {genericTypes.map(type => {
            const meta = WIDGET_TYPE_META[type];
            const Icon = (LucideIcons as any)[meta.icon] || Plus;
            return (
              <button
                key={type}
                onClick={() => pickGenericType(type)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-all text-left"
              >
                <Icon size={15} className="text-slate-400 shrink-0" />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {step === "pick-table" && pendingType && (
        <div className="absolute right-0 z-20 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2">
          <button onClick={() => { setStep("pick-type"); setPendingType(null); }} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600">
            <ChevronLeft size={12} /> Back
          </button>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Source table for {WIDGET_TYPE_META[pendingType].label}</p>
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {SYSTEM_TABLE_NAMES.map(t => (
              <button
                key={t}
                onClick={() => pickTable(t, null)}
                className="w-full text-left px-3 py-2 rounded-xl text-[12px] font-medium text-slate-700 hover:bg-slate-50"
              >
                {tableLabelOverrides[t]?.plural || DEFAULT_SYSTEM_TABLE_LABELS[t]}
              </button>
            ))}
            {tables.map(t => (
              <button
                key={t.id}
                onClick={() => pickTable("custom", t.id)}
                className="w-full text-left px-3 py-2 rounded-xl text-[12px] font-medium text-slate-700 hover:bg-slate-50"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
