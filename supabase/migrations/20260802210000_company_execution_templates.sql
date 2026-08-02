-- The firm's execution page: how each kind of party signs.
--
-- Separate from company_deed_templates because they answer different
-- questions. The deed template supplies numbering and page setup for the whole
-- instrument; the execution template supplies only the signing blocks, and a
-- firm may want to change one without touching the other.
--
-- The built-in scheme in lib/precedents/executionClauses.ts is used when a
-- firm hasn't uploaded one, so this is an override rather than a requirement.
create table if not exists company_execution_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  -- The blocks read out of the uploaded file, keyed by the party kind they
  -- were matched to (individual, company_127_two_officers, ...). Stored so
  -- generation doesn't re-download and re-parse the file every time, and so
  -- the settings screen can show what was recognised.
  blocks jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_execution_templates_company_idx
  on company_execution_templates(company_id);

alter table company_execution_templates enable row level security;

drop policy if exists company_execution_templates_select on company_execution_templates;
create policy company_execution_templates_select on company_execution_templates
  for select using (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
  );
