// app/api/gmail/create-project-label/route.ts
// Called right after a project is created from the dashboard (NewProjectModal)
// so it gets a shared Gmail label the same way projects created via the
// Gmail Add-on do -- that flow was previously the only path that ever wrote a
// project_gmail_labels row, so dashboard-created projects never synced to
// Gmail at all. Only writes metadata here; the actual per-mailbox Gmail
// label creation happens in gmail-label-sync-processor once the job below
// is picked up, same as every other label-creation path in this app.
// Core DB logic lives in lib/gmail/createProjectLabel.ts, shared with
// lib/ai/actions.ts's createProject (Teams/WhatsApp bot path).
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { createProjectGmailLabel } from "@/lib/gmail/createProjectLabel";

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { projectId } = body;
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prof } = await supabase.from("profiles").select("active_company_id").eq("id", user.id).single();
  const companyId = prof?.active_company_id;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  const adminDb = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const result = await createProjectGmailLabel(adminDb, companyId, projectId, user.id);
  if (!result.ok) {
    console.error("[create-project-label] failed:", result.error);
    return NextResponse.json({ error: result.error }, { status: result.error === "Project not found" ? 404 : 500 });
  }
  return NextResponse.json(result);
}
