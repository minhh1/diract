-- The firm's deed template, alongside its letterhead.
--
-- Deeds don't go on the letterhead: a deed is a numbered instrument whose
-- numbering, indentation and cross-reference scheme live in named Word styles,
-- and those come from the firm's own template. See
-- lib/precedents/deedTemplateStyles.ts for the style contract and
-- lib/precedents/deedDocx.ts for how a deed is generated into it.
--
-- Separate table rather than a column on company_letterheads because they are
-- different documents with different jobs -- a letterhead carries branding and
-- merge tags, a deed template carries styles -- and a firm may reasonably have
-- one without the other.
create table if not exists company_deed_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  -- styleId -> style name, as found in the uploaded file. Kept so the settings
  -- screen can show which styles a firm's template actually defines without
  -- re-downloading and re-parsing it every time the page opens.
  detected_styles jsonb not null default '{}'::jsonb,
  -- True when the template arrived without the required styles and the default
  -- scheme was added to it on upload. Surfaced in the UI so a firm knows the
  -- numbering it sees is ours rather than theirs, and can replace it.
  defaults_applied boolean not null default false,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One per company: uploading again replaces what is there, same as the
-- letterhead.
create unique index if not exists company_deed_templates_company_idx
  on company_deed_templates(company_id);

alter table company_deed_templates enable row level security;

-- Readable by any member of the company; only the service role writes, since
-- uploading runs through the API so the styles can be checked and the default
-- scheme applied before the file is stored.
drop policy if exists company_deed_templates_select on company_deed_templates;
create policy company_deed_templates_select on company_deed_templates
  for select using (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
  );
