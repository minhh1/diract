// supabase/functions/field-review-worker/index.ts
// Automatic "did the parties agree on a new value for this field?" check,
// triggered by a real new email landing on a matter (see field_review_jobs
// -- gmail-push/index.ts's enqueueFieldReviewJob upserts a pending,
// realtime row here every time it writes a genuinely new project_emails
// row for a project). Every 2 min via pg_cron (see the migration that
// creates field_review_jobs).
//
// Single self-contained function (dispatcher + processor in one), unlike
// the label/email-sync pair -- an AI review call has no OAuth token
// juggling and no per-mailbox fan-out (this is matter-scoped, one review
// per project regardless of how many staff have it synced), so the extra
// isolate-per-unit split those workers need to survive Gmail API rate
// limits isn't buying anything here. Revisit if job volume ever makes one
// function's own execution ceiling the bottleneck.
//
// IMPORTANT -- this duplicates, rather than imports, the AI prompt/parsing
// logic in lib/ai/matterFieldReview.ts and the write-back logic in
// lib/clientUpdatePageFieldReview.ts. That's deliberate, not an oversight:
// this is a Deno Edge Function, those are Next.js/Node modules using
// `@/lib/...` path aliases Deno can't resolve, and there is no precedent
// anywhere in this codebase for an Edge Function calling back into a
// Next.js API route to do work (confirmed against every other worker here,
// e.g. ai-embed-worker/index.ts ports Together.ai calls the same way
// rather than calling app/api/ai/chat/route.ts). If you change the prompt,
// the value-kind rules, or the write-back shape in either of those two
// Next.js files, mirror the change here too -- and vice versa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const TOGETHER_API_KEY = Deno.env.get("TOGETHER_API_KEY");
// Mirrors lib/billing/aiModels.ts's HOSTED_MODELS[0] -- hand-kept in sync,
// same as the rest of this file (see header comment).
const MODEL_ID = "deepseek-ai/DeepSeek-V4-Pro";
const MODEL_INPUT_USD_PER_1K = 0.00174;
const MODEL_OUTPUT_USD_PER_1K = 0.00348;

const MAX_ATTEMPTS = 5;
// Realtime jobs only, ONE per tick -- confirmed live that a single matter
// with 10 reviewable fields alone took ~124s (a real Together.ai call per
// field, sequential), already most of this function's ~150s execution
// ceiling. Looping through even 2-3 such jobs in one invocation risked
// running out the clock mid-job. Anything left over just waits for the
// next tick, 2 minutes later -- fine for a background re-check nobody's
// actively watching a spinner for.
const MAX_JOBS_PER_TICK = 1;

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function heartbeat(name: string, durationMs: number, result: unknown): Promise<void> {
  try {
    await db.from("cron_heartbeats").upsert(
      { name, last_run_at: new Date().toISOString(), last_duration_ms: durationMs, last_result: result },
      { onConflict: "name" }
    );
  } catch (_) { /* never break the worker over a heartbeat write */ }
}

const LOCK_NAME = "field-review-worker";
const LOCK_TTL_MS = 170_000; // longer than the 150s platform ceiling, so a genuinely-still-running tick keeps its lock

async function acquireLock(): Promise<boolean> {
  const { data } = await db.from("dispatcher_locks")
    .update({ locked_until: new Date(Date.now() + LOCK_TTL_MS).toISOString() })
    .eq("name", LOCK_NAME).lt("locked_until", new Date().toISOString()).select();
  return !!data && data.length > 0;
}
async function releaseLock(): Promise<void> {
  try { await db.from("dispatcher_locks").update({ locked_until: new Date().toISOString() }).eq("name", LOCK_NAME); } catch (_) {}
}

// ── Ported from lib/ai/matterEmails.ts ──────────────────────────────────
interface MatterEmailForAi { subject: string | null; from_name: string | null; snippet: string | null; sortDate: string; }

