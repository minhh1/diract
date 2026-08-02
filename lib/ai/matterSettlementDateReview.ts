// lib/ai/matterSettlementDateReview.ts
// Reviews a conveyancing matter's email correspondence for clear, mutual
// agreement on a NEW settlement date -- triggered either by staff (a
// "Review emails" button on the matter) or automatically whenever a new
// email is logged against the matter (see
// lib/clientUpdatePageSettlementReview.ts, the shared runner both paths
// call). Deliberately conservative: a one-sided proposal, a vague
// discussion, or a reconfirmation of the existing date are all treated as
// "no change", since a wrong auto-applied settlement date on a real
// property matter is a real, costly mistake -- see that runner's own
// header comment for how the applied change is still flagged for a human
// to confirm afterwards, rather than trusting the model's judgement alone.
import { callHostedModel } from "./modelCall";
import { fetchCombinedMatterEmails, formatMatterEmailBlock } from "./matterEmails";

const SYSTEM_PROMPT = `You review email correspondence for a property conveyancing matter to determine whether BOTH parties (the vendor and purchaser, or their respective solicitors) have clearly and mutually agreed, in writing, to change the matter's settlement date to one specific new date.

Rules:
- A request or proposal from only ONE side that hasn't been confirmed by the other is NOT agreement.
- Vague discussion of "maybe extending" without a specific date is NOT agreement.
- Emails that only reconfirm the CURRENT settlement date (given to you below) are NOT a change.
- Only answer "agreed" if you can point to a specific new date both sides have accepted.

Respond with ONLY a JSON object, nothing else -- no markdown fences, no prose:
{"agreed": boolean, "newDate": "YYYY-MM-DD" or null, "reasoning": "one short sentence explaining the decision"}`;

export interface SettlementDateReview {
  agreed: boolean;
  newDate: string | null;
  reasoning: string;
  inputTokens: number;
  outputTokens: number;
}

export async function reviewSettlementDateAgreement(
  admin: any, companyId: string, modelId: string,
  itemId: string, projectId: string, matterName: string, currentDate: string | null
): Promise<SettlementDateReview | null> {
  const emails = await fetchCombinedMatterEmails(admin, companyId, itemId, projectId);
  if (!emails.length) return null;

  const emailBlock = formatMatterEmailBlock(emails);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Matter: ${matterName}\nCurrent settlement date: ${currentDate || "not set"}\n\nRecent emails (most recent first):\n${emailBlock}`,
    },
  ];

  const usage = await callHostedModel(modelId, messages);
  let parsed: any = {};
  try {
    const match = usage.content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : usage.content);
  } catch {
    // Falls through -- agreed stays false below, same "degrade to no
    // action" behaviour a malformed response should have.
  }

  const validDate = typeof parsed.newDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.newDate);
  const agreed = !!parsed.agreed && validDate && parsed.newDate !== currentDate;
  const reasoning = typeof parsed.reasoning === "string" && parsed.reasoning.trim() ? parsed.reasoning.trim() : "No clear mutual agreement on a new date found.";

  return {
    agreed,
    newDate: agreed ? parsed.newDate : null,
    reasoning,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}
