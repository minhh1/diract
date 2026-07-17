// app/api/pdf-editor/upload/route.ts
// Auth required. Accepts a PDF upload + name, stores it in the private
// `pdf-documents` bucket at {companyId}/{uuid}.pdf, and creates a pdf_documents row.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  const name = String(form.get("name") || "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "A .pdf file is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "Could not read this file as a PDF" }, { status: 400 });
  }

  const documentId = randomUUID();
  const storagePath = `${companyId}/${documentId}.pdf`;
  const { error: uploadErr } = await admin.storage.from("pdf-documents").upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data: doc, error: insertErr } = await admin.from("pdf_documents").insert({
    id: documentId,
    company_id: companyId,
    name,
    storage_path: storagePath,
    created_by: user.id,
  }).select("id, name, created_at, updated_at").single();

  if (insertErr || !doc) {
    await admin.storage.from("pdf-documents").remove([storagePath]);
    return NextResponse.json({ error: insertErr?.message || "Failed to save document" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: doc });
}
