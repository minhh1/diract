// app/api/finance-model/attachments/upload/route.ts
// Multipart upload into the private finance-model-attachments bucket,
// same shape as app/api/document-templates/upload/route.ts: verify the
// project belongs to the caller's company, upload to storage, insert the
// tracking row, roll back the storage object if the DB insert fails.
// attachableTable/attachableId are optional -- omitted (or both blank)
// means a general project-level attachment; ('budget_line'|'task', id)
// scopes it to that record.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { randomUUID } from "crypto";

const ATTACHABLE_TABLES = ["budget_line", "task"];

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  const projectId = String(form.get("projectId") || "");
  const attachableTable = form.get("attachableTable") ? String(form.get("attachableTable")) : null;
  const attachableId = form.get("attachableId") ? String(form.get("attachableId")) : null;

  if (!(file instanceof File)) return NextResponse.json({ error: "A file is required" }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (attachableTable && !ATTACHABLE_TABLES.includes(attachableTable)) {
    return NextResponse.json({ error: `attachableTable must be one of: ${ATTACHABLE_TABLES.join(", ")}` }, { status: 400 });
  }
  if (attachableTable && !attachableId) {
    return NextResponse.json({ error: "attachableId is required when attachableTable is set" }, { status: 400 });
  }

  const { data: project } = await admin.from("projects").select("id, company_id").eq("id", projectId).maybeSingle();
  if (!project || project.company_id !== companyId) {
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const storagePath = `${companyId}/${projectId}/${randomUUID()}${ext}`;

  const { error: uploadErr } = await admin.storage.from("finance-model-attachments").upload(storagePath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data: attachment, error: insertErr } = await admin.from("finance_model_attachments").insert({
    company_id: companyId,
    project_id: projectId,
    attachable_table: attachableTable,
    attachable_id: attachableId,
    name: file.name,
    storage_path: storagePath,
    file_size: bytes.length,
    content_type: file.type || null,
    created_by: user.id,
  }).select("id, name, storage_path, file_size, content_type, attachable_table, attachable_id, created_at").single();

  if (insertErr || !attachment) {
    await admin.storage.from("finance-model-attachments").remove([storagePath]);
    return NextResponse.json({ error: insertErr?.message || "Failed to save attachment" }, { status: 500 });
  }

  return NextResponse.json({ attachment });
}
