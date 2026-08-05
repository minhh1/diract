// app/api/precedents/letterhead/preview/route.ts
// Renders the company's currently-saved letterhead (with its auto-inserted
// {{address}}/{{content}} tags still literally visible as text) to PDF, so an
// admin can visually confirm the tags landed in the right spot -- below any
// logo/header art, above the footer -- before relying on it for real
// issuances. Streamed back directly rather than stored, since it's a
// throwaway render of the source file, not a generated document.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { convertDocxToPdf } from "@/lib/gotenberg";

const BUCKET = "precedent-documents";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: letterhead } = await admin
    .from("company_letterheads").select("storage_path").eq("company_id", companyId).maybeSingle();
  if (!letterhead) return NextResponse.json({ error: "No letterhead uploaded yet" }, { status: 404 });

  const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(letterhead.storage_path);
  if (dlErr || !fileData) return NextResponse.json({ error: "Could not load the letterhead file" }, { status: 500 });

  let pdfBytes: Buffer;
  try {
    pdfBytes = await convertDocxToPdf(Buffer.from(await fileData.arrayBuffer()), "letterhead.docx");
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to render preview" }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=letterhead-preview.pdf" },
  });
}
