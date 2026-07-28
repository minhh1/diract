// lib/hooks/scopedDefaultResources.ts
// Which company_tables/company_dashboards ids are mandatory for THIS viewer
// via a team/person-scoped rule (company_default_scopes -- additive on top
// of the resource's own is_default, see
// 20260729000000_scoped_default_views.sql and AdminDefaultTablesTab.tsx /
// AdminDefaultDashboardsTab.tsx). Shared by useCustomTables.ts and
// useCustomDashboards.ts, whose module-level caches are already keyed by
// userId -- this rides along in the same fetch/cache cycle rather than
// being its own hook.
import { supabase } from "@/lib/supabase";

export async function fetchScopedDefaultResourceIds(
  resourceType: 'table' | 'dashboard',
  userId: string | null,
): Promise<Set<string>> {
  if (!userId) return new Set();

  const { data: teamRows } = await supabase.from('team_members').select('team_id').eq('profile_id', userId);
  const teamIds = (teamRows || []).map((r: any) => r.team_id);

  const orClauses = [`user_id.eq.${userId}`, teamIds.length ? `team_id.in.(${teamIds.join(',')})` : null]
    .filter(Boolean).join(',');
  const { data: scopeRows } = await supabase
    .from('company_default_scopes')
    .select('resource_id')
    .eq('resource_type', resourceType)
    .or(orClauses);

  return new Set((scopeRows || []).map((r: any) => r.resource_id));
}
