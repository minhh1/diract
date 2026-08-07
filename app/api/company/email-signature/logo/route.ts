// app/api/company/email-signature/logo/route.ts
// Company-admin-only logo upload/removal for the signature specifically --
// close mirror of app/api/company/logo/route.ts's pattern (same
// company-logos bucket, same validation), but writes to
// company_email_signature_settings.logo_url rather than companies.logo_url,
// since a firm may want a different crop/version for signatures than their
// main invoice/dashboard logo. Leaving this null falls back to the
// company's main logo (see lib/signature/getUserSignatureHtml.ts).
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

async function requireCompanyAdmin() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return { error: auth.error } as const;
  if (!auth.isAdmin) {
    return { error: NextResponse.json({ error: "Only a company admin can change the signature logo" }, { status: 403 }) } as const;
  }
  return { admin: auth.admin, companyId: auth.companyId } as const;
}

function extractStoragePath(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  const marker = "/company-logos/";
  const idx = logoUrl.indexOf(marker);
  return idx === -1 ? null : logoUrl.slice(idx + marker.length);
}

export async function POST(req: NextRequest) {
  const ctx = await requireCompanyAdmin();
  if ("error" in ctx) return ctx.error;
  const { admin, companyId } = ctx;

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "A logo file is required" }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Logo must be a PNG, JPEG, WEBP, or SVG" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Logo must be under 5MB" }, { status: 400 });

  const { data: existing } = await admin
    .from("company_email_signature_settings").select("logo_url").eq("company_id", companyId).maybeSingle();

  const bytes = Buffer.from(await file.arrayBuffer());
  const storagePath = `${companyId}/signature-${randomUUID()}.${ext}`;

  const { error: uploadErr } = await admin.storage.from("company-logos").upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data: pub } = admin.storage.from("company-logos").getPublicUrl(storagePath);

  const { error: updateErr } = await admin
    .from("company_email_signature_settings")
    .upsert({ company_id: companyId, logo_url: pub.publicUrl, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
  if (updateErr) {
    await admin.storage.from("company-logos").remove([storagePath]);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const previousPath = extractStoragePath(existing?.logo_url);
  if (previousPath) await admin.storage.from("company-logos").remove([previousPath]);

  return NextResponse.json({ ok: true, logo_url: pub.publicUrl });
}

export async function DELETE() {
  const ctx = await requireCompanyAdmin();
  if ("error" in ctx) return ctx.error;
  const { admin, companyId } = ctx;

  const { data: existing } = await admin
    .from("company_email_signature_settings").select("logo_url").eq("company_id", companyId).maybeSingle();

  const { error: updateErr } = await admin
    .from("company_email_signature_settings")
    .upsert({ company_id: companyId, logo_url: null, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const previousPath = extractStoragePath(existing?.logo_url);
  if (previousPath) await admin.storage.from("company-logos").remove([previousPath]);

  return NextResponse.json({ ok: true });
}
