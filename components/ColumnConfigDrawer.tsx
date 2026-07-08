// components/ColumnConfigDrawer.tsx
"use client";

import { useState } from "react";
import { X, Eye, EyeOff, Check } from "lucide-react";
import FilterPanel from "@/components/FilterPanel";
import type { ActiveFilter } from "@/lib/types/filters";

interface Field {
  id: string;
  label: string;
  fieldType?: string;
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
  // Filter props
  filters?: ActiveFilter[];
  filterableFields?: FilterableField[];
  onFiltersChange?: (filters: ActiveFilter[]) => void;
}

type ActiveTab = 'columns' | 'filters';

export default function ColumnConfigDrawer({
  isOpen, onClose, sections, tableCols, expandCols,
  activePresetName, onToggle,
  filters = [], filterableFields = [], onFiltersChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('columns');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative ml-auto w-96 bg-white h-full shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-[13px] font-bold text-slate-800 uppercase tracking-wide">
              Column setup
            </h2>
            {activePresetName && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                Preset: {activePresetName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6 shrink-0">
          <button
            onClick={() => setActiveTab('columns')}
            className={`pb-3 mr-6 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 ${
              activeTab === 'columns'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            Columns
          </button>
          <button
            onClick={() => setActiveTab('filters')}
            className={`pb-3 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 relative ${
              activeTab === 'filters'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            Filters
            {filters.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[8px] font-bold align-middle">
                {filters.length}
              </span>
            )}
          </button>
        </div>

        {/* ── Columns tab ── */}
        {activeTab === 'columns' && (
          <div className="flex-1 overflow-y-auto">
            {sections.map((section, si) => (
              <div key={si} className="px-6 py-4 border-b border-slate-50 last:border-0">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  {section.label}
                </p>

                <div className="grid grid-cols-1 gap-1.5">
                  {(section.fields || []).map((f: Field) => {
                    const inTable = tableCols.includes(f.id);
                    const inExpand = expandCols.includes(f.id);
                    const current = inTable ? 'table' : inExpand ? 'expand' : 'none';

                    return (
                      <div
                        key={f.id}
                        className="flex items-center justify-between px-3 py-2.5 rounded-2xl hover:bg-slate-50 transition-all group"
                      >
                        {/* Label */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[12px] font-medium text-slate-700 truncate">
                            {f.label}
                          </span>
                          {f.fieldType && (
                            <span className="text-[9px] text-slate-400 uppercase font-bold shrink-0">
                              {f.fieldType}
                            </span>
                          )}
                        </div>

                        {/* Toggle buttons */}
                        <div className="flex items-center gap-1 shrink-0 ml-3">
                          {/* Table toggle */}
                          <button
                            onClick={() => onToggle(f.id, inTable ? 'none' : 'table')}
                            title={inTable ? 'Remove from table' : 'Show in table'}
                            className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-all ${
                              inTable
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            Table
                          </button>

                          {/* Expand toggle */}
                          <button
                            onClick={() => onToggle(f.id, inExpand ? 'none' : 'expand')}
                            title={inExpand ? 'Remove from expand' : 'Show in expand panel'}
                            className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-all ${
                              inExpand
                                ? 'bg-slate-600 text-white'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            Expand
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {(section.fields || []).length === 0 && (
                    <p className="text-[11px] text-slate-300 italic py-2">
                      No fields in this section
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Filters tab ── */}
        {activeTab === 'filters' && (
          <div className="flex-1 overflow-y-auto p-6">
            {onFiltersChange ? (
              <FilterPanel
                fields={filterableFields}
                filters={filters}
                onChange={onFiltersChange}
              />
            ) : (
              <p className="text-[11px] text-slate-300 italic">
                Filters not available
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>
              {tableCols.length} in table · {expandCols.length} in expand
            </span>
            {filters.length > 0 && (
              <button
                onClick={() => onFiltersChange?.([])}
                className="text-red-400 hover:text-red-600 font-bold transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}