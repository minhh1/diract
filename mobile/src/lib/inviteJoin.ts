import { supabase } from './supabase';
import { ensureStaffEntity } from './staffEntityService';

export type InviteTokenData = {
  id: string;
  token: string;
  company_id: string | null;
  company_name: string | null;
  note: string | null;
  expires_at: string | null;
  used_at: string | null;
  default_team_id: string | null;
  role: string;
};

// Mirrors validateToken() in app/login/page.tsx.
export async function validateInviteToken(token: string): Promise<InviteTokenData | null> {
  const { data, error } = await supabase
    .from('registration_tokens')
    .select('id, note, expires_at, used_at, company_id, default_team_id, role, company:company_id(name)')
    .eq('token', token)
    .single();

  if (error || !data) return null;

  const isExpired = data.expires_at ? new Date(data.expires_at) < new Date() : false;
  if (isExpired || data.used_at) return null;

  return {
    id: data.id,
    token,
    company_id: data.company_id,
    company_name: (data.company as { name?: string } | null)?.name ?? null,
    note: data.note,
    expires_at: data.expires_at,
    used_at: data.used_at,
    default_team_id: data.default_team_id,
    role: data.role || 'operator',
  };
}

// Mirrors handleTokenJoin()/the invite-join branch of handleLogin() in
// app/login/page.tsx: adds the membership, provisions the Staff entity,
// switches the active company, assigns the default team, and burns the
// token. Best-effort by design -- a failed join here shouldn't strand an
// otherwise-successful sign-in.
export async function joinCompanyWithToken(userId: string, invite: InviteTokenData): Promise<void> {
  if (!invite.company_id) return;
  try {
    await supabase.from('company_memberships').upsert(
      { company_id: invite.company_id, user_id: userId, role: invite.role || 'operator' },
      { onConflict: 'company_id,user_id' },
    );
    await ensureStaffEntity(supabase, invite.company_id, userId);
    await supabase.from('profiles').update({ active_company_id: invite.company_id }).eq('id', userId);
    if (invite.default_team_id) {
      await supabase.from('team_members').upsert(
        { team_id: invite.default_team_id, profile_id: userId },
        { onConflict: 'team_id,profile_id' },
      );
    }
    await supabase.from('registration_tokens').update({ used_at: new Date().toISOString() }).eq('token', invite.token);
  } catch (err) {
    console.error('[joinCompanyWithToken] failed', err);
  }
}
