-- User-facing archive requests from the Gmail add-on. Every add-on request
-- lands here as 'pending' — an admin must approve (or reject) it from the
-- admin "Gmail sync" tab before gmail_sync_jobs / gmail-archive-worker
-- ever touch the project. Direct admin-initiated archiving from the admin
-- tab bypasses this table entirely (it enqueues gmail_sync_jobs directly).
CREATE TABLE IF NOT EXISTS gmail_archive_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gmail_archive_requests_company_idx ON gmail_archive_requests(company_id, status, created_at DESC);

ALTER TABLE gmail_archive_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gmail_archive_requests_company ON gmail_archive_requests;
CREATE POLICY gmail_archive_requests_company ON gmail_archive_requests
  FOR ALL USING (company_id = active_company_id()) WITH CHECK (company_id = active_company_id());
