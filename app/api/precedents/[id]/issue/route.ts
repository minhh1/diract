// app/api/precedents/[id]/issue/route.ts
// Issues a precedent document from a subject + body. The body is either a
// plain string the staff member wrote/edited themselves (freeform, or
// pre-filled via the separate optional AI drafting assist -- see
// app/api/precedents/[id]/draft/route.ts) OR, when this precedent has a
// detected body_template (see lib/precedents/bodyTemplateDetect.ts) and the
// Issue modal's field form was used, reconstructed server-side from
// fieldValues via buildBodyFromTemplate -- see the fieldValuesInput handling
// below. Splices
// the selected signers' signoff blocks into the letterhead's {{signoff}} tag
// (lib/precedents/signoffXml.ts) and the composed date/Our-Ref/subject/
// salutation/body/closing into its {{content}} tag (lib/precedents/contentXml.ts)
// as raw OOXML BEFORE Docxtemplater runs -- both need per-run formatting
// (bold names/headings, real paragraph spacing) a flat text tag can't give.
// Docxtemplater then only fills the remaining plain-text tags (address, and
// any of our_ref/date/delivery_mode/recipient_name/subject/salutation the
// letterhead has its own dedicated tag for), converts to PDF, stores it, and
// logs a precedent_issuances row. No AI call happens in this route at all.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { formatSubjectLine, formatLetterDate, resolveSalutation } from "@/lib/precedents/composeLetter";
import { insertSignoffBlock, type SignoffPerson } from "@/lib/precedents/signoffXml";
import { insertContentBlock } from "@/lib/precedents/contentXml";
import { buildBodyFromTemplate } from "@/lib/precedents/bodyTemplateDetect";
import { convertDocxToPdf } from "@/lib/gotenberg";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { randomUUID } from "crypto";

const BUCKET = "precedent-documents";
const SIGNED_URL_TTL = 3600;

const DEFAULT_SETTINGS = {
  subject_line_style: "sentence_case" as const,
  date_format: "D MMMM YYYY",
  salutation_style: "generic" as const,
  signers: [] as string[], // staff_signoffs.user_id, up to 4
  include_firm_reference: false,
};

// Resolves each selected signer (a user_id, see precedent_settings.signers)
// to their saved staff_signoffs row -- falling back to just their account
// name if they haven't filled one in yet, same fallback the staff-signoffs
// directory GET route uses, so a signer is never silently dropped from the
// document just because their signoff block is incomplete.
async function resolveSignoffs(admin: any, companyId: string, userIds: string[]): Promise<SignoffPerson[]> {
  if (!userIds.length) return [];
  const [{ data: signoffs }, { data: profiles }] = await Promise.all([
    admin.from("staff_signoffs").select("*").eq("company_id", companyId).in("user_id", userIds),
    admin.from("profiles").select("id, full_name, email").in("id", userIds),
  ]);
  const signoffByUserId = new Map<string, any>((signoffs || []).map((s: any) => [s.user_id, s]));
  const profileByUserId = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));
  const people: SignoffPerson[] = [];
  for (const userId of userIds) {
    const signoff = signoffByUserId.get(userId);
    const profile = profileByUserId.get(userId);
    const name = signoff?.name || profile?.full_name || profile?.email;
    if (!name) continue;
    people.push({
      name,
      position: signoff?.position ?? null,
      companyName: signoff?.company_name ?? null,
      contactNumber: signoff?.contact_number ?? null,
      contactEmail: signoff?.contact_email ?? profile?.email ?? null,
    });
  }
  return people;
}

async function resolveClientNames(admin: any, companyId: string, projectId: string) {
  const { data: fields } = await admin
    .from("company_custom_fields").select("id, field_key").eq("company_id", companyId).eq("table_name", "projects")
    .in("field_key", ["client_name", "client_full_name", "client_first_name"]).is("deleted_at", null);
  if (!fields?.length) return { clientFirstName: null as string | null, clientFullName: null as string | null };

  const { data: values } = await admin
    .from("company_custom_field_values").select("field_id, value_text").eq("record_id", projectId).in("field_id", fields.map((f: any) => f.id));
  const keyByFieldId = new Map(fields.map((f: any) => [f.id, f.field_key]));
  let clientFullName: string | null = null, clientFirstName: string | null = null;
  for (const v of values || []) {
    const key = keyByFieldId.get(v.field_id);
    if ((key === "client_full_name" || key === "client_name") && v.value_text) clientFullName = v.value_text;
    if (key === "client_first_name" && v.value_text) clientFirstName = v.value_text;
  }
  if (!clientFirstName && clientFullName) clientFirstName = clientFullName.split(" ")[0];
  return { clientFirstName, clientFullName };
}

