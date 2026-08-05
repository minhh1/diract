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
//
// The whole pipeline below the initial validation/lookups streams
// newline-delimited progress -- both the email-date-resolution phase and
// the per-user drafting phase used to run silently, and the former turned
// out to be the dominant cost (confirmed live: ~29s of a ~35s "Everyone's
// day" request), so a client only watching the drafting phase would show a
// progress bar that stays dark for most of the wait. See AutoTimeRecordingPanel
// for how the two phases' progress gets combined into one bar client-side.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCompanyTimezone } from "@/lib/companyTimezone";
import { dayRangeInTimezone } from "@/lib/dayRangeInTimezone";
import { ensureStaffEntity } from "@/lib/services/staffEntityService";
import { HOSTED_MODELS, costUsd } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";
import { draftAutoTimeEntries, type AutoTimeEntryTaskInput, type AutoTimeEntryEmailInput, type DescriptionDetailLevel } from "@/lib/ai/autoTimeEntryDraft";
import { dedupeAndAttributeEmails, type RawProjectEmail, type StaffMember } from "@/lib/ai/emailTimekeeperAttribution";
import { refreshTokenIfNeeded } from "@/lib/gmail/client";

const MODEL_ID = HOSTED_MODELS[0].id;
const VALID_LEVELS: DescriptionDetailLevel[] = ["brief", "standard", "detailed"];

function initialsFor(name: string | null): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  return trimmed.split(/\s+/).map(p => p[0]).join("").toUpperCase().slice(0, 3);
}

