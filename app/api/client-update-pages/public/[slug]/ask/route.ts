// app/api/client-update-pages/public/[slug]/ask/route.ts
// GENUINELY UNAUTHENTICATED -- lets the client themselves ask a free-form
// question about one of their own matters (e.g. "did the vendor reply
// about our amendment requests?"), but only when staff have switched this
// on for the page (client_update_pages.ai_ask_enabled -- off by default,
// same spirit as every other staff-controlled page option). Same gate as
// the parent GET route (active/unexpired/PIN); additionally verifies the
// itemId given actually belongs to this page, same as the public notes
// route.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadActivePageBySlug, codeMatches } from "@/lib/clientUpdatePageGate";
import { runMatterQuestion } from "@/lib/clientUpdatePageAskQuestion";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";
import type { AskScope } from "@/lib/ai/matterQuestionAnswer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const { itemId, question: rawQuestion, code, fields: rawFields } = body as { itemId?: string; question?: string; code?: string; fields?: { label: string; value: string }[] };
  const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
  const fields = Array.isArray(rawFields) ? rawFields : [];
  if (!itemId || !question) return NextResponse.json({ error: "A question is required" }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const gate = await loadActivePageBySlug(admin, slug);
  if (gate.error) return gate.error;
  const { page } = gate;
  if (page.access_code && !codeMatches(page, code)) {
    return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
  }
  if (page.base_table !== "projects") {
    return NextResponse.json({ error: "This is only available on a matters page" }, { status: 400 });
  }

  if (!page.ai_ask_enabled) return NextResponse.json({ error: "Not available on this page" }, { status: 403 });

  const { data: item } = await admin.from("client_update_page_items").select("id, record_id, display_name").eq("id", itemId).eq("page_id", page.id).maybeSingle();
  if (!item) return NextResponse.json({ error: "This matter is not available" }, { status: 404 });

  const { data: project } = await admin.from("projects").select("name").eq("id", item.record_id).maybeSingle();
  const matterName = item.display_name || project?.name || "this matter";

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", page.company_id).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, page.company_id, tokenCap)) {
    return NextResponse.json({ error: "This page has reached its monthly AI limit -- please try again later" }, { status: 429 });
  }

  const scope = (page.ai_ask_scope || "emails") as AskScope;
  const result = await runMatterQuestion(admin, page.company_id, null, itemId, item.record_id, matterName, question, scope, fields);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({ answer: result.answer });
}
