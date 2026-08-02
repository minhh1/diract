// app/api/precedents/deed-template/route.ts
// The firm's deed template: the .docx whose named Word styles supply the
// numbering and indentation for every generated deed.
//
// Parallel to ./letterhead, and deliberately separate from it. A letterhead
// carries branding and merge tags and is what a LETTER is composed into; a
// deed template carries styles and is what a DEED is generated into. A firm
// may have one without the other.
//
// Uploading checks the template for the styles a deed applies and, where they
// are missing, adds the default scheme rather than refusing the file -- see
// lib/precedents/deedTemplateStyles.ts for why.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { convertDocToDocx } from "@/lib/gotenberg";
import {
  checkDeedTemplate, applyDefaultDeedStyles, readDocxStyles,
} from "@/lib/precedents/deedTemplateStyles";

const BUCKET = "precedent-documents";
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data } = await admin
    .from("company_deed_templates")
    .select("id, original_filename, detected_styles, defaults_applied, created_at, updated_at")
    .eq("company_id", companyId)
    .maybeSingle();

  return NextResponse.json({ deedTemplate: data || null });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) {
    return NextResponse.json({ error: "Only a company admin can change the deed template" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
  }

  let bytes = Buffer.from(await file.arrayBuffer());

  // A firm's deed precedent is as likely to be a legacy .doc as the court
  // forms were, and the styles can't be read out of the binary format.
  if (bytes.subarray(0, 8).equals(OLE2_SIGNATURE)) {
    try {
      bytes = Buffer.from(await convertDocToDocx(bytes, file.name));
    } catch (e) {
      const message = e instanceof Error ? e.message : "conversion failed";
      return NextResponse.json(
        { error: `That looks like an older .doc file and it could not be converted: ${message}` },
        { status: 400 }
      );
    }
  }
  if (!bytes.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    return NextResponse.json({ error: "That file is not a Word document" }, { status: 400 });
  }

  // Check, then supply what's missing rather than turning the firm away.
  const check = checkDeedTemplate(bytes);
  const defaultsApplied = check.needsDefaults;
  if (defaultsApplied) bytes = Buffer.from(applyDefaultDeedStyles(bytes));

  const storagePath = `deed-templates/${companyId}/${randomUUID()}.docx`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (uploadErr) {
    return NextResponse.json({ error: `Could not store the template: ${uploadErr.message}` }, { status: 500 });
  }

  const { data: existing } = await admin
    .from("company_deed_templates").select("id, storage_path").eq("company_id", companyId).maybeSingle();

  const { data, error } = await admin
    .from("company_deed_templates")
    .upsert({
      company_id: companyId,
      storage_path: storagePath,
      original_filename: file.name,
      detected_styles: readDocxStyles(bytes),
      defaults_applied: defaultsApplied,
      uploaded_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" })
    .select("id, original_filename, detected_styles, defaults_applied, created_at, updated_at")
    .single();

  if (error || !data) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: error?.message || "Could not save the template" }, { status: 500 });
  }

  // The previous file is orphaned once the row points elsewhere.
  if (existing?.storage_path && existing.storage_path !== storagePath) {
    await admin.storage.from(BUCKET).remove([existing.storage_path]);
  }

  return NextResponse.json({
    ok: true,
    deedTemplate: data,
    defaultsApplied,
    // Reported so the screen can name what was added rather than saying
    // something vague about styles.
    stylesAdded: defaultsApplied ? check.missingRequired.map(s => s.name) : [],
  });
}

export async function DELETE() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) {
    return NextResponse.json({ error: "Only a company admin can remove the deed template" }, { status: 403 });
  }

  const { data: existing } = await admin
    .from("company_deed_templates").select("storage_path").eq("company_id", companyId).maybeSingle();
  if (existing?.storage_path) await admin.storage.from(BUCKET).remove([existing.storage_path]);
  await admin.from("company_deed_templates").delete().eq("company_id", companyId);

  return NextResponse.json({ ok: true });
}
