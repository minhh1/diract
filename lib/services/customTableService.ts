import { supabase } from "@/lib/supabase";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";

function getValueColumn(fieldType: string): string {
  if (['number', 'currency'].includes(fieldType)) return 'value_number';
  if (fieldType === 'date') return 'value_date';
  if (fieldType === 'boolean') return 'value_boolean';
  if (['property', 'entity', 'project', 'table_relation'].includes(fieldType)) return 'value_record_id';
  return 'value_text';
}

export async function createRecord(
  tableId: string,
  companyId: string,
  userId: string,
  values: Record<string, any>,
  fields: CustomTableField[]
): Promise<{ id: string } | null> {
  const { data: record, error } = await supabase
    .from('company_table_records')
    .insert({ table_id: tableId, company_id: companyId, created_by: userId })
    .select('id')
    .single();

  if (error || !record) { console.error('createRecord:', error); return null; }

  await saveValues(record.id, tableId, companyId, values, fields);
  return record;
}

export async function updateRecord(
  recordId: string,
  tableId: string,
  companyId: string,
  values: Record<string, any>,
  fields: CustomTableField[]
): Promise<void> {
  await supabase
    .from('company_table_records')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', recordId);

  await saveValues(recordId, tableId, companyId, values, fields);
}

export async function deleteRecord(recordId: string): Promise<void> {
  await supabase
    .from('company_table_records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', recordId);
}

async function saveValues(
  recordId: string,
  tableId: string,
  companyId: string,
  values: Record<string, any>,
  fields: CustomTableField[]
): Promise<void> {
    const fieldMap = new Map(fields.map(f => [f.field_key, f]));
    const upserts = Object.entries(values)
    .map(([key, value]) => {
        const field = fieldMap.get(key);
        if (!field || value === undefined || value === null || value === '') return null;
        const valueCol = getValueColumn(field.field_type);
        return {
        company_id: companyId,
        table_id: tableId,
        record_id: recordId,
        field_id: field.id,
        [valueCol]: value,
        };
    })
    .filter((u): u is NonNullable<typeof u> => u !== null);

  if (upserts.length) {
    await supabase
      .from('company_table_values')
      .upsert(upserts, { onConflict: 'record_id,field_id' });
  }
}