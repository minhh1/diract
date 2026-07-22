// app/api/templates/[slug]/uninstall/route.ts
// Removes exactly what this company's install of the template created
// (nothing it mapped onto an existing table/field) -- see
// uninstall_company_template in supabase/template_marketplace.sql. Calls
// the RPC through the user's own session so its internal auth.uid()
// membership check resolves correctly.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { slug } = await params;

  const { data: template } = await admin
    .from("template_definitions").select("id").eq("slug", slug).maybeSingle();
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("uninstall_company_template", {
    p_company_id: companyId,
    p_template_id: template.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
