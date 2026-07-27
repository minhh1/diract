-- Phase 2 of Outlook parity for Shared Labels: the async label-sync engine,
-- mirroring the production Gmail pipeline (gmail_sync_jobs / gmail_sync_log
-- / gmail_sync_failures / gmail_user_locks / dispatcher_locks) as closely
-- as Microsoft Graph allows. See supabase/gmail_user_concurrency_lock.sql,
-- supabase/dispatcher_locks.sql, supabase/gmail_sync_failures.sql for the
-- Gmail originals these are modelled on.

-- ── project_outlook_emails: Outlook-shaped twin of project_emails ────────
-- Kept as a separate table rather than overloading project_emails, matching
-- this codebase's existing per-integration convention (Gmail/Teams/OneDrive
-- each get fully separate tables — see the many Gmail-only workers that
-- depend on project_emails' exact shape). `categories` is the last-known
-- category list for this user's copy of the message — needed because Graph
-- delta responses say an item changed, not *what* changed, so outlook-push
-- has to diff against something to notice a manually-applied category.
CREATE TABLE IF NOT EXISTS project_outlook_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  outlook_message_id text NOT NULL,
  outlook_internet_message_id text NOT NULL,
  outlook_conversation_id text,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  from_address text,
  from_name text,
  date text,
  snippet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_outlook_emails_user_msg_idx
  ON project_outlook_emails(user_id, outlook_message_id);
CREATE INDEX IF NOT EXISTS project_outlook_emails_internet_msg_idx
  ON project_outlook_emails(company_id, outlook_internet_message_id);
CREATE INDEX IF NOT EXISTS project_outlook_emails_project_idx
  ON project_outlook_emails(project_id);

ALTER TABLE project_outlook_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_outlook_emails_company_members ON project_outlook_emails;
CREATE POLICY project_outlook_emails_company_members ON project_outlook_emails
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- ── outlook_sync_jobs: mirrors gmail_sync_jobs ────────────────────────────
CREATE TABLE IF NOT EXISTS outlook_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL DEFAULT 'label_sync' CHECK (job_type IN ('label_sync')),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label_code text,
  category_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  error text,
  completed_users jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_users int NOT NULL DEFAULT 0,
  is_realtime boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outlook_sync_jobs_status_idx ON outlook_sync_jobs(job_type, status, is_realtime);
CREATE INDEX IF NOT EXISTS outlook_sync_jobs_company_project_idx ON outlook_sync_jobs(company_id, project_id);

ALTER TABLE outlook_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlook_sync_jobs_company_members ON outlook_sync_jobs;
CREATE POLICY outlook_sync_jobs_company_members ON outlook_sync_jobs
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- ── outlook_sync_log: mirrors gmail_sync_log ──────────────────────────────
CREATE TABLE IF NOT EXISTS outlook_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  triggered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  outlook_message_id text,
  category_name text,
  target_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outlook_sync_log_company_idx ON outlook_sync_log(company_id, created_at DESC);

ALTER TABLE outlook_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlook_sync_log_company_members ON outlook_sync_log;
CREATE POLICY outlook_sync_log_company_members ON outlook_sync_log
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- ── outlook_sync_failures: mirrors gmail_sync_failures ────────────────────
-- Quarantine table populated by outlook-label-sync-processor on first
-- failure. No recovery worker consumes this yet (that's a later phase,
-- same as gmail-sync-recovery-worker) — rows just sit here until then,
-- same as the data would if built in isolation ahead of its consumer.
CREATE TABLE IF NOT EXISTS outlook_sync_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES outlook_sync_jobs(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_retry' CHECK (status IN ('pending_retry', 'resolved', 'persistent_failure')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_attempted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS outlook_sync_failures_job_user_idx ON outlook_sync_failures(job_id, user_id);
CREATE INDEX IF NOT EXISTS outlook_sync_failures_company_status_idx ON outlook_sync_failures(company_id, status, created_at DESC);

ALTER TABLE outlook_sync_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlook_sync_failures_company ON outlook_sync_failures;
CREATE POLICY outlook_sync_failures_company ON outlook_sync_failures
  FOR ALL USING (company_id = active_company_id()) WITH CHECK (company_id = active_company_id());

-- ── outlook_user_locks: mirrors gmail_user_locks ──────────────────────────
-- Caps how many Graph API writes are ever in flight against the SAME
-- target user's mailbox at once. Only one dispatcher (outlook-label-sync-
-- worker) exists so far, unlike Gmail's two (label-sync + email-sync), but
-- kept as a DB-backed lock from the start since a future email-sync worker
-- would need the same cross-function guarantee Gmail's does.
CREATE TABLE IF NOT EXISTS outlook_user_locks (
  user_id uuid PRIMARY KEY,
  locked_until timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION acquire_outlook_user_lock(p_user_id uuid, p_ttl_seconds int DEFAULT 100)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  affected int;
BEGIN
  INSERT INTO outlook_user_locks (user_id, locked_until)
  VALUES (p_user_id, now() + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = excluded.locked_until
    WHERE outlook_user_locks.locked_until <= now();
  GET DIAGNOSTICS affected = row_count;
  RETURN affected > 0;
END;
$$;

CREATE OR REPLACE FUNCTION release_outlook_user_lock(p_user_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE outlook_user_locks SET locked_until = now() WHERE user_id = p_user_id;
$$;

-- ── dispatcher_locks: register the new dispatcher tick ────────────────────
INSERT INTO dispatcher_locks (name, locked_until) VALUES
  ('outlook-label-sync-worker', now() - interval '1 minute')
ON CONFLICT (name) DO NOTHING;
