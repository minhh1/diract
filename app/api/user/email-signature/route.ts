// app/api/user/email-signature/route.ts
// GET: the caller's own personal signature fields, plus the fully rendered
// HTML (via getUserSignatureHtml -- same resolver the Gmail push and
// Outlook add-in endpoints use) for the Settings tab's live preview.
// PUT: the caller updates their own personal fields only -- branding stays
// admin-only via app/api/company/email-signature/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getUserSignatureHtml } from "@/lib/signature/getUserSignatureHtml";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user } = auth;

  const [{ data: settings }, resolved] = await Promise.all([
    admin.from("user_email_signature_settings").select("*").eq("user_id", user.id).maybeSingle(),
    getUserSignatureHtml(admin, user.id),
  ]);

  return NextResponse.json({ settings: settings || null, preview: resolved });
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("user_email_signature_settings")
    .upsert({
      user_id: user.id,
      company_id: companyId,
      display_name: body?.displayName ? String(body.displayName).trim() : null,
      job_title: body?.jobTitle ? String(body.jobTitle).trim() : null,
      direct_phone: body?.directPhone ? String(body.directPhone).trim() : null,
      mobile_phone: body?.mobilePhone ? String(body.mobilePhone).trim() : null,
      photo_url: body?.photoUrl ? String(body.photoUrl).trim() : null,
      enabled: body?.enabled !== false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Failed to save" }, { status: 500 });

  const resolved = await getUserSignatureHtml(admin, user.id);
  return NextResponse.json({ ok: true, settings: data, preview: resolved });
}
