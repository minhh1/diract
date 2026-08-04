// app/api/time-entries/auto-generate/regenerate-description/route.ts
// Rephrases ONE already-drafted Auto Time Recording entry's description at
// a different length/detail level -- see AutoTimeRecordingPanel.tsx's
// per-entry control. Refetches just that entry's own source task(s)/
// email(s) by id (scoped to the caller's company) and re-runs a single-item
// prompt; never touches matter/hours/attribution, which are already fixed
// by the time this is called.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { HOSTED_MODELS, costUsd } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";
import { redraftEntryDescription, type DescriptionDetailLevel } from "@/lib/ai/autoTimeEntryDraft";

const MODEL_ID = HOSTED_MODELS[0].id;
const VALID_LEVELS: DescriptionDetailLevel[] = ["brief", "standard", "detailed"];

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const body = await req.json().catch(() => ({}));
  const detailLevel: DescriptionDetailLevel = VALID_LEVELS.includes(body.detailLevel) ? body.detailLevel : "standard";
  const sourceTaskIds: string[] = Array.isArray(body.sourceTaskIds) ? body.sourceTaskIds.filter((id: any) => typeof id === "string") : [];
  const sourceEmailIds: string[] = Array.isArray(body.sourceEmailIds) ? body.sourceEmailIds.filter((id: any) => typeof id === "string") : [];
  if (!sourceTaskIds.length && !sourceEmailIds.length) {
    return NextResponse.json({ error: "No source task or email ids provided" }, { status: 400 });
  }

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly AI usage cap reached" }, { status: 429 });
  }

  const [{ data: tasks }, { data: emails }] = await Promise.all([
    sourceTaskIds.length
      ? admin.from("tasks").select("id, name, notes").eq("company_id", companyId).in("id", sourceTaskIds)
      : Promise.resolve({ data: [] as any[] }),
    sourceEmailIds.length
      ? admin.from("project_emails").select("id, subject, snippet, from_name").eq("company_id", companyId).in("id", sourceEmailIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const taskInputs = (tasks || []).map((t: any) => ({ name: t.name, notes: t.notes }));
  const emailInputs = (emails || []).map((e: any) => ({ subject: e.subject, snippet: e.snippet, fromName: e.from_name }));
  if (!taskInputs.length && !emailInputs.length) {
    return NextResponse.json({ error: "Source items not found" }, { status: 404 });
  }

  const result = await redraftEntryDescription(MODEL_ID, taskInputs, emailInputs, detailLevel);
  if (!result) return NextResponse.json({ error: "Could not generate a description" }, { status: 500 });

  const cost = costUsd("hosted", MODEL_ID, result);
  await admin.from("ai_usage_events").insert({
    company_id: companyId, user_id: user.id, model_id: MODEL_ID, provider: "hosted",
    input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
  });

  return NextResponse.json({ description: result.description });
}
