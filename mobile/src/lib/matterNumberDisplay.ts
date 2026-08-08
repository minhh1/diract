import { supabase } from './supabase';

// Mobile port of lib/matterNumberDisplay.ts on the web app (see its header
// comment for the full picture, including the two other sibling
// implementations -- components/dashboard/RelationPicker.tsx's own inline
// version and lib/prependMatterNumbers.ts -- this mirrors the web app's
// generic-client variant). A linked Matter shows its per-company matter
// number alongside its name wherever it's displayed as a relation: the
// dashboard grid's relation columns (relationResolution.ts), a single
// resolved relation value (relationLabels.ts), and the relation picker's
// option list (RelationPickerSheet.tsx). Detected purely by data (does
// this company have a projects custom field literally keyed
// 'matter_number'?), not gated by company_type.
const MATTER_NUMBER_FIELD_KEY = 'matter_number';

let matterNumberFieldIdCache: { value: string | null; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function resolveMatterNumberFieldId(): Promise<string | null> {
  if (matterNumberFieldIdCache && matterNumberFieldIdCache.expiresAt > Date.now()) {
    return matterNumberFieldIdCache.value;
  }
  const { data } = await supabase
    .from('company_custom_fields')
    .select('id')
    .eq('table_name', 'projects')
    .eq('field_key', MATTER_NUMBER_FIELD_KEY)
    .is('deleted_at', null)
    .maybeSingle();
  const value = data?.id ?? null;
  matterNumberFieldIdCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function fetchMatterNumbersByProjectId(projectIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (projectIds.length === 0) return result;
  const fieldId = await resolveMatterNumberFieldId();
  if (!fieldId) return result;
  const { data } = await supabase
    .from('company_custom_field_values')
    .select('record_id, value_text')
    .eq('field_id', fieldId)
    .in('record_id', projectIds);
  (data ?? []).forEach((v: { record_id: string; value_text: string | null }) => {
    if (v.value_text) result.set(v.record_id, v.value_text);
  });
  return result;
}

// Comma-separated, not a dash -- matches the web app's established format
// (RelationPicker.tsx/lib/prependMatterNumbers.ts), per AGENTS.md's "no em
// dash" rule (also covers ASCII dash-style separators in user-facing text).
export function withMatterNumber(name: string, matterNumber: string | null | undefined): string {
  return matterNumber ? `${matterNumber}, ${name}` : name;
}
