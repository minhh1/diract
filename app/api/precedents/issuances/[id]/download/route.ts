// app/api/precedents/issuances/[id]/download/route.ts
// Streams a previously-issued precedent back on demand -- the private bucket
// means there's no durable public URL, and a signed URL created at issuance
// time would eventually expire, so history downloads go through this route
// instead of a stored link (see precedent_issuances.sql). ?format=docx serves
// the editable Word version the PDF was rendered from, for anything that
// needs a last edit before it goes out.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

const BUCKET = "precedent-documents";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: issuanceId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: issuance } = await admin
    .from("precedent_issuances").select("company_id, storage_path, docx_storage_path, subject_line").eq("id", issuanceId).maybeSingle();
  if (!issuance || issuance.company_id !== companyId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Issued before the .docx was kept alongside the PDF (or its upload
  // failed) -- say so rather than silently handing back a PDF named .docx.
  const wantsDocx = req.nextUrl.searchParams.get("format") === "docx";
  if (wantsDocx && !issuance.docx_storage_path) {
    return NextResponse.json({ error: "No Word version was kept for this document" }, { status: 404 });
  }

  const { data: fileData, error: dlErr } = await admin.storage
    .from(BUCKET)
    .download(wantsDocx ? issuance.docx_storage_path : issuance.storage_path);
  if (dlErr || !fileData) return NextResponse.json({ error: "Could not load the document" }, { status: 500 });

  const filename = (issuance.subject_line || "document").replace(/[^\w\-. ]+/g, "_").trim() || "document";
  return new NextResponse(new Uint8Array(await fileData.arrayBuffer()), {
    headers: wantsDocx
      ? { "Content-Type": DOCX_MIME, "Content-Disposition": `attachment; filename="${filename}.docx"` }
      : { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}.pdf"` },
  });
}
