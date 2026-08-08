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
import { installTemplateForCompany } from "@/lib/templates/installTemplateForCompany";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const supabase = await createSupabaseServerClient();

  const result = await installTemplateForCompany({
    supabase, admin, companyId, userId: user.id, slug,
    resolutions: body.resolutions || {},
    installDashboards: body.installDashboards === true,
    installExtras: body.installExtras || {},
  });

  if (result.error) {
    const status = result.error === "Template not found" ? 404 : result.error.includes("limit") ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ...result.data, precedents: result.precedents });
}
