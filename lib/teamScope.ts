// lib/teamScope.ts
// Resolves which "Staff" entities (via entities.linked_profile_id) the
// current signed-in user is allowed to see: a company admin sees everyone
// (null = unrestricted); a team leader sees the union of every team they
// lead (a leader can lead more than one team -- teams.leader_id has no
// uniqueness constraint) plus themselves; everyone else sees only
// themselves. Backs RelationPicker's '$team_scope' sentinel (see
// FieldConfigPanel.tsx / RelationPicker.tsx), the role/team-aware
// replacement for the old, inconsistently-applied '$current_user'-only
// filter on Time & Fee Entries/Disbursements' Staff field.
//
// Generalizes the inline "teams I lead or belong to" query already
// duplicated in components/settings/PublicTaskPagesTab.tsx and
// lib/publicTaskPageAuth.ts -- no shared helper existed for it before this.
//
// Note: `teams` has no company_id column, so a leader_id match isn't itself
// company-scoped -- acceptable here since a user only ever has one active
// company at a time in this app, same assumption those two existing call
// sites already make.
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

  const { data: ledTeams } = await supabase.from('teams').select('id').eq('leader_id', user.id);
  const ledTeamIds = (ledTeams || []).map(t => t.id);

  const profileIds = new Set<string>([user.id]);
  if (ledTeamIds.length) {
    const { data: members } = await supabase.from('team_members').select('profile_id').in('team_id', ledTeamIds);
    (members || []).forEach(m => profileIds.add(m.profile_id));
  }

  const { data: staffEntities } = await supabase
    .from('entities').select('id')
    .eq('company_id', companyId)
    .in('linked_profile_id', [...profileIds])
    .is('deleted_at', null);
  return (staffEntities || []).map(e => e.id);
}
