// lib/teamScope.ts
// Resolves which "Staff" entities (via entities.linked_profile_id) the
// current signed-in user is allowed to bill work as: a company admin can
// bill as anyone (null = unrestricted); a member of a team with
// teams.allow_time_entry_delegation set (configured in Admin > Teams) can
// too; everyone else can only bill as themselves. Backs RelationPicker's
// '$team_scope' sentinel (see FieldConfigPanel.tsx / RelationPicker.tsx),
// the role-aware replacement for the old, inconsistently-applied
// '$current_user'-only filter on Time & Fee Entries/Disbursements' Staff
// field.
import { supabase } from "@/lib/supabase";

export async function getStaffScopeIds(): Promise<string[] | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: prof } = await supabase
    .from('profiles').select('active_company_id').eq('id', user.id).maybeSingle();
  const companyId = prof?.active_company_id;
  if (!companyId) return [];

  const { data: membership } = await supabase
    .from('company_memberships').select('role').eq('user_id', user.id).eq('company_id', companyId).maybeSingle();
  if (membership?.role === 'company_admin') return null;

  // Delegated permission -- a team's members can bill as anyone too, not
  // just the company_admin, if an admin has ticked "Allow members to enter
  // time on behalf of other staff" for that team (Admin > Teams). `teams`
  // isn't itself company-scoped (see AdminTeamsTab.tsx), but team_members
  // only ever links a profile actually in THIS user's own membership check
  // above, so there's no cross-company leak from checking it unconditionally.
  const { data: myTeams } = await supabase
    .from('team_members').select('team_id').eq('profile_id', user.id);
  const myTeamIds = (myTeams || []).map(t => t.team_id);
  if (myTeamIds.length) {
    const { data: delegatedTeam } = await supabase
      .from('teams').select('id').in('id', myTeamIds).eq('allow_time_entry_delegation', true).limit(1).maybeSingle();
    if (delegatedTeam) return null;
  }

  const { data: staffEntities } = await supabase
    .from('entities').select('id')
    .eq('company_id', companyId)
    .eq('linked_profile_id', user.id)
    .is('deleted_at', null);
  return (staffEntities || []).map(e => e.id);
}

// Mirrors getStaffScopeIds() above, but for VIEWING other staff's rows
// (teams.allow_time_entry_view, set in Admin > Teams) rather than logging
// time AS them (allow_time_entry_delegation) -- a deliberately separate
// permission, see supabase/migrations/20260728220000_time_entry_view_scope.sql.
// Client-side mirror of that migration's time_entry_view_scope_ids() (which
// actually enforces the read restriction via RLS); this copy exists so the
// UI can decide upfront whether a viewer is even ELIGIBLE to set a
// non-"myself" default view, without waiting on a table fetch to find out.
export async function getTimeEntryViewScopeIds(): Promise<string[] | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: prof } = await supabase
    .from('profiles').select('active_company_id').eq('id', user.id).maybeSingle();
  const companyId = prof?.active_company_id;
  if (!companyId) return [];

  const { data: membership } = await supabase
    .from('company_memberships').select('role').eq('user_id', user.id).eq('company_id', companyId).maybeSingle();
  if (membership?.role === 'company_admin') return null;

  const { data: myTeams } = await supabase
    .from('team_members').select('team_id').eq('profile_id', user.id);
  const myTeamIds = (myTeams || []).map(t => t.team_id);
  if (myTeamIds.length) {
    const { data: viewTeam } = await supabase
      .from('teams').select('id').in('id', myTeamIds).eq('allow_time_entry_view', true).limit(1).maybeSingle();
    if (viewTeam) return null;
  }

  const { data: staffEntities } = await supabase
    .from('entities').select('id')
    .eq('company_id', companyId)
    .eq('linked_profile_id', user.id)
    .is('deleted_at', null);
  return (staffEntities || []).map(e => e.id);
}

// Convenience boolean for gating UI (e.g. "set default view") -- null from
// getTimeEntryViewScopeIds() means unrestricted, i.e. more than just their
// own rows.
export async function canViewMultipleTimeEntries(): Promise<boolean> {
  return (await getTimeEntryViewScopeIds()) === null;
}
