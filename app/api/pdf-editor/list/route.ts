// app/api/pdf-editor/list/route.ts
// Auth required. Lists the caller's company's PDF documents.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: documents, error } = await admin
    .from("pdf_documents")
    .select("id, name, created_at, updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ documents: documents || [] });
}
