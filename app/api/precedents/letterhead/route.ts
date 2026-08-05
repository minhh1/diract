// app/api/precedents/letterhead/route.ts
// Company-admin-only: upload/replace/clear the firm's letterhead (one row per
// company, company_letterheads). Mirrors app/api/document-templates/upload/route.ts's
// validation shape (.docx/.doc accept, legacy .doc -> .docx via Gotenberg,
// magic-byte checks) but is company-scoped, not project-scoped. Runs the
// uploaded letterhead through lib/precedents/letterheadClassify.ts first -
// AI-classifies each paragraph's semantic role (Our Ref, date, delivery
// mode, recipient, salutation, subject, body, signoff, closing) and rewrites
// placeholders in place -- then lib/precedents/letterheadTag.ts's blind
// append still runs afterward as a safety net (it no-ops on tags that
// already exist), so a classification failure or a plain logo-only
// letterhead with nothing to classify both still end up with working
// address/content/signoff tags.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { convertDocToDocx } from "@/lib/gotenberg";
import { insertLetterTags } from "@/lib/precedents/letterheadTag";
import { extractParagraphs, classifyParagraphs, applyClassification } from "@/lib/precedents/letterheadClassify";
import { costUsd, HOSTED_MODELS } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";
import { randomUUID } from "crypto";

const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const BUCKET = "precedent-documents";
const DEFAULT_MODEL_ID = HOSTED_MODELS[0].id;

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data } = await admin
    .from("company_letterheads")
    .select("id, original_filename, address_tag_key, content_tag_key, signoff_tag_key, detected_fields, created_at, updated_at")
    .eq("company_id", companyId)
    .maybeSingle();

  return NextResponse.json({ letterhead: data || null });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can change the letterhead" }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "A .docx or .doc file is required" }, { status: 400 });

  let bytes = Buffer.from(await file.arrayBuffer());

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

  const addressTagKey = "address";
  const contentTagKey = "content";
  const signoffTagKey = "signoff";

  // Smart classification -- best-effort. A model outage, a letterhead with
  // nothing recognizable (pure logo/header art), or an unexpected shape all
  // just mean detectedFields stays empty; insertLetterTags below still runs
  // regardless.
  let classified: Buffer = bytes;
  let detectedFields: { role: string; options?: string[] }[] = [];
  try {
    const { data: aiSettings } = await admin
      .from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
    const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
    if (!(await isTokenCapReached(admin, companyId, tokenCap))) {
      const paragraphs = extractParagraphs(bytes);
      const { classifications, blankLineAfter, inputTokens, outputTokens } = await classifyParagraphs(paragraphs, DEFAULT_MODEL_ID);
      if (classifications.length) {
        const applied = applyClassification(bytes, classifications, { addressTagKey, contentTagKey, signoffTagKey }, blankLineAfter);
        classified = applied.bytes;
        detectedFields = applied.detectedFields;
      }
      if (inputTokens || outputTokens) {
        const cost = costUsd("hosted", DEFAULT_MODEL_ID, { inputTokens, outputTokens });
        await admin.from("ai_usage_events").insert({
          company_id: companyId, user_id: user.id, model_id: DEFAULT_MODEL_ID, provider: "hosted",
          input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost,
        });
      }
    }
  } catch (e) {
    console.error("Letterhead smart classification failed, falling back to plain tagging:", e);
  }

  let tagged: Buffer;
  try {
    tagged = insertLetterTags(classified, [addressTagKey, contentTagKey, signoffTagKey]);
  } catch {
    return NextResponse.json({ error: "Could not read this file as a .docx" }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("company_letterheads").select("id, storage_path").eq("company_id", companyId).maybeSingle();

  const storagePath = `letterheads/${companyId}/${randomUUID()}.docx`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, tagged, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data: letterhead, error: dbErr } = await admin.from("company_letterheads").upsert({
    id: existing?.id,
    company_id: companyId,
    storage_path: storagePath,
    original_filename: file.name,
    address_tag_key: addressTagKey,
    content_tag_key: contentTagKey,
    signoff_tag_key: signoffTagKey,
    detected_fields: detectedFields,
    uploaded_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id" }).select("id, original_filename, address_tag_key, content_tag_key, signoff_tag_key, detected_fields, created_at, updated_at").single();

  if (dbErr || !letterhead) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: dbErr?.message || "Failed to save letterhead" }, { status: 500 });
  }

  // Old file is orphaned in storage once the row points elsewhere -- clean it
  // up now that the new one is safely committed.
  if (existing?.storage_path && existing.storage_path !== storagePath) {
    await admin.storage.from(BUCKET).remove([existing.storage_path]);
  }

  return NextResponse.json({ ok: true, letterhead });
}

// Lets an admin review/correct what the classifier found -- e.g. drop a
// wrongly-detected field entirely (it just falls back to being folded into
// the {{content}} block, same as a letterhead with nothing detected at all -
// see lib/precedents/contentXml.ts) or fix up the delivery-mode wording
// without re-uploading the whole document.
export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can change the letterhead" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!Array.isArray(body?.detectedFields)) return NextResponse.json({ error: "detectedFields must be an array" }, { status: 400 });
  const detectedFields = body.detectedFields
    .filter((f: any) => typeof f?.role === "string" && f.role)
    .map((f: any) => ({
      role: f.role,
      options: Array.isArray(f.options) ? f.options.map((o: any) => String(o)).filter(Boolean) : undefined,
    }));

  const { data: letterhead, error } = await admin
    .from("company_letterheads")
    .update({ detected_fields: detectedFields, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .select("id, original_filename, address_tag_key, content_tag_key, signoff_tag_key, detected_fields, created_at, updated_at")
    .single();

  if (error || !letterhead) return NextResponse.json({ error: error?.message || "Failed to save" }, { status: 500 });
  return NextResponse.json({ ok: true, letterhead });
}

export async function DELETE() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can change the letterhead" }, { status: 403 });

  const { data: existing } = await admin
    .from("company_letterheads").select("id, storage_path").eq("company_id", companyId).maybeSingle();
  if (!existing) return NextResponse.json({ ok: true });

  await admin.storage.from(BUCKET).remove([existing.storage_path]);
  await admin.from("company_letterheads").delete().eq("id", existing.id);
  return NextResponse.json({ ok: true });
}
