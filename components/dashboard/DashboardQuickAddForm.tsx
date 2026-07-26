"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, GripVertical } from "lucide-react";
import FieldValueInput from "./FieldValueInput";
import { supabase } from "@/lib/supabase";
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
  // Field_key -> value pairs to load into the VISIBLE, still-editable form
  // state -- unlike fixedValues above (silently merged in only at submit),
  // this is meant to be seen and adjusted before Add is clicked, e.g. a
  // my_tasks_button widget handing off a task's text as a starting
  // Description. Applied once per distinct non-null value via the effect
  // below, then immediately reported back via onPrefillApplied so the
  // caller can clear its own pending state -- without that round-trip, the
  // same object reference re-applying on every unrelated re-render would
  // permanently pin these fields, overwriting anything the viewer typed
  // afterward.
  prefill?: Record<string, any> | null;
  onPrefillApplied?: () => void;
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
// number/currency fields also honor a configured `default_value` (e.g.
// Disbursements' quantity defaulting to 1) -- unlike date/boolean this is
// opt-in per field (no default_value means no default, stays blank), since
// unlike "today"/"false" there's no universally-sensible number to assume.
// Recomputed after each successful add so the next entry starts from these
// same defaults again instead of resetting to blank/undefined.
function getDefaultValues(quickAddFields: CustomTableField[]): Record<string, any> {
  const defaults: Record<string, any> = {};
  for (const field of quickAddFields) {
    if (field.field_type === 'date' && !field.formula_type) {
      defaults[field.field_key] = new Date().toISOString().slice(0, 10);
    } else if (field.field_type === 'boolean' && !field.formula_type) {
      defaults[field.field_key] = field.default_value === 'true';
    } else if ((field.field_type === 'number' || field.field_type === 'currency') && !field.formula_type && field.default_value != null) {
      const n = Number(field.default_value);
      if (!Number.isNaN(n)) defaults[field.field_key] = n;
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
  prefill, onPrefillApplied,
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

  // See Props.prefill's doc comment -- applies once, then immediately hands
  // the "consumed" signal back so the caller clears its own pending state.
  // formGeneration bumps too, same as a successful Add: the fields this
  // touches (e.g. Description) are uncontrolled (defaultValue), so merely
  // updating `values` wouldn't touch what's actually showing in the DOM
  // without also forcing FieldSlot's remount.
  useEffect(() => {
    if (!prefill) return;
    setValues(prev => ({ ...prev, ...prefill }));
    setFormGeneration(g => g + 1);
    onPrefillApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

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

  // After a "signed-in user only" Staff field auto-selects itself (see
  // RelationPicker's own auto-select effect, which calls this field's
  // onSelect the moment it resolves), pulls that entity's own default_rate
  // (see supabase/migrations/20260726065536_entities_default_rate.sql) into
  // a sibling Rate field -- saves re-entering the same rate on every time
  // entry. Only ever fills an EMPTY Rate, checked again after the fetch
  // resolves in case the viewer typed one in the meantime.
  const applyDefaultRate = async (entityId: string) => {
    const rateField = quickAddFields.find(f => f.field_key === 'rate' && f.field_type === 'currency');
    if (!rateField || values[rateField.field_key] !== undefined) return;
    const { data } = await supabase.from('entities').select('default_rate').eq('id', entityId).maybeSingle();
    if (data?.default_rate == null) return;
    setValues(prev => {
      if (prev[rateField.field_key] !== undefined) return prev;
      return { ...prev, [rateField.field_key]: data.default_rate };
    });
    // Rate's own input is uncontrolled (see FieldSlot/formGeneration's doc
    // comment above) -- without this, the value above lands in state but
    // never shows up in the field itself.
    setFormGeneration(g => g + 1);
  };

  // '$team_scope' (role/team-aware Staff picker -- see RelationPicker.tsx)
  // still auto-selects the signed-in user's own entity by default, same as
  // the older '$current_user'-only config it replaced -- so this still
  // applies to it too.
  const isCurrentUserStaffField = (field: CustomTableField) =>
    field.field_type === 'entity' && field.linked_filter_column === 'linked_profile_id' &&
    (field.linked_filter_value === '$current_user' || field.linked_filter_value === '$team_scope');

  const previews = computeAllPreviews(fields, values);
  const valueFor = (field: CustomTableField) => field.formula_type ? previews[field.field_key] ?? null : values[field.field_key];
  const commitFor = (field: CustomTableField) => (v: any) => {
    setValues(prev => ({ ...prev, [field.field_key]: v }));
    if (v && isCurrentUserStaffField(field)) applyDefaultRate(v);
  };

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
