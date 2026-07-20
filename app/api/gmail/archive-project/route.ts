// app/api/gmail/archive-project/route.ts
// Admin-only manual trigger: archives a project's shared emails to the
// company's nominated archive Gmail account(s), then (once delivery is
// verified by gmail-archive-worker) deletes them from everyone else.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { enqueueProjectArchive } from "@/lib/gmail/archiveProject";

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { project_id: projectId } = body;
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

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

    const result = await enqueueProjectArchive(adminDb, companyId, projectId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({ ok: true, totalUsers: result.totalUsers });
  } catch (err: any) {
    console.error("[archive-project] Unhandled error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
