// app/api/finance-model/attachments/route.ts
// List/delete for Finance Model attachments (see supabase/migrations/
// 20260801250000_niksen_finance_model_attachments.sql). Upload is a
// separate multipart route (attachments/upload/route.ts, mirroring
// document-templates/upload/route.ts); download is attachments/[id]/route.ts
// (short-lived signed URL, same pattern as pdf-editor/[id]/route.ts).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const attachableTable = req.nextUrl.searchParams.get("attachableTable");
  const attachableId = req.nextUrl.searchParams.get("attachableId");

  let query = admin
    .from("finance_model_attachments")
    .select("id, name, storage_path, file_size, content_type, attachable_table, attachable_id, created_at, created_by")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (attachableTable && attachableId) {
    query = query.eq("attachable_table", attachableTable).eq("attachable_id", attachableId);
  } else if (req.nextUrl.searchParams.get("generalOnly") === "true") {
    query = query.is("attachable_table", null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ attachments: data || [] });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await admin.from("finance_model_attachments").select("storage_path").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  await admin.storage.from("finance-model-attachments").remove([existing.storage_path]);
  const { error } = await admin.from("finance_model_attachments").delete().eq("id", id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
