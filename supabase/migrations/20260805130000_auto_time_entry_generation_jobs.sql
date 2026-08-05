-- Persists auto-generate ("Auto Time Recording") runs so they survive the
-- drawer closing or the browser tab closing entirely -- the route now kicks
-- the actual work off via Next's after()/Vercel waitUntil and writes
-- progress here instead of streaming it straight to one held-open response.
-- requested_by_user_id-scoped rather than company-wide: a job is private to
-- whoever clicked Generate, same as the drafts it produces were always only
-- ever shown to them before submit.
create table if not exists auto_time_entry_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  requested_by_user_id uuid not null references profiles(id) on delete cascade,
  date text not null,
  scope text not null check (scope in ('mine', 'all')),
  detail_level text not null check (detail_level in ('brief', 'standard', 'detailed')),
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  processed int not null default 0,
  total int not null default 0,
  entries jsonb not null default '[]'::jsonb,
  staff_options jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The panel's "is there already a job for this date/scope" lookup on open,
-- and the button widget's "is anything of mine still running" check.
create index if not exists auto_time_entry_generation_jobs_lookup_idx
  on auto_time_entry_generation_jobs (requested_by_user_id, date, scope, created_at desc);

alter table auto_time_entry_generation_jobs enable row level security;

-- Read-only for the owner -- every write comes from the route's admin
-- (service-role) client, which bypasses RLS entirely, so there's
-- deliberately no insert/update/delete policy for the authenticated role.
create policy auto_time_entry_generation_jobs_select_own
  on auto_time_entry_generation_jobs for select
  using (requested_by_user_id = auth.uid());

alter publication supabase_realtime add table auto_time_entry_generation_jobs;
