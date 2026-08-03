// lib/clientUpdatePageAskQuestion.ts
// Shared by both the staff-authenticated and public (PIN-gated) "ask
// anything about this matter" routes -- lets whoever's looking at a matter
// ask a free-form question and get a direct answer grounded in the
// matter's own correspondence and, depending on the page's configured
// ai_ask_scope, its notes and currently-displayed field values too.
// Read-only: no writes, no flags, no logChange -- just an AI usage event
// for billing, same as the other AI features here.
import { HOSTED_MODELS, costUsd } from "@/lib/billing/aiModels";
import { answerMatterQuestion, type AskScope, type MatterFieldForAi } from "@/lib/ai/matterQuestionAnswer";

// HOSTED_MODELS[0], not the cheaper [1] -- see rewrite-text/route.ts's note
// on why this codebase avoids Together's smaller 3.1-8B-Turbo model.
const MODEL_ID = HOSTED_MODELS[0].id;

export async function runMatterQuestion(
  admin: any, companyId: string, userId: string | null,
  itemId: string, projectId: string, matterName: string,
  question: string, scope: AskScope,
  // The board's own currently-rendered field values, supplied by the
  // caller rather than re-resolved here -- at scope 'all' this is exactly
  // what's already on screen for whoever's asking, so there's nothing to
  // look up that they don't already see. Capped defensively against an
  // oversized prompt driving up AI cost, not as a trust boundary.
  clientFields: MatterFieldForAi[]
): Promise<{ answer: string } | { error: string }> {
  let notes: { body: string; source: "staff" | "client"; noteDate: string }[] = [];
  if (scope !== "emails") {
    const { data } = await admin.from("client_update_page_notes")
      .select("body, source, note_date").eq("item_id", itemId)
      .order("note_date", { ascending: false }).limit(30);
    notes = (data || []).map((n: any) => ({ body: n.body, source: n.source, noteDate: n.note_date }));
  }
  const fields = scope === "all" ? clientFields.slice(0, 40).map(f => ({ label: f.label, value: String(f.value ?? "").slice(0, 300) })) : [];

  const result = await answerMatterQuestion(admin, companyId, MODEL_ID, itemId, projectId, matterName, question, scope, notes, fields);
  if (!result) return { error: "No information available for this matter yet." };

  const cost = costUsd("hosted", MODEL_ID, result);
  await admin.from("ai_usage_events").insert({
    company_id: companyId, user_id: userId, model_id: MODEL_ID, provider: "hosted",
    input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
  });

  return { answer: result.answer };
}
