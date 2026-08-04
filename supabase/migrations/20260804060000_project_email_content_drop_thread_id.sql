-- Corrects a modeling error in 20260804050000_project_email_content_dedup.sql:
-- gmail_thread_id was treated as shared content (grouped by the same
-- subject+from_address+snippet+project_id fingerprint as subject/snippet/
-- etc), but it isn't -- Gmail assigns thread ids PER MAILBOX. An imported
-- copy of a real email starts a brand-new thread in the target mailbox
-- (no prior reply history to link to there), so the same real email's
-- several copies routinely have DIFFERENT thread ids across different
-- users' mailboxes, unlike subject/from_address/snippet/has_attachments
-- (copied byte-for-byte from the original message on import, genuinely
-- identical across every copy).
--
-- Confirmed live before this ever reached gmail-push's thread-continuity
-- matching (the one place that actually reads gmail_thread_id for live
-- auto-labeling decisions, not just display): 2,926 of 5,503 content
-- groups had at least one linked project_emails row whose gmail_thread_id
-- didn't match the group's single stored value. gmail_thread_id stays
-- exactly where it already was -- a per-copy column on project_emails --
-- and is simply removed from the shared content side of this migration.
drop trigger if exists project_emails_set_content_id on project_emails;

alter table project_email_content drop column if exists gmail_thread_id;

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

  insert into project_email_content (company_id, project_id, subject, from_address, from_name, snippet, has_attachments, fingerprint)
  values (NEW.company_id, NEW.project_id, NEW.subject, NEW.from_address, NEW.from_name, NEW.snippet, NEW.has_attachments, v_fingerprint)
  on conflict (project_id, fingerprint) do update set
    subject = coalesce(project_email_content.subject, excluded.subject),
    from_address = coalesce(project_email_content.from_address, excluded.from_address),
    from_name = coalesce(project_email_content.from_name, excluded.from_name),
    snippet = coalesce(project_email_content.snippet, excluded.snippet),
    has_attachments = coalesce(project_email_content.has_attachments, excluded.has_attachments)
  returning id into v_content_id;

  NEW.content_id := v_content_id;
  return NEW;
end;
$$;

-- gmail_thread_id dropped from the trigger's watch list too -- it no
-- longer has any bearing on content resolution, so a write that touches
-- only that column has nothing new to resolve.
create trigger project_emails_set_content_id
  before insert or update of subject, from_address, from_name, snippet, has_attachments
  on project_emails
  for each row
  execute function set_project_email_content_id();
