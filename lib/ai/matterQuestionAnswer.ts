// lib/ai/matterQuestionAnswer.ts
// Answers a free-form question about a conveyancing matter -- e.g. "did the
// vendor reply about our amendment requests?" -- asked by either staff or,
// if the page allows it (see client_update_pages.ai_ask_enabled), the
// client viewing the page themselves. Shares the same email fetch as
// lib/ai/matterSettlementDateReview.ts and lib/ai/matterEmailSummary.ts so
// every AI feature over a matter's correspondence reads the same data.
// Read-only -- unlike the settlement-date review, this never writes
// anything back, just answers.
import { callHostedModel } from "./modelCall";
import { fetchCombinedMatterEmails, formatMatterEmailBlock } from "./matterEmails";

// How much context the AI is given, staff-configured per page
// (client_update_pages.ai_ask_scope) independent of who's asking --
// everything at every scope level is already visible to whoever's looking
// at the page, so this is a cost/relevance dial, not a privacy boundary.
export type AskScope = "emails" | "emails_notes" | "all";

export interface MatterNoteForAi { body: string; source: "staff" | "client"; noteDate: string; }
export interface MatterFieldForAi { label: string; value: string; }

const SYSTEM_PROMPT = `You answer a specific question about a property conveyancing matter, using ONLY the context given below. Be direct and concise -- two or three sentences at most, naming dates and who said what where relevant. If the context doesn't contain enough information to answer confidently, say so plainly rather than guessing or inventing detail.`;

export async function answerMatterQuestion(
  admin: any, companyId: string, modelId: string,
  itemId: string, projectId: string, matterName: string, question: string,
  scope: AskScope, notes: MatterNoteForAi[], fields: MatterFieldForAi[]
): Promise<{ answer: string; inputTokens: number; outputTokens: number } | null> {
  const emails = await fetchCombinedMatterEmails(admin, companyId, itemId, projectId);
  if (!emails.length && !notes.length && !fields.length) return null;

  const sections = [`Matter: ${matterName}`];
  if (emails.length) sections.push(`Email correspondence (most recent first):\n${formatMatterEmailBlock(emails)}`);
  if (notes.length) sections.push(`Notes (most recent first):\n${notes.map(n => `[${n.noteDate}] (${n.source}) ${n.body}`).join("\n")}`);
  if (fields.length) sections.push(`Matter details:\n${fields.map(f => `${f.label}: ${f.value}`).join("\n")}`);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${sections.join("\n\n")}\n\nQuestion: ${question}` },
  ];

  const usage = await callHostedModel(modelId, messages);
  const answer = usage.content.trim() || "I couldn't come up with an answer for that.";
  return { answer, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}
