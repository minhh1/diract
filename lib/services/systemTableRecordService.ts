// Write-path counterpart to lib/hooks/useSystemTableAsCustomTable.ts --
// creates/updates/deletes rows on a system table (projects/properties/
// entities) from the exact same `values` (field_key -> raw value) shape
// components/dashboard/DashboardQuickAddForm.tsx and DashboardGrid.tsx
// already pass into lib/services/customTableService.ts for custom tables.
// Mirrors components/dashboard/RecordDashboard.tsx's proven
// company_custom_field_values upsert shape (onConflict: 'field_id,record_id').
//
// Deliberately does not implement several custom-table-only concepts that
// have no equivalent on a fixed native schema: formula fields, server-
// assigned auto-numbering, allow_multiple relations, and is_unique claiming
// (Postgres unique constraints on native columns, if any, still surface as
// an insert/update error -- just not pre-validated here).

import { supabase } from "@/lib/supabase";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import type { SystemTableName } from "@/lib/hooks/useSystemTableAsCustomTable";

// Columns present on `projects` but not `properties`/`entities` -- included
// in a write only for the table that actually has them, since inserting/
// updating an unknown column is a hard Postgres error, not a no-op.
const HAS_CREATED_BY: Record<SystemTableName, boolean> = { projects: true, properties: false, entities: false };
const HAS_UPDATED_AT: Record<SystemTableName, boolean> = { projects: true, properties: false, entities: false };

function isEmptyValue(v: any): boolean {
  return v === undefined || v === null || v === '';
}

function splitValues(values: Record<string, any>, fields: CustomTableField[]) {
  const native: Record<string, any> = {};
  const custom: { field: CustomTableField; value: any }[] = [];
  for (const field of fields) {
    if (!(field.field_key in values)) continue;
    const value = values[field.field_key];
    if (field.field_source === 'custom') custom.push({ field, value });
    else native[field.field_key] = value;
  }
  return { native, custom };
}

function valueColumn(fieldType: string): 'value_number' | 'value_date' | 'value_boolean' | 'value_text' {
  if (fieldType === 'number' || fieldType === 'currency') return 'value_number';
  if (fieldType === 'date') return 'value_date';
  if (fieldType === 'boolean') return 'value_boolean';
  return 'value_text';
}

async function saveCustomFieldValues(
  tableName: SystemTableName,
  companyId: string,
  recordId: string,
  custom: { field: CustomTableField; value: any }[],
): Promise<{ error: string } | void> {
  const rows = custom
    .filter(c => !isEmptyValue(c.value))
    .map(c => ({
      company_id: companyId,
      table_name: tableName,
      record_id: recordId,
      field_id: c.field.id,
      [valueColumn(c.field.field_type)]: c.value,
    }));
  if (!rows.length) return;
  const { error } = await supabase
    .from('company_custom_field_values')
    .upsert(rows, { onConflict: 'field_id,record_id' });
  if (error) {
    console.error('systemTableRecordService: custom field values:', error);
    return { error: 'Saved the record, but a custom field failed to save — please check its value.' };
  }
}

// Writes a sum_related rollup's freshly-computed value onto a system-table
// record (see lib/services/customTableService.ts's recomputeRelatedRollups,
// which calls this whenever a related custom-table row is created/edited/
// deleted) -- same upsert shape as saveCustomFieldValues above, just for the
// one-field case a rollup recompute always is.
export async function saveRollupValue(
  tableName: SystemTableName, companyId: string, recordId: string, fieldId: string, value: number
): Promise<void> {
  const { error } = await supabase
    .from('company_custom_field_values')
    .upsert(
      { company_id: companyId, table_name: tableName, record_id: recordId, field_id: fieldId, value_number: value },
      { onConflict: 'field_id,record_id' }
    );
  if (error) console.error('systemTableRecordService.saveRollupValue:', error);
}

export async function createRecord(
  tableName: SystemTableName,
  companyId: string,
  userId: string,
  values: Record<string, any>,
  fields: CustomTableField[],
): Promise<{ id: string } | { error: string } | null> {
  const hasContent = fields.some(f => !isEmptyValue(values[f.field_key]));
  if (!hasContent) return { error: 'Fill in at least one field before creating a record.' };

  const missingRequired = fields.find(f => f.is_required && isEmptyValue(values[f.field_key]));
  if (missingRequired) return { error: `${missingRequired.label} is required.` };

  const { native, custom } = splitValues(values, fields);

  const insertPayload: Record<string, any> = { ...native, company_id: companyId };
  if (HAS_CREATED_BY[tableName]) insertPayload.created_by = userId;

  const { data: record, error } = await supabase
    .from(tableName)
    .insert(insertPayload)
    .select('id')
    .single();
  if (error || !record) {
    console.error('systemTableRecordService.createRecord:', error);
    return { error: error?.message || 'Could not create this record.' };
  }

  const cfError = await saveCustomFieldValues(tableName, companyId, record.id, custom);
  if (cfError) return cfError;

  return { id: record.id };
}

export async function updateRecord(
  recordId: string,
  tableName: SystemTableName,
  companyId: string,
  values: Record<string, any>,
  fields: CustomTableField[],
): Promise<{ error: string } | void> {
  const { native, custom } = splitValues(values, fields);

  if (Object.keys(native).length) {
    const updatePayload = HAS_UPDATED_AT[tableName] ? { ...native, updated_at: new Date().toISOString() } : native;
    const { error } = await supabase.from(tableName).update(updatePayload).eq('id', recordId);
    if (error) {
      console.error('systemTableRecordService.updateRecord:', error);
      return { error: error.message };
    }
  }

  return saveCustomFieldValues(tableName, companyId, recordId, custom) as Promise<{ error: string } | void>;
}

export async function deleteRecord(recordId: string, tableName: SystemTableName): Promise<{ error: string } | void> {
  const { error } = await supabase.from(tableName).update({ deleted_at: new Date().toISOString() }).eq('id', recordId);
  if (error) {
    console.error('systemTableRecordService.deleteRecord:', error);
    return { error: error.message };
  }
}
