import { supabase } from './supabase';
import { callApi } from './api';

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
    .rpc('validate_registration_token', { p_token: token })
    .single() as { data: Omit<InviteTokenData, 'token'> | null; error: unknown };

  if (error || !data) return null;

  const isExpired = data.expires_at ? new Date(data.expires_at) < new Date() : false;
  if (isExpired || data.used_at) return null;

  return {
    id: data.id,
    token,
    company_id: data.company_id,
    company_name: data.company_name ?? null,
    note: data.note,
    expires_at: data.expires_at,
    used_at: data.used_at,
    default_team_id: data.default_team_id,
    role: data.role || 'operator',
  };
}

// Calls the web app's /api/join-company (service role), which adds the
// membership, provisions the Staff entity, switches the active company,
// assigns the default team, and burns the token -- all server-side.
// Doing these writes directly from the client (as this used to) silently
// failed for operator-role invites: team_members and registration_tokens
// both have admin-only RLS write policies that a brand-new operator
// invitee can't satisfy with their own session yet. See
// lib/services/joinCompanyWithToken.ts's header comment on the web side
// for the full explanation. Best-effort by design -- a failed join here
// shouldn't strand an otherwise-successful sign-in.
export async function joinCompanyWithToken(invite: InviteTokenData): Promise<void> {
  if (!invite.company_id) return;
  try {
    const res = await callApi('/api/join-company', {
      method: 'POST',
      body: JSON.stringify({ token: invite.token }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      console.error('[joinCompanyWithToken] failed', json?.error);
    }
  } catch (err) {
    console.error('[joinCompanyWithToken] failed', err);
  }
}
