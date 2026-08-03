// components/AutoFillFieldPicker.tsx
// Single-pick "which field auto-fills this template field" control, used by
// DocumentTemplatesTab.tsx in place of a plain <select>. Offers, in order:
// a small set of common computed values (Full Property Address, Client v
// Other Side -- see lib/documentTemplateAutoFillRelated.ts's
// resolveCompositeAutoFillValue), direct fields on the matter itself, and
// one hop into any of the matter's own relations (its linked Property,
// parent Matter, or a custom entity/property/project/table_relation field)
// -- the system relations from the same underlying data (useRelatedFields)
// the column-config picker (ColumnConfigDrawer.tsx) uses, so what shows
// here always matches what shows there, PLUS the company's own custom
// relation-type fields (Client, Other Side, ...), which useRelatedFields'
// RPC can't see since they're an app-level EAV relation, not a real
// Postgres FK constraint.
//
// Deliberately not a reuse of ColumnConfigDrawer itself: that component is a
// multi-select "which columns are visible" tool (onToggle('table'|'expand'|
// 'none')) with an entire Filters tab baked in, not a single-pick field
// chooser. This borrows its drill-in/breadcrumb interaction only, and caps
// depth at one hop -- no further drill-in once inside a folder. Custom
// relation-type fields (Client, Other Side, ...) resolve straight to their
// own configured display column rather than opening a folder of their own --
// picking "Client" always means the client's name, not a sub-menu of every
// field on the entities table.
"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronLeft, ChevronDown } from "lucide-react";
import { useRelatedFields, cleanLabel, cleanFullLabel, type RelatedField } from "@/lib/hooks/useRelatedFields";

export interface AutoFillCustomField {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  linked_table: string | null;
  linked_display_column: string | null;
}

export interface AutoFillSelection {
  autoFillFieldId: string | null;
  relationColumn: string | null;
  relatedTable: string | null;
  relatedField: string | null;
  composite: string | null;
}

export const EMPTY_AUTO_FILL_SELECTION: AutoFillSelection = {
  autoFillFieldId: null, relationColumn: null, relatedTable: null, relatedField: null, composite: null,
};

const RELATION_FIELD_TYPES = new Set(["entity", "property", "project", "table_relation", "relation"]);

const COMMON_OPTIONS: { composite: string; label: string }[] = [
  { composite: "full_property_address", label: "Full Property Address" },
  { composite: "client_v_other_side", label: "Client v Other Side" },
];

interface Props {
  baseTable: string;
  customFields: AutoFillCustomField[];
  value: AutoFillSelection;
  onChange: (selection: AutoFillSelection) => void;
}

