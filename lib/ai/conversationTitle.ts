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
import { TABLE_BUILDER_MODEL_ID } from "@/lib/billing/aiModels";

// Confirmed live (2026-08-06): lib/billing/aiModels.ts's "fast, cheap"
// Llama 3.1 8B entry is stale -- Together now rejects it with
// "Unable to access non-serverless model ... create a dedicated endpoint",
// i.e. it's no longer actually in their serverless catalog despite still
// being listed here. Reusing the table-builder's own model instead, which
// is confirmed working -- the price difference is irrelevant at the ~20
// output tokens a title costs.
const TITLE_MODEL_ID = TABLE_BUILDER_MODEL_ID;

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
      // Generous for a 3-6 word answer -- DeepSeek V4 Pro is a reasoning
      // model that can spend part of its completion on an unrequested
      // chain-of-thought preamble even for a trivial prompt like this one
      // (confirmed live: max_tokens: 20 left zero room left for the actual
      // title, usage.content came back empty even though the request
      // itself succeeded).
      300
    );
    const title = usage.content.trim().replace(/^["'“”]+|["'“”]+$/g, "").replace(/[.!?]+$/, "").trim();
    if (!title) console.error("[generateConversationTitle] empty content, usage:", JSON.stringify(usage));
    return title ? title.slice(0, 60) : null;
  } catch (err) {
    console.error("[generateConversationTitle] failed:", err);
    return null;
  }
}
