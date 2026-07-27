// app/api/precedents/[id]/draft-subject/route.ts
// Suggests just a subject line -- independent of body drafting (see
// app/api/precedents/[id]/draft/route.ts), for when someone wants a subject
// suggested without writing a whole brief. Informed by the record's own
// name/custom-field data (lib/precedents/issuePrecedent.ts's
// resolveProjectSummary), not a user-supplied prompt. Used by both the web
// Issue modal's Subject field and the bot (lib/ai/precedentAction.ts calls
// draftSubjectLine directly rather than this route, since it already has an
// admin client in hand).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { draftSubjectLine } from "@/lib/ai/precedentDraft";
import { resolveProjectSummary } from "@/lib/precedents/issuePrecedent";
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
  if (!projectId) return NextResponse.json({ error: "recordId is required" }, { status: 400 });

  const { data: precedent } = await admin
    .from("precedents").select("id, company_id, name, ai_instructions").eq("id", precedentId).is("deleted_at", null).maybeSingle();
  if (!precedent || precedent.company_id !== companyId) return NextResponse.json({ error: "Precedent not found" }, { status: 404 });

  const { data: project } = await admin.from("projects").select("id, company_id").eq("id", projectId).maybeSingle();
  if (!project || project.company_id !== companyId) return NextResponse.json({ error: "Invalid matter" }, { status: 400 });

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly AI token cap reached for this company" }, { status: 429 });
  }

  let draft;
  try {
    const recordSummary = await resolveProjectSummary(admin, companyId, projectId);
    draft = await draftSubjectLine(DEFAULT_MODEL_ID, precedent.name, precedent.ai_instructions, recordSummary);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to draft a subject line" }, { status: 502 });
  }

  const cost = costUsd("hosted", DEFAULT_MODEL_ID, draft);
  await admin.from("ai_usage_events").insert({
    company_id: companyId, user_id: user.id, model_id: DEFAULT_MODEL_ID, provider: "hosted",
    input_tokens: draft.inputTokens, output_tokens: draft.outputTokens, cost_usd: cost,
  });

  return NextResponse.json({ subject: draft.subject });
}