async function resolveMatterReference(admin: any, companyId: string, projectId: string): Promise<string | null> {
  const { data: field } = await admin
    .from("company_custom_fields").select("id").eq("company_id", companyId).eq("table_name", "projects")
    .eq("field_key", "matter_number").is("deleted_at", null).maybeSingle();
  if (!field) return null;
  const { data: value } = await admin
    .from("company_custom_field_values").select("value_text").eq("record_id", projectId).eq("field_id", field.id).maybeSingle();
  return value?.value_text || null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: precedentId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const projectId = String(body?.recordId || "");
  const subjectInput = String(body?.subject || "").trim();
  // Purely informational -- the brief given to the optional AI drafting
  // assist, if the user used it, kept only for this issuance's history.
  const draftBrief = String(body?.prompt || "").trim();
  const recipientAddress = String(body?.recipientAddress || "").trim();
  const recipientName = String(body?.recipientName || "").trim();
  const deliveryMode = String(body?.deliveryMode || "").trim();
  // Per-issuance overrides -- default to the matter/company's configured
  // precedent_settings when omitted, same as before this existed.
  const salutationOverride = String(body?.salutation || "").trim();
  const signerIdsOverride = Array.isArray(body?.signerIds)
    ? body.signerIds.map((id: any) => String(id || "").trim()).filter(Boolean).slice(0, 4)
    : undefined;
  const fieldValuesInput = body?.fieldValues && typeof body.fieldValues === "object" ? body.fieldValues : null;
  if (!projectId) return NextResponse.json({ error: "recordId is required" }, { status: 400 });
  if (!subjectInput) return NextResponse.json({ error: "A subject line is required" }, { status: 400 });
  if (!recipientAddress) return NextResponse.json({ error: "A recipient address is required" }, { status: 400 });

  const { data: precedent } = await admin
    .from("precedents").select("id, company_id, name, body_template").eq("id", precedentId).is("deleted_at", null).maybeSingle();
  if (!precedent || precedent.company_id !== companyId) return NextResponse.json({ error: "Precedent not found" }, { status: 404 });

  // A field-value form (see the Issue modal's template mode) always wins
  // over a client-sent `body` string when this precedent has a detected
  // template -- the body is reconstructed from the firm's own boilerplate
  // server-side so a form submission can't be tampered with into arbitrary
  // content. Falls back to the freeform `body` string otherwise (no
  // template detected yet, or the staff member toggled "Write freeform").
  let bodyInput: string;
  if (fieldValuesInput && precedent.body_template?.segments) {
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(fieldValuesInput)) values[key] = String(value ?? "");
    bodyInput = buildBodyFromTemplate(precedent.body_template.segments, values).trim();
  } else {
    bodyInput = String(body?.body || "").trim();
  }
  if (!bodyInput) return NextResponse.json({ error: "The document's body text is required" }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id, company_id, name").eq("id", projectId).maybeSingle();
  if (!project || project.company_id !== companyId) return NextResponse.json({ error: "Invalid matter" }, { status: 400 });

  const { data: letterhead } = await admin
    .from("company_letterheads")
    .select("storage_path, address_tag_key, content_tag_key, signoff_tag_key, detected_fields")
    .eq("company_id", companyId).maybeSingle();
  if (!letterhead) {
    return NextResponse.json({ error: "This firm hasn't set up a letterhead yet — an admin can upload one in Settings → Precedents." }, { status: 400 });
  }

  // Fields lib/precedents/letterheadClassify.ts found beyond the always-
  // present address/content/signoff tags -- e.g. a real letterhead with its
  // own Our Ref/date/delivery-mode/recipient/salutation/subject lines
  // already laid out, not just logo/header art. A plain letterhead has none
  // of these, and every check below is a no-op.
  const detectedRoles = new Map<string, { role: string; options?: string[] }>(
    (letterhead.detected_fields || []).map((f: any) => [f.role, f])
  );
  if (detectedRoles.has("recipient_name") && !recipientName) {
    return NextResponse.json({ error: "Recipient name is required" }, { status: 400 });
  }
  if (detectedRoles.has("delivery_mode")) {
    if (!deliveryMode) return NextResponse.json({ error: "Delivery mode is required" }, { status: 400 });
    const options = detectedRoles.get("delivery_mode")?.options || [];
    if (options.length && !options.includes(deliveryMode)) {
      return NextResponse.json({ error: "Invalid delivery mode" }, { status: 400 });
    }
  }

  // Resolve settings: matter override ?? company default ?? hard-coded fallback.
  const [{ data: projectSettings }, { data: companySettings }] = await Promise.all([
    admin.from("precedent_settings").select("*").eq("company_id", companyId).eq("project_id", projectId).maybeSingle(),
    admin.from("precedent_settings").select("*").eq("company_id", companyId).is("project_id", null).maybeSingle(),
  ]);
  const settings = projectSettings || companySettings || DEFAULT_SETTINGS;

  const needsMatterReference = settings.include_firm_reference || detectedRoles.has("our_ref");
  const [{ clientFirstName, clientFullName }, matterReference, signoffs] = await Promise.all([
    resolveClientNames(admin, companyId, projectId),
    needsMatterReference ? resolveMatterReference(admin, companyId, projectId) : Promise.resolve(null),
    // A per-issuance signer selection overrides the matter/company default
    // list -- lets a firm pick who signs THIS document instead of always
    // using the same fixed signers for every letter (see Issue modal's
    // "Sign off" section).
    resolveSignoffs(admin, companyId, signerIdsOverride ?? settings.signers ?? []),
  ]);

  const formattedSubject = formatSubjectLine(subjectInput, settings.subject_line_style);
  // A typed-in override replaces the resolved default salutation either way
  // -- whether the letterhead has its own {{salutation}} tag or not (see
  // Issue modal's optional "Salutation" field).
  const resolvedSalutation = salutationOverride || resolveSalutation(settings.salutation_style, clientFirstName, clientFullName);

  const fillData: Record<string, string> = {
    [letterhead.address_tag_key]: recipientAddress,
  };
  if (detectedRoles.has("our_ref")) fillData.our_ref = matterReference || "";
  if (detectedRoles.has("date")) fillData.date = formatLetterDate(settings.date_format);
  if (detectedRoles.has("delivery_mode")) fillData.delivery_mode = deliveryMode;
  if (detectedRoles.has("recipient_name")) fillData.recipient_name = recipientName;
  if (detectedRoles.has("salutation")) fillData.salutation = resolvedSalutation;
  if (detectedRoles.has("subject")) fillData.subject = formattedSubject;

  const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(letterhead.storage_path);
  if (dlErr || !fileData) return NextResponse.json({ error: "Could not load the firm's letterhead" }, { status: 500 });

  let docxBuffer: Buffer;
  try {
    let sourceBytes = insertSignoffBlock(Buffer.from(await fileData.arrayBuffer()), letterhead.signoff_tag_key, signoffs);
    // Spliced in as real OOXML paragraphs BEFORE Docxtemplater runs -- same
    // reason as insertSignoffBlock above: a flat text tag can't give the
    // subject line its own bold run or give each section real paragraph
    // spacing (see lib/precedents/contentXml.ts).
    sourceBytes = insertContentBlock(sourceBytes, letterhead.content_tag_key, {
      date: detectedRoles.has("date") ? null : formatLetterDate(settings.date_format),
      ourRef: !detectedRoles.has("our_ref") && matterReference ? matterReference : null,
      subject: detectedRoles.has("subject") ? null : formattedSubject,
      salutation: detectedRoles.has("salutation") ? null : resolvedSalutation,
      body: bodyInput,
      closing: detectedRoles.has("closing") ? null : "Yours faithfully,",
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
    return NextResponse.json({ error: `Failed to fill the letterhead: ${e?.message || "render error"}` }, { status: 500 });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await convertDocxToPdf(docxBuffer, "document.docx");
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to convert to PDF" }, { status: 502 });
  }

  const issuanceId = randomUUID();
  const storagePath = `generated/${companyId}/${precedentId}/${issuanceId}.pdf`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (upErr) return NextResponse.json({ error: `Failed to store the document: ${upErr.message}` }, { status: 500 });

  const { error: insertErr } = await admin.from("precedent_issuances").insert({
    id: issuanceId, precedent_id: precedentId, company_id: companyId, project_id: projectId,
    created_by: user.id, prompt: draftBrief, subject_line: formattedSubject, storage_path: storagePath,
  });
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);

  return NextResponse.json({ ok: true, issuanceId, subject: formattedSubject, url: signed?.signedUrl || null });
}
