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

const SYSTEM_PROMPT = `You review email correspondence for a property conveyancing matter to determine the CURRENT STATUS of the settlement date -- whether both parties (the vendor and purchaser, or their respective solicitors) have clearly and mutually agreed, in writing, to change it to one specific new date, or, if not, where the negotiation currently stands.

Rules:
- A request or proposal from only ONE side that hasn't been confirmed by the other is NOT agreement -- classify it as "extension_requested".
- If staff or a party has chased up a still-unanswered request, classify it as "followed_up".
- Vague discussion of "maybe extending" without a specific date, or emails that only reconfirm the CURRENT settlement date (given to you below), are "not_yet_agreed".
- If the recent emails don't mention the settlement date at all, use "no_discussion".
- Only use "agreed" if you can point to a specific new date both sides have accepted.
- This matter may involve more than one property (e.g. a multi-lot subdivision), listed below. When more than one is listed, assume any agreement applies to ALL of them unless the emails clearly single out just one specific property (naming its address or lot number) -- in that case set "scope" to that property's address exactly as given below; otherwise set "scope" to "all". When only one property is listed, always use "scope": "all".

Respond with ONLY a JSON object, nothing else -- no markdown fences, no prose:
{"status": "agreed" | "extension_requested" | "followed_up" | "not_yet_agreed" | "no_discussion", "agreed": boolean, "newDate": "YYYY-MM-DD" or null, "scope": "all" or one property's exact address from the list below, "reasoning": "one short sentence describing the status, naming the relevant date(s) and who requested/followed up where applicable"}

"agreed" must be true only when status is "agreed"; "newDate" must be set only when status is "agreed".`;

export type SettlementStatus = "agreed" | "extension_requested" | "followed_up" | "not_yet_agreed" | "no_discussion";

export interface SettlementDateReview {
  agreed: boolean;
  newDate: string | null;
  status: SettlementStatus;
  // "all" (the common case, including single-property matters) or one
  // property's address from the `properties` list passed in, when the
  // emails clearly singled that one out -- see runSettlementDateReview's
  // fan-out logic, which is what actually applies this.
  scope: string;
  reasoning: string;
  inputTokens: number;
  outputTokens: number;
}

export async function reviewSettlementDateAgreement(
  admin: any, companyId: string, modelId: string,
  itemId: string, projectId: string, matterName: string,
  properties: { address: string | null; currentDate: string | null }[]
): Promise<SettlementDateReview | null> {
  const emails = await fetchCombinedMatterEmails(admin, companyId, itemId, projectId);
  if (!emails.length) return null;

  const emailBlock = formatMatterEmailBlock(emails);
  const propertyBlock = properties.length > 1
    ? `Properties on this matter:\n${properties.map(p => `- ${p.address || "(no address on file)"}: current settlement date ${p.currentDate || "not set"}`).join("\n")}`
    : `Current settlement date: ${properties[0]?.currentDate || "not set"}`;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Matter: ${matterName}\n${propertyBlock}\n\nRecent emails (most recent first):\n${emailBlock}`,
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
  // Not a real change if every property already sits on that date -- the
  // runner resolves exactly which property/ies this applies to, but "is
  // this actually new anywhere" is decidable here without that.
  const alreadyCurrentEverywhere = properties.length > 0 && properties.every(p => p.currentDate === parsed.newDate);
  const agreed = !!parsed.agreed && validDate && !alreadyCurrentEverywhere;
  const scope = typeof parsed.scope === "string" && parsed.scope.trim() ? parsed.scope.trim() : "all";
  const reasoning = typeof parsed.reasoning === "string" && parsed.reasoning.trim() ? parsed.reasoning.trim() : "No clear mutual agreement on a new date found.";
  const VALID_STATUSES: SettlementStatus[] = ["agreed", "extension_requested", "followed_up", "not_yet_agreed", "no_discussion"];
  // Falls back to inferring from `agreed` alone if the model's own `status`
  // is missing or malformed, rather than trusting an unvalidated string --
  // "not_yet_agreed" is the safe default for anything else, same spirit as
  // `agreed` itself defaulting to false on a bad response.
  const status: SettlementStatus = VALID_STATUSES.includes(parsed.status) ? parsed.status : agreed ? "agreed" : "not_yet_agreed";

  return {
    agreed,
    newDate: agreed ? parsed.newDate : null,
    status: agreed ? "agreed" : status,
    scope,
    reasoning,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}
