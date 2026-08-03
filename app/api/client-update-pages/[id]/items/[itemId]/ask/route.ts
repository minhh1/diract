// app/api/client-update-pages/[id]/items/[itemId]/ask/route.ts
// Staff-triggered "ask anything about this matter" -- the public
// counterpart (available to the client themselves, only when the page's
// own ai_ask_enabled is on) lives in
// .../public/[slug]/ask/route.ts, both calling the same
// runMatterQuestion so they can't behave differently. Projects pages only,
// same restriction as the other matter-email AI features (summaries,
// settlement-date review) -- item.record_id is a project id.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { runMatterQuestion } from "@/lib/clientUpdatePageAskQuestion";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";
import type { AskScope } from "@/lib/ai/matterQuestionAnswer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;
  if (gate.page.base_table !== "projects") {
    return NextResponse.json({ error: "This is only available on a matters page" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const question: string | undefined = typeof body?.question === "string" ? body.question.trim() : undefined;
  const fields: { label: string; value: string }[] = Array.isArray(body?.fields) ? body.fields : [];
  if (!question) return NextResponse.json({ error: "A question is required" }, { status: 400 });

  const { data: item } = await admin.from("client_update_page_items").select("id, record_id, display_name").eq("id", itemId).eq("page_id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Matter not found on this page" }, { status: 404 });

  const { data: project } = await admin.from("projects").select("name").eq("id", item.record_id).maybeSingle();
  const matterName = item.display_name || project?.name || "this matter";

  const scope = (gate.page.ai_ask_scope || "emails") as AskScope;

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly AI token cap reached for this company" }, { status: 429 });
  }

  const result = await runMatterQuestion(admin, companyId, user.id, itemId, item.record_id, matterName, question, scope, fields);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({ answer: result.answer });
}
