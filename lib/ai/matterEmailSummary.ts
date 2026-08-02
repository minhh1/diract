// lib/ai/matterEmailSummary.ts
// One-sentence "where this matter is up to" summary for a Client Update
// Page card, generated from that matter's linked project_emails (the Gmail
// sync -- see app/api/gmail/assign/route.ts and the gmail-email-sync-*
// edge functions) PLUS any staff-appended entries in
// client_update_page_emails (see that migration's header comment -- manually
// logged emails that never went through a real Gmail sync). project_outlook_
// emails is intentionally not included: that integration has no continuous
// sync yet, only individually-assigned messages, so it wouldn't have
// meaningful volume to summarize from.
import { callHostedModel } from "./modelCall";
import { fetchCombinedMatterEmails, formatMatterEmailBlock } from "./matterEmails";

const SYSTEM_PROMPT =
  "You write a single sentence summarising where a legal matter is up to, based on its recent email " +
  "correspondence. This sentence is shown directly to the firm's client on a matter status page -- write it in " +
  "plain, neutral, factual language suitable for a client to read. Do not mention internal staff discussion, " +
  "other clients, or anything not appropriate to share externally; if the emails don't clearly show progress, " +
  "describe the most recent concrete step instead. Respond with ONLY the one sentence -- no preamble, no quotes.";

export interface MatterEmailSummary { summary: string; inputTokens: number; outputTokens: number; }

export async function summarizeMatterEmails(
  admin: any, companyId: string, modelId: string, itemId: string, projectId: string, matterName: string
): Promise<MatterEmailSummary | null> {
  const combined = await fetchCombinedMatterEmails(admin, companyId, itemId, projectId);
  if (!combined.length) return null;

  const emailBlock = formatMatterEmailBlock(combined);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Matter: ${matterName}\n\nRecent emails (most recent first):\n${emailBlock}` },
  ];

  const usage = await callHostedModel(modelId, messages);
  const summary = usage.content.trim().replace(/^["']|["']$/g, "");
  return { summary, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}
