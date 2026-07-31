"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";
import RelationPicker, { CURRENT_USER_SENTINEL, TEAM_SCOPE_SENTINEL } from "./RelationPicker";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import { isRelationType, isNumericType } from "@/lib/schema/fieldCapabilities";
import { PILL_SIZE_CLASSES, PILL_GAP_CLASSES, FIELD_WIDTH_CLASSES, defaultFieldWidth, type PillSize, type PillGap, type FieldWidth } from "@/lib/dashboardWidgets/pillSize";
import { toRelativeDateToken, relativeDateFromToken, RELATIVE_DATE_LABELS, type RelativeDateRange } from "@/lib/dashboardWidgets/relativeDates";

// The filter bar's own quick-pick set -- a deliberately short list (the
// full RELATIVE_DATE_RANGES also has Yesterday/Last week/Last month/etc.,
// better suited to a condition builder than a toolbar control meant to be
// glanced at). "Custom date..." below covers everything else.
const FILTER_BAR_DATE_PRESETS: RelativeDateRange[] = ['today', 'this_week', 'this_month'];

// A viewer usually means "this week's entries", not one specific literal
// date -- see relativeDates.ts's doc comment. Fully derived from `value`
// (no local state to fall out of sync with it): a relative-range token
// shows as its preset; a literal 'YYYY-MM-DD' shows as "Custom date..."
// plus the native date input to adjust it; empty is "All". Picking "Custom
// date..." seeds today's date immediately (rather than an ambiguous
// "custom but no value yet" state) so the date input has something to
// start adjusting from the moment it appears.
function DateFilterControl({ value, onChange, className }: { value: any; onChange: (v: any) => void; className: string }) {
  const range = relativeDateFromToken(value);
  const isCustom = !!value && !range;
  const presetValue = isCustom ? 'custom' : (range ? toRelativeDateToken(range) : '');
  return (
    <div className="space-y-1">
      <select
        value={presetValue}
        onChange={e => {
          const v = e.target.value;
          onChange(v === 'custom' ? new Date().toISOString().slice(0, 10) : (v || null));
        }}
        className={`${className} appearance-none`}
      >
        <option value="">All</option>
        {FILTER_BAR_DATE_PRESETS.map(r => <option key={r} value={toRelativeDateToken(r)}>{RELATIVE_DATE_LABELS[r]}</option>)}
        <option value="custom">Custom date...</option>
      </select>
      {isCustom && (
        <input type="date" value={value} onChange={e => onChange(e.target.value || null)} className={className} />
      )}
    </div>
  );
}

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
  // Drag-to-reorder a pill directly on the dashboard, gated to admins --
  // mirrors DashboardGrid's column grip handle exactly (same drag/drop
  // mechanics), so "where's this field positioned" has one live answer
  // instead of a second, disconnected up/down control in the widget's
  // settings panel. Omitted entirely in builder-preview contexts, same as
  // grid's isAdmin.
  isAdmin?: boolean;
  onReorder?: (fieldIds: string[]) => void;
  // "Set as default view" for a $current_user/$team_scope field (e.g. Time
  // Entry's Staff filter) -- see useDashboardData's matching state. true
  // only for a viewer who can actually see more than their own rows;
  // undefined/false/null all render the control nowhere (no permission, or
  // this context -- builder preview, a record tab -- doesn't support it).
  canSeeMultipleScope?: boolean | null;
  // Field ids this viewer has an explicit saved default for (including an
  // explicit "All") -- suppresses RelationPicker's own auto-select-self so
  // the saved default isn't immediately overridden back to "just me".
  viewDefaultFieldIds?: Set<string>;
  onSetViewDefault?: (fieldId: string, value: string | null) => void;
  onClearViewDefault?: (fieldId: string) => void;
}

