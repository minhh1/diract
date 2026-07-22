"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface RelationOption { id: string; label: string }

interface Props {
  // Exactly one of these identifies the target — a system table (entities/
  // projects/properties) or a sibling custom table.
  linkedSystemTable?: string | null;
  linkedTableId?: string | null;
  displayField?: string | null; // system-table column to search/show, default 'name'
  // Extra fields to match the search query against, besides displayField --
  // native column names, or 'cf:<company_custom_fields.id>' for a custom
  // field (e.g. Matter Number on projects). System table only. Configured
  // per-field in components/schema/FieldConfigPanel.tsx.
  searchFieldKeys?: string[] | null;
  // Restricts results to rows where this native column equals this value
  // (e.g. entity_type = 'Staff'). System table only. Never applied when
  // resolving the *current* value's label, so an out-of-filter selection
  // still displays correctly.
  filterColumn?: string | null;
  filterValue?: string | null;
  value: string | null;
  onSelect: (id: string | null, label: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Resolves the primary display field's value for one record of a custom
// (company_tables) table -- used both to label the currently-selected value
// and to build the search results list.
async function fetchCustomTableRecordLabels(tableId: string, recordIds?: string[]): Promise<RelationOption[]> {
  const { data: tableRow } = await supabase.from('company_tables').select('primary_field_key').eq('id', tableId).maybeSingle();
  const { data: fieldsData } = await supabase.from('company_table_fields').select('id, field_key').eq('table_id', tableId).is('deleted_at', null);
  const primaryField = (fieldsData || []).find(f => f.field_key === tableRow?.primary_field_key) || (fieldsData || [])[0];
  if (!primaryField) return [];

  let query = supabase
    .from('company_table_records')
    .select('id, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean)')
    .eq('table_id', tableId)
    .is('deleted_at', null);
  if (recordIds) query = query.in('id', recordIds);
  else query = query.limit(200);

  const { data: records } = await query;
  return (records || []).map((r: any) => {
    const v = (r.values || []).find((val: any) => val.field_id === primaryField.id);
    const label = v ? (v.value_text ?? v.value_number ?? v.value_date ?? '') : '';
    return { id: r.id, label: String(label || 'Untitled') };
  });
}

export default function RelationPicker({
  linkedSystemTable, linkedTableId, displayField, searchFieldKeys, filterColumn, filterValue,
  value, onSelect, disabled, placeholder,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<RelationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentLabel, setCurrentLabel] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  // Which value id `currentLabel` is already known-correct for -- set
  // synchronously by the picker's own click handler (it already knows the
  // label of whatever it just clicked) so the resolution effect below can
  // skip a redundant round-trip for a selection that was just made here.
  const resolvedForRef = useRef<string | null>(null);

  // Resolve the current value's display label whenever it changes.
  useEffect(() => {
    if (!value) { setCurrentLabel(''); resolvedForRef.current = null; return; }
    if (resolvedForRef.current === value) return;
    let active = true;
    (async () => {
      let label = '';
      if (linkedSystemTable) {
        const col = displayField || 'name';
        // .is('deleted_at', null) matches the linkedTableId branch below
        // (fetchCustomTableRecordLabels always filters it) -- without this,
        // a relation pointing at a soft-deleted entity/project/property
        // would keep showing its stale label forever, inconsistently with
        // how a deleted custom-table record's relation goes blank instead.
        const { data } = await supabase.from(linkedSystemTable).select(`id, ${col}`).eq('id', value).is('deleted_at', null).maybeSingle();
        label = data ? String((data as any)[col] ?? '') : '';
      } else if (linkedTableId) {
        const [opt] = await fetchCustomTableRecordLabels(linkedTableId, [value]);
        label = opt?.label || '';
      }
      if (active) { setCurrentLabel(label); resolvedForRef.current = value; }
    })();
    return () => { active = false; };
  }, [value, linkedSystemTable, linkedTableId, displayField]);

  // Search as the dropdown is open / query changes.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      let results: RelationOption[] = [];
      if (linkedSystemTable) {
        const col = displayField || 'name';
        const nativeExtra = (searchFieldKeys || []).filter(k => !k.startsWith('cf:'));
        const cfIds = (searchFieldKeys || []).filter(k => k.startsWith('cf:')).map(k => k.slice(3));

        if (nativeExtra.length === 0 && cfIds.length === 0 && !filterColumn) {
          // Common case, unchanged: one column, server-side ilike + limit.
          let q = supabase.from(linkedSystemTable).select(`id, ${col}`).is('deleted_at', null).order(col).limit(20);
          if (query.trim()) q = q.ilike(col, `%${query.trim()}%`);
          const { data } = await q;
          results = (data || []).map((r: any) => ({ id: r.id, label: String(r[col] ?? 'Untitled') }));
        } else {
          // Extra search fields and/or a restrict-to filter -- fetch a
          // wider candidate set and match client-side, same scale
          // assumption RelationPicker already makes for custom tables.
          const nativeCols = Array.from(new Set([col, ...nativeExtra]));
          let rowsQuery = supabase.from(linkedSystemTable).select(`id, ${nativeCols.join(', ')}`).is('deleted_at', null).order(col).limit(200);
          if (filterColumn && filterValue) rowsQuery = rowsQuery.eq(filterColumn, filterValue);
          const { data: rows } = await rowsQuery;

          const cfTextByRecord = new Map<string, string[]>();
          if (cfIds.length && rows?.length) {
            const { data: cfRows } = await supabase
              .from('company_custom_field_values')
              .select('record_id, value_text')
              .in('field_id', cfIds)
              .in('record_id', rows.map((r: any) => r.id));
            (cfRows || []).forEach((v: any) => {
              const list = cfTextByRecord.get(v.record_id) || [];
              list.push(v.value_text || '');
              cfTextByRecord.set(v.record_id, list);
            });
          }

          const q = query.trim().toLowerCase();
          const candidates = (rows || []).map((r: any) => {
            const searchText = [...nativeCols.map(c => r[c]), ...(cfTextByRecord.get(r.id) || [])]
              .filter(Boolean).join(' ').toLowerCase();
            return { id: r.id, label: String(r[col] ?? 'Untitled'), searchText };
          });
          results = (q ? candidates.filter(c => c.searchText.includes(q)) : candidates)
            .slice(0, 20)
            .map(({ id, label }) => ({ id, label }));
        }
      } else if (linkedTableId) {
        const all = await fetchCustomTableRecordLabels(linkedTableId);
        const q = query.trim().toLowerCase();
        results = (q ? all.filter(o => o.label.toLowerCase().includes(q)) : all).slice(0, 20);
      }
      if (active) { setOptions(results); setLoading(false); }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [open, query, linkedSystemTable, linkedTableId, displayField, searchFieldKeys, filterColumn, filterValue]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (disabled) {
    return (
      <div className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3.5 text-[13px] font-medium text-slate-500 truncate">
        {currentLabel || '—'}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        onClick={() => setOpen(true)}
        className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3.5 text-[13px] font-medium outline-none cursor-pointer flex items-center justify-between gap-2 focus-within:ring-2 focus-within:ring-indigo-100"
      >
        {open ? (
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder || 'Search...'}
            className="w-full bg-transparent outline-none"
          />
        ) : (
          <span className={`truncate ${currentLabel ? 'text-slate-700' : 'text-slate-400'}`}>
            {currentLabel || placeholder || 'Select...'}
          </span>
        )}
        {currentLabel && !open && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setCurrentLabel(''); resolvedForRef.current = null; onSelect(null, null); }}
            className="text-slate-300 hover:text-red-500 shrink-0"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-slate-300" /></div>
          ) : options.length === 0 ? (
            <p className="text-[11px] text-slate-300 italic text-center py-4">No matches</p>
          ) : (
            options.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  // Already know the label from the option clicked -- set it
                  // immediately instead of waiting on the value-resolution
                  // effect below to re-fetch it from the server, which was
                  // the visible lag on every relation pick.
                  setCurrentLabel(opt.label);
                  resolvedForRef.current = opt.id;
                  onSelect(opt.id, opt.label);
                  setQuery('');
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-[12px] font-medium text-slate-700 hover:bg-indigo-50 transition-colors"
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
