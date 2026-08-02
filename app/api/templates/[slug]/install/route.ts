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
import { installPrecedentLibrary } from "@/lib/precedents/installLibrary";

// Templates that ship the seeded Australian precedent library alongside
// their tables and dashboards (see lib/precedents/library/). Slug-keyed
// rather than a flag on template_definitions because the library is authored
// in TypeScript, not stored as template rows -- there is nothing in the
// template record itself to hang it off.
const TEMPLATES_WITH_PRECEDENT_LIBRARY = new Set(["law-firm"]);

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
    p_install_dashboards: body.installDashboards === true,
  });

  if (error) {
    const status = error.message.includes("limit") ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  // Seed the precedent library for templates that ship one. Runs after the
  // RPC so the matter_type custom field exists and fill-in fields can bind
  // to it. Deliberately non-fatal: the template itself installed fine, and
  // failing the whole install over the precedent library would be a worse
  // outcome than a firm having to top it up from Settings afterwards.
  let precedents;
  if (TEMPLATES_WITH_PRECEDENT_LIBRARY.has(slug)) {
    const { result, error: precedentError } = await installPrecedentLibrary(admin, companyId, auth.user.id);
    if (precedentError) console.error("[template-install] precedent library failed:", precedentError);
    else precedents = result;
  }

  return NextResponse.json({ ...data, precedents });
}
