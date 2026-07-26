// app/api/ai/rewrite-text/route.ts
// One-shot "make this more professional" rewrite, backing MyTasksButtonWidget's
// "Rewrite with AI" action (turning a task's raw name/notes into a
// billing-narrative-style time-entry description). Deliberately NOT the RAG
// chat pipeline (app/api/ai/chat/route.ts) -- no retrieval, no conversation
// history, non-streaming (the caller just wants the finished text, not
// token-by-token deltas) -- but shares its exact model-calling/token-cap/
// usage-logging plumbing so this counts against the same company-wide
// monthly_token_cap and shows up in the same ai_usage_events accounting
// rather than being an unmetered side door.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { callHostedModel } from "@/lib/ai/modelCall";
import { HOSTED_MODELS, costUsd } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

// Always a hosted model, never the company's own chat provider preference
// (self-hosted Ollama models vary too much in instruction-following quality
// to build a fixed-shape rewrite on top of -- see modelCall.ts's identical
// reasoning for skipping self-hosted in the Teams bot's tool-calling path).
// Specifically HOSTED_MODELS[0] -- the same model app/api/ai/models/route.ts
// hands the chat page as ITS default (models[0].id, picked automatically on
// load) -- rather than a separately hand-picked id: Together periodically
// retires a model from serverless (pay-per-token) availability onto
// dedicated-endpoint-only (confirmed live: the smaller 3.1-8B-Turbo this
// used to point at started 400ing with "model_not_available" even though
// it's still listed in the catalog), and whichever model the chat feature
// actually exercises day-to-day is the one most likely to still be live.
const REWRITE_MODEL_ID = HOSTED_MODELS[0].id;

const SYSTEM_PROMPT = `You rewrite short, informal work-task notes into a single, concise, professional time-entry description suitable for a client-facing legal invoice. Rules:
- Output ONLY the rewritten description text, nothing else -- no preamble, no quotes, no explanation.
- One sentence or a short clause, not a paragraph.
- Keep every concrete fact (names, amounts, dates, document types) exactly as given -- never invent details.
- Write in past tense, third person implied (e.g. "Reviewed contract and provided advice regarding..."), the standard style of a billing narrative.
- If the input is already professional and concise, return it close to unchanged.`;

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  const body = await req.json().catch(() => null);
  const text: string | undefined = body?.text;
  if (!text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const { data: settings } = await admin
    .from("ai_chat_settings")
    .select("monthly_token_cap")
    .eq("company_id", companyId)
    .maybeSingle();
  const tokenCap = settings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly AI token cap reached for this company" }, { status: 429 });
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text.trim() },
  ];

  let usage;
  try {
    usage = await callHostedModel(REWRITE_MODEL_ID, messages);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  const cost = costUsd("hosted", REWRITE_MODEL_ID, usage);
  await admin.from("ai_usage_events").insert({
    company_id: companyId,
    user_id: user.id,
    model_id: REWRITE_MODEL_ID,
    provider: "hosted",
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cost_usd: cost,
  });

  return NextResponse.json({ text: usage.content.trim() });
}
