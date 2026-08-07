// supabase/functions/gmail-addon/index.ts
// Handles all Gmail Add-on API calls

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const googleClientId     = Deno.env.get('GOOGLE_CLIENT_ID')!;
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getProfileId(email: string): Promise<string | null> {
  if (!email) return null;
  const { data } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  return data?.id || null;
}

async function isCompanyAdmin(email: string, companyId: string): Promise<boolean> {
  const profileId = await getProfileId(email);
  if (!profileId) return false;
  const { data } = await db.from('company_memberships').select('role')
    .eq('user_id', profileId).eq('company_id', companyId).maybeSingle();
  return data?.role === 'company_admin';
}

// Mirrors lib/schema/fieldCapabilities.ts (Next.js app) -- kept in sync
// manually since this Deno function can't import from the app.
const RELATION_FIELD_TYPES = ['table_relation', 'property', 'entity', 'project', 'link'];
function isRelationFieldType(fieldType: string): boolean {
  return RELATION_FIELD_TYPES.includes(fieldType);
}
function valueColumnForFieldType(fieldType: string): string {
  if (fieldType === 'number' || fieldType === 'currency') return 'value_number';
  if (fieldType === 'date') return 'value_date';
  if (fieldType === 'boolean') return 'value_boolean';
  if (isRelationFieldType(fieldType)) return 'value_record_id';
  return 'value_text';
}
function isEmptyFieldValue(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

// Relation field types that resolve to one of the three fixed system
// tables, each with an obvious single identifying text column -- table_relation
// and link are excluded (no established identifying-column convention, and
// unused on system-table custom fields as of writing) and stay blocked.
const RESOLVABLE_RELATION_TABLES: Record<string, { table: string; nameColumn: string }> = {
  entity: { table: 'entities', nameColumn: 'name' },
  property: { table: 'properties', nameColumn: 'street_address' },
  project: { table: 'projects', nameColumn: 'name' },
};
function isResolvableRelationType(fieldType: string): boolean {
  return fieldType in RESOLVABLE_RELATION_TABLES;
}

// Resolves a typed name (or, for "property", a typed address) to a row in
// the relevant system table without a search-and-pick UI (Google CardService
// can't do live search) -- mirrors lib/ai/actions.ts's
// resolveEntityByName/resolveProjectByName + pickBestMatch (used by the
// Teams bot for the identical "no picker available" problem): a single
// ilike candidate, or an exact case-insensitive match among several, is
// treated as confident and linked directly. Anything less certain (no
// match, or several similarly-named candidates with none an exact match)
// creates a new row rather than guessing which existing one was meant, and
// flags it needs_review=true so it surfaces in that table's review banner
// (components/GenericMasterTable.tsx) -- the existing duplicate-
// reconciliation tool (Settings → Reconciliation) is what a user would then
// use to merge it if it does turn out to be a duplicate.
// Case-insensitive EXACT match (ilike with no wildcards) -- checked first
// and separately from the fuzzy substring search below, because the DB's
// own uniqueness guard on this table (e.g. entities' unique_entity_per_company)
// keys off the exact name, not a substring. Two different relation fields
// resolving the identical name on the same project (e.g. Client Name and
// Debtor both "X Pty Ltd") is a completely ordinary case, not an edge case
// -- skipping this exact check and going straight to the fuzzy search below
// is what caused it to intermittently 500 with a duplicate-key error
// instead of just linking to the same record for both fields.
async function findExactRelationMatch(table: string, nameColumn: string, companyId: string, trimmed: string): Promise<{ id: string } | null> {
  const { data } = await db
    .from(table)
    .select('id')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .ilike(nameColumn, trimmed)
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id } : null;
}

async function resolveOrCreateRelation(
  companyId: string, fieldType: string, name: string, createdBy: string | null, fieldLabel: string | null
): Promise<{ id: string; flagged: boolean; table: string }> {
  const config = RESOLVABLE_RELATION_TABLES[fieldType];
  if (!config) throw new Error(`Unsupported relation field type: ${fieldType}`);
  const trimmed = name.trim();

  const exact = await findExactRelationMatch(config.table, config.nameColumn, companyId, trimmed);
  if (exact) return { id: exact.id, flagged: false, table: config.table };

  const { data: candidates } = await db
    .from(config.table)
    .select(`id, ${config.nameColumn}`)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .ilike(config.nameColumn, `%${trimmed}%`);

  const list = (candidates || []) as any[];
  // No exact-match branch needed here any more (handled above) -- several
  // fuzzy candidates with none exact is genuinely ambiguous.
  const match = list.length === 1 ? list[0] : null;
  if (match) return { id: match.id, flagged: false, table: config.table };

  const reason = list.length > 1
    ? `Created from Gmail -- "${trimmed}" matched several existing records, none exactly: ${list.map((c) => c[config.nameColumn]).join(', ')}`
    : `Created from Gmail -- "${trimmed}" didn't match any existing record`;
  const insertRow: Record<string, unknown> = {
    company_id: companyId,
    [config.nameColumn]: trimmed,
    needs_review: true,
    review_reason: reason,
    review_created_by: createdBy,
    review_field_label: fieldLabel,
  };
  if (fieldType === 'entity') insertRow.entity_type = 'Company';
  if (fieldType === 'project') { insertRow.status = 'active'; insertRow.created_by = createdBy; }

  const { data: created, error } = await db
    .from(config.table)
    .insert(insertRow)
    .select('id').single();

  if (error?.code === '23505') {
    // Lost a race against a concurrent request creating the same name (e.g.
    // a double-tap on "Create project & label") -- someone else's insert won
    // between our candidate search and our own insert. Re-query by exact
    // name (not the fuzzy search -- that's what let this fall through to an
    // error previously) rather than erroring: the row now exists, so use it
    // like a normal confident match.
    const retryExact = await findExactRelationMatch(config.table, config.nameColumn, companyId, trimmed);
    if (retryExact) return { id: retryExact.id, flagged: false, table: config.table };
  }
  if (error || !created) throw new Error(error?.message || `Failed to create ${fieldType}`);

  // Best-effort -- this is the one place needs_review ever gets set true
  // (components/GenericMasterTable.tsx only ever reads/clears it). try/catch,
  // not .catch() chained directly on the rpc() call -- this Supabase client's
  // query builder is thenable (awaitable) but doesn't implement a real
  // .catch() method, so chaining one throws synchronously ("X.catch is not
  // a function") instead of ever reaching the actual RPC (confirmed live:
  // this broke every create-project call that flagged a new entity/project
  // for review, well before auto-numbering existed).
  try {
    await db.rpc('notify_company_admins', {
      p_company_id: companyId,
      p_event_type: 'gmail_needs_review',
      p_title: `Needs review: "${trimmed}"`,
      p_body: reason,
      p_link_url: `/dashboard/${config.table}?id=${created.id}`,
      p_entity_table: config.table,
      p_entity_id: created.id,
    });
  } catch (_) { /* best-effort */ }

  return { id: created.id, flagged: true, table: config.table };
}

// Fills in review_source_table/review_source_record_id on every relation
// resolveOrCreateRelation flagged for this request, once the parent record
// they were typed into actually exists -- it doesn't yet at the point
// resolveOrCreateRelation runs (that insert happens before the parent
// record's own insert), so this is a follow-up update rather than part of
// the original insert. Best-effort: this is review-banner display metadata,
// not something worth failing an otherwise-successful create over.
async function linkFlaggedRelationsToSource(
  flaggedRelations: { table: string; id: string }[], sourceTable: string, sourceRecordId: string
): Promise<void> {
  if (flaggedRelations.length === 0) return;
  const idsByTable = new Map<string, string[]>();
  for (const r of flaggedRelations) idsByTable.set(r.table, [...(idsByTable.get(r.table) || []), r.id]);
  try {
    await Promise.all([...idsByTable.entries()].map(([table, ids]) =>
      db.from(table).update({ review_source_table: sourceTable, review_source_record_id: sourceRecordId }).in('id', ids)
    ));
  } catch (_) { /* best-effort */ }
}

async function logTaskActivity(params: { taskId: string; companyId: string; actorId: string | null; action: string; detail?: string | null }) {
  await db.from('task_activity_log').insert({
    task_id: params.taskId,
    company_id: params.companyId,
    actor_id: params.actorId,
    action: params.action,
    detail: params.detail || null,
  });

  // Best-effort fan-out to watchers -- mirrors lib/taskActivityLog.ts's
  // logTaskActivity on the web-app side of this event.
  const [{ data: watchers }, { data: task }] = await Promise.all([
    db.from('task_watchers').select('profile_id').eq('task_id', params.taskId),
    db.from('tasks').select('name').eq('id', params.taskId).maybeSingle(),
  ]);
  const recipients = (watchers || [])
    .map((w: any) => w.profile_id as string)
    .filter((id: string) => id !== params.actorId);
  // try/catch per-recipient, not .catch() chained on the rpc() call itself --
  // see resolveOrCreateRelation's matching comment for why that throws
  // synchronously instead of ever making the request.
  await Promise.all(recipients.map(async (recipientId: string) => {
    try {
      await db.rpc('create_notification', {
        p_company_id: params.companyId,
        p_recipient_user_id: recipientId,
        p_event_type: 'task_comment',
        p_title: `Update on ${task?.name || 'a task'}`,
        p_body: params.detail || params.action,
        p_link_url: `/dashboard/tasks?id=${params.taskId}`,
        p_entity_table: 'tasks',
        p_entity_id: params.taskId,
      });
    } catch (_) { /* best-effort */ }
  }));
}

// Enqueues a label_sync job right after a label is created, instead of
// relying solely on gmail-label-sync-cron's 15-minute sweep to notice the
// new project_gmail_labels row -- gmail-label-sync-worker runs every 1
// minute, so this gets a brand-new label synced within ~60s instead of up
// to 15 minutes. Best-effort: never throws, since a missing job just means
// the 15-min cron catches it later instead of blocking the label creation.
async function enqueueLabelSyncJob(companyId: string, projectId: string, labelCode: string, gmailLabelName: string): Promise<void> {
  try {
    const { data: members } = await db.from('company_memberships').select('user_id').eq('company_id', companyId);
    const memberIds = (members || []).map((m: any) => m.user_id);
    const { data: connected } = memberIds.length
      ? await db.from('user_gmail_tokens').select('user_id').in('user_id', memberIds)
      : { data: [] as any[] };
    const totalUsers = (connected || []).length;
    if (!totalUsers) return;

    await db.from('gmail_sync_jobs').insert({
      job_type: 'label_sync',
      company_id: companyId,
      project_id: projectId,
      label_code: labelCode,
      gmail_label_name: gmailLabelName,
      status: 'pending',
      attempts: 0,
      completed_users: [],
      total_users: totalUsers,
      is_realtime: true, // a brand-new label should sync ahead of the routine backlog
    });
  } catch (err: any) {
    console.error('[enqueueLabelSyncJob] failed:', err.message);
  }
}

function truncateText(text: string, max = 40): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function quotedText(text: string | null | undefined): string {
  const t = (text || '').trim();
  return t ? `"${truncateText(t)}"` : '(none)';
}

async function nameForProfileId(id: string | null | undefined): Promise<string> {
  if (!id) return 'Unassigned';
  const { data } = await db.from('profiles').select('full_name, email').eq('id', id).maybeSingle();
  return data?.full_name || data?.email || 'Unknown';
}

async function nameForTeamId(id: string | null | undefined): Promise<string> {
  if (!id) return 'No team';
  const { data } = await db.from('teams').select('team_name').eq('id', id).maybeSingle();
  return data?.team_name || 'Unknown';
}

// Watchers -- extra people (beyond the assignee) who see a task and get
// notified, but aren't responsible for it. Grouped per task for list views.
async function watchersByTaskIds(taskIds: string[]): Promise<Record<string, { id: string; name: string }[]>> {
  const result: Record<string, { id: string; name: string }[]> = {};
  if (!taskIds.length) return result;
  const { data: rows } = await db.from('task_watchers').select('task_id, profile_id').in('task_id', taskIds);
  if (!rows?.length) return result;
  const profileIds = [...new Set(rows.map((r: any) => r.profile_id))];
  const { data: profiles } = await db.from('profiles').select('id, full_name, email').in('id', profileIds);
  const nameById: Record<string, string> = {};
  for (const p of profiles || []) nameById[p.id] = p.full_name || p.email || 'Unknown';
  for (const r of rows) {
    (result[r.task_id] ||= []).push({ id: r.profile_id, name: nameById[r.profile_id] || 'Unknown' });
  }
  return result;
}

// Per-task follow-up count (done entries) and next scheduled date (earliest
// pending entry) -- shared by /project-tasks, /all-tasks, /unallocated-tasks,
// run alongside their other independent lookups via Promise.all rather than
// after them, since none of these three depend on each other.
async function followUpSummary(taskIds: string[]): Promise<{ counts: Record<string, number>; scheduled: Record<string, string> }> {
  const counts: Record<string, number> = {};
  const scheduled: Record<string, string> = {};
  if (!taskIds.length) return { counts, scheduled };
  const { data: followUps } = await db.from('task_follow_ups').select('task_id, is_done, followed_up_at').in('task_id', taskIds);
  for (const f of followUps || []) {
    if (f.is_done) {
      counts[f.task_id] = (counts[f.task_id] || 0) + 1;
    } else if (!scheduled[f.task_id] || f.followed_up_at < scheduled[f.task_id]) {
      scheduled[f.task_id] = f.followed_up_at;
    }
  }
  return { counts, scheduled };
}

// Matter-number custom-field value per project, for the simplified task-row
// view -- shared by /all-tasks and /unallocated-tasks.
async function matterNumbersForProjects(companyId: string, projectIds: string[]): Promise<Record<string, string>> {
  if (!projectIds.length) return {};
  const { data: matterField } = await db.from('company_custom_fields')
    .select('id').eq('company_id', companyId).eq('table_name', 'projects').eq('field_key', 'matter_number').maybeSingle();
  if (!matterField) return {};
  const { data: values } = await db.from('company_custom_field_values')
    .select('record_id, value_text').eq('field_id', matterField.id).in('record_id', projectIds);
  return Object.fromEntries((values || []).map((v: any) => [v.record_id, v.value_text || '']));
}

// Company-scoped Gmail label settings -- no calling-user data in here
// (isAdmin is layered on by /label-settings itself), so this is safe to
// share verbatim across every user of a company via /warm-cache.
async function getLabelSettingsCore(companyId: string): Promise<{ parentLabel: string; parentCode: string; separator: string; tokens: string[] } | null> {
  const { data: company } = await db
    .from('companies')
    .select('gmail_label_format, gmail_parent_label, gmail_parent_code, gmail_sublabel_separator, gmail_label_tokens, gmail_source_emails')
    .eq('id', companyId)
    .single();
  if (!company) return null;
  return {
    parentLabel: company.gmail_parent_label || 'Shared Emails',
    parentCode: company.gmail_parent_code || '',
    separator: company.gmail_sublabel_separator || ' -- ',
    tokens: company.gmail_label_tokens || ['project_name'],
  };
}

