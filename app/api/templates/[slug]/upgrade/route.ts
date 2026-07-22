// app/api/templates/[slug]/upgrade/route.ts
// Body: same shape as install/route.ts's { resolutions }. For a company that
// already installed this template, picks up anything added to the template's
// catalog since (new tables, new fields on already-installed tables, new
// dashboards) -- see supabase/template_marketplace_upgrade.sql. Calls the RPC
// through the user's own session so upgrade_company_template's internal
// auth.uid() membership check resolves correctly, same as install/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { slug } = await params;

  const { data: template } = await admin
    .from("template_definitions").select("id, is_published, owner_company_id").eq("slug", slug).maybeSingle();
  if (!template || (!template.is_published && template.owner_company_id !== companyId)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const resolutions = body.resolutions || {};

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upgrade_company_template", {
    p_company_id: companyId,
    p_template_id: template.id,
    p_resolutions: resolutions,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
