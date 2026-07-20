-- Closed-matter Gmail archiving: nominate one or more archive Gmail
-- accounts per company, move a closed project's emails there, then delete
-- (trash) them from every other connected member once delivery is
-- confirmed. See supabase/functions/gmail-archive-worker.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS gmail_archive_emails jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gmail_archive_label text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gmail_auto_archive_on_close boolean NOT NULL DEFAULT false;

ALTER TABLE project_gmail_labels ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Enqueues an 'archive' job the moment a project's status flips to
-- 'Closed', but only for companies that opted into gmail_auto_archive_on_close,
-- and only when there's an active (non-removed, non-archived) shared label
-- to archive. Fires on the UPDATE transition only — projects that were
-- already 'Closed' before this trigger existed are NOT retroactively swept.
CREATE OR REPLACE FUNCTION enqueue_gmail_archive_on_close() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auto boolean;
  v_archive_emails jsonb;
  v_label project_gmail_labels%ROWTYPE;
  v_total_users int;
BEGIN
  IF NEW.status = 'Closed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT gmail_auto_archive_on_close, gmail_archive_emails
      INTO v_auto, v_archive_emails FROM companies WHERE id = NEW.company_id;

    -- Require at least one nominated archive account, else this would enqueue
    -- a job doomed to fail and leave the label stuck excluded from ordinary sync.
    IF v_auto IS TRUE AND jsonb_array_length(coalesce(v_archive_emails, '[]'::jsonb)) > 0 THEN
      SELECT * INTO v_label FROM project_gmail_labels
        WHERE project_id = NEW.id AND company_id = NEW.company_id
          AND removed_at IS NULL AND archived_at IS NULL
        LIMIT 1;
      IF FOUND AND NOT EXISTS (
        SELECT 1 FROM gmail_sync_jobs
        WHERE job_type = 'archive' AND project_id = NEW.id AND company_id = NEW.company_id
          AND status IN ('pending', 'processing')
      ) THEN
        SELECT count(*) INTO v_total_users
          FROM company_memberships cm
          JOIN user_gmail_tokens ugt ON ugt.user_id = cm.user_id
          WHERE cm.company_id = NEW.company_id
            AND ugt.email NOT IN (SELECT jsonb_array_elements_text(v_archive_emails));

        UPDATE project_gmail_labels SET archived_at = now()
          WHERE project_id = NEW.id AND company_id = NEW.company_id;
        INSERT INTO gmail_sync_jobs
          (job_type, company_id, project_id, label_code, gmail_label_name, status, attempts, completed_users, total_users)
        VALUES
          ('archive', NEW.company_id, NEW.id, v_label.label_code, v_label.gmail_label_name, 'pending', 0, '[]'::jsonb, v_total_users);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_status_archive ON projects;
CREATE TRIGGER trg_projects_status_archive
  AFTER UPDATE OF status ON projects
  FOR EACH ROW EXECUTE FUNCTION enqueue_gmail_archive_on_close();

-- Poll for 'archive' jobs every minute, same cadence as the sibling workers.
SELECT cron.schedule(
  'gmail-archive-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/gmail-archive-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb)
  $$
);
