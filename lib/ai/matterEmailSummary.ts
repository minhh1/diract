// lib/ai/matterEmailSummary.ts
// One-sentence "where this matter is up to" summary for a Client Update
// Page card, generated from that matter's linked project_emails (the Gmail
// sync -- see app/api/gmail/assign/route.ts and the gmail-email-sync-*
// edge functions) PLUS any staff-appended entries in
// client_update_page_emails (see that migration's header comment -- manually
// logged emails that never went through a real Gmail sync). project_outlook_
// emails is intentionally not included: that integration has no continuous
// sync yet, only individually-assigned messages, so it wouldn't have
// meaningful volume to summarize from.
import { callHostedModel } from "./modelCall";

const SYSTEM_PROMPT =
  "You write a single sentence summarising where a legal matter is up to, based on its recent email " +
  "correspondence. This sentence is shown directly to the firm's client on a matter status page -- write it in " +
  "plain, neutral, factual language suitable for a client to read. Do not mention internal staff discussion, " +
  "other clients, or anything not appropriate to share externally; if the emails don't clearly show progress, " +
  "describe the most recent concrete step instead. Respond with ONLY the one sentence -- no preamble, no quotes.";

export interface MatterEmailSummary { summary: string; inputTokens: number; outputTokens: number; }

export async function summarizeMatterEmails(
  admin: any, companyId: string, modelId: string, itemId: string, projectId: string, matterName: string
): Promise<MatterEmailSummary | null> {
  const [{ data: syncedEmails }, { data: appendedEmails }] = await Promise.all([
    admin.from("project_emails").select("subject, from_name, snippet, created_at")
      .eq("company_id", companyId).eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(25),
    admin.from("client_update_page_emails").select("subject, from_name, snippet, email_date, created_at")
      .eq("item_id", itemId).order("email_date", { ascending: false }).limit(25),
  ]);

  const combined = [
    ...(syncedEmails || []).map((e: any) => ({ ...e, sortDate: e.created_at })),
    ...(appendedEmails || []).map((e: any) => ({ ...e, sortDate: e.email_date })),
  ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()).slice(0, 25);
  if (!combined.length) return null;

  const emailBlock = combined
    .map((e: any) => `[${new Date(e.sortDate).toLocaleDateString()}] From ${e.from_name || "unknown"} -- "${e.subject || "(no subject)"}": ${e.snippet || ""}`)
    .join("\n");

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Matter: ${matterName}\n\nRecent emails (most recent first):\n${emailBlock}` },
  ];

  const usage = await callHostedModel(modelId, messages);
  const summary = usage.content.trim().replace(/^["']|["']$/g, "");
  return { summary, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}
