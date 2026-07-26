"use client";

import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import RelationPicker from "./RelationPicker";
import { getValueColumn, isRelationType, isNumericType } from "@/lib/schema/fieldCapabilities";
import { PILL_SIZE_CLASSES, type PillSize } from "@/lib/dashboardWidgets/pillSize";

// Which company_table_values column stores a given field_type's value.
export const valueColumnFor = getValueColumn;

// 'pill' is the rounded, bordered, placeholder-labelled look used by filter
// bars/quick-add forms (real standalone form controls). 'plain' is a flat
// spreadsheet-cell look with no border/background/placeholder/field-label
// decoration -- used by DashboardGrid, where the column header already
// names the field and every row (filled or still blank) should read like an
// actual spreadsheet cell, not a little form floating in a table.
type Variant = 'pill' | 'plain';

const inputClassFor = (size: PillSize, variant: Variant) =>
  variant === 'plain'
    ? 'w-full bg-transparent outline-none font-medium text-[12px] text-slate-700 px-0.5 py-1 rounded-sm focus:ring-2 focus:ring-indigo-100'
    : `w-full bg-slate-50 border border-slate-200 rounded-full font-medium outline-none focus:ring-2 focus:ring-indigo-100 ${PILL_SIZE_CLASSES[size]}`;

interface Props {
  field: CustomTableField;
  value: any;
  onCommit: (value: any) => void;
  disabled?: boolean;
  // Pre-resolved label for a relation-type value (e.g. CustomTableRecord.
  // displayValues) -- see RelationPicker's initialLabel for why this
  // matters at any real scale of rows.
  displayValue?: string;
  // Visual size (padding/text) -- see lib/dashboardWidgets/pillSize.ts.
  // Undefined means 'md', the size every existing caller (grid cells, etc.)
  // already renders at.
  size?: PillSize;
  // See Variant above. Undefined means 'pill', what every existing caller
  // besides DashboardGrid already renders at.
  variant?: Variant;
}

// Renders the appropriate input widget for a custom-table field, bound to a
// value, committing on blur/change. Reuses the field_type conventions shared
// across the schema system (see components/schema/types.ts).
export default function FieldValueInput({ field, value, onCommit, disabled, displayValue, size = 'md', variant = 'pill' }: Props) {
  const type = field.field_type;
  const inputClass = inputClassFor(size, variant);
  const plain = variant === 'plain';

  // Computed fields are never hand-edited — see supabase/company_table_fields_formula.sql.
  if (field.formula_type) {
    return (
      <div
        className={plain ? 'w-full text-[12px] font-medium text-slate-500 truncate px-0.5 py-1' : 'w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3.5 text-[13px] font-medium text-slate-500 truncate'}
        title="Auto-calculated"
      >
        {value !== null && value !== undefined && value !== '' ? String(value) : (plain ? '' : '—')}
      </div>
    );
  }

  if (type === 'boolean') {
    return (
      <label className={`flex items-center ${plain ? '' : 'gap-2'} cursor-pointer`}>
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={e => onCommit(e.target.checked)}
          className="w-4 h-4 accent-indigo-600"
        />
        {/* Grid columns already name the field via their header -- a
            repeated visible label here would be exactly the "help text"
            a blank spreadsheet cell shouldn't show. Kept for a11y only. */}
        <span className={plain ? 'sr-only' : 'text-[11px] font-medium text-slate-500'}>{field.label}</span>
      </label>
    );
  }

  if (type === 'select') {
    return (
      <select
        defaultValue={value ?? ''}
        disabled={disabled}
        onChange={e => onCommit(e.target.value || null)}
        className={`${inputClass} appearance-none`}
      >
        <option value="">{plain ? '' : '—'}</option>
        {(field.select_options || []).map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (type === 'date') {
    return (
      <input
        type="date"
        defaultValue={value ?? ''}
        disabled={disabled}
        onBlur={e => onCommit(e.target.value || null)}
        className={inputClass}
      />
    );
  }

  if (isNumericType(type)) {
    return (
      <input
        type="number"
        defaultValue={value ?? ''}
        disabled={disabled}
        onBlur={e => onCommit(e.target.value === '' ? null : Number(e.target.value))}
        className={inputClass}
        placeholder={plain ? undefined : field.label}
      />
    );
  }

  if (isRelationType(type)) {
    if (field.allow_multiple) {
      return (
        <RelationPicker
          linkedSystemTable={field.linked_system_table}
          linkedTableId={field.linked_system_table ? null : field.linked_table_id}
          displayField={field.linked_display_field}
          displayField2={field.linked_display_field_2}
          searchFieldKeys={field.linked_search_field_keys}
          filterColumn={field.linked_filter_column}
          filterValue={field.linked_filter_value}
          multiple
          values={Array.isArray(value) ? value : []}
          onSelectMulti={ids => onCommit(ids)}
          disabled={disabled}
          placeholder={plain ? '' : field.label}
          size={size}
          variant={variant}
        />
      );
    }
    return (
      <RelationPicker
        linkedSystemTable={field.linked_system_table}
        linkedTableId={field.linked_system_table ? null : field.linked_table_id}
        displayField={field.linked_display_field}
        displayField2={field.linked_display_field_2}
        searchFieldKeys={field.linked_search_field_keys}
        filterColumn={field.linked_filter_column}
        filterValue={field.linked_filter_value}
        value={value || null}
        onSelect={id => onCommit(id)}
        disabled={disabled}
        placeholder={plain ? '' : field.label}
        initialLabel={displayValue}
        size={size}
        variant={variant}
      />
    );
  }

  // Plain 'text' in a form (not email/url, not a grid cell) auto-grows
  // instead of using a single-line input -- a single line horizontally
  // scrolls hidden content once a value overflows it (confirmed live on
  // Time & Fee Entries' Description: typing a normal billing-narrative
  // sentence scrolled the start of it off-screen), so there's no way to see
  // or highlight the whole thing without first scrolling to find it. An
  // auto-growing textarea wraps instead, so every character stays visible
  // and selectable and nothing shifts while typing. Scoped to non-'plain'
  // only -- DashboardGrid's rows have a fixed height, so a growing textarea
  // there would misalign against every other cell in the same row.
  if (type === 'text' && !plain) {
    const grow = (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    return (
      <textarea
        ref={grow}
        defaultValue={value ?? ''}
        disabled={disabled}
        onBlur={e => onCommit(e.target.value || null)}
        onInput={e => grow(e.currentTarget)}
        rows={1}
        className={`${inputClass.replace('rounded-full', 'rounded-2xl')} resize-none leading-snug`}
        placeholder={field.label}
      />
    );
  }

  // email / url / auto_id fallback (and 'text' in a grid cell)
  return (
    <input
      type={type === 'email' ? 'email' : type === 'url' ? 'url' : 'text'}
      defaultValue={value ?? ''}
      disabled={disabled}
      onBlur={e => onCommit(e.target.value || null)}
      className={inputClass}
      placeholder={plain ? undefined : field.label}
    />
  );
}
