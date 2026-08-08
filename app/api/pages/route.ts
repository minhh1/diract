// app/api/pages/route.ts
// List/create company_pages ("Pages" -> Content pages sub-tab). Creation is
// admin-only (mirrors lib/ai/tableBuilderTools.ts's ADMIN_ONLY_TOOLS
// convention for anything content/schema-defining). If a prompt is given,
// the AI drafts the page's blocks up front via lib/ai/pageGenerate.ts --
// otherwise it's created as an empty draft for the manual editor.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generatePageBlocks } from "@/lib/ai/pageGenerate";
import { costUsd, TABLE_BUILDER_MODEL_ID } from "@/lib/billing/aiModels";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET() {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const { data, error } = await admin
    .from("company_pages")
    .select("id, title, slug, visibility, status, updated_at, created_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pages: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can create pages" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const title = String(body?.title || "").trim();
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const baseSlug = slugify(typeof body?.slug === "string" && body.slug.trim() ? body.slug : title);
  if (!baseSlug) return NextResponse.json({ error: "Could not derive a URL slug from that title" }, { status: 400 });
  const { data: clash } = await admin.from("company_pages").select("id").eq("slug", baseSlug).maybeSingle();
  if (clash) return NextResponse.json({ error: `The URL "/public/pages/${baseSlug}" is already taken` }, { status: 409 });

  let blocks: unknown[] = [];
  let aiPrompt: string | null = null;
  if (prompt) {
    const result = await generatePageBlocks(title, prompt);
    if (!result.blocks.length) {
      return NextResponse.json({ error: "The assistant didn't return any usable content -- try a more specific prompt." }, { status: 502 });
    }
    blocks = result.blocks;
    aiPrompt = prompt;
    const cost = costUsd("hosted", TABLE_BUILDER_MODEL_ID, result);
    await admin.from("ai_usage_events").insert({
      company_id: companyId, user_id: user.id, model_id: TABLE_BUILDER_MODEL_ID, provider: "hosted",
      input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
    });
  }

  const { data: created, error } = await admin
    .from("company_pages")
    .insert({ company_id: companyId, title, slug: baseSlug, blocks, ai_prompt: aiPrompt, created_by: user.id })
    .select("id, title, slug, visibility, status, blocks")
    .single();
  if (error || !created) return NextResponse.json({ error: error?.message || "Failed to create page" }, { status: 500 });

  return NextResponse.json({ page: created });
}
