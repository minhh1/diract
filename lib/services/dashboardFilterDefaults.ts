// lib/services/dashboardFilterDefaults.ts
// Per-user persisted defaults for a dashboard's $current_user/$team_scope
// filter fields (see supabase/migrations/20260730190000_dashboard_filter_view_defaults.sql
// and lib/teamScope.ts's canViewMultipleTimeEntries) -- e.g. a Time Entry
// dashboard's Staff filter defaulting to "All" for a team lead instead of
// always re-narrowing to just their own entries.
import { supabase } from "@/lib/supabase";

// value_record_id null means "All" -- still a real, saved preference,
// distinct from "this user has never set one" (which the caller represents
// as the field_id simply being absent from the returned map).
export async function getFilterDefaults(dashboardId: string): Promise<Record<string, string | null>> {
  // getSession() is local-only (no network round trip), unlike getUser() --
  // safe here since this only seeds a client-side filter default, not a
  // real access check.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return {};
  const { data } = await supabase
    .from('user_field_filter_defaults')
    .select('field_id, value_record_id')
    .eq('user_id', user.id)
    .eq('dashboard_id', dashboardId);
  const out: Record<string, string | null> = {};
  for (const row of data || []) out[row.field_id] = row.value_record_id;
  return out;
}

export async function setFilterDefault(dashboardId: string, fieldId: string, valueRecordId: string | null): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;
  await supabase.from('user_field_filter_defaults').upsert({
    user_id: user.id, dashboard_id: dashboardId, field_id: fieldId,
    value_record_id: valueRecordId, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,dashboard_id,field_id' });
}

export async function clearFilterDefault(dashboardId: string, fieldId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;
  await supabase.from('user_field_filter_defaults')
    .delete().eq('user_id', user.id).eq('dashboard_id', dashboardId).eq('field_id', fieldId);
}
