// app/api/precedents/issuances/[id]/download/route.ts
// Streams a previously-issued precedent PDF back on demand — the private
// bucket means there's no durable public URL, and a signed URL created at
// issuance time would eventually expire, so history downloads go through
// this route instead of a stored link (see precedent_issuances.sql).
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

const BUCKET = "precedent-documents";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: issuanceId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: issuance } = await admin
    .from("precedent_issuances").select("company_id, storage_path, subject_line").eq("id", issuanceId).maybeSingle();
  if (!issuance || issuance.company_id !== companyId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(issuance.storage_path);
  if (dlErr || !fileData) return NextResponse.json({ error: "Could not load the document" }, { status: 500 });

  const filename = (issuance.subject_line || "document").replace(/[^\w\-. ]+/g, "_").trim() || "document";
  return new NextResponse(new Uint8Array(await fileData.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}.pdf"` },
  });
}
