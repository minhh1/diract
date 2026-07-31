// app/api/finance-model/attachments/[id]/route.ts
// GET returns a short-lived signed URL for a private attachment -- same
// pattern as app/api/pdf-editor/[id]/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: attachment } = await admin.from("finance_model_attachments").select("id, name, storage_path").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const { data: signed, error } = await admin.storage.from("finance-model-attachments").createSignedUrl(attachment.storage_path, 60);
  if (error || !signed) return NextResponse.json({ error: error?.message || "Could not sign URL" }, { status: 500 });

  return NextResponse.json({ name: attachment.name, url: signed.signedUrl });
}
