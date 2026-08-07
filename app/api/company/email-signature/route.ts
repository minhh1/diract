// app/api/company/email-signature/route.ts
// GET: any company member reads the firm's signature branding (merged with
// companies.logo_url/name fallbacks, same resolution getUserSignatureHtml
// uses, so the Settings form shows exactly what a rendered signature would
// actually use). PUT: company-admin-only, upserts
// company_email_signature_settings -- branding is a firm-wide standard, not
// something any individual member should be able to change.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { SIGNATURE_TEMPLATES, EMAIL_SAFE_FONTS } from "@/lib/signature/renderSignatureHtml";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const [{ data: company }, { data: settings }] = await Promise.all([
    admin.from("companies").select("name, logo_url").eq("id", companyId).maybeSingle(),
    admin.from("company_email_signature_settings").select("*").eq("company_id", companyId).maybeSingle(),
  ]);

  return NextResponse.json({
    settings: settings || null,
    // The Settings form shows these as placeholder/fallback text when the
    // firm hasn't overridden them for the signature specifically.
    companyDefaults: { name: company?.name || null, logoUrl: company?.logo_url || null },
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can change the firm's email signature branding" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const templateId = (SIGNATURE_TEMPLATES as readonly string[]).includes(body?.templateId) ? body.templateId : "logo_left";
  const fontFamily = (EMAIL_SAFE_FONTS as readonly string[]).includes(body?.fontFamily) ? body.fontFamily : "Arial";
  const baseFontSize = Number.isFinite(body?.baseFontSize) ? Math.max(9, Math.min(20, Math.round(body.baseFontSize))) : 12;
  const links = Array.isArray(body?.links)
    ? body.links
      .map((l: any) => ({ label: String(l?.label || "").trim(), url: String(l?.url || "").trim() }))
      .filter((l: any) => l.label && l.url)
      .slice(0, 6)
    : null;

  const { data, error } = await admin
    .from("company_email_signature_settings")
    .upsert({
      company_id: companyId,
      template_id: templateId,
      logo_url: body?.logoUrl ? String(body.logoUrl).trim() : null,
      brand_color: body?.brandColor ? String(body.brandColor).trim() : null,
      font_family: fontFamily,
      base_font_size: baseFontSize,
      company_name: body?.companyName ? String(body.companyName).trim() : null,
      company_address: body?.companyAddress ? String(body.companyAddress).trim() : null,
      company_phone: body?.companyPhone ? String(body.companyPhone).trim() : null,
      company_website: body?.companyWebsite ? String(body.companyWebsite).trim() : null,
      links,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" })
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Failed to save" }, { status: 500 });
  return NextResponse.json({ ok: true, settings: data });
}
