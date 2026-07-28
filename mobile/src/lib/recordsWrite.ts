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
