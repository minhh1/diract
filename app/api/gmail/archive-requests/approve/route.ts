// app/api/gmail/archive-requests/approve/route.ts
// Admin-only bulk approval for add-on-submitted archive requests
// (gmail_archive_requests). Approving a request enqueues the same archive
// job the admin-direct trigger uses (lib/gmail/archiveProject.ts).
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { enqueueProjectArchive } from "@/lib/gmail/archiveProject";

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

    const { data: requests } = await adminDb
      .from("gmail_archive_requests")
      .select("id, project_id, company_id, status")
      .in("id", requestIds).eq("company_id", companyId);

    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const reqRow of (requests || [])) {
      if (reqRow.status !== "pending") {
        results.push({ id: reqRow.id, ok: false, error: `Already ${reqRow.status}` });
        continue;
      }

      const outcome = await enqueueProjectArchive(adminDb, reqRow.company_id, reqRow.project_id);
      if (outcome.ok) {
        await adminDb.from("gmail_archive_requests").update({
          status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString(), error: null,
        }).eq("id", reqRow.id);
        results.push({ id: reqRow.id, ok: true });
      } else {
        await adminDb.from("gmail_archive_requests").update({
          error: outcome.error,
        }).eq("id", reqRow.id); // stays pending — admin can retry once the underlying issue is fixed
        results.push({ id: reqRow.id, ok: false, error: outcome.error });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    console.error("[archive-requests/approve] Unhandled error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
