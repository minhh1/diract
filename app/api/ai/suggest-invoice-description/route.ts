// app/api/ai/suggest-invoice-description/route.ts
// One-shot draft of the Detailed invoice template's "Professional Fees
// Description" -- shown on page 1 in place of the itemised Professional
// Fees table when a template turns that table off (see
// generateDetailedInvoicePdf.ts / CreateInvoiceModal.tsx). Unlike
// app/api/ai/rewrite-text/route.ts (which polishes text the viewer already
// typed), this DRAFTS new text from the matter name + the selected fee
// entries' own descriptions -- there's nothing typed yet for a brand new
// invoice. Same model-calling/token-cap/usage-logging plumbing as
// rewrite-text, so this counts against the same company-wide
// monthly_token_cap and ai_usage_events accounting.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { callHostedModel } from "@/lib/ai/modelCall";
import { HOSTED_MODELS, costUsd } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

const SUGGEST_MODEL_ID = HOSTED_MODELS[0].id;

const SYSTEM_PROMPT = `You draft the single summary description of professional services rendered on a client-facing legal tax invoice, in place of an itemised time-entry breakdown. Rules:
- Output ONLY the description text, nothing else -- no preamble, no quotes, no explanation.
- One concise paragraph (1-3 sentences), not a list.
- Base it ONLY on the matter name and fee entry descriptions given -- never invent facts, names, dates or amounts not present in the input.
- Write in the standard style of a legal invoice narrative, e.g. "For professional services rendered in connection with...".
- If the fee entries cover clearly distinct kinds of work, summarise the main themes rather than listing every entry.
- Never use an em dash, a double hyphen ("--"), or a spaced hyphen (" - ") as a separator. Use a comma, colon, period, or just restructure the sentence instead.`;

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  const body = await req.json().catch(() => null);
  const matterName: string | undefined = body?.matterName;
  const feeDescriptions: string[] = Array.isArray(body?.feeDescriptions) ? body.feeDescriptions.filter((d: any) => typeof d === 'string' && d.trim()) : [];
  if (!feeDescriptions.length) return NextResponse.json({ error: "At least one fee entry description is required" }, { status: 400 });

  const { data: settings } = await admin
    .from("ai_chat_settings")
    .select("monthly_token_cap")
    .eq("company_id", companyId)
    .maybeSingle();
  const tokenCap = settings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly AI token cap reached for this company" }, { status: 429 });
  }

  const userContent = [
    matterName ? `Matter: ${matterName}` : null,
    `Fee entries:\n${feeDescriptions.map(d => `- ${d}`).join('\n')}`,
  ].filter(Boolean).join('\n\n');

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  let usage;
  try {
    usage = await callHostedModel(SUGGEST_MODEL_ID, messages);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  const cost = costUsd("hosted", SUGGEST_MODEL_ID, usage);
  await admin.from("ai_usage_events").insert({
    company_id: companyId,
    user_id: user.id,
    model_id: SUGGEST_MODEL_ID,
    provider: "hosted",
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cost_usd: cost,
  });

  return NextResponse.json({ text: usage.content.trim() });
}
