// components/ColumnConfigDrawer.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { X, Save, Lock, Check, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, GripVertical, Loader2 } from "lucide-react";
import FilterPanel from "@/components/FilterPanel";
import type { ActiveFilter } from "@/lib/types/filters";

interface Field {
  id: string;
  label: string;
  fieldType?: string;
  // Present (and non-empty, or a loader is given) on a relation field's row
  // -- clicking that row navigates into these instead of toggling it
  // directly, replacing the old design where every related table's fields
  // were dumped into their own always-visible section on the same page.
  // Either the fields themselves (already fetched, e.g. system tables'
  // depth-2 related-fields RPC) or a lazy loader (custom tables, which have
  // no such precomputed data) -- never both.
  subFields?: Field[];
  loadSubFields?: () => Promise<Field[]>;
  // True for a synthetic "folder" row standing in for a whole related
  // table (e.g. "Client") that isn't itself a real column on this table --
  // hides the Table/Expand toggles (there's nothing to toggle) and makes
  // the entire row a drill-in target instead of just the chevron button.
  navigateOnly?: boolean;
  // True for a "this record can have many of these" relation (sub-projects,
  // documents, checklist items...) -- a single table cell can't meaningfully
  // show a many-valued relation, so its fields can only go in the expand
  // panel. Hides the Table button on a leaf field; shows a "Many" badge on
  // a navigateOnly folder standing in for the whole relation.
  expandOnly?: boolean;
  manyRelation?: boolean;
}

interface Section {
  label: string;
  fields: Field[];
}

interface FilterableField {
  id: string;
  label: string;
  fieldType: string;
  options?: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sections: Section[];
  tableCols: string[];
  expandCols: string[];
  activePresetName?: string;
  onToggle: (fieldId: string, target: 'table' | 'expand' | 'none') => void;
  filters?: ActiveFilter[];
  filterableFields?: FilterableField[];
  onFiltersChange?: (filters: ActiveFilter[]) => void;
  isAdmin?: boolean;
  // Labels columns that live inside a related-table "folder" -- those are
  // otherwise only known once a user drills into that folder (see Field's
  // subFields/loadSubFields comment above), so a flat "what's showing now"
  // list needs its own label source.
  resolveColLabel?: (colId: string) => string;
  // Table-column-only reorder (no equivalent exists for expandCols -- see
  // ColumnConfigDrawer's callers, usePresetTable/useTableColumnConfig only
  // expose one).
  onReorderTableCols?: (next: string[]) => void;
}

type ActiveTab = 'columns' | 'filters';

// One level of the file-explorer-style column picker -- either the root
// (every top-level section) or one relation field's own fields, pushed by
// drilling in. `crumbLabel` is what shows in the breadcrumb trail for this
// level; the root has none.
interface DrillLevel {
  crumbLabel: string;
  fields: Field[];
}

