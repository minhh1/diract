"use client";

import { useState, useRef, useEffect } from "react";
import * as LucideIcons from "lucide-react";
import { Plus } from "lucide-react";
import { WIDGET_TYPE_META } from "@/lib/dashboardWidgets/defaults";
import type { DashboardWidgetType } from "@/lib/dashboardWidgets/types";

const ALL_TYPES = Object.keys(WIDGET_TYPE_META) as DashboardWidgetType[];

interface Props {
  onAdd: (type: DashboardWidgetType) => void;
  // Narrows the menu to only these types -- see
  // lib/dashboardWidgets/defaults.ts's TABLE_INDEPENDENT_WIDGET_TYPES,
  // passed in by CanvasEditor for a tableless (sourceKind 'none') dashboard.
  // Undefined (the common case) shows every widget type.
  allowedTypes?: DashboardWidgetType[];
}

export default function AddWidgetMenu({ onAdd, allowedTypes }: Props) {
  const TYPES = allowedTypes ? ALL_TYPES.filter(t => allowedTypes.includes(t)) : ALL_TYPES;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all"
      >
        <Plus size={13} /> Add widget
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5">
          {TYPES.map(type => {
            const meta = WIDGET_TYPE_META[type];
            const Icon = (LucideIcons as any)[meta.icon] || Plus;
            return (
              <button
                key={type}
                onClick={() => { onAdd(type); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-all text-left"
              >
                <Icon size={15} className="text-slate-400 shrink-0" />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
