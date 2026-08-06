// lib/precedents/renderLetterheadPdf.ts
// A simplified sibling to issuePrecedentDocument (lib/precedents/issuePrecedent.ts)
// for the document_export widget's 'letter' style (see
// lib/dashboardWidgets/types.ts's DocumentExportWidget) -- renders an
// arbitrary custom table record's own field values onto the company's
// letterhead, WITHOUT going through the precedent/matter pipeline that
// function hard-requires (a real projectId, precedent_settings, signer
// resolution). Reuses the same underlying mechanics (address formatting,
// layout normalization, content splicing, docx->pdf conversion) directly,
// since those are genuinely generic -- just skips:
//   - signer/signoff resolution (no signer list to resolve for an arbitrary
//     record) -- the letterhead's own {{signoff}} tag, if it has one, just
//     renders empty.
//   - precedent_issuances audit logging -- this is a lighter, unaudited
//     export path. A fast-follow if export history is wanted here later.
import { formatSubjectLine, formatLetterDate } from "@/lib/precedents/composeLetter";
import { formatRecipientBlock, formatAddressBlock } from "@/lib/precedents/addressBlock";
import { normalizeLetterLayout } from "@/lib/precedents/letterLayout";
import { insertSignoffBlock } from "@/lib/precedents/signoffXml";
import { insertContentBlock } from "@/lib/precedents/contentXml";
import { convertDocxToPdf } from "@/lib/gotenberg";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const BUCKET = "precedent-documents";

export interface RenderLetterheadPdfInput {
  companyId: string;
  subject: string;
  body: string; // flat text, blank-line-separated paragraphs -- same contract as ComposeContentInput.body
  recipientName: string;
  recipientAddress: string;
  closing?: string; // defaults to "Yours faithfully,"
}

export type RenderLetterheadPdfResult =
  | { ok: true; pdfBuffer: Buffer }
  | { ok: false; error: string; status: number };

export async function renderLetterheadPdf(admin: any, input: RenderLetterheadPdfInput): Promise<RenderLetterheadPdfResult> {
  // Unlike issuePrecedentDocument (which always requires a subject line for
  // a real matter letter), a subject is optional here -- an arbitrary
  // record's mapped fields might not include anything subject-shaped, and
  // plenty of real letters don't have one. Body is the only hard
  // requirement: a letter with nothing to say isn't worth rendering.
  const subject = (input.subject || "").trim();
  const body = (input.body || "").trim();
  if (!body) return { ok: false, error: "The document's body text is required", status: 400 };

  const { data: letterhead } = await admin
    .from("company_letterheads")
    .select("storage_path, address_tag_key, content_tag_key, signoff_tag_key, detected_fields")
    .eq("company_id", input.companyId).maybeSingle();
  if (!letterhead) {
    return { ok: false, error: "This company hasn't set up a letterhead yet. An admin can upload one in Settings → Precedents.", status: 400 };
  }

  // Fields lib/precedents/letterheadClassify.ts found beyond the always-
  // present address/content/signoff tags -- see issuePrecedentDocument's own
  // comment on this same map. A plain letterhead has none of these and
  // every check below is a no-op.
  const detectedRoles = new Map<string, { role: string }>(
    (letterhead.detected_fields || []).map((f: any) => [f.role, f])
  );

  const recipientBlock = formatRecipientBlock(input.recipientName, input.recipientAddress);
  const fillData: Record<string, string> = {
    [letterhead.address_tag_key]: detectedRoles.has("recipient_name")
      ? recipientBlock.address
      : formatAddressBlock(input.recipientName, input.recipientAddress),
  };
  const formattedSubject = subject ? formatSubjectLine(subject, "sentence_case") : null;
  if (detectedRoles.has("date")) fillData.date = formatLetterDate("D MMMM YYYY");
  if (detectedRoles.has("recipient_name")) fillData.recipient_name = recipientBlock.name;
  if (detectedRoles.has("subject")) fillData.subject = formattedSubject || "";
  // No salutation/delivery_mode/our_ref context for an arbitrary record --
  // a letterhead with dedicated tags for these just renders them blank.
  if (detectedRoles.has("salutation")) fillData.salutation = "";
  if (detectedRoles.has("delivery_mode")) fillData.delivery_mode = "";

  const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(letterhead.storage_path);
  if (dlErr || !fileData) return { ok: false, error: "Could not load the company's letterhead", status: 500 };

  let docxBuffer: Buffer;
  try {
    let sourceBytes = normalizeLetterLayout(Buffer.from(await fileData.arrayBuffer()), {
      addressTagKey: letterhead.address_tag_key,
      letterTagKeys: [
        ...[...detectedRoles.keys()].filter((role) => role !== "closing" && role !== "signoff"),
        letterhead.address_tag_key,
        letterhead.content_tag_key,
      ],
      subjectTagKey: detectedRoles.has("subject") ? "subject" : null,
    });
    // No signers to resolve here -- an empty list clears the {{signoff}} tag
    // cleanly rather than leaving it as literal placeholder text.
    sourceBytes = insertSignoffBlock(sourceBytes, letterhead.signoff_tag_key, []);
    sourceBytes = insertContentBlock(sourceBytes, letterhead.content_tag_key, {
      date: detectedRoles.has("date") ? null : formatLetterDate("D MMMM YYYY"),
      ourRef: null,
      subject: detectedRoles.has("subject") ? null : formattedSubject,
      salutation: detectedRoles.has("salutation") ? null : "Dear Sir/Madam,",
      body,
      closing: detectedRoles.has("closing") ? null : (input.closing || "Yours faithfully,"),
    });
    const zip = new PizZip(sourceBytes);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
      nullGetter: () => "",
    });
    doc.render(fillData);
    docxBuffer = doc.getZip().generate({ type: "nodebuffer" });
  } catch (e: any) {
    return { ok: false, error: `Failed to fill the letterhead: ${e?.message || "render error"}`, status: 500 };
  }

  try {
    const pdfBuffer = await convertDocxToPdf(docxBuffer, "document.docx");
    return { ok: true, pdfBuffer };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Failed to convert to PDF", status: 502 };
  }
}
