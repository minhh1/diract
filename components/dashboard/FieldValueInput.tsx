"use client";

import type { CustomTableField } from "@/lib/hooks/useCustomTable";

// Which company_table_values column stores a given field_type's value.
export function valueColumnFor(fieldType: string): string {
  if (['number', 'currency'].includes(fieldType)) return 'value_number';
  if (fieldType === 'date') return 'value_date';
  if (fieldType === 'boolean') return 'value_boolean';
  if (['property', 'entity', 'project', 'table_relation'].includes(fieldType)) return 'value_record_id';
  return 'value_text';
}

const inputClass =
  "w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3.5 text-[13px] font-medium outline-none focus:ring-2 focus:ring-indigo-100";

interface Props {
  field: CustomTableField;
  value: any;
  onCommit: (value: any) => void;
  disabled?: boolean;
}

// Renders the appropriate input widget for a custom-table field, bound to a
// value, committing on blur/change. Reuses the field_type conventions shared
// across the schema system (see components/schema/types.ts).
export default function FieldValueInput({ field, value, onCommit, disabled }: Props) {
  const type = field.field_type;

  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={e => onCommit(e.target.checked)}
          className="w-4 h-4 accent-indigo-600"
        />
        <span className="text-[11px] font-medium text-slate-500">{field.label}</span>
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
        <option value="">—</option>
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

  if (['number', 'currency'].includes(type)) {
    return (
      <input
        type="number"
        defaultValue={value ?? ''}
        disabled={disabled}
        onBlur={e => onCommit(e.target.value === '' ? null : Number(e.target.value))}
        className={inputClass}
        placeholder={field.label}
      />
    );
  }

  // Relation types have no inline picker here — show a read-only reference.
  if (['property', 'entity', 'project', 'table_relation'].includes(type)) {
    return (
      <div className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3.5 text-[13px] font-medium text-slate-400 truncate">
        {value ? String(value) : `${field.label} (linked)`}
      </div>
    );
  }

  // text / email / url / auto_id / link fallback
  return (
    <input
      type={type === 'email' ? 'email' : type === 'url' ? 'url' : 'text'}
      defaultValue={value ?? ''}
      disabled={disabled}
      onBlur={e => onCommit(e.target.value || null)}
      className={inputClass}
      placeholder={field.label}
    />
  );
}
