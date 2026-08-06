// lib/ai/matterFieldReview.ts
// Reviews a conveyancing matter's email correspondence for clear, mutual
// agreement on a NEW value for one specific field -- Settlement Date,
// Purchase Price, Initial Deposit, or any other project_property-sourced
// field on the matter (see isReviewableFieldType below for which field
// types this supports). Triggered either by staff (a "Review emails"
// button on that field) or the bulk "check every field" action (see
// lib/clientUpdatePageFieldReview.ts, the shared runner both paths call so
// they can't behave differently). Deliberately conservative: a one-sided
// proposal, a vague discussion, or a reconfirmation of the existing value
// are all treated as "no change", since a wrong auto-applied value on a
// real property matter is a real, costly mistake -- see that runner's own
// header comment for how the applied change is still flagged for a human
// to confirm afterwards, rather than trusting the model's judgement alone.
// Started life as matterSettlementDateReview.ts (date-only); generalized to
// any field once staff asked for the same behaviour on Purchase Price etc.
import { callHostedModel } from "./modelCall";
import { fetchCombinedMatterEmails, formatMatterEmailBlock } from "./matterEmails";

export type FieldReviewStatus = "agreed" | "change_requested" | "followed_up" | "not_yet_agreed" | "no_discussion";

// Which project_property_values column a field's agreed-upon value gets
// written to, and how the AI's raw text answer is validated before that --
// see lib/clientUpdatePageFieldReview.ts's writeAgreedValue. Relation-typed
// fields (entity/property/select/table_relation) are deliberately excluded
// -- free-text AI output can't safely resolve to a valid option/record id,
// see isReviewableFieldType.
export type FieldValueKind = "date" | "currency" | "number" | "text";

export function isReviewableFieldType(fieldType: string | undefined | null): boolean {
  return !fieldType || fieldType === "text" || fieldType === "date" || fieldType === "currency" || fieldType === "number";
}

export function valueKindForFieldType(fieldType: string | undefined | null): FieldValueKind {
  if (fieldType === "date") return "date";
  if (fieldType === "currency" || fieldType === "number") return "currency";
  return "text";
}

function formatCurrentValue(kind: FieldValueKind, raw: string | null): string {
  if (raw == null || raw === "") return "not set";
  if (kind === "currency") return `$${raw}`;
  return raw;
}

function systemPrompt(fieldLabel: string, kind: FieldValueKind): string {
  const valueShape = kind === "date" ? '"YYYY-MM-DD"' : kind === "currency" ? "a plain number, no currency symbol or commas (e.g. 750000 or 750000.50)" : "a short plain-text value";
  return `You review email correspondence for a property conveyancing matter to determine the CURRENT STATUS of "${fieldLabel}" -- whether both parties (the vendor and purchaser, or their respective solicitors) have clearly and mutually agreed, in writing, to change it to one specific new value, or, if not, where the negotiation currently stands.

Rules:
- A request or proposal from only ONE side that hasn't been confirmed by the other is NOT agreement -- classify it as "change_requested".
- If staff or a party has chased up a still-unanswered request, classify it as "followed_up".
- Vague discussion without a specific new value, or emails that only reconfirm the CURRENT value (given to you below), are "not_yet_agreed".
- If the recent emails don't mention "${fieldLabel}" at all, use "no_discussion".
- Only use "agreed" if you can point to a specific new value both sides have accepted.
- This matter may involve more than one property (e.g. a multi-lot subdivision), listed below. When more than one is listed, assume any agreement applies to ALL of them unless the emails clearly single out just one specific property (naming its address or lot number) -- in that case set "scope" to that property's address exactly as given below; otherwise set "scope" to "all". When only one property is listed, always use "scope": "all".

Respond with ONLY a JSON object, nothing else -- no markdown fences, no prose:
{"status": "agreed" | "change_requested" | "followed_up" | "not_yet_agreed" | "no_discussion", "agreed": boolean, "newValue": ${valueShape} or null, "scope": "all" or one property's exact address from the list below, "reasoning": "one short sentence describing the status, naming the relevant value(s) and who requested/followed up where applicable"}

"agreed" must be true only when status is "agreed"; "newValue" must be set only when status is "agreed".`;
}

export interface FieldReview {
  agreed: boolean;
  newValue: string | null;
  status: FieldReviewStatus;
  scope: string;
  reasoning: string;
  inputTokens: number;
  outputTokens: number;
}

function validateValue(kind: FieldValueKind, raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const trimmed = raw.trim();
  if (kind === "date") return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  if (kind === "currency") {
    const cleaned = trimmed.replace(/[$,\s]/g, "");
    return /^\d+(\.\d+)?$/.test(cleaned) ? cleaned : null;
  }
  return trimmed;
}

export async function reviewFieldAgreement(
  admin: any, companyId: string, modelId: string,
  itemId: string, projectId: string, matterName: string,
  fieldLabel: string, fieldType: string | undefined,
  properties: { address: string | null; currentValue: string | null }[]
): Promise<FieldReview | null> {
  const emails = await fetchCombinedMatterEmails(admin, companyId, itemId, projectId);
  if (!emails.length) return null;

  const kind = valueKindForFieldType(fieldType);
  const emailBlock = formatMatterEmailBlock(emails);
  const propertyBlock = properties.length > 1
    ? `Properties on this matter:\n${properties.map(p => `- ${p.address || "(no address on file)"}: current ${fieldLabel} ${formatCurrentValue(kind, p.currentValue)}`).join("\n")}`
    : `Current ${fieldLabel}: ${formatCurrentValue(kind, properties[0]?.currentValue ?? null)}`;
  const messages = [
    { role: "system", content: systemPrompt(fieldLabel, kind) },
    { role: "user", content: `Matter: ${matterName}\n${propertyBlock}\n\nRecent emails (most recent first):\n${emailBlock}` },
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

  const validValue = validateValue(kind, parsed.newValue);
  // Not a real change if every property already sits on that value -- the
  // runner resolves exactly which property/ies this applies to, but "is
  // this actually new anywhere" is decidable here without that.
  const alreadyCurrentEverywhere = properties.length > 0 && properties.every(p => (p.currentValue ?? null) === validValue);
  const agreed = !!parsed.agreed && validValue != null && !alreadyCurrentEverywhere;
  const scope = typeof parsed.scope === "string" && parsed.scope.trim() ? parsed.scope.trim() : "all";
  const reasoning = typeof parsed.reasoning === "string" && parsed.reasoning.trim() ? parsed.reasoning.trim() : "No clear mutual agreement on a new value found.";
  const VALID_STATUSES: FieldReviewStatus[] = ["agreed", "change_requested", "followed_up", "not_yet_agreed", "no_discussion"];
  // Falls back to inferring from `agreed` alone if the model's own `status`
  // is missing or malformed, rather than trusting an unvalidated string --
  // "not_yet_agreed" is the safe default for anything else, same spirit as
  // `agreed` itself defaulting to false on a bad response.
  const status: FieldReviewStatus = VALID_STATUSES.includes(parsed.status) ? parsed.status : agreed ? "agreed" : "not_yet_agreed";

  return {
    agreed,
    newValue: agreed ? validValue : null,
    status: agreed ? "agreed" : status,
    scope,
    reasoning,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}
