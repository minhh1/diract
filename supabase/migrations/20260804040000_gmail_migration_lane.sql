-- Huynh Lawyers' shared-mailbox Gmail sync got stuck again -- 137 of 146
-- project label jobs sitting "pending", 42 (job, user) pairs across EVERY
-- connected staff member (not just Tommy Ha, who reported it -- Minh,
-- Katherine, Huy, Hoang, Jason all affected too) quarantined in
-- gmail_sync_failures, repeatedly hitting "Time budget reached mid-mailbox
-- ... will resume next tick" for hours without converging.
--
-- Root cause: gmail_sync_failures/gmail-sync-recovery-worker is ONE shared
-- slow lane for two very different situations -- a genuinely transient
-- failure (rate limit, timeout) that should clear in one retry, and a
-- large one-time historical backlog (a newly-connected or long-
-- disconnected mailbox with hundreds/thousands of messages to catch up on)
-- that's expected to take many ticks by design. The recovery worker only
-- gets 10 slots/15min with NO per-company limit, a single oversized
-- mailbox can burn its whole 100s budget alone, and -- worse -- the fast
-- workers (gmail-email-sync-worker, gmail-label-sync-worker) permanently
-- skip any (job, user) pair once quarantined, so a user stuck behind a big
-- backlog gets NO further attempts from the fast path either, for ANY
-- project, until the slow lane works through everything ahead of them.
-- That's "Tommy cannot receive any emails" -- he isn't uniquely broken,
-- he's just bottlenecked on a queue a big backlog was never supposed to
-- share with quick fixes.
--
-- Fix: detect "this needs migration, not a quick retry" UP FRONT, before a
-- job ever gets a chance to time out and quarantine -- see the matching
-- changes in gmail-email-sync-worker and gmail-label-sync-worker (message
-- count already fetched there for other reasons, so this costs no extra
-- Gmail API calls). Anything over MIGRATION_THRESHOLD (50) messages for a
-- given (job, user) pair is routed straight into its own dedicated lane
-- (gmail_migration_jobs + gmail-migration-worker, */5 * * * *, its own
-- generous time budget) that never competes with, or gets blocked by, the
-- steady daily flow. Completion still updates the SAME gmail_sync_jobs.
-- completed_users the fast lane writes to, so nothing else about job
-- bookkeeping (the cron's "already done" skip logic, etc.) needs to change.
create table if not exists gmail_migration_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  source_job_id uuid not null references gmail_sync_jobs(id) on delete cascade,
  job_type text not null check (job_type in ('email_sync', 'label_sync')),
  project_id uuid not null,
  user_id uuid not null,
  label_code text,
  gmail_label_name text not null,
  total_users int not null,
  message_count int not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'persistent_failure')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_job_id, user_id)
);

-- Smallest-first, like gmail-sync-recovery-worker's own fairness sort --
-- a handful of modest backlogs converge and stop competing for slots
-- before one huge mailbox eats a whole tick's budget by itself.
create index if not exists gmail_migration_jobs_dispatch_idx
  on gmail_migration_jobs (message_count, created_at)
  where status in ('pending', 'processing');

-- Seed this worker's overlap-guard row (dispatcher_locks, shared with the
-- other gmail workers -- see gmail_sync_failures.sql) so acquireLock()'s
-- UPDATE has a row to find on the very first tick.
insert into dispatcher_locks (name, locked_until)
values ('gmail-migration-worker', to_timestamp(0))
on conflict (name) do nothing;

alter table gmail_migration_jobs enable row level security;
drop policy if exists gmail_migration_jobs_admin_read on gmail_migration_jobs;
create policy gmail_migration_jobs_admin_read on gmail_migration_jobs for select
  using (company_id = active_company_id() and is_current_user_admin());

select cron.schedule(
  'gmail-migration-worker',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/gmail-migration-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb)
  $$
);

-- ── Immediate relief: move Huynh Lawyers' CURRENT backlog into the new
--    lane now, not just future ones ─────────────────────────────────────
-- The 42 already-quarantined (job, user) pairs: compute each one's real
-- message count (project_emails count for that project -- the same number
-- the fast workers would have used had this routing existed when the job
-- was first dispatched) and seed gmail_migration_jobs directly from them.
insert into gmail_migration_jobs (company_id, source_job_id, job_type, project_id, user_id, label_code, gmail_label_name, total_users, message_count, status)
select
  f.company_id, f.job_id, f.job_type, f.project_id, f.user_id,
  j.label_code, j.gmail_label_name, coalesce(j.total_users, 1),
  coalesce((select count(*) from project_emails pe where pe.project_id = f.project_id), 0),
  'pending'
from gmail_sync_failures f
join gmail_sync_jobs j on j.id = f.job_id
where f.status in ('pending_retry', 'persistent_failure')
  and f.user_id is not null
on conflict (source_job_id, user_id) do nothing;

-- Resolve the failures now owned by the migration lane -- safe to do
-- unconditionally: the fast workers' next change (this same deploy) skips
-- any (job, user) pair with an active gmail_migration_jobs row regardless
-- of quarantine status, so this can't bounce them back into the fast path.
update gmail_sync_failures f
set status = 'resolved', resolved_at = now()
where f.status in ('pending_retry', 'persistent_failure')
  and exists (
    select 1 from gmail_migration_jobs m
    where m.source_job_id = f.job_id and m.user_id = f.user_id
  );
