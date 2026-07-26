// app/api/precedents/settings/route.ts
// Formatting defaults for issued precedent documents (subject-line style,
// date format, salutation style, up to 4 signers) — see
// supabase/migrations/..._precedent_settings.sql. Answered once: a
// project_id-less row is the company-wide default (edited from the admin
// "Precedents" tab), an optional project_id-scoped row overrides it for one
// matter (edited from the "Customize for this matter" gear on the Precedent
// record tab). GET returns both so either UI can show "using firm default"
// vs an actual override; the issue pipeline itself resolves project row ??
// company row ?? these same hard-coded fallbacks inline.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

const SUBJECT_STYLES = ["all_caps", "sentence_case", "with_re"];
const SALUTATION_STYLES = ["generic", "client_first_name", "client_full_name"];
const SETTINGS_COLUMNS = "id, project_id, subject_line_style, date_format, salutation_style, signers, include_firm_reference, updated_at";

function validSigners(input: any): { name: string; position: string }[] | null {
  if (!Array.isArray(input) || input.length > 4) return null;
  const out: { name: string; position: string }[] = [];
  for (const s of input) {
    const name = String(s?.name || "").trim();
    if (!name) continue;
    out.push({ name, position: String(s?.position || "").trim() });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const projectId = req.nextUrl.searchParams.get("projectId");

  const { data: companyDefault } = await admin
    .from("precedent_settings").select(SETTINGS_COLUMNS).eq("company_id", companyId).is("project_id", null).maybeSingle();

  let projectOverride: any = null;
  if (projectId) {
    const { data: project } = await admin.from("projects").select("id, company_id").eq("id", projectId).maybeSingle();
    if (!project || project.company_id !== companyId) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    const { data } = await admin
      .from("precedent_settings").select(SETTINGS_COLUMNS).eq("company_id", companyId).eq("project_id", projectId).maybeSingle();
    projectOverride = data || null;
  }

  return NextResponse.json({ companyDefault: companyDefault || null, projectOverride });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const projectId: string | null = body?.projectId ? String(body.projectId) : null;
  // Company-wide defaults are an admin-only setting; a matter-level override
  // is something anyone with access to that matter can set for themselves.
  if (!projectId && !isAdmin) {
    return NextResponse.json({ error: "Only a company admin can change the firm-wide defaults" }, { status: 403 });
  }
  if (projectId) {
    const { data: project } = await admin.from("projects").select("id, company_id").eq("id", projectId).maybeSingle();
    if (!project || project.company_id !== companyId) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }

  if (body?.clearOverride) {
    if (!projectId) return NextResponse.json({ error: "clearOverride requires a projectId" }, { status: 400 });
    await admin.from("precedent_settings").delete().eq("company_id", companyId).eq("project_id", projectId);
    return NextResponse.json({ ok: true });
  }

  if (body?.subjectLineStyle && !SUBJECT_STYLES.includes(body.subjectLineStyle)) {
    return NextResponse.json({ error: "Invalid subjectLineStyle" }, { status: 400 });
  }
  if (body?.salutationStyle && !SALUTATION_STYLES.includes(body.salutationStyle)) {
    return NextResponse.json({ error: "Invalid salutationStyle" }, { status: 400 });
  }
  const signers = "signers" in body ? validSigners(body.signers) : undefined;
  if (signers === null) return NextResponse.json({ error: "signers must be an array of at most 4 {name, position}" }, { status: 400 });

  const update: Record<string, any> = { company_id: companyId, project_id: projectId, updated_at: new Date().toISOString() };
  if (body?.subjectLineStyle) update.subject_line_style = body.subjectLineStyle;
  if (body?.dateFormat) update.date_format = String(body.dateFormat);
  if (body?.salutationStyle) update.salutation_style = body.salutationStyle;
  if (signers !== undefined) update.signers = signers;
  if ("includeFirmReference" in body) update.include_firm_reference = !!body.includeFirmReference;

  const { data, error } = await admin
    .from("precedent_settings")
    .upsert(update, { onConflict: projectId ? "company_id,project_id" : "company_id" })
    .select(SETTINGS_COLUMNS)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Failed to save settings" }, { status: 500 });
  return NextResponse.json({ ok: true, settings: data });
}