function FieldRow({
  field, inTable, inExpand, isAdmin, onToggle, onDrillIn, drilling,
}: {
  field: Field;
  inTable: boolean;
  inExpand: boolean;
  isAdmin: boolean;
  onToggle: (target: 'table' | 'expand' | 'none') => void;
  onDrillIn: () => void;
  drilling: boolean;
}) {
  const canDrillIn = !!(field.subFields || field.loadSubFields);

  if (field.navigateOnly) {
    return (
      <button
        onClick={onDrillIn}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl hover:bg-indigo-50 transition-all group text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-bold text-slate-700 truncate">{field.label}</span>
          {field.manyRelation && (
            <span className="text-[8px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
              Many
            </span>
          )}
        </span>
        {drilling ? (
          <Loader2 size={13} className="animate-spin text-slate-300 shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-slate-300 group-hover:text-indigo-600 transition-colors shrink-0" />
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-2xl hover:bg-slate-50 transition-all group">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-[12px] font-medium text-slate-700 truncate">{field.label}</span>
        {field.fieldType && (
          <span className="text-[9px] text-slate-400 uppercase font-bold shrink-0">{field.fieldType}</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-3">
        {!field.expandOnly && (
          <button
            onClick={isAdmin ? () => onToggle(inTable ? 'none' : 'table') : undefined}
            disabled={!isAdmin}
            title={!isAdmin ? 'Only admins can change columns' : inTable ? 'Remove from table' : 'Show in table'}
            className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-all ${
              inTable
                ? 'bg-indigo-600 text-white'
                : `bg-slate-100 text-slate-400 ${isAdmin ? 'hover:bg-slate-200' : 'opacity-40'}`
            } ${!isAdmin ? 'cursor-default' : ''}`}
          >
            Table
          </button>
        )}
        <button
          onClick={isAdmin ? () => onToggle(inExpand ? 'none' : 'expand') : undefined}
          disabled={!isAdmin}
          title={!isAdmin ? 'Only admins can change columns' : inExpand ? 'Remove from expand' : 'Show in expand panel'}
          className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-all ${
            inExpand
              ? 'bg-slate-600 text-white'
              : `bg-slate-100 text-slate-400 ${isAdmin ? 'hover:bg-slate-200' : 'opacity-40'}`
          } ${!isAdmin ? 'cursor-default' : ''}`}
        >
          Expand
        </button>
        {canDrillIn && (
          <button
            onClick={onDrillIn}
            title={`Explore ${field.label}'s fields`}
            className="p-1 rounded-full text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
          >
            {drilling ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ColumnConfigDrawer({
  isOpen, onClose, sections, tableCols, expandCols,
  activePresetName, onToggle,
  filters = [], filterableFields = [], onFiltersChange,
  isAdmin = false,
  resolveColLabel, onReorderTableCols,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('columns');
  const [draggedColId, setDraggedColId] = useState<string | null>(null);

  const moveTableCol = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= tableCols.length) return;
    const next = [...tableCols];
    [next[idx], next[target]] = [next[target], next[idx]];
    onReorderTableCols?.(next);
  };

  const handleColDrop = (targetId: string) => {
    if (!draggedColId || draggedColId === targetId) { setDraggedColId(null); return; }
    const next = [...tableCols];
    const fromIdx = next.indexOf(draggedColId);
    const toIdx = next.indexOf(targetId);
    setDraggedColId(null);
    if (fromIdx === -1 || toIdx === -1) return;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, draggedColId);
    onReorderTableCols?.(next);
  };

  const labelFor = (colId: string) =>
    resolveColLabel ? resolveColLabel(colId) : colId.replace(/_id$/, '').replace('.', ' ');

  // Local draft for filters — only applied on Save
  const [draftFilters, setDraftFilters] = useState<ActiveFilter[]>(filters);
  const [filtersDirty, setFiltersDirty] = useState(false);
  // Brief "Saved" confirmation on the button — the drawer intentionally
  // stays open on save so filters can keep being tweaked without reopening it.
  const [justSaved, setJustSaved] = useState(false);

  // Drill-in navigation stack for the Columns tab -- [] means "at the root"
  // (showing `sections` as before). Reset whenever the drawer reopens or the
  // underlying sections change (e.g. switching table/preset), so a stale
  // drilled-in view never survives past the data it was built from.
  const [drillStack, setDrillStack] = useState<DrillLevel[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    if (isOpen) setDrillStack([]);
  }, [isOpen, sections]);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

  // Sync draft when external filters change (e.g. preset switch)
  useEffect(() => {
    setDraftFilters(filters);
    setFiltersDirty(false);
  }, [filters]);

  const handleFilterChange = (f: ActiveFilter[]) => {
    setDraftFilters(f);
    setFiltersDirty(true);
    setJustSaved(false);
  };

  const handleSaveFilters = () => {
    onFiltersChange?.(draftFilters);
    setFiltersDirty(false);
    setJustSaved(true);
  };

  // The drawer's copy claims "Filters save automatically for this table" --
  // that was only true once a value made a filter row feel "worth" clicking
  // Save for. Picking a field (or an operator) without a value yet, then
  // closing the drawer (X/backdrop) or navigating away/logging out, silently
  // dropped that draft -- draftFilters only ever reached the parent (and
  // whatever persists `filters`, e.g. a saved view) via the explicit Save
  // button. Refs (not the state values directly) because this effect's
  // closure is only re-created when `isOpen` changes, so reading
  // draftFilters/filtersDirty directly here would see whatever they were
  // the LAST time the drawer opened, not the latest edit.
  const draftFiltersRef = useRef(draftFilters);
  const filtersDirtyRef = useRef(filtersDirty);
  const onFiltersChangeRef = useRef(onFiltersChange);
  useEffect(() => { draftFiltersRef.current = draftFilters; }, [draftFilters]);
  useEffect(() => { filtersDirtyRef.current = filtersDirty; }, [filtersDirty]);
  useEffect(() => { onFiltersChangeRef.current = onFiltersChange; }, [onFiltersChange]);

  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen && filtersDirtyRef.current) {
      onFiltersChangeRef.current?.(draftFiltersRef.current);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Covers the drawer's own component instance being unmounted entirely
  // (e.g. navigating to a different table) while still open and dirty --
  // the isOpen-transition effect above only fires when isOpen itself flips
  // to false first.
  useEffect(() => () => {
    if (filtersDirtyRef.current) onFiltersChangeRef.current?.(draftFiltersRef.current);
  }, []);

  const handleClearFilters = () => {
    setDraftFilters([]);
    setFiltersDirty(true);
  };

  const handleDrillIn = async (field: Field) => {
    if (field.subFields) {
      setDrillStack(prev => [...prev, { crumbLabel: field.label, fields: field.subFields! }]);
      return;
    }
    if (!field.loadSubFields) return;
    setDrillLoading(true);
    try {
      const fields = await field.loadSubFields();
      setDrillStack(prev => [...prev, { crumbLabel: field.label, fields }]);
    } finally {
      setDrillLoading(false);
    }
  };

  if (!isOpen) return null;

  const atRoot = drillStack.length === 0;
  const currentFields = atRoot ? null : drillStack[drillStack.length - 1].fields;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative ml-auto w-96 bg-white h-full shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-10 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-[13px] font-bold text-slate-800 uppercase tracking-wide">
              Column setup
            </h2>
            {activeTab === 'filters' && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {activePresetName ? `View: ${activePresetName}` : 'Filters save automatically for this table'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6 pt-4 shrink-0">
          <button
            onClick={() => setActiveTab('columns')}
            className={`pb-3 mr-6 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 ${
              activeTab === 'columns' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            Columns
          </button>
          <button
            onClick={() => setActiveTab('filters')}
            className={`pb-3 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 relative ${
              activeTab === 'filters' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            Filters
            {(draftFilters.length > 0 || filters.length > 0) && (
              <span className="ml-2 px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[8px] font-bold align-middle">
                {draftFilters.length}
              </span>
            )}
          </button>
        </div>

        {/* ── Columns tab ── */}
        {activeTab === 'columns' && (
          <div className="flex-1 overflow-y-auto pt-4">
            {!isAdmin && (
              <div className="mx-6 mb-2 flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl">
                <Lock size={12} className="text-slate-400 shrink-0" />
                <p className="text-[10px] text-slate-500 font-medium">
                  Columns are set by your company admin and shared by the whole team.
                </p>
              </div>
            )}

            {/* "On this page" -- what's currently showing, reorderable/removable
                without hunting through the section browser below or dragging
                column headers directly in the live table. */}
            {atRoot && (
              <div className="px-6 mb-4">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  On this page
                </p>
                {tableCols.length === 0 ? (
                  <p className="text-[11px] text-slate-300 italic py-1">No columns showing</p>
                ) : (
                  <div className="space-y-1">
                    {tableCols.map((colId, idx) => (
                      <div
                        key={colId}
                        draggable={isAdmin}
                        onDragStart={() => setDraggedColId(colId)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleColDrop(colId)}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl"
                      >
                        {isAdmin && <GripVertical size={12} className="text-slate-300 shrink-0 cursor-move" />}
                        <span className="flex-1 min-w-0 truncate text-[11px] font-semibold text-slate-700">
                          {labelFor(colId)}
                        </span>
                        {isAdmin && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => moveTableCol(idx, -1)}
                              disabled={idx === 0}
                              className="p-1 rounded-full text-slate-300 hover:text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                              title="Move up"
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button
                              onClick={() => moveTableCol(idx, 1)}
                              disabled={idx === tableCols.length - 1}
                              className="p-1 rounded-full text-slate-300 hover:text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                              title="Move down"
                            >
                              <ChevronDown size={12} />
                            </button>
                            <button
                              onClick={() => onToggle(colId, 'none')}
                              className="p-1 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Remove from table"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {expandCols.length > 0 && (
                  <>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-2">
                      In expand panel
                    </p>
                    <div className="space-y-1">
                      {expandCols.map(colId => (
                        <div
                          key={colId}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl"
                        >
                          <span className="flex-1 min-w-0 truncate text-[11px] font-semibold text-slate-700">
                            {labelFor(colId)}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => onToggle(colId, 'none')}
                              className="p-1 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                              title="Remove from expand panel"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Breadcrumb -- only once drilled into a relation's fields */}
            {!atRoot && (
              <div className="px-6 mb-2 flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setDrillStack(prev => prev.slice(0, -1))}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 shrink-0"
                >
                  <ChevronLeft size={12} /> Back
                </button>
                <span className="text-[10px] text-slate-300 shrink-0">/</span>
                {drillStack.map((level, i) => (
                  <button
                    key={i}
                    onClick={() => setDrillStack(prev => prev.slice(0, i + 1))}
                    className={`text-[10px] font-bold ${i === drillStack.length - 1 ? 'text-slate-500' : 'text-indigo-600 hover:text-indigo-700'}`}
                  >
                    {level.crumbLabel}{i < drillStack.length - 1 ? ' /' : ''}
                  </button>
                ))}
              </div>
            )}

            {atRoot ? (
              sections.map((section, si) => (
                <div key={si} className="px-6 py-4 border-b border-slate-50 last:border-0">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    {section.label}
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {(section.fields || []).map((f: Field) => (
                      <FieldRow
                        key={f.id}
                        field={f}
                        inTable={tableCols.includes(f.id)}
                        inExpand={expandCols.includes(f.id)}
                        isAdmin={isAdmin}
                        onToggle={target => onToggle(f.id, target)}
                        onDrillIn={() => handleDrillIn(f)}
                        drilling={drillLoading}
                      />
                    ))}
                    {(section.fields || []).length === 0 && (
                      <p className="text-[11px] text-slate-300 italic py-2">No fields in this section</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 gap-1.5">
                  {(currentFields || []).map((f: Field) => (
                    <FieldRow
                      key={f.id}
                      field={f}
                      inTable={tableCols.includes(f.id)}
                      inExpand={expandCols.includes(f.id)}
                      isAdmin={isAdmin}
                      onToggle={target => onToggle(f.id, target)}
                      onDrillIn={() => handleDrillIn(f)}
                      drilling={drillLoading}
                    />
                  ))}
                  {(currentFields || []).length === 0 && (
                    <p className="text-[11px] text-slate-300 italic py-2">No fields here</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Filters tab ── */}
        {activeTab === 'filters' && (
          <div className="flex-1 overflow-y-auto p-6 pt-6">
            {onFiltersChange ? (
              <FilterPanel
                fields={filterableFields}
                filters={draftFilters}
                onChange={handleFilterChange}
              />
            ) : (
              <p className="text-[11px] text-slate-300 italic">Filters not available</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 space-y-3">
          {/* Filter save button — only shown on filters tab */}
          {activeTab === 'filters' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveFilters}
                disabled={!filtersDirty}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[11px] font-bold rounded-full transition-colors ${
                  justSaved
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                {justSaved ? <Check size={13} /> : <Save size={13} />}
                {justSaved ? 'Saved' : 'Save filters'}
              </button>
              {draftFilters.length > 0 && (
                <button
                  onClick={handleClearFilters}
                  className="px-4 py-2.5 text-[11px] font-bold text-red-400 hover:text-red-600 border border-red-200 hover:border-red-300 rounded-full transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>{tableCols.length} in table · {expandCols.length} in expand</span>
            {activeTab === 'filters' && filtersDirty && (
              <span className="text-amber-500 font-bold">Unsaved changes</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
