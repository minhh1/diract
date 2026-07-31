// lib/precedents/issuePrecedent.ts
// The actual precedent-issuing pipeline -- extracted out of
// app/api/precedents/[id]/issue/route.ts (which is now a thin wrapper
// around this) so the Teams/WhatsApp bot's issue_precedent action
// (lib/ai/precedentAction.ts) can produce an identical document to the web
// Issue modal, rather than a second, drifting implementation. Fills the
// {{address}}/plain-tag fields via Docxtemplater, splices the signoff block
// and composed content in as raw OOXML first (lib/precedents/signoffXml.ts,
// lib/precedents/contentXml.ts -- a flat text tag can't give the subject
// line its own bold run or give each section real paragraph spacing),
// converts to PDF, stores it, and logs a precedent_issuances row.
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

export interface IssuePrecedentInput {
  companyId: string;
  userId: string;
  precedentId: string;
  projectId: string;
  subject: string;
  body?: string; // ignored when fieldValues is given and the precedent has a body_template
  fieldValues?: Record<string, string>;
  recipientAddress: string;
  recipientName?: string;
  deliveryMode?: string;
  salutation?: string; // per-issuance override of the resolved default
  signerIds?: string[]; // per-issuance override of precedent_settings.signers
  draftBrief?: string; // purely informational -- kept on the issuance for history
}

export type IssuePrecedentResult =
  | { ok: true; issuanceId: string; subject: string; url: string | null }
  | { ok: false; error: string; status: number };

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

export async function issuePrecedentDocument(admin: any, input: IssuePrecedentInput): Promise<IssuePrecedentResult> {
  const { companyId, userId, precedentId, projectId } = input;
  const subjectInput = input.subject.trim();
  const draftBrief = (input.draftBrief || "").trim();
  const recipientAddress = input.recipientAddress.trim();
  const recipientName = (input.recipientName || "").trim();
  const deliveryMode = (input.deliveryMode || "").trim();
  const salutationOverride = (input.salutation || "").trim();
  const signerIdsOverride = input.signerIds?.map(id => id.trim()).filter(Boolean).slice(0, 4);

  if (!subjectInput) return { ok: false, error: "A subject line is required", status: 400 };

  const { data: precedent } = await admin
    .from("precedents").select("id, company_id, name, body_template, is_system").eq("id", precedentId).is("deleted_at", null).maybeSingle();
  if (!precedent || precedent.company_id !== companyId) return { ok: false, error: "Precedent not found", status: 404 };

  // Every real (non-system) precedent is a letter to someone, so an address
  // is always required. The hidden General Document precedent (see
  // resolveOrCreateGeneralPrecedent below) covers freeform documents that
  // might not have one -- e.g. an internal memo -- so it's the one case
  // where leaving this blank is fine; the letterhead's address block just
  // renders empty.
  if (!recipientAddress && !precedent.is_system) return { ok: false, error: "A recipient address is required", status: 400 };

  // A field-value form (see the Issue modal's template mode, or the bot's
  // per-field questions once a precedent has a body_template) always wins
  // over a freeform `body` string when this precedent has a detected
  // template -- the body is reconstructed from the firm's own boilerplate
  // server-side so a caller can't be tampered with into arbitrary content.
  // Falls back to the freeform `body` string otherwise.
  let bodyInput: string;
  if (input.fieldValues && precedent.body_template?.segments) {
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.fieldValues)) values[key] = String(value ?? "");
    bodyInput = buildBodyFromTemplate(precedent.body_template.segments, values).trim();
  } else {
    bodyInput = (input.body || "").trim();
  }
  if (!bodyInput) return { ok: false, error: "The document's body text is required", status: 400 };

  const { data: project } = await admin.from("projects").select("id, company_id, name").eq("id", projectId).maybeSingle();
  if (!project || project.company_id !== companyId) return { ok: false, error: "Invalid matter", status: 400 };

  const { data: letterhead } = await admin
    .from("company_letterheads")
    .select("storage_path, address_tag_key, content_tag_key, signoff_tag_key, detected_fields")
    .eq("company_id", companyId).maybeSingle();
  if (!letterhead) {
    return { ok: false, error: "This company hasn't set up a letterhead yet. An admin can upload one in Settings → Precedents.", status: 400 };
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
    return { ok: false, error: "Recipient name is required", status: 400 };
  }
  if (detectedRoles.has("delivery_mode")) {
    if (!deliveryMode) return { ok: false, error: "Delivery mode is required", status: 400 };
    const options = detectedRoles.get("delivery_mode")?.options || [];
    if (options.length && !options.includes(deliveryMode)) {
      return { ok: false, error: "Invalid delivery mode", status: 400 };
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
    // using the same fixed signers for every letter.
    resolveSignoffs(admin, companyId, signerIdsOverride ?? settings.signers ?? []),
  ]);

  const formattedSubject = formatSubjectLine(subjectInput, settings.subject_line_style);
  // A typed-in override replaces the resolved default salutation either way
  // -- whether the letterhead has its own {{salutation}} tag or not.
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
  if (dlErr || !fileData) return { ok: false, error: "Could not load the company's letterhead", status: 500 };

  let docxBuffer: Buffer;
  try {
    let sourceBytes = insertSignoffBlock(Buffer.from(await fileData.arrayBuffer()), letterhead.signoff_tag_key, signoffs);
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
    return { ok: false, error: `Failed to fill the letterhead: ${e?.message || "render error"}`, status: 500 };
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await convertDocxToPdf(docxBuffer, "document.docx");
  } catch (e: any) {
    return { ok: false, error: e?.message || "Failed to convert to PDF", status: 502 };
  }

  const issuanceId = randomUUID();
  const storagePath = `generated/${companyId}/${precedentId}/${issuanceId}.pdf`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `Failed to store the document: ${upErr.message}`, status: 500 };

  const { error: insertErr } = await admin.from("precedent_issuances").insert({
    id: issuanceId, precedent_id: precedentId, company_id: companyId, project_id: projectId,
    created_by: userId, prompt: draftBrief, subject_line: formattedSubject, storage_path: storagePath,
  });
  if (insertErr) return { ok: false, error: insertErr.message, status: 500 };

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);

  return { ok: true, issuanceId, subject: formattedSubject, url: signed?.signedUrl || null };
}

