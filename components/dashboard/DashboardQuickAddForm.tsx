"use client";

import { useState } from "react";
import { Plus, Loader2, GripVertical } from "lucide-react";
import FieldValueInput from "./FieldValueInput";
import { createRecord } from "@/lib/services/customTableService";
import { createRecord as createSystemTableRecord } from "@/lib/services/systemTableRecordService";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import type { DashboardSourceKind } from "@/lib/hooks/useDashboardData";
import type { SystemTableName } from "@/lib/hooks/useSystemTableAsCustomTable";
import { PILL_GAP_CLASSES, FIELD_WIDTH_CLASSES, defaultFieldWidth, type PillSize, type PillGap, type FieldWidth } from "@/lib/dashboardWidgets/pillSize";

interface Props {
  tableId: string;
  sourceKind: DashboardSourceKind;
  companyId: string;
  userId: string;
  fields: CustomTableField[]; // full field list -- formula fields need their dependencies
  quickAddFieldIds: string[]; // ordered subset to show
  onAdded: () => void;
  // Extra field_key -> value pairs merged into every created record, invisible
  // to the form itself -- e.g. a record-scoped dashboard tab (see
  // RecordDashboardTab.tsx) stamping the link field back to its parent record.
  fixedValues?: Record<string, any>;
  // Visual size/spacing of this widget's controls -- see
  // lib/dashboardWidgets/pillSize.ts. Undefined means 'md'/'normal', today's
  // only look.
  pillSize?: PillSize;
  pillGap?: PillGap;
  // Per-field width override, keyed by field id -- see
  // lib/dashboardWidgets/pillSize.ts's FIELD_WIDTH_CLASSES.
  fieldLayout?: Record<string, { width?: FieldWidth }>;
  // Drag-to-reorder a field directly on the dashboard, gated to admins --
  // mirrors DashboardGrid's column grip handle exactly (same drag/drop
  // mechanics), so "where's this field positioned" has one live answer
  // instead of a second, disconnected up/down control in the widget's
  // settings panel. Omitted entirely in builder-preview contexts, same as
  // grid's isAdmin.
  isAdmin?: boolean;
  onReorder?: (fieldIds: string[]) => void;
}

// Live-computes every formula field's preview value from the in-progress
// form state, mirroring lib/services/customTableService.ts's
// computeFormulaFields (kept in sync manually since this is a UI preview,
// not the source of truth -- the real save always goes through that shared
// function). Walks `fields` in order and accumulates into one working map so
// a computed field that depends on *another* computed field (e.g. GST is a
// percentage of Amount, which is itself Rate x Duration) resolves correctly,
// the same way the save-time version does.
function computeAllPreviews(fields: CustomTableField[], values: Record<string, any>): Record<string, any> {
  const byId = new Map(fields.map(f => [f.id, f]));
  const result = { ...values };
  for (const field of fields) {
    // sum_related aggregates OTHER rows -- nothing to preview from this form.
    if (!field.formula_type || field.formula_type === 'sum_related' || !field.formula_field_a_id) continue;
    const fieldA = byId.get(field.formula_field_a_id);
    const a = fieldA ? Number(result[fieldA.field_key]) : NaN;
    if (Number.isNaN(a)) continue;

    if (field.formula_type === 'multiply' || field.formula_type === 'add') {
      const fieldB = field.formula_field_b_id ? byId.get(field.formula_field_b_id) : null;
      const b = fieldB ? Number(result[fieldB.field_key]) : NaN;
      if (!Number.isNaN(b)) result[field.field_key] = field.formula_type === 'add' ? a + b : a * b;
    } else {
      result[field.field_key] = a * ((field.formula_percent ?? 0) / 100);
    }
  }
  return result;
}

// Date fields default to today rather than blank -- almost every quick-add
// use case (e.g. a time entry) is logged same-day, and re-picking the date
// for every row is friction. Boolean fields default to `default_value`
// (see supabase/company_table_fields_default_value.sql), or false when
// unset -- either way the key is always present in `values`, since the
// required-field check in customTableService can't tell "left blank" from
// "the user picked No" otherwise, blocking a legitimate submission.
// Recomputed after each successful add so the next entry starts from these
// same defaults again instead of resetting to blank/undefined.
function getDefaultValues(quickAddFields: CustomTableField[]): Record<string, any> {
  const defaults: Record<string, any> = {};
  for (const field of quickAddFields) {
    if (field.field_type === 'date' && !field.formula_type) {
      defaults[field.field_key] = new Date().toISOString().slice(0, 10);
    } else if (field.field_type === 'boolean' && !field.formula_type) {
      defaults[field.field_key] = field.default_value === 'true';
    }
  }
  return defaults;
}

