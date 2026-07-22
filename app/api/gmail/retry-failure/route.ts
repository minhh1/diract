// app/api/gmail/retry-failure/route.ts
// Admin-only manual retry for a gmail_sync_failures row — covers both
// "pending_retry" (force it now instead of waiting up to 15 min for
// gmail-sync-recovery-worker's next tick) and "persistent_failure" (stuck
// permanently until a human resets it, e.g. after the account owner
// reconnects Gmail or a rate limit clears). Resets attempts to 0 since a
// manual retry implies the underlying issue is believed fixed — it
// shouldn't immediately re-escalate after just one more failed attempt.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { failureId } = body;
  if (!failureId) return NextResponse.json({ error: "Missing failureId" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prof } = await supabase.from("profiles").select("active_company_id").eq("id", user.id).single();
  const companyId = prof?.active_company_id;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

  const { data: membership } = await supabase
    .from("company_memberships").select("role")
    .eq("user_id", user.id).eq("company_id", companyId).single();
  if (membership?.role !== "company_admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  const adminDb = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: failure } = await adminDb
    .from("gmail_sync_failures").select("id, company_id, status")
    .eq("id", failureId).single();
  if (!failure || failure.company_id !== companyId) {
    return NextResponse.json({ error: "Failure not found" }, { status: 404 });
  }

  const { error: updErr } = await adminDb.from("gmail_sync_failures").update({
    status: "pending_retry",
    attempts: 0,
    last_attempted_at: null,
    resolved_at: null,
  }).eq("id", failureId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Best-effort nudge so the recovery worker picks this up now instead of
  // waiting up to 15 minutes — failure to reach it isn't fatal, the row is
  // already back in pending_retry and the next scheduled tick will get it.
  fetch(`${supabaseUrl}/functions/v1/gmail-sync-recovery-worker`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }).catch(err => console.error("[retry-failure] Failed to trigger recovery worker:", err));

  return NextResponse.json({ ok: true });
}
