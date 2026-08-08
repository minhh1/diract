// lib/ai/pageGenerate.ts
// Drafts a company_pages row's content from a short prompt (see
// app/api/pages/route.ts's POST and app/api/pages/[id]/generate/route.ts).
// Single-shot: one tool (set_page_blocks, lib/ai/pageBuilderTools.ts),
// expected to be called exactly once with the whole page. Whatever comes
// back is passed through lib/pages/validateBlocks.ts regardless of whether
// the model actually honored the tool schema -- that function, not this
// one, is the real security boundary for this feature.
import { callTogetherModelWithTools } from "./modelCall";
import { PAGE_BUILDER_TOOLS } from "./pageBuilderTools";
import { validateBlocks } from "@/lib/pages/validateBlocks";
import type { PageBlock } from "@/lib/pages/blockTypes";
import { TABLE_BUILDER_MODEL_ID } from "@/lib/billing/aiModels";

const SYSTEM_PROMPT =
  "You design the content of a single web page for a law firm, from a short instruction. Call set_page_blocks " +
  "exactly once with the page's full content as an ordered list of blocks. Use a sensible structure: usually a " +
  "heading near the top, paragraphs for explanatory text, a list for enumerated points, a button only when there's " +
  "a clear call to action and only with a real URL the user actually gave you -- never invent one. Keep prose " +
  "professional and concise, no meta-commentary about the page itself. " +
  "Never use an em dash, a double hyphen (\"--\"), or a spaced hyphen (\" - \") as a separator -- use a comma, colon, period, or restructure the sentence instead.";

export interface PageGenerateResult {
  blocks: PageBlock[];
  inputTokens: number;
  outputTokens: number;
}

export async function generatePageBlocks(title: string, prompt: string): Promise<PageGenerateResult> {
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
    SYSTEM_PROMPT,
    [{ role: "user", content: `Page title: ${title}\n\nInstruction: ${prompt}` }],
    PAGE_BUILDER_TOOLS,
    executeTool,
    undefined,
    undefined,
    undefined,
    3
  );

  return {
    blocks: validateBlocks(captured),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
