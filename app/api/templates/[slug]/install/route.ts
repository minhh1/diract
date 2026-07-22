// app/api/templates/[slug]/install/route.ts
// Body: { resolutions: { tables: {[slug]: 'use_existing'|'create_new'},
//   systemFields: {['table:field_key']: 'use_existing'|'create_new'},
//   applyLabelOverrides?: boolean } }
// Calls the RPC through the user's own session (not the admin/service-role
// client) so install_company_template's internal auth.uid() membership
// check resolves correctly -- see supabase/template_marketplace.sql.
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
  const { data, error } = await supabase.rpc("install_company_template", {
    p_company_id: companyId,
    p_template_id: template.id,
    p_resolutions: resolutions,
  });

  if (error) {
    const status = error.message.includes("limit") ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}
