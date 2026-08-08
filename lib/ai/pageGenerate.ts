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
import { PAGE_BUILDER_TOOLS, executePageBuilderTool } from "./pageBuilderTools";
import { validateBlocks, stripBannedSeparators } from "@/lib/pages/validateBlocks";
import type { PageBlock } from "@/lib/pages/blockTypes";
import { TABLE_BUILDER_MODEL_ID } from "@/lib/billing/aiModels";

// The system prompt tells the model never to use em dashes/double hyphens or
// markdown list markers in its own chat replies (unlike block text, this
// string is shown to the user completely as-is, never re-typed by them into
// a block) -- but a prompt instruction is a strong hint, not a guarantee, so
// this is the deterministic fallback, same "enforce it, don't just ask"
// reasoning as stripBannedSeparators itself. Only strips a leading "- "/"1. "
// at the START of a line (an actual list marker), never a real mid-sentence
// hyphen or a number followed by a period elsewhere in a sentence.
function sanitizeReply(text: string): string {
  return stripBannedSeparators(text)
    .replace(/^[ \t]*[-*]\s+/gm, "")
    .replace(/^[ \t]*\d+\.\s+/gm, "")
    .trim();
}

const BASE_SYSTEM_PROMPT =
  "You design the content of a single web page for a law firm, working with a staff member in a short back-and-forth. " +
  "When their request is clear enough to draft well (you know roughly what the page should say and who it's for), " +
  "call set_page_blocks with the page's full content as an ordered list of blocks, then briefly confirm what you " +
  "drafted in a short reply -- one or two plain sentences, not a bulleted recap of every block. " +
  "When it's genuinely ambiguous -- the audience, tone, or scope is unclear, or a detail you'd need to draft well is " +
  "missing -- do NOT call set_page_blocks. Instead ask exactly one focused clarifying question in plain text. If " +
  "there's more than one reasonable direction, name 2 or 3 concrete options and explicitly recommend the one you " +
  "think fits best with a short reason, rather than listing them neutrally, then invite them to confirm or redirect " +
  "-- for example: 'I'd suggest a warm, client-facing tone since this is for prospective clients -- want me to go " +
  "with that, or something more formal?' Never call set_page_blocks and ask a question in the same turn. " +
  "Every reply you write -- a clarifying question, options, or a confirmation -- is shown as plain chat text with no " +
  "markdown rendering at all, so never use markdown syntax there either (no **bold**, no - / 1. list markers, no " +
  "headings): write it as ordinary sentences, the same as you would say it out loud. " +
  "\n\n" +
  "Design discipline -- every block type already renders with consistent typography, color, spacing, and alignment " +
  "automatically; you never set fonts, colors, or alignment yourself, and text fields render exactly as written, " +
  "never parsed as markdown -- so never use asterisks, hashes, or underscores for emphasis or headings inside a " +
  "text field, it will show up as literal punctuation. Your only job is choosing which block types to use, in what " +
  "order, and what they say, so the page reads as one continuous, deliberate flow, not a set of disconnected " +
  "pieces: every block should follow naturally from the one before it, at a level of detail and tone consistent " +
  "with the rest of the page. The page's title is already shown as its own top-level heading above your content, " +
  "so never repeat it as a heading block, and never use heading level 1 -- start straight into the body (an " +
  "opening paragraph, or a level-2 heading if the page has distinct sections from the start), use level 2 for " +
  "each major section and level 3 only for a sub-point within one, and never skip a level or use headings " +
  "inconsistently. If the page has several similar sections (e.g. one per service or topic), give every one of " +
  "them the same internal shape -- e.g. always a heading followed by a paragraph, not a heading and paragraph for " +
  "one section and a heading and list for another -- so the page reads as one coherent design, not a patchwork. " +
  "Never add a divider, spacer, quote, or button just for variety or decoration -- include one only when it serves " +
  "a real structural or functional purpose (a divider between genuinely distinct sections, a button for an actual " +
  "call to action with a real URL you were actually given, never an invented one). " +
  "Even when sections share the same structure, don't reuse the same sentence openings, transitions, or stock " +
  "phrases across them (e.g. every section starting with the same kind of framing sentence, or 'peace of mind' / " +
  "'look no further' style filler repeated more than once on the page) -- vary sentence structure and wording so " +
  "each block reads as its own fresh content, not a reworded copy of another one on the same page. " +
  "\n\n" +
  "Record data -- record_field shows one live field from this page's linked matter (if any); record_list shows a " +
  "capped table of related records (e.g. every Invoice linked to it). Never invent a fieldKey/childTableId/" +
  "relationFieldId/fieldIds -- call list_record_fields and/or list_related_tables first and use only what they " +
  "return. If the page isn't linked to a matter, those tools will tell you so; don't use record_field/record_list " +
  "at all in that case, and don't ask the user to link one yourself -- that's done in Page Settings, outside this " +
  "conversation, mention it only if they ask why real data isn't available. " +
  "\n\n" +
  "Multiple matters -- when the user describes a KIND of matter they want shown (e.g. \"matters with an email from " +
  "niksen.com.au\", \"open matters with Smith in the name\"), call search_matters with the right criteria, then " +
  "present the results in plain text: how many were found and a few example names. Do not call link_matters yet -- " +
  "wait for the user to explicitly confirm before linking, then call link_matters with confirm=true and the " +
  "matter ids they agreed to. Call list_linked_matters first if you're unsure whether matters were already linked " +
  "in an earlier turn, so you don't propose duplicates. Once matters are linked, use a matter_list block (with " +
  "fields from list_record_fields) to actually show them -- linking alone doesn't add anything to the page. " +
  "\n\n" +
  "Never refer to yourself as \"AI\" or \"the assistant\" when talking to the user -- say \"we\" instead (e.g. \"we've drafted...\", not \"the AI drafted...\"). " +
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

