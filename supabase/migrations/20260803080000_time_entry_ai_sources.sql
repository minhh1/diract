-- Tracks which task/email a given AI-drafted-then-submitted Time & Fee
-- Entries record came from -- see app/api/time-entries/auto-generate and
-- .../submit. Two jobs:
--   1. Never suggest the same task/email again once it's been converted
--      (the auto-generate route excludes anything with a row here).
--   2. Cross-user race safety for the admin "push everyone's" flow -- if a
--      user submits their own entry for a task/email at the same moment an
--      admin pushes it on their behalf, the unique constraint below lets
--      exactly one of those two inserts win; the loser's submit route
--      treats the resulting conflict as "already recorded" rather than
--      creating a duplicate Time & Fee Entries row.
-- Deliberately NOT modeled as a `status` column on company_table_records
-- itself (e.g. a 'Draft' -> 'Released' pipeline) -- an AI suggestion here
-- is never written to company_table_records/values at all until the user
-- (or admin) actually submits it, so there's nothing to track before that
-- point, and nothing left to clean up if they never do.
create table if not exists time_entry_ai_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  source_type text not null check (source_type in ('task', 'email')),
  source_id uuid not null,
  company_table_record_id uuid not null references company_table_records(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists time_entry_ai_sources_record_idx on time_entry_ai_sources (company_table_record_id);
create index if not exists time_entry_ai_sources_company_idx on time_entry_ai_sources (company_id);

alter table time_entry_ai_sources enable row level security;

-- Read-only for company members (used by the client to show "already
-- recorded" state); every write goes through app/api/time-entries/* with
-- the admin/service-role client, which bypasses RLS deliberately -- same
-- pattern as archive_requests' approve route -- so there is no insert/
-- update/delete policy for the authenticated role at all.
drop policy if exists time_entry_ai_sources_select on time_entry_ai_sources;
create policy time_entry_ai_sources_select on time_entry_ai_sources
  for select using (company_id = active_company_id());