async function fetchCombinedMatterEmails(companyId: string, itemId: string, projectId: string, limit = 25): Promise<MatterEmailForAi[]> {
  const [{ data: syncedEmails }, { data: appendedEmails }] = await Promise.all([
    db.from("project_emails").select("content_id, id, subject, from_name, snippet, created_at")
      .eq("company_id", companyId).eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(limit * 10),
    db.from("client_update_page_emails").select("subject, from_name, snippet, email_date, created_at")
      .eq("item_id", itemId).order("email_date", { ascending: false }).limit(limit),
  ]);

  const seenContentIds = new Set<string>();
  const dedupedSynced = (syncedEmails || []).filter((e: any) => {
    const key = e.content_id || e.id;
    if (seenContentIds.has(key)) return false;
    seenContentIds.add(key);
    return true;
  });

  return [
    ...dedupedSynced.map((e: any) => ({ subject: e.subject, from_name: e.from_name, snippet: e.snippet, sortDate: e.created_at })),
    ...(appendedEmails || []).map((e: any) => ({ subject: e.subject, from_name: e.from_name, snippet: e.snippet, sortDate: e.email_date })),
  ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()).slice(0, limit);
}

function formatMatterEmailBlock(emails: MatterEmailForAi[]): string {
  return emails
    .map(e => `[${new Date(e.sortDate).toLocaleDateString()}] From ${e.from_name || "unknown"} -- "${e.subject || "(no subject)"}": ${e.snippet || ""}`)
    .join("\n");
}

// ── Ported from lib/ai/modelCall.ts's callHostedModel ───────────────────
interface TokenUsage { inputTokens: number; outputTokens: number; content: string; }

async function callHostedModel(messages: unknown[]): Promise<TokenUsage> {
  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_API_KEY}` },
    body: JSON.stringify({ model: MODEL_ID, messages, stream: true, stream_options: { include_usage: true } }),
  });
  if (!res.ok || !res.body) throw new Error(`Together chat completion failed: ${res.status} ${await res.text()}`);

  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, content: "" };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return usage;
      const json = JSON.parse(payload);
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) usage.content += delta;
      if (json.usage) {
        usage.inputTokens = json.usage.prompt_tokens ?? 0;
        usage.outputTokens = json.usage.completion_tokens ?? 0;
      }
    }
  }
  return usage;
}

// ── Ported from lib/ai/matterFieldReview.ts ─────────────────────────────
type FieldReviewStatus = "agreed" | "change_requested" | "followed_up" | "not_yet_agreed" | "no_discussion";
type FieldValueKind = "date" | "currency" | "text";

function isReviewableFieldType(fieldType: string | undefined | null): boolean {
  return !fieldType || fieldType === "text" || fieldType === "date" || fieldType === "currency" || fieldType === "number";
}
function valueKindForFieldType(fieldType: string | undefined | null): FieldValueKind {
  if (fieldType === "date") return "date";
  if (fieldType === "currency" || fieldType === "number") return "currency";
  return "text";
}
function formatCurrentValue(kind: FieldValueKind, raw: string | null): string {
  if (raw == null || raw === "") return "not set";
  if (kind === "currency") return `$${raw}`;
  return raw;
}
function systemPrompt(fieldLabel: string, kind: FieldValueKind): string {
  const valueShape = kind === "date" ? '"YYYY-MM-DD"' : kind === "currency" ? "a plain number, no currency symbol or commas (e.g. 750000 or 750000.50)" : "a short plain-text value";
  return `You review email correspondence for a property conveyancing matter to determine the CURRENT STATUS of "${fieldLabel}" -- whether both parties (the vendor and purchaser, or their respective solicitors) have clearly and mutually agreed, in writing, to change it to one specific new value, or, if not, where the negotiation currently stands.

Rules:
- A request or proposal from only ONE side that hasn't been confirmed by the other is NOT agreement -- classify it as "change_requested".
- If staff or a party has chased up a still-unanswered request, classify it as "followed_up".
- Vague discussion without a specific new value, or emails that only reconfirm the CURRENT value (given to you below), are "not_yet_agreed".
- If the recent emails don't mention "${fieldLabel}" at all, use "no_discussion".
- Only use "agreed" if you can point to a specific new value both sides have accepted.
- This matter may involve more than one property (e.g. a multi-lot subdivision), listed below. When more than one is listed, assume any agreement applies to ALL of them unless the emails clearly single out just one specific property (naming its address or lot number) -- in that case set "scope" to that property's address exactly as given below; otherwise set "scope" to "all". When only one property is listed, always use "scope": "all".

