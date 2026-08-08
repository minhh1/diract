// app/api/pages/[id]/generate/route.ts
// Drafts/redrafts a page's blocks through a short conversation, not a single
// blind prompt -- see lib/ai/pageGenerate.ts's header comment. The caller
// sends the FULL turn history each time (same convention as the dashboard
// AI assistant's own client-held history, components/ai/AiChatThread.tsx);
// this route has no server-side conversation state of its own.
//
// Two outcomes per call: the model called set_page_blocks (blocks.length >
// 0) -> saved, returns { page, message }; or it just replied in plain text
// (a clarifying question, or options + a recommendation) -> nothing saved,
// returns { message } only. The UI is responsible for showing that message
// as the assistant's reply and sending the user's next answer back in as
// another turn of history, not treating an empty result as an error.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generatePageBlocks, type PageChatMessage } from "@/lib/ai/pageGenerate";
import { costUsd, TABLE_BUILDER_MODEL_ID } from "@/lib/billing/aiModels";
import { resolveRecordBlocks } from "@/lib/pages/resolveRecordBlocks";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;

function parseHistory(input: unknown): PageChatMessage[] | null {
  if (!Array.isArray(input) || !input.length || input.length > MAX_MESSAGES) return null;
  const history: PageChatMessage[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const { role, content } = raw as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || !content.trim()) return null;
    history.push({ role, content: content.trim().slice(0, MAX_MESSAGE_CHARS) });
  }
  if (history[history.length - 1].role !== "user") return null;
  return history;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can generate page content" }, { status: 403 });
  const { id } = await params;

  const { data: page } = await admin.from("company_pages").select("id, title, visibility, project_id").eq("id", id).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const history = parseHistory(body?.history);
  if (!history) return NextResponse.json({ error: "history must be a non-empty list of {role, content} turns, ending with a user message" }, { status: 400 });

  const result = await generatePageBlocks(admin, companyId, id, page.title, page.visibility, page.project_id, history);

  const cost = costUsd("hosted", TABLE_BUILDER_MODEL_ID, result);
  await admin.from("ai_usage_events").insert({
    company_id: companyId, user_id: user.id, model_id: TABLE_BUILDER_MODEL_ID, provider: "hosted",
    input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
  });

  if (!result.blocks.length) {
    return NextResponse.json({ message: result.message || "Could you say a bit more about what you'd like this page to say?" });
  }

  const lastUserMessage = history[history.length - 1].content;
  const { data: updated, error } = await admin
    .from("company_pages")
    .update({ blocks: result.blocks, ai_prompt: lastUserMessage, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, title, slug, visibility, status, blocks")
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message || "Failed to save generated content" }, { status: 500 });

  // Resolved before returning -- the client applies this straight onto its
  // live preview, which otherwise briefly loses record_field/record_list's
  // resolved values until the next full reload.
  const blocks = await resolveRecordBlocks(admin, companyId, id, page.project_id, updated.blocks ?? []);

  // link_matters may have just changed company_page_projects this same turn
  // -- returned here too (same shape as GET) so the client's "apply this
  // turn's result" merge doesn't leave the Linked matters UI stale until the
  // next full page reload, the same staleness bug already fixed above for
  // record_field/record_list.
  const { data: links } = await admin.from("company_page_projects").select("project_id").eq("page_id", id);
  const linkedIds = (links || []).map((l: { project_id: string }) => l.project_id);
  const { data: linkedMatterRows } = linkedIds.length
    ? await admin.from("projects").select("id, name, status").in("id", linkedIds).eq("company_id", companyId).is("deleted_at", null)
    : { data: [] };

  return NextResponse.json({ page: { ...updated, blocks, linkedMatters: linkedMatterRows || [] }, message: result.message || "Drafted." });
}
