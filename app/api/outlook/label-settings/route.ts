// app/api/outlook/label-settings/route.ts
// Reads/writes companies.outlook_parent_folder/outlook_archive_folder/
// outlook_label_tokens/outlook_sublabel_separator — the Outlook analog of
// the gmail-addon edge function's /label-settings endpoint.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prof } = await supabase
    .from("profiles").select("active_company_id").eq("id", user.id).single();
  const companyId = prof?.active_company_id;
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

  const { data: company } = await supabase
    .from("companies")
    .select("outlook_parent_folder, outlook_archive_folder, outlook_label_tokens, outlook_sublabel_separator")
    .eq("id", companyId).single();

  const { data: membership } = await supabase
    .from("company_memberships").select("role")
    .eq("user_id", user.id).eq("company_id", companyId).single();

  return NextResponse.json({
    parentFolder: company?.outlook_parent_folder || "Shared Emails",
    archiveFolder: company?.outlook_archive_folder || "",
    tokens: company?.outlook_label_tokens?.length ? company.outlook_label_tokens : ["project_name"],
    separator: company?.outlook_sublabel_separator || " — ",
    isAdmin: membership?.role === "company_admin",
  });
}

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { parentFolder, archiveFolder, tokens, separator } = body;

  const { error } = await supabase.from("companies").update({
    outlook_parent_folder: parentFolder || null,
    outlook_archive_folder: archiveFolder || null,
    outlook_label_tokens: tokens?.length ? tokens : ["project_name"],
    outlook_sublabel_separator: separator || " — ",
  }).eq("id", companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