// Company-scoped project custom-field settings -- likewise no calling-user
// data (isAdmin is layered on by /project-field-settings itself).
async function getProjectFieldsCore(companyId: string): Promise<{ fields: any[] }> {
  const { data: fields } = await db
    .from('company_custom_fields')
    .select('id, field_key, label, field_type, is_required, is_unique, select_options, display_order, auto_number_prefix')
    .eq('company_id', companyId)
    .eq('table_name', 'projects')
    .is('deleted_at', null)
    .order('display_order');

  return {
    fields: (fields || []).map((f: any) => ({
      id: f.id,
      fieldKey: f.field_key,
      label: f.label,
      fieldType: f.field_type,
      isRequired: f.is_required,
      isUnique: f.is_unique,
      selectOptions: f.select_options || [],
      isRelationType: isRelationFieldType(f.field_type),
      isResolvableRelation: isResolvableRelationType(f.field_type),
      // Assigned server-side on creation (see /create-project below and
      // supabase/migrations/20260730180000_custom_field_auto_numbering.sql)
      // -- the add-on's own create-project card (GmailAddon.js) uses this
      // to hide/replace this field's input with an "auto-assigned" note.
      autoNumber: f.auto_number_prefix != null, // != null, not truthiness: '' is a valid prefix (bare numbers)
    })),
  };
}

// Company-scoped task-building blocks (profiles/statuses/teams/templates) -
// nothing here varies per calling user, so it's shared as-is via /warm-cache.
async function getTaskContextCore(companyId: string) {
  const [
    { data: members, error: membersErr },
    { data: statuses },
    { data: teams, error: teamsErr },
    { data: templates },
  ] = await Promise.all([
    db.from('company_memberships')
      .select('user_id')
      .eq('company_id', companyId),
    db.from('task_statuses')
      .select('id, label, color_hex')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    db.from('teams')
      .select('id, team_name')
      .eq('company_id', companyId)
      .eq('is_active', true),
    db.from('checklist_templates')
      .select('id, name, items:checklist_template_items(id, title, due_offset_days, due_anchor, assignee_id, assigned_team_id, is_monetary, estimated_cost, display_order)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true }),
  ]);

  if (membersErr) console.error('[task-context] members error:', membersErr.message);
  if (teamsErr) console.error('[task-context] teams error:', teamsErr.message);

  const userIds = (members || []).map((m: any) => m.user_id);
  const { data: profileRows, error: profilesErr } = await db
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);

  if (profilesErr) console.error('[task-context] profiles error:', profilesErr.message);
  const profiles = profileRows || [];

  const sortedTemplates = (templates || []).map((t: any) => ({
    ...t,
    items: (t.items || []).sort((a: any, b: any) => a.display_order - b.display_order),
  }));

  return {
    profiles,
    statuses: statuses || [],
    teams: teams || [],
    templates: sortedTemplates,
    reminderOptions: [
      { value: 'none', label: 'No reminder' },
      { value: '15min', label: '15 minutes before' },
      { value: '30min', label: '30 minutes before' },
      { value: '1hour', label: '1 hour before' },
      { value: '2hours', label: '2 hours before' },
      { value: '1day', label: '1 day before' },
      { value: '2days', label: '2 days before' },
      { value: '1week', label: '1 week before' },
    ],
  };
}

// Company-wide unallocated tasks -- no calling-user data, shared as-is via
// /warm-cache (only page 0 is worth pre-warming; deeper pages stay live).
async function getUnallocatedTasksCore(companyId: string, limit: number, offset: number): Promise<{ tasks: any[]; limit: number; offset: number; totalCount: number | null; error?: string }> {
  const [
    { data: tasks, error: tasksErr },
    { count: totalCount },
  ] = await Promise.all([
    db.from('tasks')
      .select(`
        id, name, is_completed, due_date, due_time, assignee_id, assigned_team_id,
        status_id, is_monetary, estimated_cost, created_by, awaiting_follow_up, follow_up_date, notes, source_message_id, source_email_subject, source_email_body, calendar_target, sync_to_company_calendar,
        project_id,
        projects:project_id(id, name, project_gmail_labels(gmail_label_name, label_code)),
        teams:assigned_team_id(team_name),
        task_statuses:status_id(label, color_hex),
        creator:created_by(full_name, email)
      `)
      .eq('company_id', companyId)
      .is('assignee_id', null)
      .eq('is_completed', false)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('due_time', { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1),
    db.from('tasks').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).is('assignee_id', null).eq('is_completed', false).is('deleted_at', null),
  ]);

  if (tasksErr) return { tasks: [], limit, offset, totalCount: null, error: tasksErr.message };

  const taskIds = (tasks || []).map((t: any) => t.id);
  const projectIds: string[] = [...new Set<string>((tasks || []).map((t: any) => t.project_id).filter(Boolean))];
  const [
    { counts: followUpCounts, scheduled: scheduledFollowUpDates },
    watchersByTask,
    matterByProject,
  ] = await Promise.all([
    followUpSummary(taskIds),
    watchersByTaskIds(taskIds),
    matterNumbersForProjects(companyId, projectIds),
  ]);

  return {
    tasks: (tasks || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      isCompleted: t.is_completed,
      dueDate: t.due_date,
      dueTime: t.due_time,
      projectId: t.project_id,
      projectName: t.projects?.name || null,
      matterNumber: t.project_id ? matterByProject[t.project_id] || null : null,
      labelName: t.projects?.project_gmail_labels?.[0]?.gmail_label_name || null,
      labelCode: t.projects?.project_gmail_labels?.[0]?.label_code || null,
      assignedTeamId: t.assigned_team_id,
      assignedTeam: t.teams?.team_name || null,
      statusId: t.status_id,
      status: t.task_statuses?.label || null,
      statusColor: t.task_statuses?.color_hex || null,
      isMonetary: t.is_monetary,
      estimatedCost: t.estimated_cost,
      createdBy: t.creator?.full_name || t.creator?.email || null,
      awaitingFollowUp: t.awaiting_follow_up,
      followUpDate: t.follow_up_date,
      followUpCount: followUpCounts[t.id] || 0,
      scheduledFollowUpDate: scheduledFollowUpDates[t.id] || null,
      notes: t.notes,
      sourceMessageId: t.source_message_id,
      sourceEmailSubject: t.source_email_subject,
      sourceEmailBody: t.source_email_body,
      calendarTarget: t.calendar_target,
      syncToCompanyCalendar: t.sync_to_company_calendar,
      watchers: watchersByTask[t.id] || [],
    })),
    limit,
    offset,
    totalCount,
  };
}

