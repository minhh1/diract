import { supabase } from './supabase';
import type { CustomTableField } from './dashboardWidgets/customTableTypes';

// Mobile port of lib/services/customTableService.ts's createRecord --
// covers the common path only (a plain, non-ledger table with no
// auto-numbered or is_unique fields), which is what every custom-table
// quick_add_form/my_tasks_button seen so far actually needs. Known v1
// gaps, each falling back to web rather than silently doing the wrong
// thing: ledger tables (insert_ledger_record RPC), auto_number_prefix
// fields (next_field_sequence RPC), is_unique enforcement (claimAllUniqueValues'
// race-safe locking), and sum_related/max_related rollup recomputation on
// the PARENT record (recomputeRelatedRollups) -- creating a Time Entry here
// won't retroactively bump a Matter's "Billable Fees" rollup until that
// Matter is next touched on web. isSupportedForWrite() below is the single
// gate every write-capable widget checks before offering to write at all.

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

function getValueColumn(fieldType: string): string {
  if (fieldType === 'number' || fieldType === 'currency') return 'value_number';
  if (fieldType === 'date') return 'value_date';
  if (fieldType === 'boolean') return 'value_boolean';
  if (['table_relation', 'property', 'entity', 'project', 'link'].includes(fieldType)) return 'value_record_id';
  return 'value_text';
}

// Mirrors lib/services/customTableService.ts's computeFormulaFields --
// sum_related/max_related are deliberately NOT handled here (see this
// file's header comment); a formula field of either type just keeps
// whatever value it's given (null on create), same as this function's web
// counterpart already does for any formula_type it doesn't recognize.
function computeFormulaFields(fields: CustomTableField[], values: Record<string, unknown>): Record<string, unknown> {
  const result = { ...values };
  const byId = new Map(fields.map((f) => [f.id, f]));
  for (const field of fields) {
    if (!field.formula_type || field.formula_type === 'sum_related' || field.formula_type === 'max_related') continue;
    const fieldA = field.formula_field_a_id ? byId.get(field.formula_field_a_id) : null;
    const rawA = fieldA ? result[fieldA.field_key] : undefined;
    const a = rawA == null ? (field.formula_type === 'add' ? 0 : NaN) : Number(rawA);
    if (Number.isNaN(a)) continue;

    if (field.formula_type === 'multiply' || field.formula_type === 'add' || field.formula_type === 'subtract' || field.formula_type === 'divide') {
      const fieldB = field.formula_field_b_id ? byId.get(field.formula_field_b_id) : null;
      const rawB = fieldB ? result[fieldB.field_key] : undefined;
      const b = rawB == null ? (field.formula_type === 'add' || field.formula_type === 'subtract' ? 0 : NaN) : Number(rawB);
      if (!Number.isNaN(b) && !(field.formula_type === 'divide' && b === 0)) {
        result[field.field_key] = field.formula_type === 'add' ? a + b
          : field.formula_type === 'subtract' ? a - b
          : field.formula_type === 'divide' ? a / b
          : a * b;
      }
    } else if (field.formula_type === 'percentage_of') {
      result[field.field_key] = a * ((field.formula_percent ?? 0) / 100);
    }
  }
  return result;
}

// A table this write path can safely handle -- gates every write-capable
// widget (quick_add_form, my_tasks_button) before it offers to create
// anything, so an unsupported table (ledger, or a field shape this doesn't
// compute correctly) falls back to "open on web" instead of silently
// creating a record with a wrong/missing computed value.
export async function isSupportedForWrite(tableId: string, fields: CustomTableField[]): Promise<boolean> {
  const { data } = await supabase.from('company_tables').select('is_ledger').eq('id', tableId).maybeSingle();
  if (data?.is_ledger) return false;
  if (fields.some((f) => f.formula_type === 'sum_related' || f.formula_type === 'max_related')) return false;
  return true;
}

export async function createCustomTableRecord(
  tableId: string,
  companyId: string,
  userId: string,
  values: Record<string, unknown>,
  fields: CustomTableField[]
): Promise<{ id: string } | { error: string }> {
  const hasContent = fields.some((f) => !f.formula_type && !isEmptyValue(values[f.field_key]));
  if (!hasContent) return { error: 'Fill in at least one field before creating a record.' };

  const toSave = computeFormulaFields(fields, values);

  const { data: record, error: recordError } = await supabase
    .from('company_table_records')
    .insert({ table_id: tableId, company_id: companyId, created_by: userId })
    .select('id')
    .single();
  if (recordError || !record) {
    console.error('[customTableWrite] createCustomTableRecord insert:', recordError);
    return { error: 'Could not create this record. Please try again.' };
  }

  const fieldByKey = new Map(fields.map((f) => [f.field_key, f]));
  const upserts: Record<string, unknown>[] = [];
  for (const [key, value] of Object.entries(toSave)) {
    const field = fieldByKey.get(key);
    if (!field || isEmptyValue(value)) continue;
    upserts.push({ company_id: companyId, table_id: tableId, record_id: record.id, field_id: field.id, [getValueColumn(field.field_type)]: value });
  }

  if (upserts.length) {
    const { error: valuesError } = await supabase.from('company_table_values').upsert(upserts, { onConflict: 'record_id,field_id' });
    if (valuesError) {
      console.error('[customTableWrite] createCustomTableRecord values:', valuesError);
      await supabase.from('company_table_records').delete().eq('id', record.id);
      return { error: 'Could not save this entry. Please try again.' };
    }
  }

  return { id: record.id };
}
