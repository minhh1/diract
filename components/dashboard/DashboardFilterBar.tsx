"use client";

import RelationPicker from "./RelationPicker";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import { isRelationType, isNumericType } from "@/lib/schema/fieldCapabilities";
import { PILL_SIZE_CLASSES, PILL_GAP_CLASSES, FIELD_WIDTH_CLASSES, defaultFieldWidth, type PillSize, type PillGap, type FieldWidth } from "@/lib/dashboardWidgets/pillSize";

interface Props {
  fields: CustomTableField[];
  filterFieldIds: string[];
  filters: Record<string, any>;
  onFilterChange: (fieldId: string, value: any) => void;
  // Visual size/spacing of this widget's controls -- see
  // lib/dashboardWidgets/pillSize.ts. Undefined means 'md'/'normal', today's
  // only look.
  pillSize?: PillSize;
  pillGap?: PillGap;
  // Per-field width override, keyed by field id -- see
  // lib/dashboardWidgets/pillSize.ts's FIELD_WIDTH_CLASSES.
  fieldLayout?: Record<string, { width?: FieldWidth }>;
}

// Renders a dashboard's configured filter fields as a top toolbar, feeding
// lib/hooks/useDashboardData.ts's filter state -- which does a generic
// String(value) === String(filterValue) match, so any field type works as
// long as the control here produces a comparable value. Type-aware, mirrors
// WidgetConfigPanel's ConditionRow value control.
export default function DashboardFilterBar({ fields, filterFieldIds, filters, onFilterChange, pillSize = 'md', pillGap = 'normal', fieldLayout }: Props) {
  const filterFields = filterFieldIds
    .map(id => fields.find(f => f.id === id))
    .filter((f): f is CustomTableField => !!f);

  if (filterFields.length === 0) return null;

  const controlClass = `w-full bg-slate-50 border border-slate-200 rounded-full font-medium outline-none focus:ring-2 focus:ring-indigo-100 ${PILL_SIZE_CLASSES[pillSize]}`;

  return (
    <div className={`flex flex-wrap p-4 bg-white border border-slate-200 rounded-2xl ${PILL_GAP_CLASSES[pillGap]}`}>
      {filterFields.map(field => (
        <div key={field.id} className={FIELD_WIDTH_CLASSES[fieldLayout?.[field.id]?.width || defaultFieldWidth(field.field_type)]}>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">
            {field.label}
          </label>
          {field.field_type === 'date' ? (
            <input
              type="date"
              value={filters[field.id] || ''}
              onChange={e => onFilterChange(field.id, e.target.value || null)}
              className={controlClass}
            />
          ) : isRelationType(field.field_type) ? (
            <RelationPicker
              linkedSystemTable={field.linked_system_table}
              linkedTableId={field.linked_system_table ? null : field.linked_table_id}
              displayField={field.linked_display_field}
              displayField2={field.linked_display_field_2}
              searchFieldKeys={field.linked_search_field_keys}
              filterColumn={field.linked_filter_column}
              filterValue={field.linked_filter_value}
              value={filters[field.id] || null}
              onSelect={id => onFilterChange(field.id, id)}
              placeholder={`All`}
              size={pillSize}
            />
          ) : field.field_type === 'boolean' ? (
            <select
              value={filters[field.id] ?? ''}
              onChange={e => onFilterChange(field.id, e.target.value || null)}
              className={`${controlClass} appearance-none`}
            >
              <option value="">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : field.field_type === 'select' ? (
            <select
              value={filters[field.id] ?? ''}
              onChange={e => onFilterChange(field.id, e.target.value || null)}
              className={`${controlClass} appearance-none`}
            >
              <option value="">All</option>
              {(field.select_options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : (
            <input
              type={isNumericType(field.field_type) ? 'number' : 'text'}
              value={filters[field.id] ?? ''}
              onChange={e => onFilterChange(field.id, e.target.value || null)}
              placeholder="All"
              className={controlClass}
            />
          )}
        </div>
      ))}
    </div>
  );
}