// A project_emails row can still have a null `date` despite the sync-time
// fixes upstream (see the commit fixing internalDate capture) -- either it
// was synced before that fix, or by a path that hasn't caught up yet. Such
// a row only ever reaches this route via the created_at fallback below,
// which is exactly wrong for a late sync: an old email that happened to be
// synced/labelled today would otherwise look like today's work. Rather than
// bulk-backfilling every historical null-date row (a much bigger, separate
// job), this resolves the real date live, on demand, but ONLY for the small
// set of null-date rows actually being considered as candidates for the
// requested day -- persisting the result so this never has to be redone for
// the same row again.
async function resolveTrueEmailDates(
  admin: any,
  rows: { id: string; user_id: string | null; gmail_message_id: string | null }[],
  onProgress?: () => void
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const candidates = rows.filter(r => r.user_id && r.gmail_message_id);
  if (!candidates.length) return resolved;

  // A Map<userId, Promise> (not the resolved value) so concurrent candidates
  // for the same user share ONE in-flight refresh instead of each starting
  // its own -- a check-then-await-then-set pattern would leave a window
  // where several of a single user's candidates could all see the map
  // empty before any of them had a chance to populate it, firing duplicate
  // token refreshes for no reason (harmless, just wasted round trips, but
  // real overhead when one person has many candidate emails on the same
  // day). Setting the promise synchronously (no await before the set)
  // closes that window.
  const tokenPromiseByUserId = new Map<string, Promise<string | null>>();
  await Promise.all(candidates.map(async (r) => {
    const userId = r.user_id as string;
    let tokenPromise = tokenPromiseByUserId.get(userId);
    if (!tokenPromise) {
      tokenPromise = refreshTokenIfNeeded(userId, admin).catch(() => null);
      tokenPromiseByUserId.set(userId, tokenPromise);
    }
    try {
      const token = await tokenPromise;
      if (!token) return;
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${r.gmail_message_id}?format=metadata&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const md = await res.json();
      let date: string | null = null;
      if (md?.internalDate) {
        const ms = Number(md.internalDate);
        if (!Number.isNaN(ms)) date = new Date(ms).toISOString();
      }
      if (!date) {
        const dateRaw = (md?.payload?.headers || []).find((h: any) => h.name === "Date")?.value;
        if (dateRaw) { try { date = new Date(dateRaw).toISOString(); } catch { date = null; } }
      }
      if (date) resolved.set(r.id, date);
    } catch { /* leave unresolved -- falls back to created_at-based inclusion below */ }
    finally { onProgress?.(); }
  }));

  if (resolved.size) {
    await Promise.all(Array.from(resolved.entries()).map(([id, date]) =>
      admin.from("project_emails").update({ date }).eq("id", id)
    ));
  }
  return resolved;
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
  const staffOptions = staff.map(s => ({ userId: s.userId, name: s.fullName, initials: initialsFor(s.fullName) }));

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
    .select("id, content_id, subject, snippet, from_address, from_name, project_id, gmail_thread_id, date, created_at, user_id, gmail_message_id")
    .eq("company_id", companyId)
    .or(`and(date.gte.${startIso},date.lt.${endIso}),and(date.is.null,created_at.gte.${startIso},created_at.lt.${endIso})`);

  // Known before any of the slow work below runs -- how many rows will
  // actually hit the Gmail API for date resolution (resolveTrueEmailDates
  // filters this same way internally).
  const dateResolutionCandidates = (rawEmailRows || []).filter((e: any) => !e.date && e.user_id && e.gmail_message_id);
  const phaseOneTotal = dateResolutionCandidates.length;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const entries: any[] = [];
      // Combined progress across both phases below -- phaseOneTotal is
      // known immediately; phaseTwoTotal only becomes known once
      // attribution finishes (it depends on phase one's results), so early
      // progress lines report against phaseOneTotal alone and total grows
      // once phase two starts. The client just renders whatever the latest
      // total is -- see AutoTimeRecordingPanel.
      let emailsProcessed = 0;
      let total = phaseOneTotal;
      const sendProgress = () => send({ type: "progress", processed: emailsProcessed, total });

      // A streamed response can't fall back to a normal error status/body
      // once bytes have already gone out -- an uncaught throw in here
      // previously left the connection reset with no body at all (worse
      // than a single-JSON-response version, which Next's route error
      // handling turns into a clean 500). Each per-user/per-batch block
      // below already has its own try/catch for exactly this reason; this
      // outer one is the last resort for anything else unexpected so the
      // client at least gets a parseable error line instead of a dead
      // connection.
      try {
        // The created_at fallback above is a proxy for "we don't know the
        // real date" -- resolve it live for exactly those rows (see
        // resolveTrueEmailDates' own comment) so a stale email that merely
        // synced today doesn't get counted as today's work. Confirmed live
        // as the dominant cost of this whole route (Gmail API round trips,
        // one per candidate row) -- streaming progress here is what makes
        // the bar actually reflect where the time goes, not just the much
        // faster drafting phase after it.
        const resolvedDates = await resolveTrueEmailDates(admin, dateResolutionCandidates, () => {
          emailsProcessed += 1;
          sendProgress();
        });

        const rawEmails: RawProjectEmail[] = (rawEmailRows || [])
          .filter((e: any) => e.project_id)
          .filter((e: any) => {
            if (e.date) return true; // already had a real date within range
            const resolved = resolvedDates.get(e.id);
            if (!resolved) return true; // couldn't resolve -- keep the created_at-fallback inclusion
            return resolved >= startIso && resolved < endIso; // now-known real date -- only keep if it's actually today
          })
          .map((e: any) => ({
            id: e.id, contentId: e.content_id, subject: e.subject, snippet: e.snippet, from_address: e.from_address, from_name: e.from_name,
            project_id: e.project_id, gmail_thread_id: e.gmail_thread_id, created_at: e.created_at,
          }));

        const attributedEmails = dedupeAndAttributeEmails(rawEmails, staff, excludedEmailIds);
        const emailDuplicatesByRepId = new Map(attributedEmails.map(e => [e.id, e.duplicateIds]));
        // For the panel's inline "show source email(s)" expand -- keyed by
        // the representative id an AutoTimeEntryDraft actually references
        // (before it's expanded out to every duplicate copy below).
        const attributedEmailById = new Map(attributedEmails.map(e => [e.id, e]));

        // Emails attribution could resolve, scoped to who's asking. Emails
        // it COULDN'T resolve (timekeeperUserId === null) only ever surface
        // in the admin "everyone's day" view, never a regular user's own
        // "my day" -- a non-admin has no business seeing an ambiguous email
        // that might not even be theirs. The admin picks a timekeeper for
        // these client-side (see AutoTimeRecordingPanel) rather than the
        // system guessing.
        const resolvedEmails = attributedEmails.filter(e => e.timekeeperUserId !== null);
        const scopedResolvedEmails = scope === "mine" ? resolvedEmails.filter(e => e.timekeeperUserId === user.id) : resolvedEmails;
        const unresolvedEmails = scope === "all" ? attributedEmails.filter(e => e.timekeeperUserId === null) : [];

        const tasks = (rawTasks || []).filter((t: any) => t.project_id && t.assignee_id && !excludedTaskIds.has(t.id));

        if (!tasks.length && !scopedResolvedEmails.length && !unresolvedEmails.length) {
          send({ type: "done", date, entries: [], staffOptions });
          controller.close();
          return;
        }

        // Phase two's total is now known -- fold it in without resetting
        // what phase one already reported as processed.
        total = phaseOneTotal + scopedResolvedEmails.length + unresolvedEmails.length;
        sendProgress();

        const projectIds = Array.from(new Set([...tasks.map((t: any) => t.project_id), ...scopedResolvedEmails.map(e => e.projectId), ...unresolvedEmails.map(e => e.projectId)]));
        const { data: projects } = await admin.from("projects").select("id, name").in("id", projectIds);
        const projectNameById = new Map((projects || []).map((p: any) => [p.id, p.name]));

        // "Matter number" is a per-company custom field (Law Firm template
        // only, see supabase/template_law_firm_seed.sql) -- shown when
        // present, falling back to the matter's name for a company without it.
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
        // Checked once up front rather than per user: everyone's draft call
        // fires together below, so re-checking mid-flight would only race
        // against usage events that haven't been inserted yet anyway.
        const capReached = await isTokenCapReached(admin, companyId, tokenCap);

        // One draft call per user, all in parallel -- this used to be a
        // sequential for-await loop, which made "Everyone's day" as slow as
        // every staff member's LLM call added together instead of just the
        // slowest one. Each user's block only touches its own uid's slice of
        // tasks/emails/entries, so running them concurrently is safe -- JS's
        // run-to-completion means the shared `entries` push and
        // `emailsProcessed` increment below never interleave mid-operation.
        // Each block has its own try/catch -- one user's draft call failing
        // (a transient AI-provider error, say) shouldn't cost everyone else
        // their already-computed entries the way it would if this whole
        // loop shared one try/catch or none at all.
        await Promise.all(userIds.map(async (uid) => {
          const userTasks: AutoTimeEntryTaskInput[] = tasks.filter((t: any) => t.assignee_id === uid)
            .map((t: any) => ({ id: t.id, name: t.name, notes: t.notes, matterId: t.project_id, matterLabel: matterLabel(t.project_id) }));
          const userEmails: AutoTimeEntryEmailInput[] = scopedResolvedEmails.filter(e => e.timekeeperUserId === uid)
            .map(e => ({ id: e.id, subject: e.subject, snippet: e.snippet, fromName: e.fromName, matterId: e.projectId, matterLabel: matterLabel(e.projectId) }));
          if (!userTasks.length && !userEmails.length) return;
          if (capReached) { emailsProcessed += userEmails.length; sendProgress(); return; }

          try {
            await ensureStaffEntity(admin, companyId, uid);
            const { data: staffEntity } = await admin.from("entities")
              .select("id, default_rate").eq("company_id", companyId).eq("linked_profile_id", uid).is("deleted_at", null).maybeSingle();

            const result = await draftAutoTimeEntries(MODEL_ID, userTasks, userEmails, detailLevel);
            if (!result) return;

            const cost = costUsd("hosted", MODEL_ID, result);
            await admin.from("ai_usage_events").insert({
              company_id: companyId, user_id: uid, model_id: MODEL_ID, provider: "hosted",
              input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
            });

            const profile = profileById.get(uid);
            result.drafts.forEach((d, idx) => {
              // Expand each representative email id back out to every
              // duplicate copy it collapsed -- submit needs to claim ALL of
              // them in time_entry_ai_sources so no copy can resurface later.
              const sourceEmailIds = d.sourceEmailIds.flatMap(repId => emailDuplicatesByRepId.get(repId) || [repId]);
              const emailPreviews = d.sourceEmailIds
                .map(repId => attributedEmailById.get(repId))
                .filter((e): e is NonNullable<typeof e> => !!e)
                .map(e => ({ subject: e.subject, snippet: e.snippet, fromName: e.fromName }));
              entries.push({
                key: `${uid}-${idx + 1}`,
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
            });
          } catch (err) {
            console.error(`auto-generate: draft failed for user ${uid}:`, err);
          } finally {
            emailsProcessed += userEmails.length;
            sendProgress();
          }
        }));

        // Emails attribution genuinely couldn't resolve -- one batch AI call
        // (no tasks, so nothing to merge them with; matter-based grouping
        // still applies) rather than one per email. userId stays null: the
        // admin picks a timekeeper for each of these in the panel before it
        // can be submitted (see AutoTimeRecordingPanel and the submit
        // route's own userId check).
        if (unresolvedEmails.length && !capReached) {
          const unresolvedInputs: AutoTimeEntryEmailInput[] = unresolvedEmails.map(e => ({
            id: e.id, subject: e.subject, snippet: e.snippet, fromName: e.fromName, matterId: e.projectId, matterLabel: matterLabel(e.projectId),
          }));
          try {
            const result = await draftAutoTimeEntries(MODEL_ID, [], unresolvedInputs, detailLevel);
            if (result) {
              const cost = costUsd("hosted", MODEL_ID, result);
              await admin.from("ai_usage_events").insert({
                company_id: companyId, user_id: user.id, model_id: MODEL_ID, provider: "hosted",
                input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
              });
              result.drafts.forEach((d, idx) => {
                const sourceEmailIds = d.sourceEmailIds.flatMap(repId => emailDuplicatesByRepId.get(repId) || [repId]);
                const emailPreviews = d.sourceEmailIds
                  .map(repId => attributedEmailById.get(repId))
                  .filter((e): e is NonNullable<typeof e> => !!e)
                  .map(e => ({ subject: e.subject, snippet: e.snippet, fromName: e.fromName }));
                entries.push({
                  key: `unresolved-${idx + 1}`,
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
              });
            }
          } catch (err) {
            console.error("auto-generate: unresolved-email draft failed:", err);
          } finally {
            emailsProcessed += unresolvedEmails.length;
            sendProgress();
          }
        }

        send({ type: "done", date, entries, staffOptions });
      } catch (err) {
        console.error("auto-generate: stream failed:", err);
        send({ type: "error", error: err instanceof Error ? err.message : "Could not generate time entries" });
      }
      controller.close();
    },
  });

  return new NextResponse(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
