// lib/teamScope.ts
// Resolves which "Staff" entities (via entities.linked_profile_id) the
// current signed-in user is allowed to bill work as: a company admin can
// bill as anyone (null = unrestricted); everyone else can only bill as
// themselves -- "only admin can bill as other people, otherwise each staff
// needs to bill as themselves," an explicit call to simplify away from an
// earlier team-leader-sees-their-team allowance. Backs RelationPicker's
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

  const { data: staffEntities } = await supabase
    .from('entities').select('id')
    .eq('company_id', companyId)
    .eq('linked_profile_id', user.id)
    .is('deleted_at', null);
  return (staffEntities || []).map(e => e.id);
}
