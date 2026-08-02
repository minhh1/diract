// app/api/precedents/[id]/download/route.ts
// GET -> the precedent as a .docx on the firm's letterhead, with every
// fill-in left as a visible [placeholder].
//
// Distinct from ./issue, which produces a real document for a real matter
// (resolves the client, the matter reference, the signers, records it against
// the file). This is the blank form: what a solicitor wants when they'd
// rather work in Word, or to see the precedent on the actual letterhead
// including the header art, which the browser preview can only stand in for.
//
// No PDF branch here on purpose -- .docx composition is pure JS, whereas PDF
// needs the LibreOffice conversion service (lib/gotenberg.ts), and a blank
// form is something you fill in, so Word is the useful format anyway.
import { NextRequest, NextResponse } from "next/server";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { insertContentBlock } from "@/lib/precedents/contentXml";
import { insertSignoffBlock } from "@/lib/precedents/signoffXml";
import { buildBodyFromTemplate, type BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";
import { buildCourtFormDocx } from "@/lib/precedents/courtFormDocx";

const BUCKET = "precedent-documents";

/** Turns "Amount owed" into "[Amount owed]" so blanks are obvious in Word. */
function placeholder(label: string): string {
  return `[${label}]`;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9 \-_()]/g, "").trim().slice(0, 120) || "precedent";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: precedentId } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: precedent } = await admin
    .from("precedents")
    .select("id, company_id, name, body_template, ai_instructions, uses_letterhead")
    .eq("id", precedentId).is("deleted_at", null).maybeSingle();
  if (!precedent || precedent.company_id !== companyId) {
    return NextResponse.json({ error: "Precedent not found" }, { status: 404 });
  }

  const segments = (precedent.body_template?.segments || []) as BodyTemplateSegment[];
  // Long-form precedents ship drafting instructions instead of a template
  // (a 30-page agreement isn't a fill-in-the-blanks document), so there's no
  // blank form to hand over.
  if (!segments.length) {
    return NextResponse.json(
      { error: "This precedent has no fill-in template — it's drafted from its instructions when issued." },
      { status: 400 }
    );
  }

  const values: Record<string, string> = {};
  for (const s of segments) if (s.type === "field") values[s.key] = placeholder(s.label);
  const body = buildBodyFromTemplate(segments, values).trim();

  // Court documents, deeds and prescribed forms are built standalone: they
  // carry their own prescribed heading and putting the firm's letterhead
  // above a statement of claim is not the approved form.
  if (precedent.uses_letterhead === false) {
    const standalone = await buildCourtFormDocx(body);
    return new NextResponse(new Uint8Array(standalone), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeFilename(precedent.name)}.docx"`,
      },
    });
  }

  const { data: letterhead } = await admin
    .from("company_letterheads")
    .select("storage_path, address_tag_key, content_tag_key, signoff_tag_key, detected_fields")
    .eq("company_id", companyId).maybeSingle();
  if (!letterhead) {
    return NextResponse.json(
      { error: "This company hasn't set up a letterhead yet. An admin can upload one in Settings → Precedents." },
      { status: 400 }
    );
  }

  const detectedRoles = new Set<string>((letterhead.detected_fields || []).map((f: { role: string }) => f.role));

  const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(letterhead.storage_path);
  if (dlErr || !fileData) {
    return NextResponse.json({ error: "Could not load the company's letterhead" }, { status: 500 });
  }

  let docxBuffer: Buffer;
  try {
    // Signers aren't known for a blank form, so the signoff block is left for
    // whoever sends it -- same insertion point the issue pipeline uses.
    let bytes = insertSignoffBlock(Buffer.from(await fileData.arrayBuffer()), letterhead.signoff_tag_key, []);
    // Anything the letterhead lays out itself is filled via its own tag
    // below; only what it lacks gets composed into the content block, which
    // is exactly how issuePrecedentDocument decides.
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
    docxBuffer = doc.getZip().generate({ type: "nodebuffer" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "render error";
    return NextResponse.json({ error: `Failed to fill the letterhead: ${message}` }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(docxBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeFilename(precedent.name)}.docx"`,
    },
  });
}
