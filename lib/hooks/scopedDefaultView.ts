// lib/hooks/scopedDefaultView.ts
// Shared "which company_default_views row applies to ME" resolver -- person
// > team > company-wide, see 20260729000000_scoped_default_views.sql for
// the schema/RLS this reads. Used by both usePresetTable.ts and
// useTableColumnConfig.ts, which otherwise duplicate their column-loading
// logic on purpose (see useTableColumnConfig.ts's own comment) -- this one
// piece is worth sharing since getting the priority order wrong in only one
// of the two would be a silent, hard-to-notice divergence.
import { supabase } from "@/lib/supabase";

export interface ScopedDefaultView {
  columns?: string[];
  expansion_columns?: string[];
  column_widths?: Record<string, number>;
  preset_name?: string;
  sort?: any;
  [key: string]: any;
}

export async function fetchScopedDefaultView(
  companyId: string,
  tableSlug: string,
  userId: string | null | undefined,
  myTeamIds: string[] | undefined,
): Promise<ScopedDefaultView | null> {
  const teamIds = myTeamIds || [];
  const orClauses = [
    userId ? `user_id.eq.${userId}` : null,
    teamIds.length ? `team_id.in.(${teamIds.join(',')})` : null,
    'and(team_id.is.null,user_id.is.null)',
  ].filter(Boolean).join(',');

  const { data } = await supabase
    .from('company_default_views')
    .select('*')
    .eq('company_id', companyId)
    .eq('table_slug', tableSlug)
    .or(orClauses);

  const rows = (data || []) as ScopedDefaultView[];
  const personRow = userId ? rows.find(r => r.user_id === userId) : null;
  const teamRow = teamIds.length ? rows.find(r => r.team_id && teamIds.includes(r.team_id)) : null;
  const companyRow = rows.find(r => !r.team_id && !r.user_id);
  return personRow || teamRow || companyRow || null;
}
