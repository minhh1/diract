// app/api/precedents/[id]/body-template/examples/route.ts
// Admin-only: upload one or more real past documents as examples of a
// precedent's body content. Mirrors app/api/precedents/letterhead/route.ts's
// upload validation (.docx/.doc accept, legacy .doc -> .docx via Gotenberg,
// magic-byte checks), but here each file is just stored (not tagged) --
// lib/precedents/redetectBodyTemplate.ts re-runs detection over every
// stored example (this upload's files plus any already there) right after.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { convertDocToDocx } from "@/lib/gotenberg";
import { redetectBodyTemplate } from "@/lib/precedents/redetectBodyTemplate";
import { randomUUID } from "crypto";

const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const BUCKET = "precedent-documents";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: precedentId } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can upload example documents" }, { status: 403 });

  const { data: precedent } = await admin
    .from("precedents").select("id, company_id").eq("id", precedentId).is("deleted_at", null).maybeSingle();
  if (!precedent || precedent.company_id !== companyId) return NextResponse.json({ error: "Precedent not found" }, { status: 404 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "At least one .docx or .doc file is required" }, { status: 400 });

  const uploadedPaths: string[] = [];
  try {
    for (const file of files) {
      let bytes = Buffer.from(await file.arrayBuffer());

      if (bytes.subarray(0, 8).equals(OLE2_SIGNATURE)) {
        try {
          bytes = Buffer.from(await convertDocToDocx(bytes, file.name));
        } catch (e: any) {
          return NextResponse.json({ error: `Failed to convert "${file.name}": ${e?.message || "conversion error"}` }, { status: 502 });
        }
      }
      if (bytes.subarray(0, 2).toString("latin1") !== "PK") {
        return NextResponse.json({ error: `Could not read "${file.name}" as a .docx` }, { status: 400 });
      }

      const storagePath = `examples/${companyId}/${precedentId}/${randomUUID()}.docx`;
      const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });
      if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
      uploadedPaths.push(storagePath);

      const { error: insertErr } = await admin.from("precedent_body_examples").insert({
        precedent_id: precedentId, company_id: companyId, storage_path: storagePath,
        original_filename: file.name, created_by: user.id,
      });
      if (insertErr) {
        await admin.storage.from(BUCKET).remove([storagePath]);
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }
  } catch (e: any) {
    await admin.storage.from(BUCKET).remove(uploadedPaths);
    return NextResponse.json({ error: e?.message || "Failed to process the uploaded files" }, { status: 500 });
  }

  let template;
  try {
    template = await redetectBodyTemplate(admin, precedentId, companyId, user.id);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to detect a template from these examples" }, { status: 502 });
  }

  const { data: examples } = await admin
    .from("precedent_body_examples")
    .select("id, original_filename, created_at")
    .eq("precedent_id", precedentId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ok: true, examples: examples || [], template });
}