// Reconciles a task's watcher list to exactly `newIds`, logging the diff.
async function saveWatchers(taskId: string, companyId: string, newIds: string[], actorEmail: string): Promise<void> {
  const { data: existing } = await db.from('task_watchers').select('profile_id').eq('task_id', taskId);
  const oldIds = (existing || []).map((w: any) => w.profile_id);
  const added = newIds.filter(id => !oldIds.includes(id));
  const removed = oldIds.filter((id: string) => !newIds.includes(id));
  if (!added.length && !removed.length) return;

  if (removed.length) await db.from('task_watchers').delete().eq('task_id', taskId).in('profile_id', removed);
  const actorId = await getProfileId(actorEmail);
  if (added.length) {
    await db.from('task_watchers').insert(added.map(profile_id => ({ task_id: taskId, company_id: companyId, profile_id, created_by: actorId })));
  }
  const [addedNames, removedNames] = await Promise.all([
    Promise.all(added.map(id => nameForProfileId(id))),
    Promise.all(removed.map(id => nameForProfileId(id))),
  ]);
  const detail = [
    addedNames.length ? `+watcher ${addedNames.join(', ')}` : null,
    removedNames.length ? `-watcher ${removedNames.join(', ')}` : null,
  ].filter(Boolean).join(', ');
  if (detail) logTaskActivity({ taskId, companyId, actorId, action: 'updated', detail });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/gmail-addon/, '');
  const userEmail = req.headers.get('X-User-Email') || '';

  console.log(`[gmail-addon] ${req.method} ${path} user=${userEmail}`);

  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    // ── GET /user-context ──────────────────────────────────────────
    if (req.method === 'GET' && path === '/user-context') {
      if (!userEmail) return json({ error: 'No user email' }, 401, headers);

      // Find profile by email
      const { data: profile } = await db
        .from('profiles')
        .select('id, full_name, active_company_id')
        .eq('email', userEmail)
        .single();

      if (!profile) return json({ error: 'User not found. Connect Gmail in the Flow app first.' }, 404, headers);

      // Get all companies this user belongs to
      const { data: memberships } = await db
        .from('company_memberships')
        .select('company_id, role, companies:company_id(id, name)')
        .eq('user_id', profile.id);

      const companies = (memberships || []).map((m: any) => ({
        id: m.company_id,
        name: m.companies?.name || m.company_id,
        role: m.role,
      }));

      const activeCompany = companies.find(c => c.id === profile.active_company_id) || companies[0];

      return json({
        email: userEmail,
        userId: profile.id,
        companies,
        activeCompanyId: activeCompany?.id || null,
        activeCompanyName: activeCompany?.name || null,
      }, 200, headers);
    }

    // ── POST /switch-company ───────────────────────────────────────
    if (req.method === 'POST' && path === '/switch-company') {
      const body = await req.json();
      const { companyId } = body;
      if (!userEmail || !companyId) return json({ error: 'Missing params' }, 400, headers);

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();
      if (!profile) return json({ error: 'User not found' }, 404, headers);

      await db.from('profiles').update({ active_company_id: companyId }).eq('id', profile.id);

      const { data: company } = await db
        .from('companies').select('name').eq('id', companyId).single();

      return json({ ok: true, companyName: company?.name }, 200, headers);
    }

    // ── GET /warm-cache ─────────────────────────────────────────────
    // Called by the add-on's own time-based trigger (warmAddonCaches in
    // GmailAddon.js), not by any user action -- bulk-fetches the
    // company-scoped (never per-calling-user) data every real card build
    // reads, for every company with at least one connected Gmail user, so
    // the trigger's script-wide cache is warm before anyone opens the
    // add-on. Deliberately excludes anything that varies per calling user
    // (isAdmin, per-assignee task lists) -- those still need their own
    // live/per-user-cached fetch.
    if (req.method === 'GET' && path === '/warm-cache') {
      const { data: connections } = await db
        .from('user_gmail_tokens')
        .select('user_id');
      const connectedUserIds = [...new Set((connections || []).map((c: any) => c.user_id))];
      if (!connectedUserIds.length) return json({ companies: [] }, 200, headers);

      const { data: memberships } = await db
        .from('company_memberships')
        .select('company_id')
        .in('user_id', connectedUserIds);
      const companyIds: string[] = [...new Set<string>((memberships || []).map((m: any) => m.company_id))];

      const companies = await Promise.all(companyIds.map(async (companyId) => {
        const [labelSettings, projectFields, taskContext, unallocatedTasks] = await Promise.all([
          getLabelSettingsCore(companyId),
          getProjectFieldsCore(companyId),
          getTaskContextCore(companyId),
          getUnallocatedTasksCore(companyId, 20, 0),
        ]);
        return { companyId, labelSettings, projectFields, taskContext, unallocatedTasks };
      }));

      return json({ companies }, 200, headers);
    }

    // ── GET /label-settings ────────────────────────────────────────
    if (req.method === 'GET' && path === '/label-settings') {
      const companyId = url.searchParams.get('companyId') || '';
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);

      const labelSettings = await getLabelSettingsCore(companyId);
      if (!labelSettings) return json({ error: 'Company not found' }, 404, headers);

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();
      const { data: mem } = await db
        .from('company_memberships').select('role').eq('user_id', profile?.id).eq('company_id', companyId).single();

      return json({
        ...labelSettings,
        isAdmin: mem?.role === 'company_admin',
      }, 200, headers);
    }

    // ── GET /check-message ─────────────────────────────────────────
    if (req.method === 'GET' && path === '/check-message') {
      const rawMessageId = url.searchParams.get('messageId') || '';
      const companyId = url.searchParams.get('companyId') || '';
      // Strip "msg-f:" prefix that Gmail Add-on passes
      const messageId = rawMessageId.replace(/^msg-f:/, '').replace(/^.*\|msg-f:/, '');

      console.log(`[check-message] messageId=${messageId} companyId=${companyId}`);

      const { data, error } = await db
        .from('project_emails')
        .select('project_id, projects:project_id(id, name), project_gmail_labels!inner(gmail_label_name, label_code)')
        .eq('gmail_message_id', messageId)
        .eq('company_id', companyId)
        .limit(1)
        .maybeSingle();

      console.log(`[check-message] data=${JSON.stringify(data)} error=${error?.message}`);

      if (!data) {
        // Try without company filter to debug
        const { data: anyData } = await db
          .from('project_emails')
          .select('project_id, company_id, gmail_message_id')
          .eq('gmail_message_id', messageId)
          .limit(3);
        console.log(`[check-message] without company filter: ${JSON.stringify(anyData)}`);
        return json({}, 200, headers);
      }

      return json({
        projectId: data.project_id,
        projectName: (data.projects as any)?.name || '',
        labelName: (data.project_gmail_labels as any)?.[0]?.gmail_label_name || '',
        labelCode: (data.project_gmail_labels as any)?.[0]?.label_code || '',
      }, 200, headers);
    }

    // ── GET /search-projects ───────────────────────────────────────
    if (req.method === 'GET' && path === '/search-projects') {
      const companyId = url.searchParams.get('companyId') || '';
      const labelled = url.searchParams.get('labelled');
      const q = url.searchParams.get('q') || '';
      const status = url.searchParams.get('status') || '';
      const page = parseInt(url.searchParams.get('page') || '0');
      const pageSize = 30;

      // Get sort config
      const { data: sortConfig } = await db
        .from('company_addon_config')
        .select('sort_field, sort_direction')
        .eq('company_id', companyId)
        .maybeSingle();

      const sortField = sortConfig?.sort_field || '__name__';
      const sortAsc = (sortConfig?.sort_direction || 'asc') === 'asc';

      // Only sort by DB columns directly -- custom field sorts done in memory
      const dbSortField = sortField === '__name__' ? 'name'
        : sortField === 'status' ? 'status'
        : 'name'; // fallback, custom field sorted in memory

      let query = db
        .from('projects')
        .select('id, name, status, project_gmail_labels(id, gmail_label_name)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order(dbSortField, { ascending: sortAsc })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (q) query = query.ilike('name', `%${q}%`);
      if (status) query = query.eq('status', status);

      const { data: projects } = await query;
      let filtered = projects || [];

      // If query and has custom field search, also search custom field values
      if (q) {
        // Get matching record IDs from custom field values
        const { data: cfMatches } = await db
          .from('company_custom_field_values')
          .select('record_id')
          .eq('company_id', companyId)
          .ilike('value_text', `%${q}%`);

        const cfMatchIds = new Set((cfMatches || []).map((r: any) => r.record_id));

        // Re-fetch all (without name filter) and combine
        if (cfMatchIds.size > 0) {
          let query2 = db
            .from('projects')
            .select('id, name, status, project_gmail_labels(id, gmail_label_name)')
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .order(dbSortField, { ascending: sortAsc });
          if (status) query2 = query2.eq('status', status);
          const { data: allProjects } = await query2;
          const existingIds = new Set(filtered.map((p: any) => p.id));
          (allProjects || []).forEach((p: any) => {
            if (cfMatchIds.has(p.id) && !existingIds.has(p.id)) {
              filtered.push(p);
            }
          });
        }
      }

      if (labelled === 'true') {
        filtered = filtered.filter((p: any) =>
          p.project_gmail_labels && p.project_gmail_labels.length > 0
        );
      } else if (labelled === 'false') {
        filtered = filtered.filter((p: any) =>
          !p.project_gmail_labels || p.project_gmail_labels.length === 0
        );
      }

      // Get addon display fields config for this company
      const { data: addonConfig } = await db
        .from('company_addon_config')
        .select('display_fields')
        .eq('company_id', companyId)
        .maybeSingle();

      const displayFields: string[] = addonConfig?.display_fields || [];
      console.log('[search-projects] displayFields:', displayFields);

      // Fetch custom field values for display fields
      let customValues: Record<string, Record<string, string>> = {};
      let cfDefs: any[] = [];
      if (displayFields.length > 0 && filtered.length > 0) {
        const projectIds = filtered.map((p: any) => p.id);
        // Get custom field definitions by field_key
        const cfDefsRes = await db
          .from('company_custom_fields')
          .select('id, label, field_key')
          .eq('company_id', companyId)
          .eq('table_name', 'projects')
          .in('field_key', displayFields);
        cfDefs = cfDefsRes.data || [];
        console.log('[search-projects] cfDefs found:', cfDefs.length, cfDefs.map((f: any) => f.field_key));

        if (cfDefs.length) {
          // Don't use .in(record_id, projectIds) -- too many IDs hits URL limits
          // Instead fetch all values for these fields and filter in memory
          const { data: cfVals, error: cfErr } = await db
            .from('company_custom_field_values')
            .select('record_id, field_id, value_text, value_number')
            .eq('company_id', companyId)
            .in('field_id', cfDefs.map((f: any) => f.id));

          console.log('[search-projects] cfVals found:', cfVals?.length, 'error:', cfErr?.message);

          const fieldKeyMap: Record<string, string> = {};
          cfDefs.forEach((f: any) => { fieldKeyMap[f.id] = f.field_key; });

          (cfVals || []).forEach((v: any) => {
            if (!customValues[v.record_id]) customValues[v.record_id] = {};
            const fieldKey = fieldKeyMap[v.field_id] || v.field_id;
            customValues[v.record_id][fieldKey] = v.value_text || String(v.value_number || '');
          });
        }
      }

      // Sort by custom field in memory if needed
      if (sortField !== '__name__' && sortField !== 'status') {
        filtered = [...filtered].sort((a: any, b: any) => {
          const aVal = (customValues[a.id]?.[sortField] || '').toLowerCase();
          const bVal = (customValues[b.id]?.[sortField] || '').toLowerCase();
          return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });
      }

      return json({
        projects: filtered.map((p: any) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          labelName: p.project_gmail_labels?.[0]?.gmail_label_name || null,
          customValues: customValues[p.id] || {},
        })),
        displayFields,
        sortField,
        sortDirection: sortAsc ? 'asc' : 'desc',
        page,
        pageSize,
        hasMore: filtered.length === pageSize,
      }, 200, headers);
    }

    // ── GET /addon-config ─────────────────────────────────────────
    if (req.method === 'GET' && path === '/addon-config') {
      const companyId = url.searchParams.get('companyId') || '';

      const { data: config } = await db
        .from('company_addon_config')
        .select('display_fields')
        .eq('company_id', companyId)
        .maybeSingle();

      // Get available custom fields for projects
      const { data: fields } = await db
        .from('company_custom_fields')
        .select('id, label, field_key, field_type')
        .eq('company_id', companyId)
        .eq('table_name', 'projects')
        .order('display_order');

      // System fields always available
      const systemFields = [
        { key: '__name__', label: 'Project name', type: 'system' },
        { key: 'status', label: 'Status', type: 'system' },
      ];

      const customFields = (fields || []).map((f: any) => ({
        key: f.field_key,
        label: f.label,
        type: f.field_type,
      }));

      // Default display order if nothing configured
      const defaultFields = ['__name__', 'status'];

      return json({
        displayFields: config?.display_fields || defaultFields,
        sortField: config?.sort_field || '__name__',
        sortDirection: config?.sort_direction || 'asc',
        availableFields: [...systemFields, ...customFields],
      }, 200, headers);
    }

    // ── POST /addon-config ────────────────────────────────────────
    if (req.method === 'POST' && path === '/addon-config') {
      const body = await req.json();
      const { companyId, displayFields } = body;
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);

      console.log('[addon-config] Saving:', JSON.stringify({ companyId, displayFields, sortField: body.sortField, sortDirection: body.sortDirection }));

      const { error: upsertErr } = await db.from('company_addon_config').upsert({
        company_id: companyId,
        display_fields: (displayFields || []).slice(0, 4),
        sort_field: body.sortField || '__name__',
        sort_direction: body.sortDirection || 'asc',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id' });

      if (upsertErr) {
        console.error('[addon-config] Upsert error:', upsertErr.message);
        return json({ error: upsertErr.message }, 500, headers);
      }

      console.log('[addon-config] Saved OK');
      return json({ ok: true }, 200, headers);
    }

    // ── POST /create-project ───────────────────────────────────────
    if (req.method === 'POST' && path === '/create-project') {
      const body = await req.json();
      const { projectName, matterNumber, status, messageId, companyId } = body;
      const customFieldValues: Record<string, string> = body.customFieldValues || {};
      const propertyAddress: string = (body.propertyAddress || '').trim();

      if (!projectName || !companyId) return json({ error: 'Missing required fields' }, 400, headers);

      // Exact-name duplicate guard -- case-insensitive (ilike with no
      // wildcards), so "Smith v Jones" and "smith v jones" count as the same
      // matter. Only an exact match is blocked; anything less certain is
      // left for a human to notice and merge via Reconciliation.
      const { data: dupProject } = await db
        .from('projects')
        .select('id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .ilike('name', projectName.trim())
        .limit(1)
        .maybeSingle();
      if (dupProject) {
        return json({ error: `A matter named "${projectName.trim()}" already exists.` }, 409, headers);
      }

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();
      if (!profile) return json({ error: 'User not found' }, 404, headers);

      // Get label settings
      const { data: company } = await db
        .from('companies')
        .select('gmail_parent_label, gmail_parent_code, gmail_sublabel_separator, gmail_label_tokens')
        .eq('id', companyId).single();

      // All configurable fields for projects, used for required/unique
      // enforcement and to know which DB column each value belongs in.
      const { data: projectFields } = await db
        .from('company_custom_fields')
        .select('id, label, field_key, field_type, is_required, is_unique, auto_number_prefix')
        .eq('company_id', companyId)
        .eq('table_name', 'projects')
        .is('deleted_at', null);
      const allFields = projectFields || [];

      // Auto-numbered fields (see supabase/migrations/
      // 20260730180000_custom_field_auto_numbering.sql) are assigned here,
      // BEFORE the label is built below -- unlike every other creation path,
      // the Gmail label name itself can include the matter number (via the
      // matter_number label token), so that value has to exist before the
      // label string is built, not just before the project row is created.
      // Accepted trade-off: a number assigned here is "spent" even if a
      // later validation in this same request fails and no project ends up
      // created -- fine for an ordinary matter number, unlike the dedicated
      // ledger-numbering system for r 36 trust receipts, which really does
      // need gapless consecutiveness.
      const autoAssignedValues: Record<string, string> = {};
      const autoAssignedNumbers: { label: string; value: string }[] = [];
      for (const field of allFields) {
        if ((field as any).auto_number_prefix == null) continue; // != null, not truthiness: '' is a valid prefix (bare numbers)
        const { data: num } = await db.rpc('next_custom_field_sequence', { p_field_id: field.id });
        if (num) {
          autoAssignedValues[field.id] = num;
          autoAssignedNumbers.push({ label: field.label, value: num });
        }
      }

      // Build label name
      const tokens: string[] = company?.gmail_label_tokens || ['project_name'];
      const separator = company?.gmail_sublabel_separator || ' -- ';
      const parentLabel = company?.gmail_parent_label || 'Shared Emails';
      const labelCode = await generateUniqueLabelCode(companyId);

      const matterFieldForLabel = allFields.find((f: any) =>
        f.label.toLowerCase().includes('matter') && f.label.toLowerCase().includes('number')
      );
      const resolvedMatterNumber = (matterFieldForLabel && autoAssignedValues[matterFieldForLabel.id]) || matterNumber || '';

      const parts = tokens.map((t: string) => {
        if (t === 'project_name') return projectName;
        if (t === 'matter_number') return resolvedMatterNumber;
        if (t === 'year') return new Date().getFullYear().toString();
        return t;
      }).filter(Boolean);

      // Replace "/" in parts to prevent Gmail splitting labels
      const cleanParts = parts.map((p: string) => p.replace(/\//g, ','));
      const sublabel = cleanParts.join(separator) + ` [${labelCode}]`;
      const fullLabelName = `${parentLabel}/${sublabel}`;

      // The dedicated "matter number" input (tied to the Gmail label format,
      // see gmail_label_tokens above) maps onto whichever custom field looks
      // like a matter number, same heuristic used since this field predates
      // the generic customFieldValues collection below. Auto-assigned values
      // always win over a client-supplied matterNumber (an older add-on
      // build could still send one even though the current UI no longer
      // shows that input once auto-numbering is on).
      const fieldValues: Record<string, string> = { ...customFieldValues, ...autoAssignedValues };
      if (matterNumber && matterFieldForLabel && !autoAssignedValues[matterFieldForLabel.id] && isEmptyFieldValue(fieldValues[matterFieldForLabel.id])) {
        fieldValues[matterFieldForLabel.id] = matterNumber;
      }

      // Resolvable relation fields (entity/property/project -- e.g. "Client
      // Name") arrive here as a typed name, not a record id -- there's no
      // search-and-pick UI in the add-on for relation fields. Resolve each
      // to a real row (creating one, flagged for review, when there's no
      // confident match) before the required-field check below and the
      // company_custom_field_values insert further down, both of which
      // expect a real id.
      const flaggedNames: string[] = [];
      // Which table/id each flagged row landed on -- the parent project
      // doesn't exist yet at this point, so review_source_record_id can't
      // be set here; it's filled in with a follow-up update once `project`
      // is inserted below.
      const flaggedRelations: { table: string; id: string }[] = [];
      for (const field of allFields) {
        if (!isResolvableRelationType(field.field_type)) continue;
        const typedName = fieldValues[field.id];
        if (isEmptyFieldValue(typedName)) continue;
        const resolved = await resolveOrCreateRelation(companyId, field.field_type, typedName, profile.id, field.label);
        fieldValues[field.id] = resolved.id;
        if (resolved.flagged) { flaggedNames.push(typedName); flaggedRelations.push({ table: resolved.table, id: resolved.id }); }
      }

      // Property is a base column (projects.property_id), not a custom
      // field, so it's resolved separately from the loop above. Required
      // specifically for Conveyancing matters (see NewProjectModal.tsx for
      // the same rule on the web-app side) -- optional otherwise.
      let propertyId: string | null = null;
      if (propertyAddress) {
        const resolvedProperty = await resolveOrCreateRelation(companyId, 'property', propertyAddress, profile.id, 'Property');
        propertyId = resolvedProperty.id;
        if (resolvedProperty.flagged) { flaggedNames.push(propertyAddress); flaggedRelations.push({ table: resolvedProperty.table, id: resolvedProperty.id }); }
      }

      const matterTypeField = allFields.find((f: any) =>
        f.field_key === 'matter_type' || f.label?.toLowerCase() === 'matter type'
      );
      const isConveyancing = matterTypeField
        ? String(fieldValues[matterTypeField.id] || '').toLowerCase() === 'conveyancing'
        : false;
      if (isConveyancing && !propertyId) {
        return json({ error: 'Property is required for Conveyancing matters.' }, 400, headers);
      }

      // Required-field check -- relation-type fields OTHER than the
      // resolvable ones (link/table_relation) have no input widget in the
      // add-on, so they're excluded from this check; a company with one of
      // those marked required can only create projects from the web app.
      const missingRequired = allFields.find((f: any) =>
        f.is_required && (!isRelationFieldType(f.field_type) || isResolvableRelationType(f.field_type)) && isEmptyFieldValue(fieldValues[f.id])
      );
      if (missingRequired) {
        return json({ error: `"${missingRequired.label}" is required.` }, 400, headers);
      }

      // Check field constraints before creating
      const fieldsToCheck = [{ key: 'name', value: projectName }];
      for (const [fieldId, value] of Object.entries(fieldValues)) {
        if (!isEmptyFieldValue(value)) fieldsToCheck.push({ key: `custom:${fieldId}`, value: String(value) });
      }
      const constraintCheck = await checkFieldConstraints(companyId, 'projects', fieldsToCheck);
      if (!constraintCheck.ok) {
        return json({ error: constraintCheck.error }, 409, headers);
      }

      // Create project in DB
      const { data: project, error: projErr } = await db
        .from('projects')
        .insert({
          company_id: companyId,
          name: projectName,
          status: status || 'active',
          property_id: propertyId,
          created_by: profile.id,
        })
        .select('id').single();

      if (projErr || !project) {
        return json({ error: projErr?.message || 'Failed to create project' }, 500, headers);
      }
      await linkFlaggedRelationsToSource(flaggedRelations, 'projects', project.id);

      // Create custom field values
      const fieldById = new Map(allFields.map((f: any) => [f.id, f]));
      const cfInserts = Object.entries(fieldValues)
        .filter(([, value]) => !isEmptyFieldValue(value))
        .map(([fieldId, value]) => {
          const field: any = fieldById.get(fieldId);
          if (!field) return null;
          const valueCol = valueColumnForFieldType(field.field_type);
          const typedValue = valueCol === 'value_number' ? parseFloat(value)
            : valueCol === 'value_boolean' ? value === 'true'
            : value;
          return {
            company_id: companyId,
            field_id: fieldId,
            record_id: project.id,
            table_name: 'projects',
            [valueCol]: typedValue,
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      if (cfInserts.length > 0) {
        const { error: cfErr } = await db.from('company_custom_field_values').insert(cfInserts);
        if (cfErr) {
          await db.from('projects').delete().eq('id', project.id);
          const isDuplicate = cfErr.code === '23505' || cfErr.message.includes('unique') || cfErr.message.includes('Duplicate');
          return json({ error: isDuplicate ? 'One of these values must be unique -- it already exists on another project' : cfErr.message }, isDuplicate ? 409 : 500, headers);
        }
      }

      // Create Gmail label in DB
      const { error: pglErr } = await db.from('project_gmail_labels').insert({
        company_id: companyId,
        project_id: project.id,
        gmail_label_name: fullLabelName,
        label_sub: sublabel,
        label_code: labelCode,
        created_by: profile.id,
      });

      if (pglErr) {
        console.error('[create-project] project_gmail_labels insert failed:', pglErr.message);
        // Roll back everything created so far -- a project silently missing
        // its label is worse than no project at all (see 2026-07-22 incident:
        // this insert's result was never checked, so the client was told
        // "success" while the label row never existed).
        if (cfInserts.length > 0) {
          await db.from('company_custom_field_values').delete().eq('record_id', project.id);
        }
        await db.from('projects').delete().eq('id', project.id);
        return json({ error: `Failed to create Gmail label: ${pglErr.message}` }, 500, headers);
      }

      await enqueueLabelSyncJob(companyId, project.id, labelCode, fullLabelName);

      // Save message to project_emails if messageId provided
      if (messageId) {
        await db.from('project_emails').upsert({
          company_id: companyId,
          user_id: profile.id,
          project_id: project.id,
          gmail_message_id: messageId,
          gmail_thread_id: messageId,
          gmail_label_applied: true,
        }, { onConflict: 'company_id,user_id,gmail_message_id', ignoreDuplicates: true });
      }

      return json({ ok: true, projectId: project.id, labelName: fullLabelName, labelCode, flaggedNames, autoAssignedNumbers }, 200, headers);
    }

    // ── GET /project-field-settings ─────────────────────────────────
    // Powers both the admin "required fields" settings card and the
    // "Create project" form's dynamic custom fields.
    if (req.method === 'GET' && path === '/project-field-settings') {
      const companyId = url.searchParams.get('companyId') || '';
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);

      const [projectFields, isAdmin] = await Promise.all([
        getProjectFieldsCore(companyId),
        isCompanyAdmin(userEmail, companyId),
      ]);

      return json({ isAdmin, ...projectFields }, 200, headers);
    }

    // ── POST /project-field-settings ────────────────────────────────
    if (req.method === 'POST' && path === '/project-field-settings') {
      const body = await req.json();
      const { companyId, updates } = body;
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);

      if (!await isCompanyAdmin(userEmail, companyId)) {
        return json({ error: 'Only a company admin can change these settings' }, 403, headers);
      }

      for (const u of (updates || []) as { id: string; isRequired: boolean }[]) {
        const { error } = await db.from('company_custom_fields')
          .update({ is_required: !!u.isRequired })
          .eq('id', u.id)
          .eq('company_id', companyId)
          .eq('table_name', 'projects');
        if (error) return json({ error: error.message }, 500, headers);
      }

      return json({ ok: true }, 200, headers);
    }

    // ── GET /custom-tables ───────────────────────────────────────────
    if (req.method === 'GET' && path === '/custom-tables') {
      const companyId = url.searchParams.get('companyId') || '';
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);

      // Ledger tables (see supabase/company_table_ledger.sql) can only be
      // written through insert_ledger_record's special balance/overdraw
      // handling -- not offered here, same as the web app's plain-insert path.
      const { data: tables } = await db
        .from('company_tables')
        .select('id, name, is_ledger')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('name');

      return json({
        tables: (tables || []).filter((t: any) => !t.is_ledger).map((t: any) => ({ id: t.id, name: t.name })),
      }, 200, headers);
    }

    // ── GET /custom-table-fields ─────────────────────────────────────
    if (req.method === 'GET' && path === '/custom-table-fields') {
      const tableId = url.searchParams.get('tableId') || '';
      if (!tableId) return json({ error: 'Missing tableId' }, 400, headers);

      const { data: fields } = await db
        .from('company_table_fields')
        .select('id, field_key, label, field_type, is_required, is_unique, select_options, auto_number_prefix, formula_type')
        .eq('table_id', tableId)
        .is('deleted_at', null)
        .order('display_order');
      const allFields = fields || [];

      // Relation fields other than entity/property/project (need a
      // search-and-pick UI against other records, or in table_relation's
      // case an arbitrary custom table with no established identifying
      // column) and formula fields (computed, not hand-entered -- and this
      // endpoint doesn't evaluate formulas) have no input widget in the
      // add-on. A required field of either kind means this table can't be
      // completed from Gmail at all.
      const blocked = allFields.find((f: any) =>
        f.is_required && ((isRelationFieldType(f.field_type) && !isResolvableRelationType(f.field_type)) || f.formula_type)
      );
      const canCreate = !blocked;

      return json({
        canCreate,
        blockedReason: blocked ? `"${blocked.label}" is required but its field type can only be set from the web app.` : null,
        fields: allFields.map((f: any) => ({
          id: f.id,
          fieldKey: f.field_key,
          label: f.label,
          fieldType: f.field_type,
          isRequired: f.is_required,
          isUnique: f.is_unique,
          selectOptions: f.select_options || [],
          isAutoNumber: f.auto_number_prefix != null,
          isFormula: !!f.formula_type,
          isRelationType: isRelationFieldType(f.field_type),
          isResolvableRelation: isResolvableRelationType(f.field_type),
        })),
      }, 200, headers);
    }

    // ── POST /create-table-record ───────────────────────────────────
    if (req.method === 'POST' && path === '/create-table-record') {
      const body = await req.json();
      const { tableId, companyId } = body;
      const values: Record<string, string> = body.values || {};
      if (!tableId || !companyId) return json({ error: 'Missing tableId or companyId' }, 400, headers);

      const { data: profile } = await db.from('profiles').select('id').eq('email', userEmail).single();
      if (!profile) return json({ error: 'User not found' }, 404, headers);

      const { data: table } = await db.from('company_tables').select('id, is_ledger').eq('id', tableId).is('deleted_at', null).maybeSingle();
      if (!table) return json({ error: 'Table not found' }, 404, headers);
      if (table.is_ledger) return json({ error: "Ledger tables can't be created from the add-on -- use the web app." }, 400, headers);

      const { data: fields } = await db
        .from('company_table_fields')
        .select('id, label, field_key, field_type, is_required, is_unique, auto_number_prefix, formula_type')
        .eq('table_id', tableId)
        .is('deleted_at', null);
      const allFields = fields || [];

      const blocked = allFields.find((f: any) =>
        f.is_required && ((isRelationFieldType(f.field_type) && !isResolvableRelationType(f.field_type)) || f.formula_type)
      );
      if (blocked) {
        return json({ error: `"${blocked.label}" is required but its field type can only be set from the web app.` }, 400, headers);
      }

      // Resolvable relation fields (entity/property/project) arrive as a
      // typed name, not a record id -- resolve each to a real row before the
      // required-field/unique checks and value inserts below, which all
      // expect a real id (see resolveOrCreateRelation for the matching
      // logic and why it creates-and-flags rather than guessing).
      const flaggedNames: string[] = [];
      // See resolveOrCreateRelation's/linkFlaggedRelationsToSource's comment
      // in the /create-project handler above -- the parent record doesn't
      // exist yet here either.
      const flaggedRelations: { table: string; id: string }[] = [];
      for (const field of allFields) {
        if (!isResolvableRelationType(field.field_type)) continue;
        const typedName = values[field.id];
        if (isEmptyFieldValue(typedName)) continue;
        const resolved = await resolveOrCreateRelation(companyId, field.field_type, typedName, profile.id, field.label);
        values[field.id] = resolved.id;
        if (resolved.flagged) { flaggedNames.push(typedName); flaggedRelations.push({ table: resolved.table, id: resolved.id }); }
      }

      const hasContent = allFields.some((f: any) => f.auto_number_prefix == null && !f.formula_type && !isEmptyFieldValue(values[f.id]));
      if (!hasContent) {
        return json({ error: 'Fill in at least one field before creating a record.' }, 400, headers);
      }

      const missingRequired = allFields.find((f: any) =>
        f.is_required && f.auto_number_prefix == null && !f.formula_type && isEmptyFieldValue(values[f.id])
      );
      if (missingRequired) {
        return json({ error: `"${missingRequired.label}" is required.` }, 400, headers);
      }

      // Auto-numbered fields (e.g. invoice/lead numbers) are assigned
      // server-side so the sequence stays consecutive under concurrent
      // writers -- see supabase/company_table_field_sequences.sql.
      const withNumbers: Record<string, string> = { ...values };
      for (const field of allFields) {
        if (field.auto_number_prefix != null && isEmptyFieldValue(withNumbers[field.id])) {
          const { data: num } = await db.rpc('next_field_sequence', { p_field_id: field.id });
          if (num) withNumbers[field.id] = num;
        }
      }

      const { data: record, error: recErr } = await db
        .from('company_table_records')
        .insert({ table_id: tableId, company_id: companyId, created_by: profile.id })
        .select('id').single();
      if (recErr || !record) return json({ error: recErr?.message || 'Failed to create record' }, 500, headers);
      await linkFlaggedRelationsToSource(flaggedRelations, tableId, record.id);

      // Atomically claim every is_unique field's value -- see
      // supabase/company_table_unique_locks.sql. On the first failure,
      // release everything already claimed by this call and roll back.
      const claimed: { fieldId: string; value: string }[] = [];
      for (const field of allFields) {
        if (!field.is_unique || isEmptyFieldValue(withNumbers[field.id])) continue;
        const value = withNumbers[field.id];
        const { data: ok } = await db.rpc('claim_unique_value', { p_field_id: field.id, p_record_id: record.id, p_value: String(value) });
        if (!ok) {
          await Promise.all(claimed.map(c => db.rpc('release_unique_value', { p_field_id: c.fieldId, p_record_id: record.id, p_value: String(c.value) })));
          await db.from('company_table_records').delete().eq('id', record.id);
          return json({ error: `"${field.label}" must be unique -- this value is already used on another record.` }, 409, headers);
        }
        claimed.push({ fieldId: field.id, value });
      }

      const valueInserts = allFields
        .filter((f: any) => !isEmptyFieldValue(withNumbers[f.id]))
        .map((f: any) => {
          const valueCol = valueColumnForFieldType(f.field_type);
          const raw = withNumbers[f.id];
          const typedValue = valueCol === 'value_number' ? parseFloat(raw) : valueCol === 'value_boolean' ? raw === 'true' : raw;
          return { company_id: companyId, table_id: tableId, record_id: record.id, field_id: f.id, [valueCol]: typedValue };
        });

      if (valueInserts.length > 0) {
        const { error: valErr } = await db.from('company_table_values').insert(valueInserts);
        if (valErr) {
          console.error('[create-table-record] values insert failed:', valErr.message);
          await db.from('company_table_records').delete().eq('id', record.id);
          return json({ error: 'Could not save this record -- please try again.' }, 500, headers);
        }
      }

      return json({ ok: true, recordId: record.id, flaggedNames }, 200, headers);
    }

    // ── POST /import-label ─────────────────────────────────────────
    if (req.method === 'POST' && path === '/import-label') {
      const body = await req.json();
      const { projectId, companyId } = body;

      // Check if label already exists
      const { data: existing } = await db
        .from('project_gmail_labels')
        .select('id, gmail_label_name')
        .eq('project_id', projectId)
        .is('removed_at', null)
        .single();

      if (existing) {
        return json({ ok: true, labelName: existing.gmail_label_name, existed: true }, 200, headers);
      }

      // Get project details
      const { data: project } = await db
        .from('projects').select('name').eq('id', projectId).single();
      if (!project) return json({ error: 'Project not found' }, 404, headers);

      // Get company label settings
      const { data: company } = await db
        .from('companies')
        .select('gmail_parent_label, gmail_sublabel_separator, gmail_label_tokens')
        .eq('id', companyId).single();

      const tokens: string[] = company?.gmail_label_tokens || ['project_name'];
      const separator = company?.gmail_sublabel_separator || ' -- ';
      const parentLabel = company?.gmail_parent_label || 'Shared Emails';
      const labelCode = await generateUniqueLabelCode(companyId);

      // Get matter number if exists
      let matterNumber = '';
      const { data: matterField } = await db
        .from('company_custom_fields')
        .select('id')
        .eq('company_id', companyId)
        .eq('table_name', 'projects')
        .ilike('label', '%matter%number%')
        .single();

      if (matterField) {
        const { data: matterVal } = await db
          .from('company_custom_field_values')
          .select('value_text')
          .eq('field_id', matterField.id)
          .eq('record_id', projectId)
          .single();
        matterNumber = matterVal?.value_text || '';
      }

      const parts = tokens.map((t: string) => {
        if (t === 'project_name') return project.name;
        if (t === 'matter_number') return matterNumber || '';
        if (t === 'year') return new Date().getFullYear().toString();
        return t;
      }).filter(Boolean);

      // Replace "/" in parts to prevent Gmail splitting labels
      const cleanParts = parts.map((p: string) => p.replace(/\//g, ','));
      const sublabel = cleanParts.join(separator) + ` [${labelCode}]`;
      const fullLabelName = `${parentLabel}/${sublabel}`;

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();

      const { error: pglErr } = await db.from('project_gmail_labels').insert({
        company_id: companyId,
        project_id: projectId,
        gmail_label_name: fullLabelName,
        label_sub: sublabel,
        label_code: labelCode,
        created_by: profile?.id,
      });

      if (pglErr) {
        console.error('[import-label] project_gmail_labels insert failed:', pglErr.message);
        return json({ error: `Failed to create Gmail label: ${pglErr.message}` }, 500, headers);
      }

      await enqueueLabelSyncJob(companyId, projectId, labelCode, fullLabelName);

      return json({ ok: true, labelName: fullLabelName }, 200, headers);
    }

    // ── POST /remove-project ───────────────────────────────────────
    if (req.method === 'POST' && path === '/remove-project') {
      const body = await req.json();
      const { projectId } = body;

      // Soft delete project
      await db.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', projectId);

      // Mark labels as removed
      await db.from('project_gmail_labels')
        .update({ removed_at: new Date().toISOString() })
        .eq('project_id', projectId);

      return json({ ok: true }, 200, headers);
    }

    // ── POST /remove-label ─────────────────────────────────────────
    if (req.method === 'POST' && path === '/remove-label') {
      const body = await req.json();
      const { messageId } = body;

      await db.from('project_emails')
        .delete()
        .eq('gmail_message_id', messageId);

      return json({ ok: true, removedFromUsers: 1 }, 200, headers);
    }

    // ── POST /request-archive ────────────────────────────────────
    // Submits a closed-matter archive request for admin approval -- never
    // archives directly. Lives in the generic archive_requests table (see
    // supabase/archive_requests.sql) as entity_table='gmail_project_archive',
    // reviewed from the unified Admin → Archive requests tab; approving one
    // calls enqueueProjectArchive (app/api/archive-requests/approve), which
    // is what actually enqueues gmail_sync_jobs. Was gmail_archive_requests,
    // a Gmail-only silo -- migrated onto the shared request/approval system
    // so admins have one place to review every kind of pending request.
    if (req.method === 'POST' && path === '/request-archive') {
      const body = await req.json();
      const { projectId, companyId } = body;
      if (!projectId || !companyId) return json({ error: 'Missing projectId or companyId' }, 400, headers);

      const requesterId = await getProfileId(userEmail);
      if (!requesterId) return json({ error: 'User not found' }, 404, headers);

      const { data: existing } = await db.from('archive_requests')
        .select('id').eq('entity_table', 'gmail_project_archive').eq('entity_id', projectId).eq('company_id', companyId)
        .eq('status', 'pending').maybeSingle();
      if (existing) return json({ ok: true, alreadyRequested: true }, 200, headers);

      const { data: project } = await db.from('projects').select('name').eq('id', projectId).maybeSingle();

      const { error: insertErr } = await db.from('archive_requests').insert({
        company_id: companyId,
        entity_table: 'gmail_project_archive',
        entity_id: projectId,
        entity_label: project?.name || 'Untitled project',
        requested_by: requesterId,
        status: 'pending',
      });
      if (insertErr) return json({ error: insertErr.message }, 500, headers);

      // Best-effort -- see lib/archiveRequests.ts's createArchiveRequest for
      // the same call on the web-app side of this event. try/catch, not
      // .catch() chained on the rpc() call -- see resolveOrCreateRelation's
      // matching comment for why that throws synchronously instead of ever
      // making the request.
      try {
        await db.rpc('notify_company_admins', {
          p_company_id: companyId,
          p_event_type: 'archive_request_submitted',
          p_title: `New archive request: ${project?.name || 'Untitled project'}`,
          p_link_url: '/dashboard/admin?tab=archiveRequests',
          p_entity_table: 'archive_requests',
        });
      } catch (_) { /* best-effort */ }

      return json({ ok: true }, 200, headers);
    }

    // ── POST /create-labels-batch ────────────────────────────────
    // Creates label DB rows for multiple projects at once.
    // Actual Gmail label creation is handled by the cron (scalable).
    if (req.method === 'POST' && path === '/create-labels-batch') {
      const body = await req.json();
      const { projectIds, companyId, forUserId } = body;
      if (!companyId || !projectIds?.length) return json({ error: 'Missing params' }, 400, headers);

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();
      if (!profile) return json({ error: 'User not found' }, 404, headers);

      const { data: company } = await db
        .from('companies')
        .select('gmail_parent_label, gmail_sublabel_separator, gmail_label_tokens')
        .eq('id', companyId).single();

      const tokens: string[] = company?.gmail_label_tokens || ['project_name'];
      const separator = company?.gmail_sublabel_separator || ' -- ';
      const parentLabel = company?.gmail_parent_label || 'Shared Emails';

      const results: any[] = [];

      for (const projectId of projectIds) {
        // Check if label already exists
        const { data: existing } = await db
          .from('project_gmail_labels')
          .select('id, gmail_label_name')
          .eq('project_id', projectId)
          .is('removed_at', null)
          .maybeSingle();

        if (existing) {
          results.push({ projectId, status: 'exists', labelName: existing.gmail_label_name });
          continue;
        }

        // Get project details
        const { data: project } = await db
          .from('projects').select('name').eq('id', projectId).single();
        if (!project) { results.push({ projectId, status: 'not_found' }); continue; }

        // Get matter number if exists
        let matterNumber = '';
        const { data: matterField } = await db
          .from('company_custom_fields')
          .select('id').eq('company_id', companyId).eq('table_name', 'projects')
          .ilike('label', '%matter%number%').maybeSingle();
        if (matterField) {
          const { data: matterVal } = await db
            .from('company_custom_field_values')
            .select('value_text').eq('field_id', matterField.id).eq('record_id', projectId).maybeSingle();
          matterNumber = matterVal?.value_text || '';
        }

        const labelCode = await generateUniqueLabelCode(companyId);
        const parts = tokens.map((t: string) => {
          if (t === 'project_name') return project.name;
          if (t === 'matter_number') return matterNumber || '';
          if (t === 'year') return new Date().getFullYear().toString();
          return t;
        }).filter(Boolean);

        // Replace "/" with "," to prevent Gmail splitting labels
        const cleanParts = parts.map((p: string) => p.replace(/\//g, ','));
        const sublabel = cleanParts.join(separator) + ` [${labelCode}]`;
        const fullLabelName = `${parentLabel}/${sublabel}`;

        const { error: insertErr } = await db.from('project_gmail_labels').insert({
          company_id: companyId,
          project_id: projectId,
          gmail_label_name: fullLabelName,
          label_sub: sublabel,
          label_code: labelCode,
          created_by: profile.id,
        });

        if (insertErr) {
          results.push({ projectId, status: 'error', error: insertErr.message });
        } else {
          results.push({ projectId, status: 'created', labelName: fullLabelName });
        }
      }

      const created = results.filter(r => r.status === 'created').length;
      const existed = results.filter(r => r.status === 'exists').length;

      return json({ ok: true, created, existed, results }, 200, headers);
    }

    // ── GET /my-projects ──────────────────────────────────────────
    // Returns projects the current user is involved in
    if (req.method === 'GET' && path === '/my-projects') {
      const companyId = url.searchParams.get('companyId') || '';
      const q = url.searchParams.get('q') || '';
      const status = url.searchParams.get('status') || '';
      const page = parseInt(url.searchParams.get('page') || '0');
      const pageSize = 30;
      const labelledOnly = url.searchParams.get('labelled') === 'true';
      const unlabelledOnly = url.searchParams.get('labelled') === 'false';

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();
      if (!profile) return json({ error: 'User not found' }, 404, headers);

      // Get all projects user has access to
      // 1. Check company membership role
      const { data: membership } = await db
        .from('company_memberships').select('role')
        .eq('user_id', profile.id).eq('company_id', companyId).maybeSingle();

      let projectIds: string[] | null = null;

      if (membership?.role !== 'company_admin') {
        // Non-admin: only their own projects
        const [{ data: memberProjects }, { data: createdProjects }] = await Promise.all([
          db.from('project_members').select('project_id').eq('profile_id', profile.id),
          db.from('projects').select('id').eq('created_by', profile.id).eq('company_id', companyId),
        ]);
        const ids = new Set([
          ...(memberProjects || []).map((r: any) => r.project_id),
          ...(createdProjects || []).map((r: any) => r.id),
        ]);
        projectIds = [...ids];
        if (!projectIds.length) return json({ projects: [], page, hasMore: false }, 200, headers);
      }

      let query = db
        .from('projects')
        .select('id, name, status, project_gmail_labels(id, gmail_label_name, label_code)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('name')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (projectIds) query = query.in('id', projectIds);
      if (q) query = query.ilike('name', `%${q}%`);
      if (status) query = query.eq('status', status);

      const { data: projects } = await query;
      let filtered = projects || [];

      if (labelledOnly) filtered = filtered.filter((p: any) => p.project_gmail_labels?.length > 0);
      if (unlabelledOnly) filtered = filtered.filter((p: any) => !p.project_gmail_labels?.length);

      return json({
        projects: filtered.map((p: any) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          hasLabel: p.project_gmail_labels?.length > 0,
          labelName: p.project_gmail_labels?.[0]?.gmail_label_name || null,
          labelCode: p.project_gmail_labels?.[0]?.label_code || null,
        })),
        page,
        hasMore: filtered.length === pageSize,
      }, 200, headers);
    }

    // ── POST /cancel-import ──────────────────────────────────────
    if (req.method === 'POST' && path === '/cancel-import') {
      const body = await req.json();
      const { jobId } = body;
      if (!jobId) return json({ error: 'Missing jobId' }, 400, headers);
      await db.from('label_import_jobs').update({
        status: 'cancelled',
        error: 'Cancelled by user',
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
      return json({ ok: true }, 200, headers);
    }

    // ── POST /resume-import ──────────────────────────────────────
    // Resume a paused job from where it left off
    if (req.method === 'POST' && path === '/resume-import') {
      const body = await req.json();
      const { jobId } = body;
      if (!jobId) return json({ error: 'Missing jobId' }, 400, headers);

      const { data: job } = await db
        .from('label_import_jobs').select('*').eq('id', jobId).single();
      if (!job) return json({ error: 'Job not found' }, 404, headers);

      // Re-fetch all project IDs for this job's filters
      let query = db
        .from('projects')
        .select('id')
        .eq('company_id', job.company_id)
        .is('deleted_at', null);

      if (job.filters?.status) query = query.eq('status', job.filters.status);
      if (job.filters?.name) query = query.ilike('name', `%${job.filters.name}%`);

      const { data: projects } = await query;
      const projectIds = (projects || []).map((p: any) => p.id);

      await db.from('label_import_jobs').update({
        status: 'running',
        error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      processImportJob(jobId, projectIds, job.company_id, job.created_by).catch(console.error);

      return json({ ok: true, total: projectIds.length, resumingFrom: job.processed }, 200, headers);
    }

    // ── GET /import-job-status ────────────────────────────────────
    if (req.method === 'GET' && path === '/import-job-status') {
      const companyId = url.searchParams.get('companyId') || '';
      const { data: job } = await db
        .from('label_import_jobs')
        .select('*')
        .eq('company_id', companyId)
        .in('status', ['pending', 'running', 'paused', 'failed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ job: job || null }, 200, headers);
    }

    // ── POST /count-import ────────────────────────────────────────
    // Count how many projects match filters (before confirming)
    if (req.method === 'POST' && path === '/count-import') {
      const body = await req.json();
      const { companyId, filters } = body;
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);

      let query = db
        .from('projects')
        .select('id, project_gmail_labels(id)', { count: 'exact' })
        .eq('company_id', companyId)
        .is('deleted_at', null);

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.name) query = query.ilike('name', `%${filters.name}%`);

      const { data: projects, count } = await query;
      const unlabelled = (projects || []).filter((p: any) => !p.project_gmail_labels?.length).length;
      const labelled = (projects || []).filter((p: any) => p.project_gmail_labels?.length > 0).length;

      return json({ total: count || 0, unlabelled, labelled }, 200, headers);
    }

    // ── POST /queue-import ────────────────────────────────────────
    // Queue a background label import job
    if (req.method === 'POST' && path === '/queue-import') {
      const body = await req.json();
      const { companyId, filters } = body;
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();
      if (!profile) return json({ error: 'User not found' }, 404, headers);

      // Check no job already running
      const { data: existing } = await db
        .from('label_import_jobs')
        .select('id, status')
        .eq('company_id', companyId)
        .in('status', ['pending', 'running'])
        .maybeSingle();

      if (existing) return json({ error: 'A job is already running', jobId: existing.id }, 409, headers);

      // Count matching projects
      let query = db
        .from('projects')
        .select('id, project_gmail_labels(id)')
        .eq('company_id', companyId)
        .is('deleted_at', null);

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.name) query = query.ilike('name', `%${filters.name}%`);

      const { data: projects } = await query;
      const unlabelled = (projects || []).filter((p: any) => !p.project_gmail_labels?.length);

      if (!unlabelled.length) return json({ error: 'No unlabelled projects match your filters', total: 0 }, 200, headers);

      // Create job
      const { data: job } = await db.from('label_import_jobs').insert({
        company_id: companyId,
        created_by: profile.id,
        status: 'pending',
        filters,
        total: unlabelled.length,
        processed: 0,
        created: 0,
        existed: 0,
      }).select().single();

      // Process in background (Edge Functions can run async)
      // We use waitUntil pattern -- process immediately but don't await in response
      const projectIds = unlabelled.map((p: any) => p.id);

      // Start processing immediately
      processImportJob(job.id, projectIds, companyId, profile.id).catch(console.error);

      return json({ ok: true, jobId: job.id, total: unlabelled.length }, 200, headers);
    }

    // ── GET /project-by-label ─────────────────────────────────────
    // Finds a project by label code (from Gmail label URL)
    if (req.method === 'GET' && path === '/project-by-label') {
      const code = url.searchParams.get('code') || '';
      const companyId = url.searchParams.get('companyId') || '';
      if (!code) return json({ error: 'Missing code' }, 400, headers);

      const { data: label } = await db
        .from('project_gmail_labels')
        .select('project_id, gmail_label_name, projects:project_id(id, name, status, description, created_at)')
        .eq('label_code', code)
        .eq('company_id', companyId)
        .maybeSingle();

      if (!label) return json({ project: null }, 200, headers);

      return json({
        project: {
          id: (label.projects as any)?.id,
          name: (label.projects as any)?.name,
          status: (label.projects as any)?.status,
          description: (label.projects as any)?.description,
          created_at: (label.projects as any)?.created_at,
          labelName: label.gmail_label_name,
          labelCode: code,
        }
      }, 200, headers);
    }

    // ── GET /project-tasks ────────────────────────────────────────
    if (req.method === 'GET' && path === '/project-tasks') {
      const projectId = url.searchParams.get('projectId') || '';
      if (!projectId) return json({ error: 'Missing projectId' }, 400, headers);

      // Matter number -- a project-level custom field, same for every task
      // in this list, used by the simplified task-row view. This chain
      // (projects → company_custom_fields → company_custom_field_values)
      // doesn't depend on the tasks/statuses queries below, so all three run
      // concurrently instead of one after another.
      async function matterNumberForProject(): Promise<string | null> {
        const { data: projectRow } = await db.from('projects').select('company_id').eq('id', projectId).maybeSingle();
        if (!projectRow?.company_id) return null;
        const { data: matterField } = await db.from('company_custom_fields')
          .select('id').eq('company_id', projectRow.company_id).eq('table_name', 'projects').eq('field_key', 'matter_number').maybeSingle();
        if (!matterField) return null;
        const { data: matterValue } = await db.from('company_custom_field_values')
          .select('value_text').eq('field_id', matterField.id).eq('record_id', projectId).maybeSingle();
        return matterValue?.value_text || null;
      }

      const [
        { data: tasks, error: tasksErr },
        { data: statuses },
        matterNumber,
      ] = await Promise.all([
        db.from('tasks')
          .select('id, name, is_completed, due_date, due_time, assignee_id, assigned_team_id, status_id, is_monetary, estimated_cost, created_by, awaiting_follow_up, follow_up_date, notes, source_message_id, source_email_subject, source_email_body, calendar_target, sync_to_company_calendar, profiles:assignee_id(full_name, email), teams:assigned_team_id(team_name), task_statuses:status_id(label, color_hex), creator:created_by(full_name, email)')
          .eq('project_id', projectId)
          .is('deleted_at', null)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('due_time', { ascending: true, nullsFirst: false }),
        db.from('task_statuses')
          .select('id, label, color_hex')
          .eq('is_active', true),
        matterNumberForProject(),
      ]);

      if (tasksErr) console.error('[project-tasks] error:', tasksErr.message);
      console.log(`[project-tasks] projectId=${projectId} count=${tasks?.length}`);
      if (tasks?.length) {
        const sample = tasks[0] as any;
        console.log(`[project-tasks] sample: assignee_id=${sample.assignee_id} profiles=${JSON.stringify(sample.profiles)} assigned_team_id=${sample.assigned_team_id} teams=${JSON.stringify(sample.teams)}`);
      }

      const taskIds = (tasks || []).map((t: any) => t.id);
      const [{ counts: followUpCounts, scheduled: scheduledFollowUpDates }, watchersByTask] = await Promise.all([
        followUpSummary(taskIds),
        watchersByTaskIds(taskIds),
      ]);

      return json({
        tasks: (tasks || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          isCompleted: t.is_completed,
          dueDate: t.due_date,
          dueTime: t.due_time,
          assigneeId: t.assignee_id,
          assignee: t.profiles?.full_name || t.profiles?.email || null,
          assignedTeamId: t.assigned_team_id,
          assignedTeam: t.teams?.team_name || null,
          statusId: t.status_id,
          status: t.task_statuses?.label || null,
          statusColor: t.task_statuses?.color_hex || null,
          isMonetary: t.is_monetary,
          estimatedCost: t.estimated_cost,
          createdBy: t.creator?.full_name || t.creator?.email || null,
          awaitingFollowUp: t.awaiting_follow_up,
          followUpDate: t.follow_up_date,
          followUpCount: followUpCounts[t.id] || 0,
          scheduledFollowUpDate: scheduledFollowUpDates[t.id] || null,
          notes: t.notes,
          sourceMessageId: t.source_message_id,
          sourceEmailSubject: t.source_email_subject,
          sourceEmailBody: t.source_email_body,
          calendarTarget: t.calendar_target,
          syncToCompanyCalendar: t.sync_to_company_calendar,
          watchers: watchersByTask[t.id] || [],
        })),
        statuses: statuses || [],
        matterNumber,
      }, 200, headers);
    }

    // ── POST /create-task ─────────────────────────────────────────
    if (req.method === 'POST' && path === '/create-task') {
      const body = await req.json();
      const {
        projectId, companyId, name,
        dueDate, dueTime,
        assigneeId, assignedTeamId,
        statusId,
        isMonetary, estimatedCost,
        reminderSetting, reminderSettings,
        responsibleTeam, assignedTo,
        notes, messageId, emailSubject, emailBody, watcherIds, calendarTarget, syncToCompanyCalendar,
      } = body;

      // ── Validation ──────────────────────────────────────────────
      if (!projectId) return json({ error: 'Project is required' }, 400, headers);
      if (!name?.trim()) return json({ error: 'Task name is required' }, 400, headers);
      if (dueDate && isNaN(Date.parse(dueDate))) return json({ error: 'Invalid due date' }, 400, headers);
      if (estimatedCost !== undefined && estimatedCost !== null && isNaN(Number(estimatedCost))) {
        return json({ error: 'Estimated cost must be a number' }, 400, headers);
      }
      if (estimatedCost !== undefined && estimatedCost !== null && Number(estimatedCost) < 0) {
        return json({ error: 'Estimated cost cannot be negative' }, 400, headers);
      }

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();

      const { data: task, error } = await db.from('tasks').insert({
        project_id: projectId,
        company_id: companyId,
        name: name.trim(),
        due_date: dueDate || null,
        due_time: dueTime || null,
        assignee_id: assigneeId || null,
        assigned_team_id: assignedTeamId || null,
        status_id: statusId || null,
        is_monetary: isMonetary || false,
        estimated_cost: estimatedCost ? Number(estimatedCost) : null,
        reminder_setting: reminderSetting || null,
        reminder_settings: reminderSettings || null,
        responsible_team: responsibleTeam || null,
        assigned_to: assignedTo || null,
        notes: notes || null,
        source_message_id: messageId || null,
        source_email_subject: emailSubject || null,
        source_email_body: emailBody || null,
        calendar_target: calendarTarget === 'main_calendar' ? 'main_calendar' : 'tasks_calendar',
        sync_to_company_calendar: !!syncToCompanyCalendar,
        created_by: profile?.id,
        date_entered: new Date().toISOString().split('T')[0],
        is_completed: false,
      }).select().single();

      if (error) return json({ error: error.message }, 500, headers);
      // Trigger calendar sync (non-blocking)
      if (task?.id && task?.due_date) triggerCalendarSync(task.id, 'upsert');
      logTaskActivity({ taskId: task.id, companyId, actorId: profile?.id || null, action: 'created' });
      if (Array.isArray(watcherIds) && watcherIds.length) {
        await db.from('task_watchers').insert(watcherIds.map((profile_id: string) => ({ task_id: task.id, company_id: companyId, profile_id, created_by: profile?.id || null })));
      }
      return json({ ok: true, task }, 200, headers);
    }

    // ── POST /toggle-task ─────────────────────────────────────────
    if (req.method === 'POST' && path === '/toggle-task') {
      const body = await req.json();
      const { taskId, isCompleted } = body;
      if (!taskId) return json({ error: 'Missing taskId' }, 400, headers);

      const { data: existingTask } = await db.from('tasks').select('company_id').eq('id', taskId).maybeSingle();

      const { error } = await db.from('tasks').update({
        is_completed: isCompleted,
      }).eq('id', taskId);

      if (error) return json({ error: error.message }, 500, headers);
      // Sync calendar -- mark complete or re-activate
      triggerCalendarSync(taskId, isCompleted ? 'complete' : 'upsert');
      if (existingTask) {
        const actorId = await getProfileId(userEmail);
        logTaskActivity({ taskId, companyId: existingTask.company_id, actorId, action: isCompleted ? 'completed' : 'reopened' });
      }
      return json({ ok: true }, 200, headers);
    }

    // ── POST /add-follow-up ──────────────────────────────────────────
    // A task can be followed up more than once (e.g. chasing the same
    // person repeatedly) -- each log entry is its own row. awaiting_follow_up
    // / follow_up_date on the task are kept as a denormalized "latest
    // state" cache so status badges elsewhere don't need to know about
    // the log table.
    if (req.method === 'POST' && path === '/add-follow-up') {
      const body = await req.json();
      const { taskId, followedUpAt } = body;
      if (!taskId) return json({ error: 'Missing taskId' }, 400, headers);
      const todayStr = new Date().toISOString().slice(0, 10);
      const date = followedUpAt || todayStr;
      const isDone = date <= todayStr;

      const { data: existingTask } = await db.from('tasks').select('company_id').eq('id', taskId).maybeSingle();
      if (!existingTask) return json({ error: 'Task not found' }, 404, headers);

      const actorId = await getProfileId(userEmail);
      const { data: entry, error } = await db.from('task_follow_ups').insert({
        task_id: taskId, company_id: existingTask.company_id, followed_up_at: date, is_done: isDone, created_by: actorId,
      }).select().single();
      if (error) return json({ error: error.message }, 500, headers);

      const taskUpdate: Record<string, unknown> = {};
      if (isDone) { taskUpdate.awaiting_follow_up = true; taskUpdate.follow_up_date = date; }
      // A future follow-up date is effectively a rescheduled due date.
      if (!isDone) taskUpdate.due_date = date;
      await db.from('tasks').update(taskUpdate).eq('id', taskId);

      logTaskActivity({
        taskId, companyId: existingTask.company_id, actorId,
        action: 'follow_up_set',
        detail: isDone ? `follow-up date: ${date}` : `follow-up scheduled: ${date} (due date moved to match)`,
      });

      return json({ ok: true, entry: { id: entry.id, followedUpAt: String(entry.followed_up_at).slice(0, 10), isDone: entry.is_done } }, 200, headers);
    }

    // ── POST /remove-follow-up ───────────────────────────────────────
    if (req.method === 'POST' && path === '/remove-follow-up') {
      const body = await req.json();
      const { taskId, followUpId } = body;
      if (!taskId || !followUpId) return json({ error: 'Missing taskId or followUpId' }, 400, headers);

      const { data: existingTask } = await db.from('tasks').select('company_id').eq('id', taskId).maybeSingle();
      if (!existingTask) return json({ error: 'Task not found' }, 404, headers);

      const { error } = await db.from('task_follow_ups').delete().eq('id', followUpId).eq('task_id', taskId);
      if (error) return json({ error: error.message }, 500, headers);

      const { data: remaining } = await db.from('task_follow_ups').select('followed_up_at').eq('task_id', taskId).eq('is_done', true);
      const dates = (remaining || []).map((r: any) => String(r.followed_up_at).slice(0, 10));
      const latest = dates.length ? dates.reduce((a: string, b: string) => (a > b ? a : b)) : null;
      await db.from('tasks').update({ awaiting_follow_up: dates.length > 0, follow_up_date: latest }).eq('id', taskId);

      const actorId = await getProfileId(userEmail);
      logTaskActivity({ taskId, companyId: existingTask.company_id, actorId, action: 'follow_up_cleared' });

      return json({ ok: true }, 200, headers);
    }

    // ── POST /mark-follow-up-done ──────────────────────────────────────
    // Marks a scheduled (future-dated) follow-up as actually done.
    if (req.method === 'POST' && path === '/mark-follow-up-done') {
      const body = await req.json();
      const { taskId, followUpId } = body;
      if (!taskId || !followUpId) return json({ error: 'Missing taskId or followUpId' }, 400, headers);

      const { data: existingTask } = await db.from('tasks').select('company_id').eq('id', taskId).maybeSingle();
      if (!existingTask) return json({ error: 'Task not found' }, 404, headers);

      const { error } = await db.from('task_follow_ups').update({ is_done: true }).eq('id', followUpId).eq('task_id', taskId);
      if (error) return json({ error: error.message }, 500, headers);

      const { data: doneEntries } = await db.from('task_follow_ups').select('followed_up_at').eq('task_id', taskId).eq('is_done', true);
      const dates = (doneEntries || []).map((r: any) => String(r.followed_up_at).slice(0, 10));
      const latest = dates.length ? dates.reduce((a: string, b: string) => (a > b ? a : b)) : null;
      await db.from('tasks').update({ awaiting_follow_up: true, follow_up_date: latest }).eq('id', taskId);

      const actorId = await getProfileId(userEmail);
      logTaskActivity({ taskId, companyId: existingTask.company_id, actorId, action: 'follow_up_set', detail: 'scheduled follow-up marked done' });

      return json({ ok: true }, 200, headers);
    }

    // ── GET /task-follow-ups ─────────────────────────────────────────
    if (req.method === 'GET' && path === '/task-follow-ups') {
      const taskId = url.searchParams.get('taskId') || '';
      if (!taskId) return json({ error: 'Missing taskId' }, 400, headers);

      const { data: entries, error } = await db.from('task_follow_ups')
        .select('id, followed_up_at, is_done').eq('task_id', taskId).order('followed_up_at', { ascending: false });
      if (error) return json({ error: error.message }, 500, headers);

      return json({
        entries: (entries || []).map((e: any) => ({ id: e.id, followedUpAt: String(e.followed_up_at).slice(0, 10), isDone: e.is_done })),
      }, 200, headers);
    }

    // ── POST /update-notes ──────────────────────────────────────────
    if (req.method === 'POST' && path === '/update-notes') {
      const body = await req.json();
      const { taskId, notes } = body;
      if (!taskId) return json({ error: 'Missing taskId' }, 400, headers);

      const { data: existingTask } = await db.from('tasks').select('company_id').eq('id', taskId).maybeSingle();

      const { error } = await db.from('tasks').update({ notes: notes || null }).eq('id', taskId);

      if (error) return json({ error: error.message }, 500, headers);
      if (existingTask) {
        const actorId = await getProfileId(userEmail);
        logTaskActivity({ taskId, companyId: existingTask.company_id, actorId, action: 'note_updated' });
      }
      return json({ ok: true }, 200, headers);
    }

    // ── POST /link-email ────────────────────────────────────────────
    // Attaches (or replaces) the Gmail message a task references -- lets a
    // user viewing a task open the email that prompted it.
    if (req.method === 'POST' && path === '/link-email') {
      const body = await req.json();
      const { taskId, messageId, emailSubject, emailBody } = body;
      if (!taskId) return json({ error: 'Missing taskId' }, 400, headers);
      if (!messageId) return json({ error: 'Missing messageId' }, 400, headers);

      const { data: existingTask } = await db.from('tasks').select('company_id').eq('id', taskId).maybeSingle();

      const { error } = await db.from('tasks').update({
        source_message_id: messageId,
        source_email_subject: emailSubject || null,
        source_email_body: emailBody || null,
      }).eq('id', taskId);

      if (error) return json({ error: error.message }, 500, headers);
      if (existingTask) {
        const actorId = await getProfileId(userEmail);
        logTaskActivity({ taskId, companyId: existingTask.company_id, actorId, action: 'email_linked' });
      }
      return json({ ok: true }, 200, headers);
    }

    // ── POST /update-task ──────────────────────────────────────────
    if (req.method === 'POST' && path === '/update-task') {
      const body = await req.json();
      const { taskId, name, dueDate, dueTime, statusId, assigneeId, assignedTeamId, isMonetary, estimatedCost, awaitingFollowUp, followUpDate, notes, watcherIds, calendarTarget, syncToCompanyCalendar } = body;
      if (!taskId) return json({ error: 'Missing taskId' }, 400, headers);
      if (!name?.trim()) return json({ error: 'Task name required' }, 400, headers);

      const { data: before } = await db.from('tasks')
        .select('company_id, name, due_date, due_time, assignee_id, assigned_team_id, is_monetary, estimated_cost, notes')
        .eq('id', taskId).maybeSingle();

      const update: Record<string, unknown> = {
        name: name.trim(),
        due_time: dueTime || null,
        status_id: statusId || null,
        assignee_id: assigneeId || null,
        assigned_team_id: assignedTeamId || null,
        is_monetary: isMonetary || false,
        estimated_cost: estimatedCost || null,
      };
      if (dueDate !== undefined) update.due_date = dueDate || null;
      if (calendarTarget !== undefined) update.calendar_target = calendarTarget === 'main_calendar' ? 'main_calendar' : 'tasks_calendar';
      if (syncToCompanyCalendar !== undefined) update.sync_to_company_calendar = !!syncToCompanyCalendar;
      if (awaitingFollowUp !== undefined) {
        update.awaiting_follow_up = !!awaitingFollowUp;
        update.follow_up_date = awaitingFollowUp ? (followUpDate || null) : null;
      }
      if (notes !== undefined) update.notes = notes || null;

      const { error } = await db.from('tasks').update(update).eq('id', taskId);

      if (error) return json({ error: error.message }, 500, headers);
      // Sync calendar with updated details
      triggerCalendarSync(taskId, 'upsert');

      if (before) {
        const changes: string[] = [];
        if (name.trim() !== before.name) changes.push(`renamed ${quotedText(before.name)} → ${quotedText(name.trim())}`);
        if ((dueDate || null) !== (before.due_date ? String(before.due_date).slice(0, 10) : null)) {
          changes.push(`due date ${before.due_date ? String(before.due_date).slice(0, 10) : 'none'} → ${dueDate || 'none'}`);
        }
        if ((dueTime || null) !== before.due_time) {
          changes.push(`due time ${before.due_time ? String(before.due_time).slice(0, 5) : 'none'} → ${dueTime || 'none'}`);
        }
        if ((assigneeId || null) !== before.assignee_id) {
          const [fromName, toName] = await Promise.all([nameForProfileId(before.assignee_id), nameForProfileId(assigneeId || null)]);
          changes.push(`assignee ${fromName} → ${toName}`);
        }
        if ((assignedTeamId || null) !== before.assigned_team_id) {
          const [fromTeam, toTeam] = await Promise.all([nameForTeamId(before.assigned_team_id), nameForTeamId(assignedTeamId || null)]);
          changes.push(`team ${fromTeam} → ${toTeam}`);
        }
        if (!!isMonetary !== !!before.is_monetary) changes.push(`monetary ${before.is_monetary ? 'Yes' : 'No'} → ${isMonetary ? 'Yes' : 'No'}`);
        if (Number(estimatedCost || 0) !== Number(before.estimated_cost || 0)) {
          changes.push(`estimated cost $${Number(before.estimated_cost || 0).toLocaleString()} → $${Number(estimatedCost || 0).toLocaleString()}`);
        }
        if (notes !== undefined && (notes || '') !== (before.notes || '')) changes.push(`notes ${quotedText(before.notes)} → ${quotedText(notes)}`);
        if (changes.length) {
          const actorId = await getProfileId(userEmail);
          logTaskActivity({ taskId, companyId: before.company_id, actorId, action: 'updated', detail: changes.join(', ') });
        }
        if (Array.isArray(watcherIds)) {
          await saveWatchers(taskId, before.company_id, watcherIds, userEmail);
        }
      }
      return json({ ok: true }, 200, headers);
    }

    // ── POST /delete-task ──────────────────────────────────────────
    if (req.method === 'POST' && path === '/delete-task') {
      const body = await req.json();
      const { taskId } = body;
      if (!taskId) return json({ error: 'Missing taskId' }, 400, headers);

      const { data: existingTask } = await db.from('tasks').select('company_id').eq('id', taskId).maybeSingle();

      const { error } = await db.from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) return json({ error: error.message }, 500, headers);
      // Delete calendar event
      triggerCalendarSync(taskId, 'delete');
      if (existingTask) {
        const actorId = await getProfileId(userEmail);
        logTaskActivity({ taskId, companyId: existingTask.company_id, actorId, action: 'deleted' });
      }
      return json({ ok: true }, 200, headers);
    }

    // ── GET /task-history ─────────────────────────────────────────
    if (req.method === 'GET' && path === '/task-history') {
      const taskId = url.searchParams.get('taskId') || '';
      if (!taskId) return json({ error: 'Missing taskId' }, 400, headers);

      const { data: entries, error } = await db.from('task_activity_log')
        .select('id, action, detail, created_at, actor:actor_id(full_name, email)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500, headers);

      return json({
        entries: (entries || []).map((e: any) => ({
          id: e.id,
          action: e.action,
          detail: e.detail,
          createdAt: e.created_at,
          actorName: e.actor?.full_name || e.actor?.email || 'System',
        })),
      }, 200, headers);
    }

    // ── GET /project-by-matter ────────────────────────────────────
    if (req.method === 'GET' && path === '/project-by-matter') {
      const matterNumber = url.searchParams.get('matter') || '';
      const companyId = url.searchParams.get('companyId') || '';
      if (!matterNumber) return json({ project: null }, 200, headers);
      const { data: matterField } = await db.from('company_custom_fields')
        .select('id').eq('company_id', companyId).eq('field_key', 'matter_number').maybeSingle();
      if (!matterField) return json({ project: null }, 200, headers);
      const { data: cfv } = await db.from('company_custom_field_values')
        .select('project_id').eq('field_id', matterField.id).eq('value_text', matterNumber).maybeSingle();
      if (!cfv) return json({ project: null }, 200, headers);
      const { data: project } = await db.from('projects')
        .select('id, name, description, created_at, estimated_completion_date').eq('id', cfv.project_id).single();
      return json({ project: project ? { id: project.id, name: project.name, description: project.description,
        matterNumber, createdAt: project.created_at, dueDate: project.estimated_completion_date } : null }, 200, headers);
    }

    // ── POST /create-task-from-row ────────────────────────────────
    if (req.method === 'POST' && path === '/create-task-from-row') {
      const body = await req.json();
      const { projectId, companyId, name, assigneeEmail, dueDate } = body;
      if (!projectId || !name) return json({ error: 'Missing projectId or name' }, 400, headers);
      let assigneeId = null;
      if (assigneeEmail) {
        const { data: p } = await db.from('profiles').select('id').eq('email', assigneeEmail).maybeSingle();
        assigneeId = p?.id || null;
      }
      const { data: task, error } = await db.from('tasks').insert({
        project_id: projectId, company_id: companyId, name,
        assignee_id: assigneeId, due_date: dueDate || null,
        is_completed: false, date_entered: new Date().toISOString().split('T')[0],
      }).select().single();
      if (error) return json({ error: error.message }, 500, headers);
      return json({ ok: true, task }, 200, headers);
    }

    // ── GET /my-tasks ─────────────────────────────────────────────
    // Returns tasks assigned to the authenticated user -- due today or overdue
    // Designed for Loop app / external integrations
    if (req.method === 'GET' && path === '/my-tasks') {
      const userId = url.searchParams.get('userId') || '';
      const filter = url.searchParams.get('filter') || 'due'; // due | all | overdue
      const companyId = url.searchParams.get('companyId') || '';

      // Find profile by email or userId
      let profileId = userId;
      if (!profileId) {
        const { data: profile } = await db
          .from('profiles').select('id').eq('email', userEmail).single();
        profileId = profile?.id || '';
      }
      if (!profileId) return json({ error: 'User not found' }, 404, headers);

      const today = new Date().toISOString().split('T')[0];

      let query = db.from('tasks')
        .select(`
          id, name, due_date, due_time, is_completed, date_entered,
          projects:project_id(id, name),
          task_statuses:status_id(label, color_hex),
          teams:assigned_team_id(team_name)
        `)
        .eq('assignee_id', profileId)
        .eq('is_completed', false)
        .is('deleted_at', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('due_time', { ascending: true, nullsFirst: false });

      if (companyId) query = query.eq('company_id', companyId);
      if (filter === 'due') query = query.lte('due_date', today);
      if (filter === 'overdue') query = query.lt('due_date', today);

      const { data: tasks, error: tasksErr } = await query;
      if (tasksErr) return json({ error: tasksErr.message }, 500, headers);

      const now = new Date();
      const result = (tasks || []).map((t: any) => {
        const due = t.due_date ? new Date(t.due_date.substring(0,10) + 'T23:59:59') : null;
        const diffMs = due ? due.getTime() - now.getTime() : null;
        const diffDays = diffMs !== null ? Math.ceil(diffMs / 86400000) : null;
        let urgency = 'none';
        if (diffDays !== null) {
          if (diffDays < 0) urgency = 'overdue';
          else if (diffDays === 0) urgency = 'today';
          else if (diffDays <= 3) urgency = 'soon';
          else urgency = 'upcoming';
        }
        return {
          id: t.id,
          name: t.name,
          dueDate: t.due_date ? t.due_date.substring(0, 10) : null,
          dueTime: t.due_time || null,
          diffDays,
          urgency,
          project: (t.projects as any)?.name || null,
          projectId: (t.projects as any)?.id || null,
          status: (t.task_statuses as any)?.label || null,
          statusColor: (t.task_statuses as any)?.color_hex || null,
          team: (t.teams as any)?.team_name || null,
        };
      });

      return json({
        userId: profileId,
        filter,
        count: result.length,
        tasks: result,
        generatedAt: new Date().toISOString(),
      }, 200, headers);
    }

    // ── GET /team-tasks ───────────────────────────────────────────
    // Returns all tasks for all members of a company -- for team digest
    if (req.method === 'GET' && path === '/team-tasks') {
      const companyId = url.searchParams.get('companyId') || '';
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);

      const today = new Date().toISOString().split('T')[0];

      const { data: tasks, error } = await db
        .from('tasks')
        .select(`
          id, name, due_date, due_time, is_completed,
          profiles:assignee_id(id, full_name, email),
          projects:project_id(id, name),
          task_statuses:status_id(label, color_hex)
        `)
        .eq('company_id', companyId)
        .eq('is_completed', false)
        .is('deleted_at', null)
        .not('assignee_id', 'is', null)
        .lte('due_date', today)
        .order('due_date', { ascending: true })
        .order('due_time', { ascending: true, nullsFirst: false });

      if (error) return json({ error: error.message }, 500, headers);

      const now = new Date();

      // Group by assignee
      const byMember: Record<string, any> = {};
      for (const t of (tasks || [])) {
        const profile = (t.profiles as any);
        if (!profile) continue;
        const uid = profile.id;
        if (!byMember[uid]) {
          byMember[uid] = {
            userId: uid,
            name: profile.full_name || profile.email,
            email: profile.email,
            tasks: [],
          };
        }
        const due = t.due_date ? new Date(t.due_date.substring(0,10) + 'T23:59:59') : null;
        const diffMs = due ? due.getTime() - now.getTime() : null;
        const diffDays = diffMs !== null ? Math.ceil(diffMs / 86400000) : null;
        byMember[uid].tasks.push({
          id: t.id,
          name: t.name,
          dueDate: t.due_date ? t.due_date.substring(0,10) : null,
          diffDays,
          urgency: diffDays === null ? 'none' : diffDays < 0 ? 'overdue' : diffDays === 0 ? 'today' : 'soon',
          project: (t.projects as any)?.name || null,
          status: (t.task_statuses as any)?.label || null,
        });
      }

      return json({
        companyId,
        members: Object.values(byMember),
        generatedAt: new Date().toISOString(),
      }, 200, headers);
    }



    // ── GET /my-tasks ─────────────────────────────────────────────
    if (req.method === 'GET' && path === '/my-tasks') {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: profile } = await db
        .from('profiles').select('id, full_name').eq('email', userEmail).single();
      if (!profile) return json({ error: 'Profile not found' }, 404, headers);
      const { data: tasks, error: tasksErr } = await db.from('tasks')
        .select('id, name, due_date, due_time, projects:project_id(id, name), task_statuses:status_id(label, color_hex), assigned_team:assigned_team_id(team_name)')
        .eq('assignee_id', profile.id).eq('is_completed', false).is('deleted_at', null)
        .not('due_date', 'is', null).lte('due_date', todayStr)
        .order('due_date', { ascending: true }).order('due_time', { ascending: true, nullsFirst: false });
      if (tasksErr) return json({ error: tasksErr.message }, 500, headers);
      const today = new Date();
      return json({
        user: profile.full_name || userEmail, date: todayStr, count: tasks?.length || 0,
        tasks: (tasks || []).map((t: any) => {
          const diffDays = Math.ceil((new Date(t.due_date.substring(0,10)+'T23:59:59').getTime() - today.getTime()) / 86400000);
          return { id: t.id, name: t.name, project: t.projects?.name || null, projectId: t.projects?.id || null,
            dueDate: t.due_date.substring(0,10), dueTime: t.due_time || null,
            status: t.task_statuses?.label || null, statusColor: t.task_statuses?.color_hex || null,
            team: t.assigned_team?.team_name || null,
            urgency: diffDays < 0 ? 'overdue' : diffDays === 0 ? 'today' : 'upcoming', daysUntilDue: diffDays };
        }),
      }, 200, headers);
    }

    // ── GET /team-tasks ───────────────────────────────────────────
    if (req.method === 'GET' && path === '/team-tasks') {
      const companyId = url.searchParams.get('companyId') || '';
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);
      const todayStr = new Date().toISOString().split('T')[0];
      const today = new Date();
      const { data: members } = await db.from('company_memberships')
        .select('user_id').eq('company_id', companyId);
      const userIds = (members || []).map((m: any) => m.user_id);
      if (!userIds.length) return json({ date: todayStr, members: [] }, 200, headers);
      const { data: tasks, error: tasksErr } = await db.from('tasks')
        .select('id, name, due_date, assignee_id, projects:project_id(id, name), task_statuses:status_id(label), profiles:assignee_id(full_name, email)')
        .in('assignee_id', userIds).eq('is_completed', false).is('deleted_at', null)
        .not('due_date', 'is', null).lte('due_date', todayStr)
        .order('due_date', { ascending: true }).order('due_time', { ascending: true, nullsFirst: false });
      if (tasksErr) return json({ error: tasksErr.message }, 500, headers);
      const byUser: Record<string, any> = {};
      for (const t of (tasks || []) as any[]) {
        if (!byUser[t.assignee_id]) byUser[t.assignee_id] = {
          name: t.profiles?.full_name || t.profiles?.email || t.assignee_id,
          email: t.profiles?.email || null, tasks: [],
        };
        const diffDays = Math.ceil((new Date(t.due_date.substring(0,10)+'T23:59:59').getTime() - today.getTime()) / 86400000);
        byUser[t.assignee_id].tasks.push({ id: t.id, name: t.name, project: t.projects?.name || null,
          dueDate: t.due_date.substring(0,10), status: t.task_statuses?.label || null,
          urgency: diffDays < 0 ? 'overdue' : 'today', daysUntilDue: diffDays });
      }
      return json({ date: todayStr, companyId, members: Object.values(byUser) }, 200, headers);
    }

    if (req.method === 'GET' && path === '/webhook-settings') {
      const { data: profile } = await db
        .from('profiles')
        .select('chat_webhook_url')
        .eq('email', userEmail)
        .single();
      return json({ webhookUrl: profile?.chat_webhook_url || null }, 200, headers);
    }

    // ── POST /webhook-settings ────────────────────────────────────
    if (req.method === 'POST' && path === '/webhook-settings') {
      const body = await req.json();
      const { webhookUrl } = body;
      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();
      if (!profile) return json({ error: 'Profile not found' }, 404, headers);
      await db.from('profiles')
        .update({ chat_webhook_url: webhookUrl || null })
        .eq('id', profile.id);
      return json({ ok: true }, 200, headers);
    }


    if (req.method === 'GET' && path === '/task-context') {
      const companyId = url.searchParams.get('companyId') || '';
      return json(await getTaskContextCore(companyId), 200, headers);
    }

    // ── GET /all-tasks ──────────────────────────────────────────────
    // Powers the Home card's "All My Tasks" section -- the requesting user's
    // own active tasks across every project, with each project's Gmail
    // label name (so users can tell at a glance which label/thread a task
    // belongs to). Paginated via limit/offset.
    if (req.method === 'GET' && path === '/all-tasks') {
      const companyId = url.searchParams.get('companyId') || '';
      const assigneeId = url.searchParams.get('assigneeId') || '';
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);
      if (!assigneeId) return json({ error: 'Missing assigneeId' }, 400, headers);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20') || 20, 100);
      const offset = Math.max(parseInt(url.searchParams.get('offset') || '0') || 0, 0);

      const [
        { data: tasks, error: tasksErr },
        { count: totalCount },
      ] = await Promise.all([
        db.from('tasks')
          .select(`
            id, name, is_completed, due_date, due_time, assignee_id, assigned_team_id,
            status_id, is_monetary, estimated_cost, created_by, awaiting_follow_up, follow_up_date, notes, source_message_id, source_email_subject, source_email_body, calendar_target, sync_to_company_calendar,
            project_id,
            projects:project_id(id, name, project_gmail_labels(gmail_label_name, label_code)),
            profiles:assignee_id(full_name, email),
            teams:assigned_team_id(team_name),
            task_statuses:status_id(label, color_hex),
            creator:created_by(full_name, email)
          `)
          .eq('company_id', companyId)
          .eq('assignee_id', assigneeId)
          .eq('is_completed', false)
          .is('deleted_at', null)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('due_time', { ascending: true, nullsFirst: false })
          .range(offset, offset + limit - 1),
        db.from('tasks').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).eq('assignee_id', assigneeId).eq('is_completed', false).is('deleted_at', null),
      ]);

      if (tasksErr) return json({ error: tasksErr.message }, 500, headers);

      const taskIds = (tasks || []).map((t: any) => t.id);
      const projectIds: string[] = [...new Set<string>((tasks || []).map((t: any) => t.project_id).filter(Boolean))];
      const [
        { counts: followUpCounts, scheduled: scheduledFollowUpDates },
        watchersByTask,
        matterByProject,
      ] = await Promise.all([
        followUpSummary(taskIds),
        watchersByTaskIds(taskIds),
        matterNumbersForProjects(companyId, projectIds),
      ]);

      return json({
        tasks: (tasks || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          isCompleted: t.is_completed,
          dueDate: t.due_date,
          dueTime: t.due_time,
          projectId: t.project_id,
          projectName: t.projects?.name || null,
          matterNumber: t.project_id ? matterByProject[t.project_id] || null : null,
          labelName: t.projects?.project_gmail_labels?.[0]?.gmail_label_name || null,
          labelCode: t.projects?.project_gmail_labels?.[0]?.label_code || null,
          assigneeId: t.assignee_id,
          assignee: t.profiles?.full_name || t.profiles?.email || null,
          assignedTeamId: t.assigned_team_id,
          assignedTeam: t.teams?.team_name || null,
          statusId: t.status_id,
          status: t.task_statuses?.label || null,
          statusColor: t.task_statuses?.color_hex || null,
          isMonetary: t.is_monetary,
          estimatedCost: t.estimated_cost,
          createdBy: t.creator?.full_name || t.creator?.email || null,
          awaitingFollowUp: t.awaiting_follow_up,
          followUpDate: t.follow_up_date,
          followUpCount: followUpCounts[t.id] || 0,
          scheduledFollowUpDate: scheduledFollowUpDates[t.id] || null,
          notes: t.notes,
          sourceMessageId: t.source_message_id,
          sourceEmailSubject: t.source_email_subject,
          sourceEmailBody: t.source_email_body,
          calendarTarget: t.calendar_target,
          syncToCompanyCalendar: t.sync_to_company_calendar,
          watchers: watchersByTask[t.id] || [],
        })),
        limit,
        offset,
        totalCount,
      }, 200, headers);
    }

    // ── GET /unallocated-tasks ────────────────────────────────────────
    // Company-wide tasks with no assignee -- these fall through every
    // per-person view (including "All My Tasks"), so they need their own
    // place to surface. Paginated via limit/offset, same shape as /all-tasks.
    if (req.method === 'GET' && path === '/unallocated-tasks') {
      const companyId = url.searchParams.get('companyId') || '';
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20') || 20, 100);
      const offset = Math.max(parseInt(url.searchParams.get('offset') || '0') || 0, 0);

      const result = await getUnallocatedTasksCore(companyId, limit, offset);
      if (result.error) return json({ error: result.error }, 500, headers);
      return json(result, 200, headers);
    }

    // ── POST /apply-template ───────────────────────────────────────
    if (req.method === 'POST' && path === '/apply-template') {
      const body = await req.json();
      const { templateId, projectId, companyId, projectCreatedAt } = body;
      if (!templateId || !projectId) return json({ error: 'Missing params' }, 400, headers);

      // Get template with items
      const { data: template } = await db
        .from('checklist_templates')
        .select('id, name, items:checklist_template_items(*)')
        .eq('id', templateId)
        .single();

      if (!template) return json({ error: 'Template not found' }, 404, headers);

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();

      const anchor = projectCreatedAt ? new Date(projectCreatedAt) : new Date();

      // Build tasks from template items (top-level only)
      const items = (template.items || [])
        .filter((i: any) => !i.parent_item_id)
        .sort((a: any, b: any) => a.display_order - b.display_order);

      const tasksToInsert = items.map((item: any) => {
        let dueDate: string | null = null;
        if (item.due_offset_days !== null && item.due_offset_days !== undefined) {
          const d = new Date(anchor);
          d.setDate(d.getDate() + item.due_offset_days);
          dueDate = d.toISOString().split('T')[0];
        }
        return {
          project_id: projectId,
          company_id: companyId,
          name: item.title,
          assignee_id: item.assignee_id || null,
          assigned_team_id: item.assigned_team_id || null,
          is_monetary: item.is_monetary || false,
          estimated_cost: item.estimated_cost || null,
          due_date: dueDate,
          is_completed: false,
          created_by: profile?.id,
          date_entered: new Date().toISOString().split('T')[0],
        };
      });

      if (!tasksToInsert.length) return json({ ok: true, count: 0 }, 200, headers);

      const { data: created, error } = await db
        .from('tasks').insert(tasksToInsert).select();

      if (error) return json({ error: error.message }, 500, headers);

      return json({ ok: true, count: created?.length || 0 }, 200, headers);
    }

    return json({ error: 'Not found' }, 404, headers);

  } catch (err: any) {
    console.error('[gmail-addon] Error:', err?.message);
    return json({ error: err?.message || 'Internal error' }, 500, headers);
  }
});

