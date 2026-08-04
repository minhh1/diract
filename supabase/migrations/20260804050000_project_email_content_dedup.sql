-- Stage 1 of de-duplicating project_emails' storage (Stage 2: converting
-- each write site to stop writing duplicate content directly, and
-- eventually dropping the columns this migration only ADDS alongside --
-- done incrementally, file by file, as a separate follow-up).
--
-- The same real email lands as a separate project_emails row PER STAFF
-- MEMBER whose own mailbox it synced into (confirmed in
-- lib/ai/emailTimekeeperAttribution.ts: 173 of 189 rows on one day were
-- duplicates of just 39 real emails) -- each carrying its own full copy of
-- subject/from_address/from_name/snippet/date/has_attachments, even though
-- that content is identical across every copy of the same real email.
--
-- This stage is purely additive and self-healing, not a rewrite of any
-- existing code path: every current INSERT/UPDATE into project_emails
-- keeps working completely unchanged (existing columns untouched), but a
-- BEFORE trigger now also resolves/creates a shared project_email_content
-- row per real email (same fingerprint emailTimekeeperAttribution.ts
-- already uses: subject + from_address + snippet + project_id) and links
-- content_id to it -- so new duplicate copies stop growing distinct
-- content in project_email_content from this point on, with zero changes
-- required to any of the ~15 existing write call sites (app/api/gmail/*,
-- lib/gmail/client.ts, gmail-push, gmail-addon, the sync workers/
-- processors). The one-time UPDATE at the bottom backfills content_id for
-- every row that already existed before this migration, by firing the
-- exact same trigger logic.
create table if not exists project_email_content (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  subject text,
  from_address text,
  from_name text,
  snippet text,
  has_attachments boolean,
  gmail_thread_id text,
  -- subject + lowercased from_address + snippet + project_id, matching
  -- lib/ai/emailTimekeeperAttribution.ts's fingerprint() exactly -- that's
  -- the already-proven definition of "same real email", not a new one
  -- invented here. project_id is part of it for the same reason that file
  -- documents: the same content can legitimately be filed to two different
  -- matters at once, and those must stay two separate groups.
  fingerprint text not null,
  created_at timestamptz not null default now()
);

-- NULLS NOT DISTINCT would be the more precise choice for a nullable
-- project_id (so two null-project rows with the same fingerprint still
-- collide into one group instead of each getting its own), but this
-- Postgres version's ON CONFLICT target needs a plain unique index to
-- upsert against -- acceptable trade-off, an orphaned (project deleted)
-- row is rare and getting its own content row instead of sharing one
-- costs nothing functionally.
create unique index if not exists project_email_content_project_fingerprint_idx
  on project_email_content (project_id, fingerprint);

alter table project_email_content enable row level security;
drop policy if exists project_email_content_company on project_email_content;
create policy project_email_content_company on project_email_content
  for all using (company_id = active_company_id()) with check (company_id = active_company_id());

alter table project_emails add column if not exists content_id uuid references project_email_content(id);
create index if not exists project_emails_content_id_idx on project_emails (content_id);

create or replace function set_project_email_content_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fingerprint text;
  v_content_id uuid;
begin
  v_fingerprint := coalesce(trim(NEW.subject), '') || '|||'
    || lower(coalesce(trim(NEW.from_address), '')) || '|||'
    || coalesce(trim(NEW.snippet), '') || '|||'
    || coalesce(NEW.project_id::text, '');

  insert into project_email_content (company_id, project_id, subject, from_address, from_name, snippet, has_attachments, gmail_thread_id, fingerprint)
  values (NEW.company_id, NEW.project_id, NEW.subject, NEW.from_address, NEW.from_name, NEW.snippet, NEW.has_attachments, NEW.gmail_thread_id, v_fingerprint)
  on conflict (project_id, fingerprint) do update set
    -- Fill in whichever fields this particular copy happened to know that
    -- the existing group row doesn't yet -- e.g. a row created before its
    -- metadata backfill (subject/from/date still null) landing after a
    -- richer copy already created the group, or vice versa. Never
    -- overwrites a field the group already has with a blanker value.
    subject = coalesce(project_email_content.subject, excluded.subject),
    from_address = coalesce(project_email_content.from_address, excluded.from_address),
    from_name = coalesce(project_email_content.from_name, excluded.from_name),
    snippet = coalesce(project_email_content.snippet, excluded.snippet),
    has_attachments = coalesce(project_email_content.has_attachments, excluded.has_attachments),
    gmail_thread_id = coalesce(project_email_content.gmail_thread_id, excluded.gmail_thread_id)
  returning id into v_content_id;

  NEW.content_id := v_content_id;
  return NEW;
end;
$$;

drop trigger if exists project_emails_set_content_id on project_emails;
create trigger project_emails_set_content_id
  before insert or update of subject, from_address, from_name, snippet, has_attachments, gmail_thread_id
  on project_emails
  for each row
  execute function set_project_email_content_id();

-- One-time backfill for every row that existed before this migration --
-- fires the exact same trigger (an UPDATE ... OF subject counts as
-- touching that column even when the value is unchanged), so this is the
-- identical code path new rows use going forward, not a separate script
-- that could drift from it.
update project_emails set subject = subject where content_id is null;
