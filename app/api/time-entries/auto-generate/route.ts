// app/api/time-entries/auto-generate/route.ts
// Drafts Time & Fee Entries suggestions from a day's completed tasks +
// matter-linked emails -- nothing is written to company_table_records here,
// these are ephemeral suggestions the caller reviews/adjusts client-side
// before POSTing the ones they actually want to .../submit. scope='mine' is
// the signed-in user's own day (the "Auto Time Recording" button next to My
// Tasks); scope='all' is every company member's day at once (admin-only --
// see AutoTimeRecordingPanel's toggle), used to "push everyone's" entries.
//
// Emails are fetched COMPANY-WIDE for the day regardless of scope, then run
// through dedupeAndAttributeEmails (lib/ai/emailTimekeeperAttribution.ts)
// BEFORE any per-scope filtering -- the same real email can land as a
// separate project_emails row under several different staff members' own
// synced mailboxes (confirmed live: 173 of 189 rows on one day were
// duplicates of just 39 real emails), so figuring out who's actually
// responsible for it requires seeing every copy across the whole company,
// not just whichever one happens to be in the current user's own rows.
// scope='mine' then keeps only the emails that attribution resolved to the
// caller; naively pre-filtering project_emails by user_id first (as this
// route used to) is exactly what caused entries to attribute to someone who
// was never actually a party to the correspondence.
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
import { draftAutoTimeEntries, type AutoTimeEntryTaskInput, type AutoTimeEntryEmailInput, type DescriptionDetailLevel } from "@/lib/ai/autoTimeEntryDraft";
import { dedupeAndAttributeEmails, type RawProjectEmail, type StaffMember } from "@/lib/ai/emailTimekeeperAttribution";