export default function AutoFillFieldPicker({ baseTable, customFields, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [drilled, setDrilled] = useState<{ label: string; fields: RelatedField[] } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const related = useRelatedFields(baseTable);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setDrilled(null); }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const plainFields = customFields.filter(cf => !RELATION_FIELD_TYPES.has(cf.field_type));
  const relationCustomFields = customFields.filter(cf => RELATION_FIELD_TYPES.has(cf.field_type));

  // One hop only -- the RPC behind useRelatedFields walks up to depth 2 for
  // column configs, but a document field's auto-fill value has to resolve
  // through a single, predictable join at fill time, so depth 2 (a related
  // table's OWN related table) is filtered out here rather than resolved.
  const oneHopFields = related.all.filter(f => f.depth === 1 && !f.is_sensitive);
  // A custom relation field the RPC also happens to already know about
  // (unlikely, but possible for a system-shaped column) isn't listed twice.
  const rpcFkColumns = new Set(oneHopFields.map(f => f.fk_column));
  const dedupedRelationCustomFields = relationCustomFields.filter(cf => !rpcFkColumns.has(cf.field_key));

  const folders = new Map<string, RelatedField[]>();
  for (const f of oneHopFields) {
    if (!folders.has(f.section_label)) folders.set(f.section_label, []);
    folders.get(f.section_label)!.push(f);
  }

  const currentLabel = (() => {
    if (value.composite) {
      return COMMON_OPTIONS.find(c => c.composite === value.composite)?.label || value.composite;
    }
    if (value.autoFillFieldId) {
      const cf = plainFields.find(c => c.id === value.autoFillFieldId);
      return cf ? `Matter: ${cf.label}` : "No auto-fill";
    }
    if (value.relationColumn && value.relatedField) {
      const customMatch = relationCustomFields.find(cf => cf.field_key === value.relationColumn);
      if (customMatch) return customMatch.label;
      const match = oneHopFields.find(
        f => f.fk_column === value.relationColumn && f.field_name === value.relatedField && f.source_table === value.relatedTable
      );
      return match ? cleanFullLabel(match.label) : `${value.relatedTable}: ${value.relatedField}`;
    }
    return "No auto-fill";
  })();

  const pick = (selection: AutoFillSelection) => {
    onChange(selection);
    setOpen(false);
    setDrilled(null);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-44 flex items-center justify-between gap-1 px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none bg-white text-left truncate hover:border-indigo-300"
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={12} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-80 overflow-y-auto py-2">
          {!drilled ? (
            <>
              <button
                type="button"
                onClick={() => pick(EMPTY_AUTO_FILL_SELECTION)}
                className="w-full text-left px-4 py-1.5 text-[12px] text-slate-400 hover:bg-slate-50"
              >
                No auto-fill
              </button>

              <p className="px-4 pt-2 pb-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Common</p>
              {COMMON_OPTIONS.map(c => (
                <button
                  key={c.composite}
                  type="button"
                  onClick={() => pick({ ...EMPTY_AUTO_FILL_SELECTION, composite: c.composite })}
                  className="w-full text-left px-4 py-1.5 text-[12px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 truncate"
                >
                  {c.label}
                </button>
              ))}

              <p className="px-4 pt-3 pb-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Matter fields</p>
              {plainFields.map(cf => (
                <button
                  key={cf.id}
                  type="button"
                  onClick={() => pick({ ...EMPTY_AUTO_FILL_SELECTION, autoFillFieldId: cf.id })}
                  className="w-full text-left px-4 py-1.5 text-[12px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 truncate"
                >
                  {cf.label}
                </button>
              ))}
              {plainFields.length === 0 && (
                <p className="px-4 py-1.5 text-[11px] text-slate-300 italic">No matter fields</p>
              )}

              {(dedupedRelationCustomFields.length > 0 || folders.size > 0) && (
                <p className="px-4 pt-3 pb-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Related</p>
              )}
              {dedupedRelationCustomFields.map(cf => (
                <button
                  key={cf.id}
                  type="button"
                  onClick={() => pick({
                    ...EMPTY_AUTO_FILL_SELECTION,
                    relationColumn: cf.field_key,
                    relatedTable: cf.linked_table || "entities",
                    relatedField: cf.linked_display_column || "name",
                  })}
                  className="w-full text-left px-4 py-1.5 text-[12px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 truncate"
                >
                  {cf.label}
                </button>
              ))}
              {[...folders.entries()].map(([label, fields]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setDrilled({ label, fields })}
                  className="w-full flex items-center justify-between gap-1 px-4 py-1.5 text-[12px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <span className="truncate">{label}</span>
                  <ChevronRight size={12} className="text-slate-300 shrink-0" />
                </button>
              ))}
              {related.loading && (
                <p className="px-4 pt-2 text-[10px] text-slate-300 italic">Loading related fields…</p>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDrilled(null)}
                className="flex items-center gap-1 px-4 pb-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
              >
                <ChevronLeft size={12} /> Back
              </button>
              {drilled.fields.map(f => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => pick({
                    ...EMPTY_AUTO_FILL_SELECTION,
                    relationColumn: f.fk_column,
                    relatedTable: f.source_table,
                    relatedField: f.field_name,
                  })}
                  className="w-full text-left px-4 py-1.5 text-[12px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 truncate"
                >
                  {cleanLabel(f.label)}
                </button>
              ))}
              {drilled.fields.length === 0 && (
                <p className="px-4 py-1.5 text-[11px] text-slate-300 italic">No fields here</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
