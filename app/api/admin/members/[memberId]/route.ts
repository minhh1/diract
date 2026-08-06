// app/api/admin/members/[memberId]/route.ts
// DELETE -- removes a member from the active company. Used to live entirely
// client-side (app/(app)/dashboard/admin/page.tsx's old handleRemoveMember,
// a single `company_memberships` delete) which left two things behind for
// good: the member's linked Staff `entities` row stayed fully active (kept
// showing up in every future Staff picker/list, indistinguishable from a
// current member -- see supabase/migrations for the entities soft-delete
// fix), and their connected Gmail account (user_gmail_tokens, plus its live
// Gmail Watch push subscription) kept running against the company they'd
// just been removed from. Confirmed live: gmail-push kept firing for a
// removed member's mailbox for days (stage: "no_companies_configured" every
// time -- harmless, but wasted invocations and left a departed member's
// OAuth refresh token sitting in the database with nothing to revoke it).
// Gmail token handling needs the refresh_token + Google client secret,
// which must never reach the browser, so this whole flow is server-side now
// instead of scattered raw client-side deletes.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { refreshTokenIfNeeded } from "@/lib/gmail/client";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can remove a member" }, { status: 403 });
  const { memberId } = await params;

  await admin.from("company_memberships").delete().eq("user_id", memberId).eq("company_id", companyId);

  // Soft-delete the linked Staff entity (if any) so this member drops out
  // of every future picker/list -- same fix as the manual backfill, now
  // applied automatically on every removal instead of needing another
  // one-off cleanup next time.
  await admin.from("entities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("company_id", companyId).eq("linked_profile_id", memberId).is("deleted_at", null);

  // Disconnect their Gmail, if they had it connected to this company: stop
  // the live push subscription (best-effort -- a stale/already-revoked
  // token failing here shouldn't block the removal) and delete the token
  // row outright, not soft-delete -- there's no "restore" use case for a
  // departed member's OAuth credentials, and leaving them in the database
  // is the actual problem being fixed here.
  const { data: tokenRow } = await admin.from("user_gmail_tokens")
    .select("id").eq("user_id", memberId).eq("company_id", companyId).maybeSingle();
  if (tokenRow) {
    try {
      const accessToken = await refreshTokenIfNeeded(memberId, admin);
      await fetch("https://gmail.googleapis.com/gmail/v1/users/me/stop", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      console.error("[admin/members] Could not stop Gmail watch during removal (continuing):", err);
    }
    await admin.from("user_gmail_tokens").delete().eq("id", tokenRow.id);
  }

  return NextResponse.json({ ok: true });
}
