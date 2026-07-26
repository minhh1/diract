// app/api/precedents/letterhead/route.ts
// Company-admin-only: upload/replace/clear the firm's letterhead (one row per
// company, company_letterheads). Mirrors app/api/document-templates/upload/route.ts's
// validation shape (.docx/.doc accept, legacy .doc -> .docx via Gotenberg,
// magic-byte checks) but is company-scoped, not project-scoped, and auto-inserts
// the {{address}}/{{content}}/{{signoff}} tags via lib/precedents/letterheadTag.ts
// instead of leaving the firm to author their own tags.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { convertDocToDocx } from "@/lib/gotenberg";
import { insertLetterTags } from "@/lib/precedents/letterheadTag";
import { randomUUID } from "crypto";

const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const BUCKET = "precedent-documents";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data } = await admin
    .from("company_letterheads")
    .select("id, original_filename, address_tag_key, content_tag_key, signoff_tag_key, created_at, updated_at")
    .eq("company_id", companyId)
    .maybeSingle();

  return NextResponse.json({ letterhead: data || null });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can change the letterhead" }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "A .docx or .doc file is required" }, { status: 400 });

  let bytes = Buffer.from(await file.arrayBuffer());

  if (bytes.subarray(0, 8).equals(OLE2_SIGNATURE)) {
    try {
      bytes = Buffer.from(await convertDocToDocx(bytes, file.name));
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Failed to convert this .doc file" }, { status: 502 });
    }
  }

  if (bytes.subarray(0, 2).toString("latin1") !== "PK") {
    return NextResponse.json({ error: "Could not read this file as a .docx" }, { status: 400 });
  }

  const addressTagKey = "address";
  const contentTagKey = "content";
  const signoffTagKey = "signoff";
  let tagged: Buffer;
  try {
    tagged = insertLetterTags(bytes, [addressTagKey, contentTagKey, signoffTagKey]);
  } catch {
    return NextResponse.json({ error: "Could not read this file as a .docx" }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("company_letterheads").select("id, storage_path").eq("company_id", companyId).maybeSingle();

  const storagePath = `letterheads/${companyId}/${randomUUID()}.docx`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, tagged, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data: letterhead, error: dbErr } = await admin.from("company_letterheads").upsert({
    id: existing?.id,
    company_id: companyId,
    storage_path: storagePath,
    original_filename: file.name,
    address_tag_key: addressTagKey,
    content_tag_key: contentTagKey,
    signoff_tag_key: signoffTagKey,
    uploaded_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id" }).select("id, original_filename, address_tag_key, content_tag_key, signoff_tag_key, created_at, updated_at").single();

  if (dbErr || !letterhead) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: dbErr?.message || "Failed to save letterhead" }, { status: 500 });
  }

  // Old file is orphaned in storage once the row points elsewhere — clean it
  // up now that the new one is safely committed.
  if (existing?.storage_path && existing.storage_path !== storagePath) {
    await admin.storage.from(BUCKET).remove([existing.storage_path]);
  }

  return NextResponse.json({ ok: true, letterhead });
}

export async function DELETE() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can change the letterhead" }, { status: 403 });

  const { data: existing } = await admin
    .from("company_letterheads").select("id, storage_path").eq("company_id", companyId).maybeSingle();
  if (!existing) return NextResponse.json({ ok: true });

  await admin.storage.from(BUCKET).remove([existing.storage_path]);
  await admin.from("company_letterheads").delete().eq("id", existing.id);
  return NextResponse.json({ ok: true });
}