const MODEL_ID = HOSTED_MODELS[0].id;
const VALID_LEVELS: DescriptionDetailLevel[] = ["brief", "standard", "detailed"];

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
  const detailLevel: DescriptionDetailLevel = VALID_LEVELS.includes(body.detailLevel) ? body.detailLevel : "standard";
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  if (scope === "all" && !isAdmin) return NextResponse.json({ error: "Only a company admin can view everyone's day" }, { status: 403 });

  const timezone = await getCompanyTimezone(admin, companyId);
  const { startIso, endIso } = dayRangeInTimezone(date, timezone);

  const { data: existingSources } = await admin.from("time_entry_ai_sources").select("source_type, source_id").eq("company_id", companyId);
  const excludedTaskIds = new Set((existingSources || []).filter((s: any) => s.source_type === "task").map((s: any) => s.source_id));
  const excludedEmailIds = new Set<string>((existingSources || []).filter((s: any) => s.source_type === "email").map((s: any) => s.source_id));

  // Every company member -- needed up front for email attribution (sender/
  // salutation/thread-walk all match against this list), not just whoever
  // already has a task or email today.
  const { data: memberships } = await admin.from("company_memberships").select("user_id").eq("company_id", companyId);
  const memberUserIds = (memberships || []).map((m: any) => m.user_id);
  const { data: memberProfiles } = await admin.from("profiles").select("id, full_name, email").in("id", memberUserIds);
  const profileById = new Map((memberProfiles || []).map((p: any) => [p.id, p]));
  const staff: StaffMember[] = (memberProfiles || [])
    .filter((p: any) => !!p.email && !!p.full_name)
    .map((p: any) => ({ userId: p.id, email: p.email, firstName: p.full_name.trim().split(/\s+/)[0], fullName: p.full_name }));

  let taskQuery = admin.from("tasks").select("id, name, notes, assignee_id, project_id, completed_at")
    .eq("company_id", companyId).eq("is_completed", true).is("deleted_at", null)
    .gte("completed_at", startIso).lt("completed_at", endIso);
  if (scope === "mine") taskQuery = taskQuery.eq("assignee_id", user.id);
  const { data: rawTasks } = await taskQuery;

  // `date` (the email's own sent/received timestamp) is nullable -- some
  // rows land in project_emails with it unset even though they're genuinely
  // from today. Falls back to created_at (when the row was linked to the
  // matter) for exactly those rows, rather than silently excluding them
  // from every day's range forever. Company-wide, not scoped by user_id --
  // see header comment.
  const { data: rawEmailRows } = await admin.from("project_emails")
    .select("id, subject, snippet, from_address, from_name, project_id, gmail_thread_id, date, created_at")
    .eq("company_id", companyId)
    .or(`and(date.gte.${startIso},date.lt.${endIso}),and(date.is.null,created_at.gte.${startIso},created_at.lt.${endIso})`);

  const rawEmails: RawProjectEmail[] = (rawEmailRows || [])
    .filter((e: any) => e.project_id)
    .map((e: any) => ({
      id: e.id, subject: e.subject, snippet: e.snippet, from_address: e.from_address, from_name: e.from_name,
      project_id: e.project_id, gmail_thread_id: e.gmail_thread_id, created_at: e.created_at,
    }));

  const attributedEmails = dedupeAndAttributeEmails(rawEmails, staff, excludedEmailIds);
  const emailDuplicatesByRepId = new Map(attributedEmails.map(e => [e.id, e.duplicateIds]));
  // For the panel's inline "show source email(s)" expand -- keyed by the
  // representative id an AutoTimeEntryDraft actually references (before
  // it's expanded out to every duplicate copy below).
  const attributedEmailById = new Map(attributedEmails.map(e => [e.id, e]));

  // Emails attribution could resolve, scoped to who's asking. Emails it
  // COULDN'T resolve (timekeeperUserId === null) only ever surface in the
  // admin "everyone's day" view, never a regular user's own "my day" -- a
  // non-admin has no business seeing an ambiguous email that might not even
  // be theirs. The admin picks a timekeeper for these client-side (see
  // AutoTimeRecordingPanel) rather than the system guessing.
  const resolvedEmails = attributedEmails.filter(e => e.timekeeperUserId !== null);
  const scopedResolvedEmails = scope === "mine" ? resolvedEmails.filter(e => e.timekeeperUserId === user.id) : resolvedEmails;
  const unresolvedEmails = scope === "all" ? attributedEmails.filter(e => e.timekeeperUserId === null) : [];

  const tasks = (rawTasks || []).filter((t: any) => t.project_id && t.assignee_id && !excludedTaskIds.has(t.id));

  if (!tasks.length && !scopedResolvedEmails.length && !unresolvedEmails.length) {
    return NextResponse.json({ date, entries: [], staffOptions: [] });
  }

  const projectIds = Array.from(new Set([...tasks.map((t: any) => t.project_id), ...scopedResolvedEmails.map(e => e.projectId), ...unresolvedEmails.map(e => e.projectId)]));
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

  const userIds = Array.from(new Set([...tasks.map((t: any) => t.assignee_id), ...scopedResolvedEmails.map(e => e.timekeeperUserId as string)]));

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;

  const entries: any[] = [];
  let entrySeq = 0;
  for (const uid of userIds) {
    if (await isTokenCapReached(admin, companyId, tokenCap)) break;

    const userTasks: AutoTimeEntryTaskInput[] = tasks.filter((t: any) => t.assignee_id === uid)
      .map((t: any) => ({ id: t.id, name: t.name, notes: t.notes, matterId: t.project_id, matterLabel: matterLabel(t.project_id) }));
    const userEmails: AutoTimeEntryEmailInput[] = scopedResolvedEmails.filter(e => e.timekeeperUserId === uid)
      .map(e => ({ id: e.id, subject: e.subject, snippet: e.snippet, fromName: e.fromName, matterId: e.projectId, matterLabel: matterLabel(e.projectId) }));
    if (!userTasks.length && !userEmails.length) continue;

    await ensureStaffEntity(admin, companyId, uid);
    const { data: staffEntity } = await admin.from("entities")
      .select("id, default_rate").eq("company_id", companyId).eq("linked_profile_id", uid).is("deleted_at", null).maybeSingle();

    const result = await draftAutoTimeEntries(MODEL_ID, userTasks, userEmails, detailLevel);
    if (!result) continue;

    const cost = costUsd("hosted", MODEL_ID, result);
    await admin.from("ai_usage_events").insert({
      company_id: companyId, user_id: uid, model_id: MODEL_ID, provider: "hosted",
      input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
    });

    const profile = profileById.get(uid);
    for (const d of result.drafts) {
      entrySeq += 1;
      // Expand each representative email id back out to every duplicate
      // copy it collapsed -- submit needs to claim ALL of them in
      // time_entry_ai_sources so no copy can resurface later.
      const sourceEmailIds = d.sourceEmailIds.flatMap(repId => emailDuplicatesByRepId.get(repId) || [repId]);
      const emailPreviews = d.sourceEmailIds
        .map(repId => attributedEmailById.get(repId))
        .filter((e): e is NonNullable<typeof e> => !!e)
        .map(e => ({ subject: e.subject, snippet: e.snippet, fromName: e.fromName }));
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
        sourceEmailIds,
        emailPreviews,
        detailLevel,
      });
    }
  }

  // Emails attribution genuinely couldn't resolve -- one batch AI call (no
  // tasks, so nothing to merge them with; matter-based grouping still
  // applies) rather than one per email. userId stays null: the admin picks
  // a timekeeper for each of these in the panel before it can be submitted
  // (see AutoTimeRecordingPanel and the submit route's own userId check).
  if (unresolvedEmails.length && !(await isTokenCapReached(admin, companyId, tokenCap))) {
    const unresolvedInputs: AutoTimeEntryEmailInput[] = unresolvedEmails.map(e => ({
      id: e.id, subject: e.subject, snippet: e.snippet, fromName: e.fromName, matterId: e.projectId, matterLabel: matterLabel(e.projectId),
    }));
    const result = await draftAutoTimeEntries(MODEL_ID, [], unresolvedInputs, detailLevel);
    if (result) {
      const cost = costUsd("hosted", MODEL_ID, result);
      await admin.from("ai_usage_events").insert({
        company_id: companyId, user_id: user.id, model_id: MODEL_ID, provider: "hosted",
        input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
      });
      for (const d of result.drafts) {
        entrySeq += 1;
        const sourceEmailIds = d.sourceEmailIds.flatMap(repId => emailDuplicatesByRepId.get(repId) || [repId]);
        const emailPreviews = d.sourceEmailIds
          .map(repId => attributedEmailById.get(repId))
          .filter((e): e is NonNullable<typeof e> => !!e)
          .map(e => ({ subject: e.subject, snippet: e.snippet, fromName: e.fromName }));
        entries.push({
          key: `unresolved-${entrySeq}`,
          userId: null,
          userInitials: "?",
          userName: null,
          staffEntityId: null,
          defaultRate: null,
          date,
          matterId: d.matterId,
          matterLabel: d.matterLabel,
          description: d.description,
          hours: d.hours,
          sourceTaskIds: d.sourceTaskIds,
          sourceEmailIds,
          emailPreviews,
          detailLevel,
        });
      }
    }
  }

  const staffOptions = staff.map(s => ({ userId: s.userId, name: s.fullName, initials: initialsFor(s.fullName) }));
  return NextResponse.json({ date, entries, staffOptions });
}
