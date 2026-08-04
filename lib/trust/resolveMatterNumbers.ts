// Server-side counterpart of lib/hooks/useMatterNumbers.ts -- resolves a
// batch of `projects` record ids to their Matter Number (a per-company
// custom field, table_name='projects', field_key='matter_number', stored
// in the generic company_custom_fields/company_custom_field_values EAV
// pair -- same lookup issuePrecedent.ts's resolveMatterReference() does for
// a single matter, batched here since a trust PDF can reference several).
import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveMatterNumbers(
  admin: SupabaseClient, companyId: string, matterIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const ids = [...new Set(matterIds.filter((id): id is string => !!id))];
  if (!ids.length) return new Map();

  const { data: field } = await admin
    .from('company_custom_fields').select('id').eq('company_id', companyId).eq('table_name', 'projects')
    .eq('field_key', 'matter_number').is('deleted_at', null).maybeSingle();
  if (!field) return new Map();

  const { data: values } = await admin
    .from('company_custom_field_values').select('record_id, value_text').eq('field_id', field.id).in('record_id', ids);

  const map = new Map<string, string>();
  for (const v of values || []) if (v.value_text) map.set(v.record_id, v.value_text);
  return map;
}
