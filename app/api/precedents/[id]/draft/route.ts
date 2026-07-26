// app/api/precedents/[id]/draft/route.ts
// Optional AI drafting assist for a precedent -- entirely separate from
// actually issuing one (app/api/precedents/[id]/issue/route.ts). Takes a
// staff member's brief and returns a suggested {subject, body}; the caller
// (components/dashboard/tabs/PrecedentsTab.tsx's Issue modal) drops those
// straight into its own editable Subject/Body fields, which the user can
// then change before issuing -- issuing itself never calls this route or any
// other AI call. The only place this feature otherwise uses AI at all is
// identifying fields in an uploaded letterhead template (see
// lib/precedents/letterheadClassify.ts) -- this drafting assist is a
// separate, opt-in feature, not a step every issued document goes through.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { draftPrecedentContent } from "@/lib/ai/precedentDraft";
import { resolveSourceTypes } from "@/lib/ai/retrieval";
import { costUsd, HOSTED_MODELS } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

const DEFAULT_MODEL_ID = HOSTED_MODELS[0].id;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: precedentId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const projectId = String(body?.recordId || "");
  const prompt = String(body?.prompt || "").trim();
  if (!projectId) return NextResponse.json({ error: "recordId is required" }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: "Describe what this document should say" }, { status: 400 });

  const { data: precedent } = await admin
    .from("precedents").select("id, company_id, name, ai_instructions").eq("id", precedentId).is("deleted_at", null).maybeSingle();
  if (!precedent || precedent.company_id !== companyId) return NextResponse.json({ error: "Precedent not found" }, { status: 404 });

  const { data: project } = await admin.from("projects").select("id, company_id, name").eq("id", projectId).maybeSingle();
  if (!project || project.company_id !== companyId) return NextResponse.json({ error: "Invalid matter" }, { status: 400 });

  const { data: aiSettings } = await admin
    .from("ai_chat_settings")
    .select("source_crm, source_gmail, source_whatsapp, source_teams, source_onedrive, monthly_token_cap")
    .eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly AI token cap reached for this company" }, { status: 429 });
  }
  const sourceTypes = resolveSourceTypes(aiSettings);

  let draft;
  try {
    draft = await draftPrecedentContent(admin, companyId, DEFAULT_MODEL_ID, sourceTypes, precedent.name, precedent.ai_instructions, prompt, project.name);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to draft document content" }, { status: 502 });
  }

  const cost = costUsd("hosted", DEFAULT_MODEL_ID, draft);
  await admin.from("ai_usage_events").insert({
    company_id: companyId, user_id: user.id, model_id: DEFAULT_MODEL_ID, provider: "hosted",
    input_tokens: draft.inputTokens, output_tokens: draft.outputTokens, cost_usd: cost,
  });

  return NextResponse.json({ subject: draft.subject, body: draft.body });
}
