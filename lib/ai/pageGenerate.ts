// lib/ai/pageGenerate.ts
// Drafts a company_pages row's content from a short back-and-forth (see
// app/api/pages/[id]/generate/route.ts). Conversational, not single-shot:
// callTogetherModelWithTools (lib/ai/modelCall.ts) already calls with
// tool_choice "auto", so the model is free to reply in plain text instead
// of calling set_page_blocks (lib/ai/pageBuilderTools.ts) -- that's how it
// asks a clarifying question or lays out options instead of guessing. The
// caller (the generate route) is responsible for showing `message` to the
// user and, if `blocks` came back empty, sending their reply back in as the
// next turn of `history` rather than treating it as a failure.
//
// Whatever the model returns via set_page_blocks is passed through
// lib/pages/validateBlocks.ts regardless of whether it actually honored the
// tool schema -- that function, not this one, is the real security boundary
// for this feature.
import { callTogetherModelWithTools } from "./modelCall";
import { PAGE_BUILDER_TOOLS } from "./pageBuilderTools";
import { validateBlocks } from "@/lib/pages/validateBlocks";
import type { PageBlock } from "@/lib/pages/blockTypes";
import { TABLE_BUILDER_MODEL_ID } from "@/lib/billing/aiModels";

const SYSTEM_PROMPT =
  "You design the content of a single web page for a law firm, working with a staff member in a short back-and-forth. " +
  "When their request is clear enough to draft well (you know roughly what the page should say and who it's for), " +
  "call set_page_blocks with the page's full content as an ordered list of blocks -- usually a heading near the top, " +
  "paragraphs for explanatory text, a list for enumerated points, a button only when there's a clear call to action " +
  "and only with a real URL they actually gave you, never an invented one -- then briefly confirm what you drafted " +
  "in a short reply. " +
  "When it's genuinely ambiguous -- the audience, tone, or scope is unclear, or a detail you'd need to draft well is " +
  "missing -- do NOT call set_page_blocks. Instead ask exactly one focused clarifying question in plain text. If " +
  "there's more than one reasonable direction, name 2 or 3 concrete options and explicitly recommend the one you " +
  "think fits best with a short reason, rather than listing them neutrally, then invite them to confirm or redirect " +
  "-- for example: 'I'd suggest a warm, client-facing tone since this is for prospective clients -- want me to go " +
  "with that, or something more formal?' Never call set_page_blocks and ask a question in the same turn. " +
  "Keep prose professional and concise, no meta-commentary about the page itself. " +
  "Never use an em dash, a double hyphen (\"--\"), or a spaced hyphen (\" - \") as a separator -- use a comma, colon, period, or restructure the sentence instead.";

export interface PageChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PageGenerateResult {
  blocks: PageBlock[];
  message: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generatePageBlocks(title: string, history: PageChatMessage[]): Promise<PageGenerateResult> {
  let captured: unknown = null;

  const executeTool = async (name: string, input: Record<string, unknown>) => {
    if (name === "set_page_blocks") {
      captured = input.blocks;
      return { content: "Blocks set." };
    }
    return { content: `Unknown tool: ${name}`, isError: true };
  };

  const result = await callTogetherModelWithTools(
    TABLE_BUILDER_MODEL_ID,
    `${SYSTEM_PROMPT}\n\nPage title: ${title}`,
    history,
    PAGE_BUILDER_TOOLS,
    executeTool,
    undefined,
    undefined,
    undefined,
    3
  );

  return {
    blocks: validateBlocks(captured),
    message: (result.content || "").trim(),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
