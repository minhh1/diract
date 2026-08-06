-- Automatic "re-check AI field agreement" trigger for the AI field-review
-- feature (see lib/clientUpdatePageFieldReview.ts and
-- supabase/functions/field-review-worker/index.ts) -- previously this only
-- ran when staff clicked "Review emails" or the bulk button. Real emails
-- only ever arrive through the Gmail Pub/Sub webhook
-- (supabase/functions/gmail-push/index.ts), which is explicitly written to
-- be fast (not a cron job) and can't afford to block on a synchronous AI
-- call per new message -- so this follows the SAME deferred job-queue
-- pattern every other Gmail-sync background task in this codebase already
-- uses (gmail_sync_jobs / gmail_migration_jobs), rather than inventing
-- something new. Matter-scoped (project_id), not per-mailbox like
-- label_sync/email_sync, since AI field review is a once-per-matter
-- concern, not a per-user copy concern.
--
-- gmail-push enqueues (upserts, one row per project) a pending, realtime
-- row here every time it writes a genuinely new project_emails row for
-- that project -- see the matching change in gmail-push/index.ts
-- (enqueueFieldReviewJob, called alongside every resetJobsForNewEmail
-- call). field-review-worker (its own cron, below) is a single
-- self-contained dispatcher+processor (unlike the label/email-sync worker/
-- processor split) since an AI review call has no OAuth token juggling and
-- is comparatively cheap -- see that function's own header comment for why
-- splitting it further isn't worth the complexity yet.
create table if not exists field_review_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts int not null default 0,
  is_realtime boolean not null default false,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, project_id)
);

create index if not exists field_review_jobs_dispatch_idx
  on field_review_jobs (is_realtime, status, updated_at)
  where status in ('pending', 'processing');

-- Seed this worker's overlap-guard row (dispatcher_locks, shared with every
-- other Gmail-sync worker) so acquireLock()'s UPDATE has a row to find on
-- the very first tick.
insert into dispatcher_locks (name, locked_until)
values ('field-review-worker', to_timestamp(0))
on conflict (name) do nothing;

alter table field_review_jobs enable row level security;
drop policy if exists field_review_jobs_admin_read on field_review_jobs;
create policy field_review_jobs_admin_read on field_review_jobs for select
  using (company_id = active_company_id() and is_current_user_admin());

-- Every 2 minutes, not every 1 -- this isn't as latency-sensitive as label/
-- email sync (nobody's actively watching a "did my label show up yet"
-- spinner for an AI field re-check), and it keeps this job's tick offset
-- from colliding with the existing */1 min jobs' own pg_sleep staggering
-- (5s/15s/30s -- see gmail_cron_timeout_fix.sql) for pg_net's single-
-- outbound-worker bottleneck. pg_sleep(45) picks an offset none of those
-- already use.
select cron.schedule(
  'field-review-worker',
  '*/2 * * * *',
  $$
  select pg_sleep(45);
  select net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/field-review-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 25000)
  $$
);
