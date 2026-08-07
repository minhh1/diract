// app/api/ai-data-access-requests/approve/route.ts
// Admin-only approval for ai_data_access_requests (see supabase/migrations/
// 20260808010000_ai_data_access.sql) -- the relay queue a non-admin's
// question lands in when lib/ai/tableBuilderTools.ts's query_records finds
// no active grant. Mirrors app/api/lead-email-assignments/approve's
// admin-gate + bulk-ids + per-id results shape, but the actual "approval"
// here is just setting ai_chat_settings.data_access_granted_until -- there's
// no per-request side effect to retry/fail the way a Gmail label apply can.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  const duration: string = body?.duration === "30_days" ? "30_days" : "one_time";
  if (ids.length === 0) return NextResponse.json({ error: "ids is required" }, { status: 400 });

  // 'one_time' here means "enough time for whoever asked to come back and
  // get their answer," not "expires before they can use it" -- unlike the
  // live/synchronous direct-ask flow (grant_ai_data_access in
  // tableBuilderTools.ts, a few minutes is plenty since that grant is used
  // within the same turn), this approval is asynchronous: the requester
  // isn't watching, so a short window would likely expire before they're
  // back to send a follow-up message.
  const grantedUntil = duration === "30_days"
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);

  const { error: grantError } = await admin.from("ai_chat_settings").upsert(
    { company_id: companyId, data_access_granted_until: grantedUntil.toISOString() },
    { onConflict: "company_id" }
  );
  if (grantError) return NextResponse.json({ error: grantError.message }, { status: 500 });

  const { error } = await admin
    .from("ai_data_access_requests")
    .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("company_id", companyId)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, grantedUntil: grantedUntil.toISOString() });
}
