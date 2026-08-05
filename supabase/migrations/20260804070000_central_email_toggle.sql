-- Central Email: per-company toggle to stop propagating a labeled/foldered
-- email into every other company member's own Gmail/Outlook mailbox (see
-- app/api/gmail/assign/route.ts's member-loop, gmail-push's
-- resetJobsForNewEmail -> gmail-label-sync-* fan-out, and outlook-push's
-- enqueueLabelSyncJob -> outlook-label-sync-* fan-out). When enabled, the
-- acting/receiving user's own mailbox is still labeled/foldered as today,
-- and matching (thread/subject) is unchanged -- only the fan-out to
-- teammates' mailboxes is skipped, and the full email body is captured
-- centrally instead so every project member can read it through the app
-- (previously only viewable by live-fetching the *viewing* user's own
-- Gmail token, which no longer has this message once fan-out stops).
--
-- Plain boolean on companies, following outlook_auto_archive_on_close
-- (20260726080000_outlook_shared_labels_foundation.sql) and
-- restrict_new_tables_dashboards_by_default
-- (20260801400000_resource_permissions.sql) -- not jsonb, since this is a
-- single on/off with no sub-settings yet.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS central_email_enabled boolean NOT NULL DEFAULT false;

-- Populated only when central_email_enabled was true at ingestion time;
-- null for every pre-existing row and for companies that never turn this
-- on -- those keep viewing bodies via the existing live Gmail-API fetch in
-- app/api/gmail/messages/[id]/route.ts, unchanged.
ALTER TABLE project_email_content
  ADD COLUMN IF NOT EXISTS body_html text;
