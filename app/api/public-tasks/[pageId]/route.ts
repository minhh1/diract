// app/api/public-tasks/[pageId]/route.ts
// Powers the embeddable public task report page. Requires a real signed-in
// session — access is scoped by the page's self/team/company configuration,
// enforced here (not via RLS) using the service-role key, same pattern as
// the Gmail add-on's /my-tasks and /team-tasks endpoints.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { loadPageAndAuthorize } from "@/lib/publicTaskPageAuth";
import { logTaskActivity } from "@/lib/taskActivityLog";
import { filterTasksByProjectAccess } from "@/lib/projectAccess";
import { triggerCalendarSync } from "@/lib/triggerCalendarSync";
import { getActiveTaskStatuses, getMatterNumberFieldId } from "@/lib/publicTasksCache";
import { companyTodayStr } from "@/lib/companyLocalDate";

export async function GET(req: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const auth = await loadPageAndAuthorize(admin, pageId, user.id);
  if (auth.error) return auth.error;
  const { page, targetUserIds, isAdmin, scopeName } = auth;

  const TASK_SELECT = `
      id, name, due_date, due_time, is_completed, completed_at, estimated_cost, date_entered, assignee_id, project_id,
      status_id, assigned_team_id, is_monetary, created_by, awaiting_follow_up, follow_up_date, notes, source_message_id,
      source_email_subject, source_email_body, sync_to_company_calendar,
      assignee:assignee_id(id, full_name, email),
      creator:created_by(id, full_name, email),
      project:project_id(id, name, deleted_at),
      task_statuses:status_id(label, color_hex),
      teams:assigned_team_id(team_name)
    `;

  const fallbackIds = targetUserIds.length ? targetUserIds : ["00000000-0000-0000-0000-000000000000"];

  // Everything in this batch only needs page/targetUserIds/isAdmin (already
  // resolved above) -- none of these queries depend on each other's
  // results, so they all fire together instead of one round trip at a
  // time. This (plus the matching batch below) is the bulk of what made
  // this route slow: what used to be ~15 sequential requests is now 2-3
  // rounds. matterFieldId is fetched unconditionally (not just when the
  // page's own columns include "matter_number") because the "add/edit
  // task" project picker always wants matter numbers to disambiguate
  // same-named projects, regardless of whether the task LIST shows that
  // column -- matches the original form-options fetch's behavior, which
  // also always ran.
  const [
    { data: rawTasks },
    { data: watcherRows },
    { data: rawUnallocated },
    { data: targetProfiles },
    { data: allProjects },
    matterFieldId,
    statuses,
    { data: teams },
    { data: companyMembersForAssignees },
  ] = await Promise.all([
    admin.from("tasks").select(TASK_SELECT)
      .in("assignee_id", fallbackIds).eq("company_id", page.company_id).is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("due_time", { ascending: true, nullsFirst: false }),
    // ── Watched tasks ── A target user watching a task they're not the
    // assignee of should also show up under their tab -- fetched
    // separately since the query above is scoped to assignee_id.
    admin.from("task_watchers").select("task_id, profile_id").in("profile_id", fallbackIds),
    // ── Unallocated tasks ── fall through every per-user tab, so they get
    // their own pseudo-tab instead of disappearing entirely. Doesn't apply
    // to a self-scoped page (inherently "just my own tasks").
    page.scope !== "self"
      ? admin.from("tasks").select(TASK_SELECT)
          .is("assignee_id", null).eq("company_id", page.company_id).is("deleted_at", null)
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("due_time", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: null }),
    admin.from("profiles").select("id, full_name, email").in("id", fallbackIds),
    // Full project catalog is loaded once here (not searched per-keystroke)
    // -- the picker filters it client-side, far faster than a round trip
    // on every keystroke.
    admin.from("projects").select("id, name").eq("company_id", page.company_id).is("deleted_at", null).order("name"),
    // Cached (see lib/publicTasksCache.ts) -- a field DEFINITION and a
    // global status list both change far less often than task/board data,
    // so a 60s-stale answer here is a non-issue and this saves 2 real
    // round trips on every cache hit.
    getMatterNumberFieldId(page.company_id),
    getActiveTaskStatuses(),
    admin.from("teams").select("id, team_name").eq("company_id", page.company_id).eq("is_active", true),
    // 'my_and_unassigned' can assign to anyone in the company (enforced in
    // POST below), so the picker needs the full roster, not just
    // targetProfiles (== [page.created_by] for this scope).
    page.scope === "my_and_unassigned"
      ? admin.from("company_memberships").select("user_id").eq("company_id", page.company_id)
      : Promise.resolve({ data: null }),
  ]);

  // watchersByTask/extraWatchedIds only need the RAW (pre-access-filter)
  // task list -- project-access filtering only ever REMOVES tasks, never
  // adds any, so using raw ids here instead of waiting on a filter step is
  // exactly as correct and lets the watched-tasks fetch below join the
  // next batch instead of waiting behind it.
  const watchersByTask: Record<string, string[]> = {};
  for (const w of watcherRows || []) (watchersByTask[w.task_id] ||= []).push(w.profile_id);
  const rawAssignedIds = new Set((rawTasks || []).map((t: any) => t.id));
  const extraWatchedIds = [...new Set(Object.keys(watchersByTask))].filter(id => !rawAssignedIds.has(id));

  // Second round: matter values (needs matterFieldId), the
  // my_and_unassigned assignee roster (needs the company's member ids),
  // and the raw watched-task rows (needs extraWatchedIds, just computed
  // above) each depend on something the first round resolved, but not on
  // each other.
  const [matterValues, assigneeProfilesForCompany, { data: rawWatched }] = await Promise.all([
    matterFieldId && (allProjects?.length)
      // Don't filter by .in(record_id, ...) with hundreds of IDs — hits URL
      // limits and silently returns nothing. Fetch all values for this
      // field (already scoped to this company via field_id) and map in
      // memory; covers both a task row's matterNumber and the form
      // options catalog below from one fetch instead of two near-identical
      // ones.
      ? admin.from("company_custom_field_values").select("record_id, value_text").eq("field_id", matterFieldId)
      : Promise.resolve({ data: null }),
    page.scope === "my_and_unassigned"
      ? admin.from("profiles").select("id, full_name, email").in("id", (companyMembersForAssignees || []).map((m: any) => m.user_id))
      : Promise.resolve({ data: null }),
    extraWatchedIds.length
      ? admin.from("tasks").select(TASK_SELECT).in("id", extraWatchedIds).eq("company_id", page.company_id).is("deleted_at", null)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const matterByProject: Record<string, string> = Object.fromEntries(
    ((matterValues as any)?.data || []).map((v: any) => [v.record_id, v.value_text || ""])
  );

  // Third round: ONE project-access filter over the union of every raw
  // task list (a task can legitimately appear in more than one -- e.g.
  // unallocated AND watched -- so dedupe by id first), instead of up to
  // three separate calls each paying their own internal round trip(s).
  // Being on the same team-scoped page doesn't grant access to a project
  // restricted to specific teams/members — filter those out for whoever
  // is actually viewing the page (not the task's assignee). Admins can
  // already see everything else in the app, so they're exempt entirely.
  let allowedTaskIds: Set<string> | null = null;
  if (!isAdmin) {
    const byId = new Map<string, any>();
    for (const t of [...(rawTasks || []), ...(rawUnallocated || []), ...(rawWatched || [])]) byId.set(t.id, t);
    const filtered = await filterTasksByProjectAccess(admin, user.id, [...byId.values()]);
    allowedTaskIds = new Set(filtered.map((t: any) => t.id));
  }
  const applyAccess = (list: any[]) => allowedTaskIds ? list.filter((t: any) => allowedTaskIds!.has(t.id)) : list;

  // A task whose linked matter has been soft-deleted (e.g. a duplicate
  // matter cleaned up after the task was created) doesn't belong in any
  // normal assignee/Unallocated tab -- its projectName/matterNumber would
  // just be whatever the matter last looked like before deletion, easy to
  // mistake for current data. Pulled out into its own "Deleted tasks"
  // pseudo-tab instead (pushed below, next to Unallocated), same
  // fell-through-into-its-own-tab treatment Unallocated tasks already get.
  const isOrphaned = (t: any) => !!t.project_id && !!t.project?.deleted_at;

  const assignedTasksAll = applyAccess(rawTasks || []);
  const unallocatedTasksAll = applyAccess(rawUnallocated || []);
  const watchedTasksAll = applyAccess(rawWatched || []);
  const assignedTasks = assignedTasksAll.filter((t: any) => !isOrphaned(t));
  const unallocatedTasks = unallocatedTasksAll.filter((t: any) => !isOrphaned(t));
  const watchedTasks = watchedTasksAll.filter((t: any) => !isOrphaned(t));
  const deletedMatterTasks = [...assignedTasksAll, ...unallocatedTasksAll, ...watchedTasksAll]
    .filter(isOrphaned)
    .filter((t: any, i: number, arr: any[]) => arr.findIndex(x => x.id === t.id) === i);

  // Merging three separately-queried groups (assigned/watched/unallocated)
  // would otherwise leave each block sorted internally but not against each
  // other (e.g. all assigned tasks before all watched ones, regardless of
  // due date) — sort the combined list once so every tab's date order is
  // correct end to end.
  const dueSortKey = (t: any) => {
    if (!t.due_date) return "9999-99-99 99:99:99";
    return String(t.due_date).slice(0, 10) + " " + (t.due_time ? String(t.due_time).slice(0, 8) : "99:99:99");
  };
  const tasks = [...(assignedTasks || []), ...watchedTasks, ...unallocatedTasks]
    .sort((a, b) => dueSortKey(a).localeCompare(dueSortKey(b)));

  // Both depend on the final merged `tasks` list, but not on each other.
  // Includes deletedMatterTasks too (they're pulled out of `tasks`, but
  // still need their own follow-ups/overrides resolved for the Deleted
  // tasks tab).
  const followUpTaskIds = [...tasks, ...deletedMatterTasks].map((t: any) => t.id);
  const [{ data: followUps }, { data: overrides }] = followUpTaskIds.length
    ? await Promise.all([
        admin.from("task_follow_ups").select("id, task_id, followed_up_at, is_done").in("task_id", followUpTaskIds),
        // ── Organised-view classification, per (task, whose tab it's in) ──
        // The same task can be "Action" in the assignee's tab and
        // "Watching" in a watcher's tab, so this isn't a single value on
        // the task itself.
        admin.from("task_group_overrides").select("task_id, profile_id, task_group").in("task_id", followUpTaskIds),
      ])
    : [{ data: [] }, { data: [] }];

  const followUpsByTask: Record<string, { id: string; followedUpAt: string; isDone: boolean }[]> = {};
  for (const f of followUps || []) {
    (followUpsByTask[f.task_id] ||= []).push({ id: f.id, followedUpAt: String(f.followed_up_at).slice(0, 10), isDone: f.is_done });
  }
  const taskGroupByTaskAndUser: Record<string, string> = {};
  for (const o of overrides || []) {
    taskGroupByTaskAndUser[`${o.task_id}:${o.profile_id}`] = o.task_group;
  }

  const mapTask = (t: any, isWatcher: boolean, tabUserId: string) => ({
    id: t.id, name: t.name, isCompleted: t.is_completed, completedAt: t.completed_at,
    assigneeId: t.assignee_id,
    dueDate: t.due_date ? String(t.due_date).slice(0, 10) : null,
    dueTime: t.due_time,
    projectId: t.project_id,
    projectName: t.project?.name || null,
    matterNumber: t.project_id ? matterByProject[t.project_id] || null : null,
    statusId: t.status_id,
    status: t.task_statuses?.label || null,
    statusColor: t.task_statuses?.color_hex || null,
    teamId: t.assigned_team_id,
    team: t.teams?.team_name || null,
    isMonetary: t.is_monetary,
    estimatedCost: t.estimated_cost,
    dateEntered: t.date_entered,
    createdBy: t.creator?.full_name || t.creator?.email || null,
    awaitingFollowUp: t.awaiting_follow_up,
    followUpDate: t.follow_up_date ? String(t.follow_up_date).slice(0, 10) : null,
    notes: t.notes,
    sourceMessageId: t.source_message_id,
    sourceEmailSubject: t.source_email_subject,
    sourceEmailBody: t.source_email_body,
    syncToCompanyCalendar: !!t.sync_to_company_calendar,
    followUps: followUpsByTask[t.id] || [],
    isWatcher,
    watcherIds: watchersByTask[t.id] || [],
    taskGroup: taskGroupByTaskAndUser[`${t.id}:${tabUserId}`] || null,
  });

  const tabs = (targetProfiles || [])
    .map((p: any) => ({
      userId: p.id,
      userName: p.full_name || p.email || "Unknown",
      tasks: (tasks || [])
        .filter((t: any) => t.assignee_id === p.id || (watchersByTask[t.id] || []).includes(p.id))
        .map((t: any) => mapTask(t, t.assignee_id !== p.id, p.id)),
    }))
    .sort((a: any, b: any) => a.userName.localeCompare(b.userName));

  if (page.scope !== "self") {
    tabs.push({
      userId: "unallocated",
      userName: "Unallocated",
      tasks: unallocatedTasks.map((t: any) => mapTask(t, false, "unallocated")),
    });
  }
  // Next to Unallocated -- only shown when there's actually one of these,
  // unlike Unallocated (which always appears on a non-self page even at 0)
  // since an orphaned-matter task is an edge case worth flagging, not a
  // routine state every page should always show a tab for.
  if (deletedMatterTasks.length) {
    tabs.push({
      userId: "deleted",
      userName: "Deleted tasks",
      tasks: deletedMatterTasks.map((t: any) => mapTask(t, false, "deleted")),
    });
  }

  // Form options for "add/edit task" -- projects/matter numbers/statuses/
  // teams/assignee roster were all already fetched in the two batches
  // above (allProjects, matterByProject, statuses, teams,
  // assigneeProfilesForCompany), so this is just assembling the response,
  // not any new I/O. 'my_and_unassigned' can assign to anyone in the
  // company (enforced above in POST), so its picker needs the full roster,
  // not just targetProfiles (== [page.created_by] for this scope).
  const assigneeProfiles = page.scope === "my_and_unassigned" ? (assigneeProfilesForCompany as any)?.data : targetProfiles;

  return NextResponse.json({
    title: page.title,
    scopeName,
    scope: page.scope,
    columns: page.columns,
    companyId: page.company_id,
    companyType: page.companies?.company_type || null,
    tabs,
    formOptions: {
      projects: (allProjects || []).map((p: any) => ({ id: p.id, name: p.name, matterNumber: matterByProject[p.id] || null })),
      statuses: statuses || [],
      teams: teams || [],
      assignees: (assigneeProfiles || []).map((p: any) => ({ id: p.id, name: p.full_name || p.email || "Unknown" })),
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const auth = await loadPageAndAuthorize(admin, pageId, user.id);
  if (auth.error) return auth.error;
  const { page, targetUserIds } = auth;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { name, projectId, dueDate, dueTime, statusId, teamId, assigneeId, notes, watcherIds, syncToCompanyCalendar } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Task name is required" }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: "Project is required" }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id, company_id").eq("id", projectId).maybeSingle();
  if (!project || project.company_id !== page.company_id) {
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }

  let finalAssigneeId: string | null = assigneeId || null;
  if (finalAssigneeId && page.scope === "my_and_unassigned") {
    // The whole point of this scope: unlike self/team/company, the viewer
    // can hand a task to anyone in the company, not just whoever the page's
    // own tabs are about (targetUserIds is just [page.created_by] here).
    const { data: assigneeMembership } = await admin
      .from("company_memberships").select("user_id").eq("company_id", page.company_id).eq("user_id", finalAssigneeId).maybeSingle();
    if (!assigneeMembership) {
      return NextResponse.json({ error: "Assignee is outside this company" }, { status: 400 });
    }
  } else if (finalAssigneeId && !targetUserIds.includes(finalAssigneeId)) {
    return NextResponse.json({ error: "Assignee is outside this page's scope" }, { status: 400 });
  }
  // Only auto-assign to the creator when they had no way to choose
  // otherwise (a single-target page hides the assignee picker entirely) —
  // on a multi-assignee page, leaving it blank means "unallocated",
  // deliberately, not "assign to me".
  if (!finalAssigneeId && targetUserIds.length === 1 && targetUserIds.includes(user.id)) finalAssigneeId = user.id;

  const { data: task, error } = await admin.from("tasks").insert({
    project_id: projectId,
    company_id: page.company_id,
    name: name.trim(),
    due_date: dueDate || null,
    due_time: dueTime || null,
    status_id: statusId || null,
    assigned_team_id: teamId || null,
    assignee_id: finalAssigneeId,
    notes: notes || null,
    sync_to_company_calendar: !!syncToCompanyCalendar,
    created_by: user.id,
    date_entered: companyTodayStr(page.companies?.company_type),
    is_completed: false,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logTaskActivity(admin, { taskId: task.id, companyId: page.company_id, actorId: user.id, action: "created" });

  if (Array.isArray(watcherIds) && watcherIds.length) {
    await admin.from("task_watchers").insert(watcherIds.map((profile_id: string) => ({ task_id: task.id, company_id: page.company_id, profile_id, created_by: user.id })));
  }

  if (task.due_date) triggerCalendarSync(task.id, "upsert");

  return NextResponse.json({ ok: true, task });
}
