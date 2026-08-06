// lib/ai/conversationTitle.ts
// Turns a user's first message in an Ask AI conversation into a short
// sidebar title -- e.g. "I run a small landscaping company. I want to
// track clients, quotes, and jobs..." becomes "Landscaping: Clients,
// Quotes & Jobs". Used both right after a brand-new conversation's first
// turn finishes (app/api/ai/chat/route.ts's runJob) and lazily as a
// backfill for older conversations that predate this feature (see
// app/api/ai/conversations/route.ts's GET) -- either way the result is
// written back to ai_conversations.title so the model only ever gets
// called once per conversation.
import { callHostedModel } from "@/lib/ai/modelCall";

// Llama 3.1 8B ("fast, cheap" in lib/billing/aiModels.ts's own catalog) --
// summarizing one sentence into a few words doesn't need the table-
// builder's much pricier tool-calling model.
const TITLE_MODEL_ID = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";

const TITLE_SYSTEM_PROMPT = "Summarize the user's message as a short conversation title, 3 to 6 words, for a sidebar list. Describe what they want, not a greeting. Plain text only -- no quotes, no trailing punctuation, no markdown.";

// Best-effort: returns null on any failure (rate limit, empty response,
// ...) rather than throwing, since a missing title just falls back to the
// caller's own truncated-first-message display -- never worth failing the
// whole request over.
export async function generateConversationTitle(firstMessage: string): Promise<string | null> {
  try {
    const usage = await callHostedModel(
      TITLE_MODEL_ID,
      [
        { role: "system", content: TITLE_SYSTEM_PROMPT },
        { role: "user", content: firstMessage.slice(0, 2000) },
      ],
      undefined,
      20
    );
    const title = usage.content.trim().replace(/^["'“”]+|["'“”]+$/g, "").replace(/[.!?]+$/, "").trim();
    return title ? title.slice(0, 60) : null;
  } catch {
    return null;
  }
}