const GENERAL_PRECEDENT_NAME = "General Document";

// One hidden, auto-created precedent per company, used only when the bot's
// issue_precedent action can't match a real precedent name and the user
// asks for a freeform AI-written document instead (see
// lib/ai/precedentAction.ts). is_system keeps it out of GET /api/precedents
// and resolvePrecedentByName's normal search -- this is the only way to
// reach it, by design.
export async function resolveOrCreateGeneralPrecedent(admin: any, companyId: string): Promise<{ id: string; name: string }> {
  const { data: existing } = await admin
    .from("precedents").select("id, name").eq("company_id", companyId).eq("is_system", true)
    .is("deleted_at", null).maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await admin
    .from("precedents")
    .insert({ company_id: companyId, record_table: "projects", name: GENERAL_PRECEDENT_NAME, is_system: true, display_order: 9999 })
    .select("id, name").single();
  if (error || !created) throw new Error(error?.message || "Failed to set up a general document precedent");
  return created;
}

// A compact "here's what this record is" summary for AI drafting context --
// the project's name plus a handful of its own custom field values (label:
// value), so a drafted subject/body actually reflects the matter instead of
// just its bare name. Entity-type fields resolve to the linked entity's own
// name, same as lib/precedents/customFieldDefaults.ts.
export async function resolveProjectSummary(admin: any, companyId: string, projectId: string): Promise<string> {
  const { data: project } = await admin.from("projects").select("name").eq("id", projectId).maybeSingle();
  const name = project?.name || "";

  const { data: fields } = await admin
    .from("company_custom_fields").select("id, label, field_type").eq("company_id", companyId).eq("table_name", "projects").is("deleted_at", null);
  if (!fields?.length) return name;

  const { data: values } = await admin
    .from("company_custom_field_values")
    .select("field_id, value_text, value_number, value_date, value_boolean, value_record_id")
    .eq("record_id", projectId).in("field_id", fields.map((f: any) => f.id));
  if (!values?.length) return name;

  const fieldById = new Map<string, any>(fields.map((f: any) => [f.id, f]));
  const entityIds = [...new Set(
    values.filter((v: any) => fieldById.get(v.field_id)?.field_type === "entity" && v.value_record_id).map((v: any) => v.value_record_id)
  )];
  let entityNameById = new Map<string, string>();
  if (entityIds.length) {
    const { data: entities } = await admin.from("entities").select("id, name").in("id", entityIds);
    entityNameById = new Map((entities || []).map((e: any) => [e.id, e.name]));
  }

  const parts: string[] = [];
  for (const v of values as any[]) {
    const field = fieldById.get(v.field_id);
    if (!field) continue;
    let display: string | null = null;
    if (field.field_type === "entity" && v.value_record_id) display = entityNameById.get(v.value_record_id) || null;
    else display = v.value_text ?? (v.value_number != null ? String(v.value_number) : null) ?? v.value_date ?? (v.value_boolean != null ? String(v.value_boolean) : null);
    if (display) parts.push(`${field.label}: ${display}`);
    if (parts.length >= 6) break; // a compact summary, not the whole record
  }

  return parts.length ? `${name} (${parts.join(", ")})` : name;
}
