// app/api/pages/[id]/generate/route.ts
// Regenerates an existing page's blocks from a new prompt (used for both
// "ask AI to redo this" and any future re-draft flow) -- same
// generatePageBlocks -> validateBlocks path as the initial create in
// app/api/pages/route.ts's POST. Overwrites blocks; the manual editor is
// where a bad regeneration gets hand-fixed rather than an undo/versioning
// system, consistent with this feature staying behind status = 'draft'
// until explicitly published.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generatePageBlocks } from "@/lib/ai/pageGenerate";
import { costUsd, TABLE_BUILDER_MODEL_ID } from "@/lib/billing/aiModels";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can generate page content" }, { status: 403 });
  const { id } = await params;

  const { data: page } = await admin.from("company_pages").select("id, title").eq("id", id).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const prompt = String(body?.prompt || "").trim();
  if (!prompt) return NextResponse.json({ error: "A prompt is required" }, { status: 400 });

  const result = await generatePageBlocks(page.title, prompt);
  if (!result.blocks.length) {
    return NextResponse.json({ error: "The assistant didn't return any usable content -- try a more specific prompt." }, { status: 502 });
  }

  const cost = costUsd("hosted", TABLE_BUILDER_MODEL_ID, result);
  await admin.from("ai_usage_events").insert({
    company_id: companyId, user_id: user.id, model_id: TABLE_BUILDER_MODEL_ID, provider: "hosted",
    input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
  });

  const { data: updated, error } = await admin
    .from("company_pages")
    .update({ blocks: result.blocks, ai_prompt: prompt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, title, slug, visibility, status, blocks")
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message || "Failed to save generated content" }, { status: 500 });

  return NextResponse.json({ page: updated });
}
