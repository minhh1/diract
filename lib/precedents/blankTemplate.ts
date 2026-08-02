// lib/precedents/blankTemplate.ts
// Builds the "blank form" version of a precedent -- the firm's own
// letterhead (or deed/court-form template) with every fill-in left as a
// visible, yellow-highlighted [placeholder] instead of real matter data.
// Extracted out of app/api/precedents/[id]/download/route.ts (now a thin
// wrapper around this) so the Teams/WhatsApp bot's send_blank_template
// action (see lib/botEngine/handleMessage.ts) can hand over the identical
// document instead of a second, drifting implementation -- the same split
// lib/precedents/issuePrecedent.ts already uses for a filled-in document.
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { randomUUID } from "crypto";
import { insertContentBlock } from "@/lib/precedents/contentXml";
import { insertSignoffBlock } from "@/lib/precedents/signoffXml";
import { buildBodyFromTemplate, type BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";
import { buildCourtFormDocx } from "@/lib/precedents/courtFormDocx";
import { buildDeedDocx } from "@/lib/precedents/deedDocx";
import { highlightBracketedPlaceholders } from "@/lib/precedents/highlightPlaceholders";

const BUCKET = "precedent-documents";
const SIGNED_URL_TTL = 3600;

/** Turns "Amount owed" into "[Amount owed]" so blanks are obvious in Word -- highlightBracketedPlaceholders then marks it yellow. */
function placeholder(label: string): string {
  return `[${label}]`;
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9 \-_()]/g, "").trim().slice(0, 120) || "precedent";
}

export type BlankTemplateResult =
  | { ok: true; bytes: Buffer; filename: string }
  | { ok: false; error: string; status: number };

