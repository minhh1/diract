// app/api/gmail/archive-requests/reject/route.ts
// Admin-only bulk rejection for add-on-submitted archive requests.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const requestIds: string[] = body.request_ids || [];
  if (!requestIds.length) return NextResponse.json({ error: "request_ids is required" }, { status: 400 });

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: prof } = await supabase
      .from("profiles").select("active_company_id").eq("id", user.id).single();
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
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    const adminDb = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: updateErr } = await adminDb.from("gmail_archive_requests")
      .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .in("id", requestIds).eq("company_id", companyId).eq("status", "pending");
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[archive-requests/reject] Unhandled error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
