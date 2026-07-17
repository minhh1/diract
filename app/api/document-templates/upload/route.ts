// app/api/document-templates/upload/route.ts
// Admin-side (auth required). Accepts a .docx (or legacy .doc, auto-converted
// via Gotenberg — see lib/gotenberg.ts) upload + projectId + name, stores the
// real .docx in the private `document-templates` bucket, discovers distinct
// {{tag}} placeholders by unzipping word/document.xml with pizzip (NOT full
// docxtemplater rendering), and creates a document_templates row + one
// document_template_fields row per tag.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { convertDocToDocx } from "@/lib/gotenberg";
import PizZip from "pizzip";
import { randomUUID } from "crypto";

const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

// Word can split a {{tag}} across multiple <w:t> runs, so strip all XML tags from
// word/document.xml before scanning for placeholders — same approach docxtemplater
// itself uses to reassemble tags spanning runs.
//
// Tag content is whatever sits between the delimiters (matches docxtemplater's
// own lenient parsing) — not just \w+, since real-world tags are often
// human-readable phrases like "{{Lender Company Name}}" or
// "{{Chairperson Name (Director of the Lender Company)}}", not bare identifiers.
function extractTags(docXml: string): string[] {
  const textOnly = docXml.replace(/<[^>]+>/g, "");
  const found = new Set<string>();
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(textOnly)) !== null) {
    const tag = m[1].trim();
    if (tag) found.add(tag);
  }
  return [...found];
}

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
  const name = String(form.get("name") || "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "A .docx or .doc file is required" }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  // Project must belong to the caller's company.
  const { data: project } = await admin.from("projects").select("id, company_id").eq("id", projectId).maybeSingle();
  if (!project || project.company_id !== companyId) {
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }

  let bytes = Buffer.from(await file.arrayBuffer());

  // ── Legacy .doc (Word 97-2003, OLE2/CFBF container) → convert to real
  // .docx via Gotenberg before anything else. This also catches .doc files
  // that were merely renamed to .docx — real .docx is a ZIP archive (starts
  // with "PK"); PizZip would otherwise open OLE2 content "successfully" with
  // word/document.xml simply missing, silently producing zero detected tags.
  if (bytes.subarray(0, 8).equals(OLE2_SIGNATURE)) {
    try {
      bytes = Buffer.from(await convertDocToDocx(bytes, file.name));
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Failed to convert this .doc file" }, { status: 502 });
    }
  }

  if (bytes.subarray(0, 2).toString("latin1") !== "PK") {
    return NextResponse.json({ error: "Could not read this file as a .docx" }, { status: 400 });
  }

  // ── Discover {{tag}} placeholders ────────────────────────────────
  let tags: string[];
  try {
    const zip = new PizZip(bytes);
    const docFile = zip.file("word/document.xml");
    if (!docFile) {
      return NextResponse.json({ error: "This .docx file looks corrupted — word/document.xml is missing" }, { status: 400 });
    }
    tags = extractTags(docFile.asText());
  } catch {
    return NextResponse.json({ error: "Could not read this file as a .docx" }, { status: 400 });
  }

  // ── Upload to private storage ────────────────────────────────────
  const storagePath = `${companyId}/${projectId}/${randomUUID()}.docx`;
  const { error: uploadErr } = await admin.storage.from("document-templates").upload(storagePath, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  // ── Insert template + fields ─────────────────────────────────────
  const { data: template, error: tplErr } = await admin.from("document_templates").insert({
    company_id: companyId,
    project_id: projectId,
    name,
    storage_path: storagePath,
    created_by: user.id,
  }).select("id, name, storage_path, created_at").single();

  if (tplErr || !template) {
    await admin.storage.from("document-templates").remove([storagePath]);
    return NextResponse.json({ error: tplErr?.message || "Failed to save template" }, { status: 500 });
  }

  let fields: any[] = [];
  if (tags.length) {
    const { data: inserted } = await admin.from("document_template_fields").insert(
      tags.map((tag, i) => ({
        template_id: template.id,
        tag_key: tag,
        label: tag,
        field_type: "text",
        is_required: false,
        display_order: i,
      }))
    ).select("id, tag_key, label, field_type, select_options, is_required, auto_fill_field_id, display_order");
    fields = inserted || [];
  }

  return NextResponse.json({ ok: true, template: { ...template, fields } });
}
