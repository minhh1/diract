// app/api/time-entries/auto-generate/route.ts
// Drafts Time & Fee Entries suggestions from a day's completed tasks +
// matter-linked emails -- nothing is written to company_table_records here,
// these are ephemeral suggestions the caller reviews/adjusts client-side
// before POSTing the ones they actually want to .../submit. scope='mine' is
// the signed-in user's own day (the "Auto Time Recording" button next to My
// Tasks); scope='all' is every company member's day at once (admin-only --
// see AdminAutoTimeRecordingPanel), used to "push everyone's" entries.
//
// Only ever drafts from a task/email that hasn't already been converted
// (time_entry_ai_sources) -- re-running this for the same day never
// re-suggests something already turned into a real entry, whether that
// happened via this same "mine" flow or via an admin's "all" push.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCompanyTimezone } from "@/lib/companyTimezone";
import { dayRangeInTimezone } from "@/lib/dayRangeInTimezone";
import { ensureStaffEntity } from "@/lib/services/staffEntityService";
import { HOSTED_MODELS, costUsd } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";
import { draftAutoTimeEntries, type AutoTimeEntryTaskInput, type AutoTimeEntryEmailInput } from "@/lib/ai/autoTimeEntryDraft";

const MODEL_ID = HOSTED_MODELS[0].id;

function initialsFor(name: string | null): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  return trimmed.split(/\s+/).map(p => p[0]).join("").toUpperCase().slice(0, 3);
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  const body = await req.json().catch(() => ({}));
  const date = typeof body.date === "string" ? body.date : null;
  const scope: "mine" | "all" = body.scope === "all" ? "all" : "mine";
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  if (scope === "all" && !isAdmin) return NextResponse.json({ error: "Only a company admin can view everyone's day" }, { status: 403 });

  const timezone = await getCompanyTimezone(admin, companyId);
  const { startIso, endIso } = dayRangeInTimezone(date, timezone);

  const { data: existingSources } = await admin.from("time_entry_ai_sources").select("source_type, source_id").eq("company_id", companyId);
  const excludedTaskIds = new Set((existingSources || []).filter((s: any) => s.source_type === "task").map((s: any) => s.source_id));
  const excludedEmailIds = new Set((existingSources || []).filter((s: any) => s.source_type === "email").map((s: any) => s.source_id));

  let taskQuery = admin.from("tasks").select("id, name, notes, assignee_id, project_id, completed_at")
    .eq("company_id", companyId).eq("is_completed", true).is("deleted_at", null)
    .gte("completed_at", startIso).lt("completed_at", endIso);
  if (scope === "mine") taskQuery = taskQuery.eq("assignee_id", user.id);
  const { data: rawTasks } = await taskQuery;

  // `date` (the email's own sent/received timestamp) is nullable -- some
  // rows land in project_emails with it unset (confirmed live: a batch of
  // matter-linked emails all had date=null despite being genuinely from
  // today). Falls back to created_at (when the row was linked to the
  // matter) for exactly those rows, rather than silently excluding them
  // from every day's range forever.
  let emailQuery = admin.from("project_emails").select("id, subject, snippet, from_name, user_id, project_id, date, created_at")
    .eq("company_id", companyId)
    .or(`and(date.gte.${startIso},date.lt.${endIso}),and(date.is.null,created_at.gte.${startIso},created_at.lt.${endIso})`);
  if (scope === "mine") emailQuery = emailQuery.eq("user_id", user.id);
  const { data: rawEmails } = await emailQuery;

  // Only items actually linked to a matter and a real user count -- there's
  // nowhere to put an entry without both (Time & Fee Entries' Matter/Staff
  // fields are effectively required for this flow, even though the schema
  // itself doesn't enforce it).
  const tasks = (rawTasks || []).filter((t: any) => t.project_id && t.assignee_id && !excludedTaskIds.has(t.id));
  const emails = (rawEmails || []).filter((e: any) => e.project_id && e.user_id && !excludedEmailIds.has(e.id));

  if (!tasks.length && !emails.length) {
    return NextResponse.json({ date, entries: [] });
  }

  const projectIds = Array.from(new Set([...tasks.map((t: any) => t.project_id), ...emails.map((e: any) => e.project_id)]));
  const { data: projects } = await admin.from("projects").select("id, name").in("id", projectIds);
  const projectNameById = new Map((projects || []).map((p: any) => [p.id, p.name]));

  // "Matter number" is a per-company custom field (Law Firm template only,
  // see supabase/template_law_firm_seed.sql) -- shown when present, falling
  // back to the matter's name for a company without it.
  const { data: matterNumberField } = await admin.from("company_custom_fields")
    .select("id").eq("company_id", companyId).eq("table_name", "projects").eq("field_key", "matter_number").is("deleted_at", null).maybeSingle();
  const matterNumberByProjectId = new Map<string, string>();
  if (matterNumberField) {
    const { data: values } = await admin.from("company_custom_field_values")
      .select("record_id, value_text").eq("field_id", matterNumberField.id).in("record_id", projectIds);
    for (const v of values || []) if (v.value_text) matterNumberByProjectId.set(v.record_id, v.value_text);
  }
  const matterLabel = (projectId: string) => matterNumberByProjectId.get(projectId) || projectNameById.get(projectId) || "Unknown matter";

  const userIds = Array.from(new Set([...tasks.map((t: any) => t.assignee_id), ...emails.map((e: any) => e.user_id)]));
  const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", userIds);
  const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;

  const entries: any[] = [];
  let entrySeq = 0;
  for (const uid of userIds) {
    if (await isTokenCapReached(admin, companyId, tokenCap)) break;

    const userTasks: AutoTimeEntryTaskInput[] = tasks.filter((t: any) => t.assignee_id === uid)
      .map((t: any) => ({ id: t.id, name: t.name, notes: t.notes, matterId: t.project_id, matterLabel: matterLabel(t.project_id) }));
    const userEmails: AutoTimeEntryEmailInput[] = emails.filter((e: any) => e.user_id === uid)
      .map((e: any) => ({ id: e.id, subject: e.subject, snippet: e.snippet, fromName: e.from_name, matterId: e.project_id, matterLabel: matterLabel(e.project_id) }));
    if (!userTasks.length && !userEmails.length) continue;

    await ensureStaffEntity(admin, companyId, uid);
    const { data: staffEntity } = await admin.from("entities")
      .select("id, default_rate").eq("company_id", companyId).eq("linked_profile_id", uid).is("deleted_at", null).maybeSingle();

    const result = await draftAutoTimeEntries(MODEL_ID, userTasks, userEmails);
    if (!result) continue;

    const cost = costUsd("hosted", MODEL_ID, result);
    await admin.from("ai_usage_events").insert({
      company_id: companyId, user_id: uid, model_id: MODEL_ID, provider: "hosted",
      input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
    });

    const profile = profileById.get(uid);
    for (const d of result.drafts) {
      entrySeq += 1;
      entries.push({
        key: `${uid}-${entrySeq}`,
        userId: uid,
        userInitials: initialsFor(profile?.full_name || null),
        userName: profile?.full_name || "Unknown",
        staffEntityId: staffEntity?.id || null,
        defaultRate: staffEntity?.default_rate ?? null,
        date,
        matterId: d.matterId,
        matterLabel: d.matterLabel,
        description: d.description,
        hours: d.hours,
        sourceTaskIds: d.sourceTaskIds,
        sourceEmailIds: d.sourceEmailIds,
      });
    }
  }

  return NextResponse.json({ date, entries });
}
