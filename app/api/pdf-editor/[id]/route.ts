// app/api/pdf-editor/[id]/route.ts
// Auth required. `id` is the pdf_documents id.
// GET returns a short-lived signed URL so the client can load the PDF into pdf.js.
// PUT overwrites the stored PDF with the flattened bytes produced client-side by
// lib/pdfeditor/applyEdits.ts (body is the raw PDF, content-type application/pdf).
// DELETE removes the storage object + row.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

async function loadDoc(admin: any, companyId: string, documentId: string) {
  const { data: doc } = await admin
    .from("pdf_documents").select("id, company_id, name, storage_path").eq("id", documentId).maybeSingle();
  if (!doc || doc.company_id !== companyId) return null;
  return doc;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const doc = await loadDoc(admin, companyId, documentId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data: signed, error } = await admin.storage
    .from("pdf-documents")
    .createSignedUrl(doc.storage_path, 60);
  if (error || !signed) return NextResponse.json({ error: error?.message || "Could not sign URL" }, { status: 500 });

  return NextResponse.json({ document: { id: doc.id, name: doc.name }, url: signed.signedUrl });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const doc = await loadDoc(admin, companyId, documentId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "Not a valid PDF" }, { status: 400 });
  }

  const { error: uploadErr } = await admin.storage.from("pdf-documents").upload(doc.storage_path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadErr) return NextResponse.json({ error: `Save failed: ${uploadErr.message}` }, { status: 500 });

  const { error: updateErr } = await admin
    .from("pdf_documents").update({ updated_at: new Date().toISOString() }).eq("id", documentId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const doc = await loadDoc(admin, companyId, documentId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await admin.storage.from("pdf-documents").remove([doc.storage_path]);

  const { error } = await admin.from("pdf_documents").delete().eq("id", documentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
