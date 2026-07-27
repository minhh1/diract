// app/api/client-update-pages/[id]/summarize-open/route.ts
// Bulk sibling to .../items/[itemId]/summarize/route.ts -- generates an AI
// email summary for every matter on the page that's still open on the real
// record (projects.status = 'Open'), has at least one linked email, and
// doesn't already have a cached summary. Staff-triggered only (a button in
// MatterBoard's toolbar), same as the single-item version -- never
// automatic, for the same public-page cost/abuse reason. Already-summarized
// items are left alone; regenerating one is still a per-card action.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";
import { summarizeMatterEmails } from "@/lib/ai/matterEmailSummary";
import { costUsd, HOSTED_MODELS } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

const DEFAULT_MODEL_ID = HOSTED_MODELS[0].id;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: items } = await admin.from("client_update_page_items").select("id, project_id, ai_summary").eq("page_id", id);
  if (!items?.length) return NextResponse.json({ generated: 0, skipped: 0 });

  const projectIds = items.map((i: any) => i.project_id);
  const { data: projects } = await admin.from("projects").select("id, name, status").in("id", projectIds);
  const projectById = new Map((projects || []).map((p: any) => [p.id, p]));

  const { data: emailRows } = await admin.from("project_emails").select("project_id").in("project_id", projectIds);
  const projectsWithEmails = new Set((emailRows || []).map((e: any) => e.project_id));

  const targets = items.filter((i: any) => !i.ai_summary && projectById.get(i.project_id)?.status === "Open" && projectsWithEmails.has(i.project_id));
  if (!targets.length) return NextResponse.json({ generated: 0, skipped: items.length });

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;

  let generated = 0;
  const failed: string[] = [];
  for (const item of targets) {
    if (await isTokenCapReached(admin, companyId, tokenCap)) {
      failed.push(...targets.slice(generated).map((t: any) => projectById.get(t.project_id)?.name || t.id));
      break;
    }
    const project = projectById.get(item.project_id);
    try {
      const result = await summarizeMatterEmails(admin, companyId, DEFAULT_MODEL_ID, item.project_id, project?.name || "this matter");
      if (!result) continue;
      const generatedAt = new Date().toISOString();
      await admin.from("client_update_page_items").update({ ai_summary: result.summary, ai_summary_generated_at: generatedAt }).eq("id", item.id);
      const cost = costUsd("hosted", DEFAULT_MODEL_ID, result);
      await admin.from("ai_usage_events").insert({
        company_id: companyId, user_id: user.id, model_id: DEFAULT_MODEL_ID, provider: "hosted",
        input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
      });
      generated++;
    } catch {
      failed.push(project?.name || item.id);
    }
  }

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "summary_generated", `Bulk-generated AI summaries for ${generated} open matter${generated === 1 ? "" : "s"}${failed.length ? ` (${failed.length} failed)` : ""}`);

  return NextResponse.json({ generated, skipped: items.length - targets.length, failed });
}
