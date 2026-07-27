// lib/ai/botFiles.ts
// Storage-backed fallback for the bot's create_file/update_file actions
// (lib/ai/actions.ts's createOnedriveFile/updateOnedriveFile) when the
// company has no OneDrive connection -- previously create_file just failed
// outright with "OneDrive isn't connected", making the whole feature
// unusable without it. Mirrors lib/precedents/issuePrecedent.ts's shape:
// write into the existing private `precedent-documents` bucket (no new
// bucket to set up) under its own `bot-files/` prefix, track the row in
// bot_created_files, hand back a signed link.
import { randomUUID } from "crypto";

const BUCKET = "precedent-documents";
const SIGNED_URL_TTL = 3600;

export interface CreateBotFileParams {
  companyId: string;
  userId: string;
  name: string;
  projectId: string | null;
  content: string;
}

function withExtension(name: string): string {
  return /\.[a-z0-9]+$/i.test(name) ? name : `${name}.txt`;
}

export async function createBotFile(admin: any, params: CreateBotFileParams): Promise<{ name: string; webUrl: string }> {
  const fileName = withExtension(params.name);
  const storagePath = `bot-files/${params.companyId}/${randomUUID()}-${fileName}`;

  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, Buffer.from(params.content, "utf-8"), {
    contentType: "text/plain", upsert: false,
  });
  if (upErr) throw new Error(`Failed to store file: ${upErr.message}`);

  const { error: insertErr } = await admin.from("bot_created_files").insert({
    company_id: params.companyId, project_id: params.projectId, name: fileName, storage_path: storagePath, created_by: params.userId,
  });
  if (insertErr) throw new Error(`Failed to record file: ${insertErr.message}`);

  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (signErr || !signed) throw new Error(`Failed to create a link for the file: ${signErr?.message || "unknown error"}`);

  return { name: fileName, webUrl: signed.signedUrl };
}

export async function updateBotFile(admin: any, fileId: string, content: string): Promise<{ webUrl: string }> {
  const { data: file } = await admin.from("bot_created_files").select("storage_path").eq("id", fileId).maybeSingle();
  if (!file) throw new Error("That file no longer exists.");

  const { error: upErr } = await admin.storage.from(BUCKET).upload(file.storage_path, Buffer.from(content, "utf-8"), {
    contentType: "text/plain", upsert: true,
  });
  if (upErr) throw new Error(`Failed to update the stored file: ${upErr.message}`);
  await admin.from("bot_created_files").update({ updated_at: new Date().toISOString() }).eq("id", fileId);

  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(file.storage_path, SIGNED_URL_TTL);
  if (signErr || !signed) throw new Error(`Failed to create a link for the file: ${signErr?.message || "unknown error"}`);

  return { webUrl: signed.signedUrl };
}
