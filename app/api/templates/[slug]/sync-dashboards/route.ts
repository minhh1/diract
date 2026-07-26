// Owner-only: push the owner company's LIVE dashboard configurations into
// the template catalog (fields, widget positions, empty rows, conditions,
// column widths/highlights) so installs reproduce the curated setup. Runs
// through the user's own session so sync_template_dashboards_from_company's
// internal auth.uid() membership check applies -- see
// supabase/template_dashboards_owner_sync.sql.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { slug } = await params;

  const { data: template } = await admin
    .from("template_definitions").select("id, owner_company_id").eq("slug", slug).maybeSingle();
  if (!template || template.owner_company_id !== companyId) {
    return NextResponse.json({ error: "Only the template's owner company can sync its dashboards" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("sync_template_dashboards_from_company", {
    p_template_id: template.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
