// app/api/templates/[slug]/trial/start/route.ts
// Creates a brand-new, isolated sandbox company for this user, installs the
// template into it with dashboards + sample data, and returns its id so the
// client can switch into it -- see create_trial_sandbox_company in
// supabase/migrations/20260730110000_template_trial_mode.sql. Calls the RPC
// through the user's own session so its internal auth.uid() check resolves,
// same pattern as install/route.ts.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { slug } = await params;

  const { data: template } = await admin
    .from("template_definitions").select("id, is_published, owner_company_id").eq("slug", slug).maybeSingle();
  if (!template || (!template.is_published && template.owner_company_id !== companyId)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_trial_sandbox_company", {
    p_template_id: template.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