Respond with ONLY a JSON object, nothing else -- no markdown fences, no prose:
{"status": "agreed" | "change_requested" | "followed_up" | "not_yet_agreed" | "no_discussion", "agreed": boolean, "newValue": ${valueShape} or null, "scope": "all" or one property's exact address from the list below, "reasoning": "one short sentence describing the status, naming the relevant value(s) and who requested/followed up where applicable"}

"agreed" must be true only when status is "agreed"; "newValue" must be set only when status is "agreed".`;
}

function validateValue(kind: FieldValueKind, raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const trimmed = raw.trim();
  if (kind === "date") return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  if (kind === "currency") {
    const cleaned = trimmed.replace(/[$,\s]/g, "");
    return /^\d+(\.\d+)?$/.test(cleaned) ? cleaned : null;
  }
  return trimmed;
}

interface FieldReview {
  agreed: boolean; newValue: string | null; status: FieldReviewStatus; scope: string; reasoning: string;
  inputTokens: number; outputTokens: number;
}

async function reviewFieldAgreement(
  companyId: string, itemId: string, projectId: string, matterName: string,
  fieldLabel: string, fieldType: string | undefined,
  properties: { address: string | null; currentValue: string | null }[]
): Promise<FieldReview | null> {
  const emails = await fetchCombinedMatterEmails(companyId, itemId, projectId);
  if (!emails.length) return null;

  const kind = valueKindForFieldType(fieldType);
  const emailBlock = formatMatterEmailBlock(emails);
  const propertyBlock = properties.length > 1
    ? `Properties on this matter:\n${properties.map(p => `- ${p.address || "(no address on file)"}: current ${fieldLabel} ${formatCurrentValue(kind, p.currentValue)}`).join("\n")}`
    : `Current ${fieldLabel}: ${formatCurrentValue(kind, properties[0]?.currentValue ?? null)}`;
  const messages = [
    { role: "system", content: systemPrompt(fieldLabel, kind) },
    { role: "user", content: `Matter: ${matterName}\n${propertyBlock}\n\nRecent emails (most recent first):\n${emailBlock}` },
  ];

  const usage = await callHostedModel(messages);
  let parsed: any = {};
  try {
    const match = usage.content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : usage.content);
  } catch { /* falls through -- agreed stays false below */ }

  const validValue = validateValue(kind, parsed.newValue);
  const alreadyCurrentEverywhere = properties.length > 0 && properties.every(p => (p.currentValue ?? null) === validValue);
  const agreed = !!parsed.agreed && validValue != null && !alreadyCurrentEverywhere;
  const scope = typeof parsed.scope === "string" && parsed.scope.trim() ? parsed.scope.trim() : "all";
  const reasoning = typeof parsed.reasoning === "string" && parsed.reasoning.trim() ? parsed.reasoning.trim() : "No clear mutual agreement on a new value found.";
  const VALID_STATUSES: FieldReviewStatus[] = ["agreed", "change_requested", "followed_up", "not_yet_agreed", "no_discussion"];
  const status: FieldReviewStatus = VALID_STATUSES.includes(parsed.status) ? parsed.status : agreed ? "agreed" : "not_yet_agreed";

  return {
    agreed, newValue: agreed ? validValue : null, status: agreed ? "agreed" : status, scope, reasoning,
    inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
  };
}

// ── Ported from lib/billing/aiUsageCap.ts + lib/billing/aiModels.ts's costUsd ──
async function isTokenCapReached(companyId: string, tokenCap: number): Promise<boolean> {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);
  const { data: periodEvents } = await db.from("ai_usage_events")
    .select("input_tokens, output_tokens").eq("company_id", companyId).gte("created_at", periodStart.toISOString());
  const tokensUsed = (periodEvents ?? []).reduce((sum: number, e: any) => sum + e.input_tokens + e.output_tokens, 0);
  return tokensUsed >= tokenCap;
}
function costUsd(usage: { inputTokens: number; outputTokens: number }): number {
  return (usage.inputTokens / 1000) * MODEL_INPUT_USD_PER_1K + (usage.outputTokens / 1000) * MODEL_OUTPUT_USD_PER_1K;
}

// ── Ported from lib/clientUpdatePageLog.ts ──────────────────────────────
async function logChange(
  pageId: string, actorName: string | null, source: "staff" | "client" | "ai", action: string, detail: string,
  cell?: { itemId: string; fieldId: string; oldValue: string | null; newValue: string | null; reason: string | null }
): Promise<void> {
  await db.from("client_update_page_logs").insert({
    page_id: pageId, actor_name: actorName, source, action, detail,
    item_id: cell?.itemId ?? null, field_id: cell?.fieldId ?? null,
    old_value: cell?.oldValue ?? null, new_value: cell?.newValue ?? null, reason: cell?.reason ?? null,
  });
}

// ── Ported from lib/clientUpdatePageFieldReview.ts's runFieldReview ─────
const COLUMN_BY_KIND: Record<FieldValueKind, string> = { date: "value_date", currency: "value_number", text: "value_text" };

async function runFieldReview(
  companyId: string, pageId: string, itemId: string, fieldId: string, fieldKey: string, fieldLabel: string, fieldType: string | undefined,
  projectId: string, matterName: string
): Promise<{ ran: boolean; agreed: boolean }> {
  const kind = valueKindForFieldType(fieldType);
  const column = COLUMN_BY_KIND[kind];

  const { data: links } = await db.from("project_properties")
    .select("id, property_id").eq("project_id", projectId).order("created_at", { ascending: true });
  const linkedRows = links || [];
  if (!linkedRows.length) return { ran: false, agreed: false };

  const propertyIds: string[] = linkedRows.map((l: any) => l.property_id);
  const [{ data: existingVals }, { data: propertyRows }] = await Promise.all([
    db.from("project_property_values").select(`project_property_id, ${column}`)
      .eq("field_id", fieldKey).in("project_property_id", linkedRows.map((l: any) => l.id)),
    propertyIds.length ? db.from("properties").select("id, street_address").in("id", propertyIds) : Promise.resolve({ data: [] }),
  ]);
  const valueByPropertyId = new Map<string, string | null>((existingVals || []).map((v: any) => [v.project_property_id, v[column] != null ? String(v[column]) : null]));
  const addressByPropertyId = new Map<string, string | null>((propertyRows || []).map((p: any) => [p.id, p.street_address]));

  const propertiesForPrompt = linkedRows.map((l: any) => ({
    address: addressByPropertyId.get(l.property_id) ?? null,
    currentValue: valueByPropertyId.get(l.id) ?? null,
  }));

  const result = await reviewFieldAgreement(companyId, itemId, projectId, matterName, fieldLabel, fieldType, propertiesForPrompt);
  if (!result) return { ran: false, agreed: false };

  await db.from("ai_usage_events").insert({
    company_id: companyId, user_id: null, model_id: MODEL_ID, provider: "hosted",
    input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: costUsd(result),
  });

  // Automatic, unattended trigger -- deliberately silent when there's no
  // agreement (unlike the bulk "check every field" button, which opts into
  // logging every outcome on demand). A matter with an unresolved
  // back-and-forth would otherwise get a fresh "still not agreed" log
  // entry every single time any new email lands on it.
  if (!result.agreed || !result.newValue) return { ran: true, agreed: false };

  let targets = linkedRows;
  if (linkedRows.length > 1 && result.scope.toLowerCase() !== "all") {
    const needle = result.scope.toLowerCase();
    const matches = linkedRows.filter((l: any) => {
      const address = (addressByPropertyId.get(l.property_id) || "").toLowerCase();
      return address && (address.includes(needle) || needle.includes(address));
    });
    if (matches.length === 1) targets = matches;
  }

  for (const t of targets) {
    const previousValue = valueByPropertyId.get(t.id) ?? null;
    const writeValue: any = kind === "currency" ? Number(result.newValue) : result.newValue;
    const { error } = await db.from("project_property_values").upsert({
      field_id: fieldKey, project_property_id: t.id, company_id: companyId,
      value_text: kind === "text" ? writeValue : null,
      value_number: kind === "currency" ? writeValue : null,
      value_date: kind === "date" ? writeValue : null,
      value_boolean: null, value_record_id: null, value_record_capacity: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_property_id,field_id" });
    if (error) { console.error(`[field-review-worker] write error for ${matterName}/${fieldLabel}:`, error.message); continue; }

    await db.from("client_update_page_ai_field_flags").upsert({
      page_id: pageId, item_id: itemId, project_property_id: t.id, field_key: fieldKey,
      previous_value: previousValue, applied_value: result.newValue, reasoning: result.reasoning,
    }, { onConflict: "item_id,project_property_id,field_key" });

    const addressSuffix = targets.length > 1 ? ` (${addressByPropertyId.get(t.property_id) || "linked property"})` : "";
    await logChange(pageId, "AI review", "ai", "value_changed",
      `AI review: set "${fieldLabel}" to ${result.newValue} on "${matterName}"${addressSuffix} -- ${result.reasoning} (automatic, triggered by a new email)`,
      { itemId, fieldId, oldValue: previousValue, newValue: result.newValue, reason: result.reasoning });
  }

  return { ran: true, agreed: true };
}

// ── Job dispatch ─────────────────────────────────────────────────────────
interface FieldReviewJob { id: string; company_id: string; project_id: string; attempts: number; }

async function processJob(job: FieldReviewJob): Promise<{ reviewed: number; agreed: number }> {
  const { data: items } = await db.from("client_update_page_items")
    .select("id, page_id, display_name").eq("record_id", job.project_id);
  if (!items?.length) return { reviewed: 0, agreed: 0 };

  const pageIds = [...new Set(items.map((i: any) => i.page_id))];
  const { data: pages } = await db.from("client_update_pages")
    .select("id").in("id", pageIds).eq("company_id", job.company_id).eq("base_table", "projects");
  const validPageIds = new Set((pages || []).map((p: any) => p.id));
  const relevantItems = items.filter((i: any) => validPageIds.has(i.page_id));
  if (!relevantItems.length) return { reviewed: 0, agreed: 0 }; // this project isn't on any matters page

  const { data: project } = await db.from("projects").select("name").eq("id", job.project_id).maybeSingle();

  const { data: aiSettings } = await db.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", job.company_id).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;

  let reviewed = 0;
  let agreed = 0;
  for (const item of relevantItems) {
    const matterName = item.display_name || project?.name || "this matter";
    const { data: fields } = await db.from("client_update_page_fields")
      .select("id, field_key, label, field_type").eq("page_id", item.page_id).eq("field_source", "project_property");
    const reviewable = (fields || []).filter((f: any) => isReviewableFieldType(f.field_type));
    const uniqueFields = [...new Map(reviewable.map((f: any) => [f.field_key, f])).values()] as { id: string; field_key: string; label: string; field_type: string | undefined }[];

    for (const field of uniqueFields) {
      if (await isTokenCapReached(job.company_id, tokenCap)) throw new Error("Monthly AI token cap reached");
      try {
        const result = await runFieldReview(job.company_id, item.page_id, item.id, field.id, field.field_key, field.label, field.field_type, job.project_id, matterName);
        if (!result.ran) continue;
        reviewed++;
        if (result.agreed) agreed++;
      } catch (err) {
        console.error(`[field-review-worker] review failed for ${matterName}/${field.label}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return { reviewed, agreed };
}

