import { supabase } from './supabase';
import type { RecordField, SystemTableName } from './records';

// Mirrors lib/services/systemTableRecordService.ts's write path on the web
// app -- same company_custom_field_values upsert shape (onConflict:
// 'field_id,record_id'), same native-vs-custom split, same value-column
// mapping by field type -- so a field edited from mobile round-trips
// identically to one edited from the web dashboard.

const HAS_UPDATED_AT: Record<SystemTableName, boolean> = {
  projects: true,
  properties: false,
  entities: false,
  tasks: false,
};

function valueColumn(fieldType: string): 'value_number' | 'value_date' | 'value_boolean' | 'value_text' {
  if (fieldType === 'number' || fieldType === 'currency') return 'value_number';
  if (fieldType === 'date') return 'value_date';
  if (fieldType === 'boolean') return 'value_boolean';
  return 'value_text';
}

export async function saveFieldValue(
  tableName: SystemTableName,
  companyId: string,
  recordId: string,
  field: RecordField,
  value: unknown,
): Promise<{ error: string } | void> {
  if (field.source === 'native') {
    const payload = HAS_UPDATED_AT[tableName]
      ? { [field.key]: value, updated_at: new Date().toISOString() }
      : { [field.key]: value };
    const { error } = await supabase.from(tableName).update(payload).eq('id', recordId);
    if (error) return { error: error.message };
    return;
  }

  const { error } = await supabase.from('company_custom_field_values').upsert(
    {
      company_id: companyId,
      table_name: tableName,
      record_id: recordId,
      field_id: field.key,
      [valueColumn(field.fieldType)]: value,
    },
    { onConflict: 'field_id,record_id' },
  );
  if (error) return { error: error.message };
}

function isEmptyValue(v: unknown): boolean {
  return v == null || v === '';
}

// Mirrors lib/services/systemTableRecordService.ts's createRecord: native
// fields go straight into the insert payload, custom fields are saved via
// saveFieldValue right after (same upsert it already uses for edits) --
// used by the quick_add_form dashboard widget (see
// src/components/dashboard/QuickAddFormWidget.tsx).
export async function createRecord(
  tableName: SystemTableName,
  companyId: string,
  fields: RecordField[],
  values: Record<string, unknown>,
): Promise<{ id: string } | { error: string }> {
  const nonEmptyFields = fields.filter((f) => !isEmptyValue(values[f.key]));
  if (nonEmptyFields.length === 0) return { error: 'Fill in at least one field before creating a record.' };

  const native: Record<string, unknown> = { company_id: companyId };
  for (const f of nonEmptyFields) {
    if (f.source === 'native') native[f.key] = values[f.key];
  }

  const { data, error } = await supabase.from(tableName).insert(native).select('id').single();
  if (error || !data) return { error: error?.message ?? 'Could not create this record.' };

  for (const f of nonEmptyFields) {
    if (f.source !== 'custom') continue;
    const result = await saveFieldValue(tableName, companyId, data.id, f, values[f.key]);
    if (result?.error) return { error: result.error };
  }

  return { id: data.id };
}