// ── Background job processor ──────────────────────────────────────
// Processes in batches of 20 with a hard timeout guard.
// If execution limit is near, saves progress and lets next invocation continue.

const BATCH_SIZE = 20;
const MAX_RUNTIME_MS = 100000; // 100s -- stop before Supabase's 150s limit

async function processImportJob(
  jobId: string,
  projectIds: string[],
  companyId: string,
  createdBy: string,
) {
  const startTime = Date.now();

  try {
    // Mark as running
    await db.from('label_import_jobs').update({
      status: 'running',
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    const { data: company } = await db
      .from('companies')
      .select('gmail_parent_label, gmail_sublabel_separator, gmail_label_tokens')
      .eq('id', companyId).single();

    const tokens: string[] = company?.gmail_label_tokens || ['project_name'];
    const separator = company?.gmail_sublabel_separator || ' -- ';
    const parentLabel = company?.gmail_parent_label || 'Shared Emails';

    const { data: matterField } = await db
      .from('company_custom_fields')
      .select('id').eq('company_id', companyId).eq('table_name', 'projects')
      .ilike('label', '%matter%number%').maybeSingle();

    // Get current progress (in case this is a resumed job)
    const { data: jobState } = await db
      .from('label_import_jobs')
      .select('processed, created, existed')
      .eq('id', jobId).single();

    let created = jobState?.created || 0;
    let existed = jobState?.existed || 0;
    let processed = jobState?.processed || 0;

    // Skip already-processed items
    const remaining = projectIds.slice(processed);
    console.log(`[import-job] Starting from ${processed}/${projectIds.length}`);

    for (let i = 0; i < remaining.length; i++) {
      // Timeout guard -- stop before execution limit
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`[import-job] Timeout guard hit at ${processed}/${projectIds.length} -- saving progress`);
        await db.from('label_import_jobs').update({
          processed,
          created,
          existed,
          status: 'paused',
          error: `Paused at ${processed}/${projectIds.length} -- will resume on next run`,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
        return;
      }

      const projectId = remaining[i];

      try {
        // Check if cancelled
        const { data: currentJob } = await db
          .from('label_import_jobs').select('status').eq('id', jobId).single();
        if (currentJob?.status === 'cancelled') {
          console.log('[import-job] Job cancelled by user');
          return;
        }

        const { data: existing } = await db
          .from('project_gmail_labels')
          .select('id').eq('project_id', projectId).is('removed_at', null).maybeSingle();

        if (existing) {
          existed++;
        } else {
          const { data: project } = await db
            .from('projects').select('name').eq('id', projectId).is('deleted_at', null).single();
          if (!project) { processed++; continue; } // skip deleted projects

          let matterNumber = '';
          if (matterField) {
            const { data: mv } = await db
              .from('company_custom_field_values')
              .select('value_text').eq('field_id', matterField.id).eq('record_id', projectId).maybeSingle();
            matterNumber = mv?.value_text || '';
          }

          const labelCode = await generateUniqueLabelCode(companyId);
          const parts = tokens.map((t: string) => {
            if (t === 'project_name') return project.name;
            if (t === 'matter_number') return matterNumber || '';
            if (t === 'year') return new Date().getFullYear().toString();
            return t;
          }).filter(Boolean);

          const cleanParts = parts.map((p: string) => p.replace(/\//g, ','));
          const sublabel = cleanParts.join(separator) + ` [${labelCode}]`;
          const fullLabelName = `${parentLabel}/${sublabel}`;

          const { error: pglErr } = await db.from('project_gmail_labels').insert({
            company_id: companyId,
            project_id: projectId,
            gmail_label_name: fullLabelName,
            label_sub: sublabel,
            label_code: labelCode,
            created_by: createdBy,
          });
          if (pglErr) throw new Error(pglErr.message);
          await enqueueLabelSyncJob(companyId, projectId, labelCode, fullLabelName);
          created++;
        }
      } catch (err: any) {
        console.error(`[import-job] Error on project ${projectId}:`, err?.message);
      }

      processed++;

      // Update progress every batch
      if (processed % BATCH_SIZE === 0) {
        await db.from('label_import_jobs').update({
          processed,
          created,
          existed,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
        console.log(`[import-job] Progress: ${processed}/${projectIds.length} (${created} created, ${existed} existed)`);
      }
    }

    // Mark done
    await db.from('label_import_jobs').update({
      status: 'done',
      processed,
      created,
      existed,
      error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    console.log(`[import-job] Complete: ${created} created, ${existed} existed`);
  } catch (err: any) {
    console.error('[import-job] Fatal:', err?.message);
    await db.from('label_import_jobs').update({
      status: 'failed',
      error: err?.message,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
}

// ── Field constraint checker ──────────────────────────────────────
async function checkFieldConstraints(
  companyId: string,
  tableName: string,
  fields: { key: string; value: string }[],
  excludeRecordId?: string
): Promise<{ ok: boolean; error?: string }> {
  for (const field of fields) {
    if (!field.value?.trim()) continue;
    const { data } = await db.rpc('check_field_constraint', {
      p_company_id: companyId,
      p_table_name: tableName,
      p_field_key: field.key,
      p_value: field.value.trim(),
      p_exclude_record_id: excludeRecordId || null,
    });
    if (data && !data.ok) return { ok: false, error: data.error };
  }
  return { ok: true };
}

function triggerCalendarSync(taskId: string, action: 'upsert' | 'delete' | 'complete'): void {
  fetch(`${supabaseUrl}/functions/v1/calendar-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ action, taskId }),
  }).catch((err) => console.error('[calendar-sync] trigger failed:', err?.message));
}

function json(data: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function generateUniqueLabelCode(companyId: string): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let attempts = 0;
  while (attempts < 10) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    // Check collision -- exclude labels from deleted projects
    const { data } = await db
      .from('project_gmail_labels')
      .select('id, projects!inner(deleted_at)')
      .eq('label_code', code)
      .is('projects.deleted_at', null) // only count active projects
      .maybeSingle();
    if (!data) return code; // unique among active projects
    attempts++;
    console.warn(`[generateLabelCode] collision on ${code}, retrying (attempt ${attempts})`);
  }
  // Fallback: timestamp-based suffix guarantees uniqueness
  return 'Z' + Date.now().toString(36).toUpperCase().slice(-4);
}

function generateLabelCode(): string {
  // Synchronous fallback -- use for contexts where async isn't available
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}