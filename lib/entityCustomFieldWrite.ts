// Writes values for fields that used to be native columns (entities.abn,
// .acn, .tfn, .bsb, .account_number, .bank_name, .nab_connect_id,
// .trust_deed_date) but are now ordinary company_custom_fields, from forms
// that still collect them as part of a bespoke create flow (NewEntityModal,
// RecordCreatorField) rather than the generic custom-field-driven record
// grid. Same upsert shape as lib/services/systemTableRecordService.ts /
// components/dashboard/RecordDashboard.tsx (onConflict: 'field_id,record_id').
import { supabase } from "@/lib/supabase";
import { getValueColumn } from "@/lib/schema/fieldCapabilities";

export async function writeEntityCustomFieldValues(
  companyId: string,
  recordId: string,
  tableName: string,
  values: Record<string, string | null | undefined>,
): Promise<{ error: string } | void> {
  const filled = Object.entries(values).filter(([, v]) => v != null && String(v).trim() !== '');
  if (!filled.length) return;

  const { data: fields, error: fetchError } = await supabase
    .from('company_custom_fields')
    .select('id, field_key, field_type')
    .eq('company_id', companyId)
    .eq('table_name', tableName)
    .in('field_key', filled.map(([key]) => key))
    .is('deleted_at', null);
  if (fetchError) return { error: fetchError.message };
  if (!fields?.length) return;

  const rows = fields
    .map(f => {
      const match = filled.find(([key]) => key === f.field_key);
      if (!match) return null;
      return {
        company_id: companyId,
        table_name: tableName,
        record_id: recordId,
        field_id: f.id,
        [getValueColumn(f.field_type)]: match[1],
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (!rows.length) return;

  const { error } = await supabase
    .from('company_custom_field_values')
    .upsert(rows, { onConflict: 'field_id,record_id' });
  if (error) return { error: error.message };
}
