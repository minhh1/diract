// lib/precedents/redetectBodyTemplate.ts
// Shared by the examples upload and delete routes (app/api/precedents/[id]/body-template/examples/**):
// whenever the set of example documents for a precedent changes, every
// stored example is downloaded and re-run through detectBodyTemplate()
// together (not incrementally diffed against the old template), since the
// number of examples for one precedent is small (a handful of past letters)
// and re-detection from scratch is simpler and more consistent than trying
// to patch an existing template.
import { extractParagraphs } from "@/lib/precedents/letterheadClassify";
import { detectBodyTemplate } from "@/lib/precedents/bodyTemplateDetect";
import { costUsd, HOSTED_MODELS } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

const BUCKET = "precedent-documents";
const DEFAULT_MODEL_ID = HOSTED_MODELS[0].id;

function paragraphsToText(paragraphs: { text: string }[]): string {
  return paragraphs.map(p => p.text).filter(Boolean).join("\n\n");
}

// Downloads every stored example for this precedent, re-runs detection over
// all of them, and saves the result (or clears it, if none remain) --
// returns the resulting template for the caller to respond with. If the
// company's monthly AI token cap is reached, this is a no-op that leaves
// whatever template already existed untouched (the cap is a temporary
// condition, not a reason to wipe out an already-detected template).
export async function redetectBodyTemplate(admin: any, precedentId: string, companyId: string, userId: string) {
  const { data: examples } = await admin
    .from("precedent_body_examples").select("storage_path").eq("precedent_id", precedentId);

  if (!examples?.length) {
    await admin.from("precedents").update({ body_template: null, updated_at: new Date().toISOString() }).eq("id", precedentId);
    return null;
  }

  const { data: aiSettings } = await admin
    .from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    const { data: precedent } = await admin.from("precedents").select("body_template").eq("id", precedentId).maybeSingle();
    return precedent?.body_template || null;
  }

  const exampleTexts: string[] = [];
  for (const ex of examples) {
    const { data: fileData } = await admin.storage.from(BUCKET).download(ex.storage_path);
    if (!fileData) continue;
    const bytes = Buffer.from(await fileData.arrayBuffer());
    exampleTexts.push(paragraphsToText(extractParagraphs(bytes)));
  }

  const { template, inputTokens, outputTokens } = await detectBodyTemplate(exampleTexts, DEFAULT_MODEL_ID);

  if (inputTokens || outputTokens) {
    const cost = costUsd("hosted", DEFAULT_MODEL_ID, { inputTokens, outputTokens });
    await admin.from("ai_usage_events").insert({
      company_id: companyId, user_id: userId, model_id: DEFAULT_MODEL_ID, provider: "hosted",
      input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost,
    });
  }

  await admin.from("precedents").update({ body_template: template, updated_at: new Date().toISOString() }).eq("id", precedentId);
  return template;
}
