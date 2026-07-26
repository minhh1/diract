// app/api/precedents/[id]/issue/route.ts
// Issues a precedent document: drafts subject+body from the staff member's
// prompt (lib/ai/precedentDraft.ts), composes the full letter text
// (lib/precedents/composeLetter.ts), splices the selected signers' signoff
// blocks into the letterhead's {{signoff}} tag as raw OOXML
// (lib/precedents/signoffXml.ts, so the name can be bold), fills the
// {{address}}/{{content}} tags via docxtemplater, converts to PDF, stores it,
// and logs a precedent_issuances row. Same token-cap/usage-logging shape as
// app/api/ai/rewrite-text/route.ts, same docxtemplater render + storage
// pattern as app/api/document-templates/public/[pageId]/submit/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { draftPrecedentContent } from "@/lib/ai/precedentDraft";
import { composeLetterContent, formatSubjectLine } from "@/lib/precedents/composeLetter";
import { insertSignoffBlock, type SignoffPerson } from "@/lib/precedents/signoffXml";
import { convertDocxToPdf } from "@/lib/gotenberg";
import { resolveSourceTypes } from "@/lib/ai/retrieval";
import { costUsd, HOSTED_MODELS } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { randomUUID } from "crypto";

const DEFAULT_MODEL_ID = HOSTED_MODELS[0].id;
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
  const prompt = String(body?.prompt || "").trim();
  const recipientAddress = String(body?.recipientAddress || "").trim();
  if (!projectId) return NextResponse.json({ error: "recordId is required" }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: "A prompt describing the document is required" }, { status: 400 });
  if (!recipientAddress) return NextResponse.json({ error: "A recipient address is required" }, { status: 400 });

  const { data: precedent } = await admin
    .from("precedents").select("id, company_id, name, ai_instructions").eq("id", precedentId).is("deleted_at", null).maybeSingle();
  if (!precedent || precedent.company_id !== companyId) return NextResponse.json({ error: "Precedent not found" }, { status: 404 });

  const { data: project } = await admin.from("projects").select("id, company_id, name").eq("id", projectId).maybeSingle();
  if (!project || project.company_id !== companyId) return NextResponse.json({ error: "Invalid matter" }, { status: 400 });

  const { data: letterhead } = await admin
    .from("company_letterheads").select("storage_path, address_tag_key, content_tag_key, signoff_tag_key").eq("company_id", companyId).maybeSingle();
  if (!letterhead) {
    return NextResponse.json({ error: "This firm hasn't set up a letterhead yet — an admin can upload one in Settings → Precedents." }, { status: 400 });
  }

  // Resolve settings: matter override ?? company default ?? hard-coded fallback.
  const [{ data: projectSettings }, { data: companySettings }] = await Promise.all([
    admin.from("precedent_settings").select("*").eq("company_id", companyId).eq("project_id", projectId).maybeSingle(),
    admin.from("precedent_settings").select("*").eq("company_id", companyId).is("project_id", null).maybeSingle(),
  ]);
  const settings = projectSettings || companySettings || DEFAULT_SETTINGS;

  const { data: aiSettings } = await admin
    .from("ai_chat_settings")
    .select("source_crm, source_gmail, source_whatsapp, source_teams, source_onedrive, monthly_token_cap")
    .eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly AI token cap reached for this company" }, { status: 429 });
  }
  const sourceTypes = resolveSourceTypes(aiSettings);

  let draft;
  try {
    draft = await draftPrecedentContent(admin, companyId, DEFAULT_MODEL_ID, sourceTypes, precedent.name, precedent.ai_instructions, prompt, project.name);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to draft document content" }, { status: 502 });
  }

  const cost = costUsd("hosted", DEFAULT_MODEL_ID, draft);
  await admin.from("ai_usage_events").insert({
    company_id: companyId, user_id: user.id, model_id: DEFAULT_MODEL_ID, provider: "hosted",
    input_tokens: draft.inputTokens, output_tokens: draft.outputTokens, cost_usd: cost,
  });

  const [{ clientFirstName, clientFullName }, matterReference, signoffs] = await Promise.all([
    resolveClientNames(admin, companyId, projectId),
    settings.include_firm_reference ? resolveMatterReference(admin, companyId, projectId) : Promise.resolve(null),
    resolveSignoffs(admin, companyId, settings.signers || []),
  ]);

  const formattedSubject = formatSubjectLine(draft.subject, settings.subject_line_style);
  const composedContent = composeLetterContent({
    subject: draft.subject,
    subjectLineStyle: settings.subject_line_style,
    dateFormat: settings.date_format,
    salutationStyle: settings.salutation_style,
    clientFirstName, clientFullName,
    body: draft.body,
    matterReference,
  });

  const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(letterhead.storage_path);
  if (dlErr || !fileData) return NextResponse.json({ error: "Could not load the firm's letterhead" }, { status: 500 });

  let docxBuffer: Buffer;
  try {
    const sourceBytes = insertSignoffBlock(Buffer.from(await fileData.arrayBuffer()), letterhead.signoff_tag_key, signoffs);
    const zip = new PizZip(sourceBytes);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
      nullGetter: () => "",
    });
    doc.render({ [letterhead.address_tag_key]: recipientAddress, [letterhead.content_tag_key]: composedContent });
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
    created_by: user.id, prompt, subject_line: formattedSubject, storage_path: storagePath,
  });
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);

  return NextResponse.json({ ok: true, issuanceId, subject: formattedSubject, url: signed?.signedUrl || null });
}