// Renders a dashboard's configured filter fields as a top toolbar, feeding
// lib/hooks/useDashboardData.ts's filter state -- which does a generic
// String(value) === String(filterValue) match, so any field type works as
// long as the control here produces a comparable value. Type-aware, mirrors
// WidgetConfigPanel's ConditionRow value control.
export default function DashboardFilterBar({
  fields, filterFieldIds, filters, onFilterChange, pillSize = 'md', pillGap = 'normal', fieldLayout, isAdmin, onReorder,
  canSeeMultipleScope, viewDefaultFieldIds, onSetViewDefault, onClearViewDefault,
}: Props) {
  const filterFields = filterFieldIds
    .map(id => fields.find(f => f.id === id))
    .filter((f): f is CustomTableField => !!f);

  // Drag-to-reorder state (which field is currently being dragged) --
  // identical shape to DashboardGrid's draggedIdx/handleDrop.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const handleDrop = (targetId: string) => {
    if (!draggedId || !onReorder || draggedId === targetId) { setDraggedId(null); return; }
    const next = [...filterFieldIds];
    const from = next.indexOf(draggedId);
    const to = next.indexOf(targetId);
    if (from === -1 || to === -1) { setDraggedId(null); return; }
    next.splice(from, 1);
    next.splice(to, 0, draggedId);
    onReorder(next);
    setDraggedId(null);
  };

  if (filterFields.length === 0) return null;

  const controlClass = `w-full bg-slate-50 border border-slate-200 rounded-full font-medium outline-none focus:ring-2 focus:ring-indigo-100 ${PILL_SIZE_CLASSES[pillSize]}`;

  return (
    <div className={`flex flex-wrap p-4 bg-white border border-slate-200 rounded-2xl ${PILL_GAP_CLASSES[pillGap]}`}>
      {filterFields.map(field => (
        <div
          key={field.id}
          draggable={isAdmin && !!onReorder}
          onDragStart={() => setDraggedId(field.id)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => handleDrop(field.id)}
          className={`group/pill ${FIELD_WIDTH_CLASSES[fieldLayout?.[field.id]?.width || defaultFieldWidth(field.field_type)]}`}
        >
          <label className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">
            {isAdmin && onReorder && (
              <GripVertical size={10} className="cursor-move opacity-0 group-hover/pill:opacity-100 transition-opacity shrink-0" />
            )}
            {field.label}
          </label>
          {field.field_type === 'date' ? (
            <DateFilterControl
              value={filters[field.id]}
              onChange={v => onFilterChange(field.id, v)}
              className={controlClass}
            />
          ) : isRelationType(field.field_type) ? (
            (() => {
              const isScopeField = field.linked_filter_value === CURRENT_USER_SENTINEL || field.linked_filter_value === TEAM_SCOPE_SENTINEL;
              const hasSavedDefault = isScopeField && !!viewDefaultFieldIds?.has(field.id);
              // A restricted viewer (can only ever see their own rows
              // anyway, or this dashboard/context doesn't support the
              // default-view feature at all) keeps the original always-
              // narrow-to-self behavior. A viewer who CAN see multiple
              // people's rows gets "All" out of the box instead (the more
              // useful default for someone with that visibility) unless
              // they've saved an explicit preference -- either way, once a
              // preference IS saved (including an explicit "All"),
              // RelationPicker's own auto-select must stay off so it can't
              // silently override it back to "just me".
              // canSeeMultipleScope is null while useDashboardData's scope
              // check is still in flight -- deliberately NOT treated as
              // "restricted" here (that was the bug: RelationPicker's own
              // auto-select-self effect fires on first paint and, once it
              // sets a value, canSeeMultipleScope resolving to true a moment
              // later can no longer undo it, since the effect's own guard
              // is `if (... || value || ...) return`). Only a CONFIRMED
              // `false` narrows to self; unknown briefly renders "All" and
              // corrects itself once the check resolves, same as a
              // known-multi-view viewer would render from the start.
              const autoSelectSelf = isScopeField
                ? (hasSavedDefault ? false : canSeeMultipleScope === false)
                : undefined;
              return (
                <div className="space-y-1">
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
                    autoSelectSelf={autoSelectSelf}
                    // Pinned at the top of the dropdown -- narrowing to one
                    // person is just a normal pick below, but getting back to
                    // "everyone" from there needs to be exactly as easy, not a
                    // separate hunt for the small X next to the current value.
                    clearLabel="All"
                  />
                  {isScopeField && canSeeMultipleScope && (onSetViewDefault || onClearViewDefault) && (
                    hasSavedDefault ? (
                      <button
                        type="button"
                        onClick={() => onClearViewDefault?.(field.id)}
                        className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 px-1"
                      >
                        ✓ Default view, click to remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSetViewDefault?.(field.id, filters[field.id] || null)}
                        className="text-[9px] font-bold text-slate-300 hover:text-indigo-600 px-1"
                      >
                        Set as my default view
                      </button>
                    )
                  )}
                </div>
              );
            })()
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
