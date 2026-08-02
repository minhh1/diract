// app/api/precedents/execution-template/route.ts
// The firm's execution page: how each kind of party signs.
//
// An override, not a requirement. Without one, generation uses the built-in
// scheme in lib/precedents/executionClauses.ts, so a firm that has never
// thought about this still gets correct signing blocks.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import PizZip from "pizzip";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { convertDocToDocx } from "@/lib/gotenberg";
import { splitExecutionBlocks, executionBlockKey } from "@/lib/precedents/executionClauses";

const BUCKET = "precedent-documents";
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Paragraph text, in order, from a .docx. */
function docxLines(bytes: Buffer): string[] {
  const xml = new PizZip(bytes).file("word/document.xml")?.asText() ?? "";
  return xml
    .split(/<\/w:p>/)
    .map(p => p.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
}

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { data } = await admin
    .from("company_execution_templates")
    .select("id, original_filename, blocks, updated_at")
    .eq("company_id", companyId).maybeSingle();
  return NextResponse.json({ executionTemplate: data || null });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) {
    return NextResponse.json({ error: "Only a company admin can change the execution template" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
  }

  let bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 8).equals(OLE2)) {
    try { bytes = Buffer.from(await convertDocToDocx(bytes, file.name)); }
    catch (e) {
      const m = e instanceof Error ? e.message : "conversion failed";
      return NextResponse.json({ error: `That older .doc file could not be converted: ${m}` }, { status: 400 });
    }
  }
  if (!bytes.subarray(0, 4).equals(ZIP)) {
    return NextResponse.json({ error: "That file is not a Word document" }, { status: 400 });
  }

  // Recognise what's in the file. A block we can't place is reported rather
  // than guessed at -- putting the wrong statutory words under a party's name
  // is worse than falling back to the built-in block.
  const blocks: Record<string, string[]> = {};
  let unrecognised = 0;
  for (const block of splitExecutionBlocks(docxLines(bytes))) {
    const key = executionBlockKey(block.join(" "));
    if (key) blocks[key] = block; else unrecognised++;
  }
  if (!Object.keys(blocks).length) {
    return NextResponse.json(
      { error: "No signing blocks were recognised. Each block should start \"Executed by\" or \"Signed, sealed and delivered by\"." },
      { status: 400 }
    );
  }

  const storagePath = `execution-templates/${companyId}/${randomUUID()}.docx`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: `Could not store the template: ${upErr.message}` }, { status: 500 });

  const { data: existing } = await admin
    .from("company_execution_templates").select("storage_path").eq("company_id", companyId).maybeSingle();

  const { data, error } = await admin
    .from("company_execution_templates")
    .upsert({
      company_id: companyId,
      storage_path: storagePath,
      original_filename: file.name,
      blocks,
      uploaded_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" })
    .select("id, original_filename, blocks, updated_at")
    .single();

  if (error || !data) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: error?.message || "Could not save the template" }, { status: 500 });
  }
  if (existing?.storage_path && existing.storage_path !== storagePath) {
    await admin.storage.from(BUCKET).remove([existing.storage_path]);
  }

  return NextResponse.json({ ok: true, executionTemplate: data, unrecognised });
}

export async function DELETE() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) {
    return NextResponse.json({ error: "Only a company admin can remove the execution template" }, { status: 403 });
  }
  const { data: existing } = await admin
    .from("company_execution_templates").select("storage_path").eq("company_id", companyId).maybeSingle();
  if (existing?.storage_path) await admin.storage.from(BUCKET).remove([existing.storage_path]);
  await admin.from("company_execution_templates").delete().eq("company_id", companyId);
  return NextResponse.json({ ok: true });
}