Deno.serve(async (_req) => {
  const t0 = Date.now();
  if (!(await acquireLock())) return respond({ ok: true, skipped: "already_running" });
  try {
    return await runDispatch(t0);
  } finally {
    await releaseLock();
  }
});

async function runDispatch(t0: number): Promise<Response> {
  const { data: realtimeJobs } = await db.from("field_review_jobs")
    .select("id, company_id, project_id, attempts")
    .eq("is_realtime", true).in("status", ["pending", "processing"]).lt("attempts", MAX_ATTEMPTS)
    .order("updated_at", { ascending: false }).limit(MAX_JOBS_PER_TICK);

  const jobs: FieldReviewJob[] = realtimeJobs || [];
  const results: Record<string, string> = {};

  for (const job of jobs) {
    await db.from("field_review_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id);
    try {
      const { reviewed, agreed } = await processJob(job);
      await db.from("field_review_jobs").update({
        status: "done", is_realtime: false, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      results[job.id] = `ok: reviewed ${reviewed}, ${agreed} agreed`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = job.attempts + 1;
      await db.from("field_review_jobs").update({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts, last_error: message, updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      results[job.id] = `error: ${message}`;
    }
  }

  const summary = { jobsProcessed: jobs.length, results };
  await heartbeat("field-review-worker", Date.now() - t0, summary);
  return respond({ ok: true, ...summary });
}