export async function generatePageBlocks(
  admin: any,
  companyId: string,
  pageId: string,
  title: string,
  visibility: "company" | "client" | "public",
  projectId: string | null,
  history: PageChatMessage[]
): Promise<PageGenerateResult> {
  let captured: unknown = null;

  let matterContext = "This page is not linked to any matter -- record_field/record_list blocks have nothing to show, don't use them.";
  if (projectId) {
    const { data: project } = await admin.from("projects").select("name, status").eq("id", projectId).eq("company_id", companyId).maybeSingle();
    matterContext = project
      ? `This page is linked to the matter "${project.name}" (status: ${project.status}). You may use record_field/record_list blocks to show real data from it, via list_record_fields/list_related_tables.`
      : "This page's linked matter could not be found -- treat it as not linked.";
  }

  // The exposure warning only applies when there's actually record data
  // AND the page has no gate at all -- 'client' pages already require a
  // PIN by default in the UI, and 'company' pages aren't public in the
  // first place, so this is specifically about 'public' visibility.
  const exposureWarning = visibility === "public"
    ? "This page's visibility is currently set to fully Public (no PIN). If you use a record_field/record_list block, your confirmation reply MUST say so plainly and state the real safeguards already in place: it's read-only, it only shows the fields you explicitly included, and there's no way for a visitor to search or edit anything else in the system. Then ask if they'd like a PIN added (possible even on a Public page) or to switch to a Client link instead -- don't just silently comply."
    : "";

  const systemPrompt = [BASE_SYSTEM_PROMPT, matterContext, exposureWarning].filter(Boolean).join("\n\n") + `\n\nPage title: ${title}`;

  const executeTool = async (name: string, input: Record<string, any>) => {
    if (name === "set_page_blocks") {
      captured = input.blocks;
      return { content: "Blocks set." };
    }
    return executePageBuilderTool(admin, companyId, projectId, pageId, name, input);
  };

  const result = await callTogetherModelWithTools(
    TABLE_BUILDER_MODEL_ID,
    systemPrompt,
    history,
    PAGE_BUILDER_TOOLS,
    executeTool,
    undefined,
    undefined,
    undefined,
    6
  );

  return {
    blocks: validateBlocks(captured),
    message: sanitizeReply(result.content || ""),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
