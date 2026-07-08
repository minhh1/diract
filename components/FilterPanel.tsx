"use client";

import { useState } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import type { ActiveFilter, FilterOperator } from "@/lib/types/filters";

interface FilterableField {
  id: string;
  label: string;
  fieldType: string;
  options?: string[]; // for select fields
}

interface Props {
  fields: FilterableField[];
  filters: ActiveFilter[];
  onChange: (filters: ActiveFilter[]) => void;
}

const OPERATORS_BY_TYPE: Record<string, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'contains',     label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'equals',       label: 'is exactly' },
    { value: 'not_equals',   label: 'is not' },
    { value: 'starts_with',  label: 'starts with' },
    { value: 'is_empty',     label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  select: [
    { value: 'equals',       label: 'is' },
    { value: 'not_equals',   label: 'is not' },
    { value: 'is_empty',     label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  boolean: [
    { value: 'is_true',  label: 'is Yes' },
    { value: 'is_false', label: 'is No' },
  ],
  date: [
    { value: 'equals', label: 'is on' },
    { value: 'gt',     label: 'is after' },
    { value: 'lt',     label: 'is before' },
    { value: 'gte',    label: 'is on or after' },
    { value: 'lte',    label: 'is on or before' },
    { value: 'is_empty',     label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  number: [
    { value: 'equals',   label: 'equals' },
    { value: 'gt',       label: 'greater than' },
    { value: 'gte',      label: 'greater than or equal' },
    { value: 'lt',       label: 'less than' },
    { value: 'lte',      label: 'less than or equal' },
    { value: 'is_empty', label: 'is empty' },
  ],
  currency: [
    { value: 'equals', label: 'equals' },
    { value: 'gt',     label: 'greater than' },
    { value: 'lt',     label: 'less than' },
  ],
  email: [
    { value: 'contains',     label: 'contains' },
    { value: 'equals',       label: 'is exactly' },
    { value: 'is_empty',     label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
};

function getOperators(fieldType: string) {
  return OPERATORS_BY_TYPE[fieldType] || OPERATORS_BY_TYPE.text;
}

function needsValueInput(operator: FilterOperator): boolean {
  return !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(operator);
}

interface FilterRowProps {
  filter: ActiveFilter;
  fields: FilterableField[];
  onChange: (updated: ActiveFilter) => void;
  onRemove: () => void;
}

function FilterRow({ filter, fields, onChange, onRemove }: FilterRowProps) {
  const field = fields.find(f => f.id === filter.fieldId);
  const operators = getOperators(filter.fieldType);
  const showValue = needsValueInput(filter.operator);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Field selector */}
      <div className="relative">
        <select
          value={filter.fieldId}
          onChange={e => {
            const f = fields.find(fi => fi.id === e.target.value);
            if (!f) return;
            const ops = getOperators(f.fieldType);
            onChange({
              ...filter,
              fieldId: f.id,
              label: f.label,
              fieldType: f.fieldType,
              operator: ops[0].value,
              value: '',
            });
          }}
          className="bg-slate-50 border border-slate-200 rounded-full py-2 pl-4 pr-8 text-[12px] font-medium outline-none appearance-none"
        >
          {fields.map(f => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>

      {/* Operator selector */}
      <div className="relative">
        <select
          value={filter.operator}
          onChange={e => onChange({ ...filter, operator: e.target.value as FilterOperator, value: '' })}
          className="bg-slate-50 border border-slate-200 rounded-full py-2 pl-4 pr-8 text-[12px] font-medium outline-none appearance-none"
        >
          {operators.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>

      {/* Value input */}
      {showValue && (
        <>
          {filter.fieldType === 'select' && field?.options?.length ? (
            <div className="relative">
              <select
                value={filter.value}
                onChange={e => onChange({ ...filter, value: e.target.value })}
                className="bg-slate-50 border border-slate-200 rounded-full py-2 pl-4 pr-8 text-[12px] font-medium outline-none appearance-none"
              >
                <option value="">Select...</option>
                {field.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          ) : filter.fieldType === 'date' ? (
            <input
              type="date"
              value={filter.value}
              onChange={e => onChange({ ...filter, value: e.target.value })}
              className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-[12px] font-medium outline-none"
            />
          ) : (filter.fieldType === 'number' || filter.fieldType === 'currency') ? (
            <input
              type="number"
              value={filter.value}
              onChange={e => onChange({ ...filter, value: e.target.value })}
              placeholder="Value..."
              className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-[12px] font-medium outline-none w-32"
            />
          ) : (
            <input
              type="text"
              value={filter.value}
              onChange={e => onChange({ ...filter, value: e.target.value })}
              placeholder="Value..."
              className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-[12px] font-medium outline-none w-40"
            />
          )}
        </>
      )}

      {/* Remove */}
      <button
        onClick={onRemove}
        className="p-1.5 text-slate-300 hover:text-red-500 transition-colors rounded-full hover:bg-red-50"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function FilterPanel({ fields, filters, onChange }: Props) {
  const addFilter = () => {
    const f = fields[0];
    if (!f) return;
    const ops = getOperators(f.fieldType);
    onChange([
      ...filters,
      {
        fieldId: f.id,
        label: f.label,
        operator: ops[0].value,
        value: '',
        fieldType: f.fieldType,
      },
    ]);
  };

  return (
    <div className="space-y-2">
      {filters.length === 0 && (
        <p className="text-[11px] text-slate-400 italic px-1">
          No filters active — all records shown
        </p>
      )}

      {filters.map((filter, idx) => (
        <FilterRow
          key={idx}
          filter={filter}
          fields={fields}
          onChange={updated => {
            const next = [...filters];
            next[idx] = updated;
            onChange(next);
          }}
          onRemove={() => onChange(filters.filter((_, i) => i !== idx))}
        />
      ))}

      <button
        onClick={addFilter}
        disabled={fields.length === 0}
        className="flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-full transition-all disabled:opacity-40"
      >
        <Plus size={13} /> Add filter
      </button>
    </div>
  );
}