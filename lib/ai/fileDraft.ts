// lib/ai/fileDraft.ts
// Drafts the actual content for a bot-created/updated OneDrive file (see
// lib/ai/fileActions.ts, app/api/teams/bot/[companyId]/route.ts,
// app/api/whatsapp/webhook/[companyId]/route.ts) -- a separate model call
// from the tool-calling/extraction ones, since drafting real document text
// isn't a small structured value, it's the whole point of the request.
import { retrieveGroundingContext } from "./retrieval";
import { callHostedModel, callSelfHostedModel } from "./modelCall";

const DRAFT_SYSTEM_PROMPT =
  "You are drafting a document based on the user's instructions. Write clear, professional content. Output ONLY the document's content itself -- no preamble like \"Here's the document:\", no meta-commentary, no markdown code fences.";

export async function draftFileContent(
  admin: any,
  companyId: string,
  modelId: string,
  ollamaUrl: string | null,
  sourceTypes: string[],
  instructions: string,
  contextLabel?: string | null
): Promise<string> {
  const { contextBlock } = await retrieveGroundingContext(admin, companyId, instructions, sourceTypes, ollamaUrl);

  const messages = [
    { role: "system", content: DRAFT_SYSTEM_PROMPT },
    ...(contextBlock ? [{ role: "system", content: `Relevant company context (use if helpful, don't force it in):\n${contextBlock}` }] : []),
    ...(contextLabel ? [{ role: "system", content: `This relates to: ${contextLabel}` }] : []),
    { role: "user", content: instructions },
  ];

  const usage = ollamaUrl ? await callSelfHostedModel(ollamaUrl, modelId, messages) : await callHostedModel(modelId, messages);
  return usage.content.trim();
}
