// lib/services/joinCompanyWithToken.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureStaffEntity, linkStaffEntity } from "@/lib/services/staffEntityService";

// Single source of truth for consuming a registration_tokens invite. Must
// run with a service-role client -- team_members and registration_tokens
// both have admin-only RLS write policies (team_members_write,
// tokens_admin_update), so a brand-new invitee joining with the invite's
// own role (usually 'operator') can't satisfy them yet themselves. Every
// call site that did this with the user's own session client instead
// (app/(marketing)/login/page.tsx, app/auth/callback/route.ts,
// mobile/src/lib/inviteJoin.ts) silently no-opped the team assignment and
// the "mark token used" write for any operator-role invite -- the
// membership itself still went through (self-insert is allowed), so the
// person got in, but the invite stayed "unused" forever and they never
// landed in the invite's team.
export type JoinCompanyResult =
  | { ok: true; companyId: string; companyName: string }
  | { ok: false; error: string };

export async function joinCompanyWithToken(
  admin: SupabaseClient,
  userId: string,
  token: string
): Promise<JoinCompanyResult> {
  const { data: tokenData, error: tokenError } = await admin
    .from("registration_tokens")
    .select("id, company_id, used_at, expires_at, default_team_id, role, staff_entity_id, company:company_id(id, name)")
    .eq("token", token)
    .single();

  if (tokenError || !tokenData) {
    return { ok: false, error: "Invalid token: not found" };
  }
  if (tokenData.used_at) {
    return { ok: false, error: "This invitation link has already been used" };
  }
  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    return { ok: false, error: "This invitation link has expired" };
  }

  const companyId = tokenData.company_id;
  if (!companyId) {
    return { ok: false, error: "Token has no company associated" };
  }

  const { error: memberError } = await admin
    .from("company_memberships")
    .upsert(
      { company_id: companyId, user_id: userId, role: tokenData.role || "operator" },
      { onConflict: "company_id,user_id", ignoreDuplicates: false }
    );
  if (memberError) {
    return { ok: false, error: memberError.message };
  }

  // Claim the pre-created Staff entity this invite was generated for, if
  // any, instead of ensureStaffEntity() creating a second blank one for the
  // same person -- falls back to the normal auto-provision path when
  // there's no pre-created entity, or it's missing/already linked.
  const linked = tokenData.staff_entity_id
    ? await linkStaffEntity(admin, companyId, userId, tokenData.staff_entity_id)
    : false;
  if (!linked) await ensureStaffEntity(admin, companyId, userId);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ active_company_id: companyId })
    .eq("id", userId);
  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  if (tokenData.default_team_id) {
    const { error: teamError } = await admin
      .from("team_members")
      .upsert(
        { team_id: tokenData.default_team_id, profile_id: userId },
        { onConflict: "team_id,profile_id" }
      );
    if (teamError) console.error("[joinCompanyWithToken] team assignment error:", teamError.message);
  }

  await admin
    .from("registration_tokens")
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq("id", tokenData.id);

  return {
    ok: true,
    companyId,
    companyName: (tokenData.company as { name?: string } | null)?.name || "Company",
  };
}
