// lib/ai/precedentDraft.ts
// Drafts the subject + body for an issued precedent document (see
// app/api/precedents/[id]/issue/route.ts) from a staff member's short
// natural-language prompt. Modeled directly on lib/ai/fileDraft.ts's
// draftFileContent (same grounding-context + system-prompt + one-shot-call
// shape) but returns both a suggested subject line AND the body from a
// single call, and unlike fileDraft.ts also returns token usage — the issue
// route needs it to log ai_usage_events / respect monthly_token_cap the same
// way app/api/ai/rewrite-text/route.ts does.
import { retrieveGroundingContext } from "./retrieval";
import { callHostedModel } from "./modelCall";

const BASE_SYSTEM_PROMPT =
  "You draft formal business correspondence, based on a staff member's instructions. " +
  "Write clear, professional prose appropriate for a client-facing document -- no meta-commentary, no markdown. " +
  "Respond in EXACTLY this format, nothing before or after it:\n" +
  "SUBJECT: <a short subject line for this letter>\n\n" +
  "<the full body of the letter, starting with the salutation's next line -- do NOT include a salutation " +
  "('Dear ...') or a signoff/signature block, those are added separately>";

const SUBJECT_LINE_RE = /^SUBJECT:\s*(.+?)\s*\n+([\s\S]*)$/i;

export interface PrecedentDraft {
  subject: string;
  body: string;
  inputTokens: number;
  outputTokens: number;
}

export async function draftPrecedentContent(
  admin: any,
  companyId: string,
  modelId: string,
  sourceTypes: string[],
  precedentName: string,
  aiInstructions: string | null,
  prompt: string,
  contextLabel?: string | null
): Promise<PrecedentDraft> {
  const { contextBlock } = await retrieveGroundingContext(admin, companyId, prompt, sourceTypes, null);

  const messages = [
    { role: "system", content: BASE_SYSTEM_PROMPT },
    { role: "system", content: `Document type: ${precedentName}` },
    ...(aiInstructions ? [{ role: "system", content: `Drafting instructions for this document type: ${aiInstructions}` }] : []),
    ...(contextBlock ? [{ role: "system", content: `Relevant company context (use if helpful, don't force it in):\n${contextBlock}` }] : []),
    ...(contextLabel ? [{ role: "system", content: `This relates to: ${contextLabel}` }] : []),
    { role: "user", content: prompt },
  ];

  const usage = await callHostedModel(modelId, messages);
  const match = usage.content.trim().match(SUBJECT_LINE_RE);
  const subject = match ? match[1].trim() : precedentName;
  const body = (match ? match[2] : usage.content).trim();

  return { subject, body, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}