export async function buildBlankPrecedentDocx(admin: any, companyId: string, precedentId: string): Promise<BlankTemplateResult> {
  const { data: precedent } = await admin
    .from("precedents")
    .select("id, company_id, name, body_template, uses_letterhead, document_type")
    .eq("id", precedentId).is("deleted_at", null).maybeSingle();
  if (!precedent || precedent.company_id !== companyId) return { ok: false, error: "Precedent not found", status: 404 };

  const segments = (precedent.body_template?.segments || []) as BodyTemplateSegment[];
  // Long-form precedents ship drafting instructions instead of a template
  // (a 30-page agreement isn't a fill-in-the-blanks document), so there's no
  // blank form to hand over.
  if (!segments.length) {
    return { ok: false, error: "This precedent has no fill-in template -- it's drafted from its instructions when issued.", status: 400 };
  }

  const values: Record<string, string> = {};
  for (const s of segments) if (s.type === "field") values[s.key] = placeholder(s.label);
  const body = buildBodyFromTemplate(segments, values).trim();
  const filename = safeFilename(precedent.name);

  // A deed is generated INTO the firm's deed template, same as a real
  // issuance -- see lib/precedents/deedDocx.ts. Its execution page uses the
  // firm's own signing blocks where one has been uploaded (company_execution_
  // templates), falling back to the built-in scheme per block otherwise.
  if (precedent.document_type === "deed") {
    const [{ data: deedTemplate }, { data: executionTemplate }] = await Promise.all([
      admin.from("company_deed_templates").select("storage_path").eq("company_id", companyId).maybeSingle(),
      admin.from("company_execution_templates").select("blocks").eq("company_id", companyId).maybeSingle(),
    ]);
    if (deedTemplate?.storage_path) {
      const { data: tplFile } = await admin.storage.from(BUCKET).download(deedTemplate.storage_path);
      if (tplFile) {
        const out = buildDeedDocx(
          Buffer.from(await tplFile.arrayBuffer()),
          body,
          executionTemplate?.blocks ?? undefined
        );
        return { ok: true, bytes: highlightBracketedPlaceholders(out), filename };
      }
    }
  }

  // Court documents and prescribed forms carry their own prescribed heading,
  // not the firm's letterhead.
  if (precedent.uses_letterhead === false) {
    const standalone = await buildCourtFormDocx(body);
    return { ok: true, bytes: highlightBracketedPlaceholders(standalone), filename };
  }

  const { data: letterhead } = await admin
    .from("company_letterheads")
    .select("storage_path, address_tag_key, content_tag_key, signoff_tag_key, detected_fields")
    .eq("company_id", companyId).maybeSingle();
  if (!letterhead) {
    return { ok: false, error: "This company hasn't set up a letterhead yet. An admin can upload one in Settings → Precedents.", status: 400 };
  }

  const detectedRoles = new Set<string>((letterhead.detected_fields || []).map((f: { role: string }) => f.role));

  const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(letterhead.storage_path);
  if (dlErr || !fileData) return { ok: false, error: "Could not load the company's letterhead", status: 500 };

  try {
    // Signers aren't known for a blank form, so the signoff block is left
    // for whoever sends it -- same insertion point the issue pipeline uses.
    let bytes = insertSignoffBlock(Buffer.from(await fileData.arrayBuffer()), letterhead.signoff_tag_key, []);
    bytes = insertContentBlock(bytes, letterhead.content_tag_key, {
      date: detectedRoles.has("date") ? null : placeholder("Date"),
      ourRef: detectedRoles.has("our_ref") ? null : placeholder("Our reference"),
      subject: detectedRoles.has("subject") ? null : placeholder("Subject"),
      salutation: detectedRoles.has("salutation") ? null : placeholder("Salutation"),
      body,
      closing: detectedRoles.has("closing") ? null : "Yours faithfully,",
    });

    const fillData: Record<string, string> = { [letterhead.address_tag_key]: placeholder("Recipient address") };
    if (detectedRoles.has("our_ref")) fillData.our_ref = placeholder("Our reference");
    if (detectedRoles.has("date")) fillData.date = placeholder("Date");
    if (detectedRoles.has("delivery_mode")) fillData.delivery_mode = placeholder("Delivery mode");
    if (detectedRoles.has("recipient_name")) fillData.recipient_name = placeholder("Recipient name");
    if (detectedRoles.has("salutation")) fillData.salutation = placeholder("Salutation");
    if (detectedRoles.has("subject")) fillData.subject = placeholder("Subject");

    const doc = new Docxtemplater(new PizZip(bytes), {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
      nullGetter: () => "",
    });
    doc.render(fillData);
    const docxBuffer: Buffer = doc.getZip().generate({ type: "nodebuffer" });
    return { ok: true, bytes: highlightBracketedPlaceholders(docxBuffer), filename };
  } catch (e) {
    const message = e instanceof Error ? e.message : "render error";
    return { ok: false, error: `Failed to fill the letterhead: ${message}`, status: 500 };
  }
}

export type DeliverBlankTemplateResult =
  | { ok: true; url: string; filename: string }
  | { ok: false; error: string };

// The web download route streams the bytes straight to the browser, but a
// chat message can only carry a link -- so for the bot, the blank form is
// uploaded (private bucket, same as a real issuance) and handed back as a
// signed URL instead. Stored under its own "blank/" prefix, never logged to
// precedent_issuances -- it's not tied to a matter and carries no real data,
// so there's nothing worth keeping an audit trail of.
export async function deliverBlankTemplate(admin: any, companyId: string, precedentId: string): Promise<DeliverBlankTemplateResult> {
  const result = await buildBlankPrecedentDocx(admin, companyId, precedentId);
  if (!result.ok) return { ok: false, error: result.error };

  const storagePath = `blank/${companyId}/${precedentId}/${randomUUID()}.docx`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, result.bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (upErr) return { ok: false, error: `Failed to store the document: ${upErr.message}` };

  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (signErr || !signed) return { ok: false, error: signErr?.message || "Failed to create a download link" };

  return { ok: true, url: signed.signedUrl, filename: result.filename };
}
