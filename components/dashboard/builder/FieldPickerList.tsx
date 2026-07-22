"use client";

// Checkbox-and-reorder field picker, used by WidgetConfigPanel for any
// widget type that needs an ordered subset of a table's fields (quick-add
// form, grid columns, filter bar). Extracted from the old fixed-form
// builder page so both the per-widget config panel and (if reintroduced)
// anywhere else can share it.
import { ChevronUp, ChevronDown } from "lucide-react";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";

interface Props {
  title: string;
  fields: CustomTableField[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  max?: number;
}

export default function FieldPickerList({ title, fields, selectedIds, onChange, max }: Props) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(i => i !== id));
    else if (!max || selectedIds.length < max) onChange([...selectedIds, id]);
  };
  const move = (id: string, dir: -1 | 1) => {
    const idx = selectedIds.indexOf(id);
    const next = [...selectedIds];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
        {title}{max ? ` (max ${max})` : ''}
      </p>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {fields.map(f => {
          const selected = selectedIds.includes(f.id);
          return (
            <div key={f.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${selected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
              <input type="checkbox" checked={selected} onChange={() => toggle(f.id)} className="accent-indigo-600" />
              <span className="text-[12px] font-medium text-slate-700 flex-1">{f.label}</span>
              <span className="text-[9px] text-slate-400 uppercase">{f.field_type}</span>
              {selected && (
                <div className="flex gap-0.5 shrink-0">
                  <button onClick={() => move(f.id, -1)} className="p-0.5 text-slate-300 hover:text-slate-600"><ChevronUp size={12} /></button>
                  <button onClick={() => move(f.id, 1)} className="p-0.5 text-slate-300 hover:text-slate-600"><ChevronDown size={12} /></button>
                </div>
              )}
            </div>
          );
        })}
        {fields.length === 0 && <p className="text-[11px] text-slate-300 italic py-2 text-center">No eligible fields</p>}
      </div>
    </div>
  );
}
