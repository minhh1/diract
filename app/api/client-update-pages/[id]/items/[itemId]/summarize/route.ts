// app/api/client-update-pages/[id]/items/[itemId]/summarize/route.ts
// Staff-triggered (never automatic -- see lib/ai/matterEmailSummary.ts's
// header) generation of a matter card's one-sentence "where it's up to"
// summary, cached on the item (ai_summary) until regenerated.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";
import { summarizeMatterEmails } from "@/lib/ai/matterEmailSummary";
import { costUsd, HOSTED_MODELS } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

const DEFAULT_MODEL_ID = HOSTED_MODELS[0].id;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: item } = await admin.from("client_update_page_items").select("id, project_id").eq("id", itemId).eq("page_id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Matter not found on this page" }, { status: 404 });

  const { data: project } = await admin.from("projects").select("name").eq("id", item.project_id).maybeSingle();

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly AI token cap reached for this company" }, { status: 429 });
  }

  let result;
  try {
    result = await summarizeMatterEmails(admin, companyId, DEFAULT_MODEL_ID, item.project_id, project?.name || "this matter");
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to summarise emails" }, { status: 502 });
  }
  if (!result) return NextResponse.json({ error: "No emails are linked to this matter yet" }, { status: 404 });

  const generatedAt = new Date().toISOString();
  const { error } = await admin.from("client_update_page_items")
    .update({ ai_summary: result.summary, ai_summary_generated_at: generatedAt }).eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cost = costUsd("hosted", DEFAULT_MODEL_ID, result);
  await admin.from("ai_usage_events").insert({
    company_id: companyId, user_id: user.id, model_id: DEFAULT_MODEL_ID, provider: "hosted",
    input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
  });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "summary_generated", `Generated an AI summary for "${project?.name || "a matter"}"`);

  return NextResponse.json({ summary: result.summary, generatedAt });
}