function FieldSlot({
  field, value, onCommit, widthClass, size, draggable, onDragStart, onDragOver, onDrop, showGrip,
}: {
  field: CustomTableField; value: any; onCommit: (v: any) => void; widthClass: string; size?: PillSize;
  draggable?: boolean; onDragStart?: () => void; onDragOver?: (e: React.DragEvent) => void; onDrop?: () => void; showGrip?: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group/pill ${widthClass}`}
    >
      <label className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">
        {showGrip && <GripVertical size={10} className="cursor-move opacity-0 group-hover/pill:opacity-100 transition-opacity shrink-0" />}
        {field.label}{field.is_required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <FieldValueInput field={field} value={value} onCommit={onCommit} size={size} />
    </div>
  );
}

export default function DashboardQuickAddForm({
  tableId, sourceKind, companyId, userId, fields, quickAddFieldIds, onAdded, fixedValues, pillSize = 'md', pillGap = 'normal', fieldLayout, isAdmin, onReorder,
}: Props) {
  const quickAddFields = quickAddFieldIds
    .map(id => fields.find(f => f.id === id))
    .filter((f): f is CustomTableField => !!f);

  // Drag-to-reorder state -- identical shape to DashboardFilterBar/
  // DashboardGrid's draggedId/handleDrop.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const handleDrop = (targetId: string) => {
    if (!draggedId || !onReorder || draggedId === targetId) { setDraggedId(null); return; }
    const next = [...quickAddFieldIds];
    const from = next.indexOf(draggedId);
    const to = next.indexOf(targetId);
    if (from === -1 || to === -1) { setDraggedId(null); return; }
    next.splice(from, 1);
    next.splice(to, 0, draggedId);
    onReorder(next);
    setDraggedId(null);
  };

  const [values, setValues] = useState<Record<string, any>>(() => getDefaultValues(quickAddFields));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after every successful add, used as part of each FieldSlot's key
  // below -- text/number/date/select inputs are uncontrolled (defaultValue,
  // not value, so retyping doesn't lag behind a slow re-render), so
  // resetting `values` state alone doesn't touch what's actually showing in
  // the DOM. Forcing a remount is what actually clears them after Add.
  const [formGeneration, setFormGeneration] = useState(0);

  if (quickAddFields.length === 0) return null;

  const handleAdd = async () => {
    // An untouched form (values still exactly the prefilled defaults --
    // today's date, false booleans) would create a record with no real
    // content; refuse before hitting the service.
    if (JSON.stringify(values) === JSON.stringify(getDefaultValues(quickAddFields))) {
      setError('Fill in the form before adding a record.');
      return;
    }
    setSaving(true);
    setError(null);
    const record = sourceKind === 'custom'
      ? await createRecord(tableId, companyId, userId, { ...values, ...fixedValues }, fields)
      : await createSystemTableRecord(sourceKind as SystemTableName, companyId, userId, { ...values, ...fixedValues }, fields);
    setSaving(false);
    if (record && 'error' in record) {
      // e.g. a trust-ledger overdraw refusal -- see customTableService's
      // ledgerErrorMessage; the entry was NOT saved.
      setError(record.error);
      return;
    }
    if (record) {
      setValues(getDefaultValues(quickAddFields));
      setFormGeneration(g => g + 1);
      onAdded();
    }
  };

  const previews = computeAllPreviews(fields, values);
  const valueFor = (field: CustomTableField) => field.formula_type ? previews[field.field_key] ?? null : values[field.field_key];
  const commitFor = (field: CustomTableField) => (v: any) => setValues(prev => ({ ...prev, [field.field_key]: v }));

  const AddButton = (
    <button
      onClick={handleAdd}
      disabled={saving}
      className="px-5 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2 shrink-0"
    >
      {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
    </button>
  );

  return (
    <div className="flex flex-col gap-3 p-4 bg-white border border-slate-200 rounded-2xl">
      {error && (
        <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
      {/* Fields render in their configured order (quickAddFieldIds --
          reorderable in the widget's field picker) at their configured
          width (fieldLayout, or a per-type default) instead of the old
          fixed text/numeric/other grouping -- both the field's POSITION and
          its SIZE are now under the admin's control, not decided for them.
          Fixed widths (not flex-1 grow/shrink) is also what fixed pills
          visually overlapping when several with different intrinsic
          minimum widths (e.g. a native date input) crowded one flex row. */}
      <div className={`flex flex-wrap items-end ${PILL_GAP_CLASSES[pillGap]}`}>
        {quickAddFields.map(field => {
          const widthClass = FIELD_WIDTH_CLASSES[fieldLayout?.[field.id]?.width || defaultFieldWidth(field.field_type)];
          return (
            <FieldSlot
              key={`${field.id}-${formGeneration}`}
              field={field} value={valueFor(field)} onCommit={commitFor(field)} widthClass={widthClass} size={pillSize}
              draggable={isAdmin && !!onReorder}
              onDragStart={() => setDraggedId(field.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(field.id)}
              showGrip={isAdmin && !!onReorder}
            />
          );
        })}
        {AddButton}
      </div>
    </div>
  );
}
