-- Leads shared-label inbox + auto-assignment approval queue.
--
-- companies.gmail_leads_label already exists (see
-- supabase/companies_gmail_leads_label.sql) and is editable in the Gmail
-- Label Settings modal, but no worker has ever consumed it. This migration
-- adds the tables that let incoming lead emails (filed under that shared
-- label) get matched to a specific Lead record -- or proposed as a new one
-- -- with every proposal sitting in a pending queue until a company_admin
-- approves it. Mirrors two existing patterns rather than inventing new ones:
--   - lead_gmail_labels / lead_emails mirror project_gmail_labels /
--     project_emails, just keyed to a company_table_records row (a Lead)
--     instead of a projects row -- same "parallel table per target type"
--     precedent already used for project_outlook_labels vs project_gmail_labels.
--   - lead_email_assignment_requests mirrors archive_requests' pending /
--     approved / rejected shape and admin-only UPDATE policy, except rows
--     are inserted by the server (the leads-sync route) using the service
--     role, not by a member's own session -- so there's no member-insert
--     policy, only SELECT and admin-gated UPDATE.

-- ── lead_gmail_labels: one shared Gmail label per Lead, pushed to every
-- team member's mailbox on approval (see lib/services/leadGmailAssignment.ts) ──
CREATE TABLE IF NOT EXISTS lead_gmail_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES company_table_records(id) ON DELETE CASCADE,
  gmail_label_id text NOT NULL,
  gmail_label_name text NOT NULL,
  label_code text NOT NULL,
  label_sub text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  removed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, lead_id)
);

ALTER TABLE lead_gmail_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_gmail_labels_company_members ON lead_gmail_labels;
CREATE POLICY lead_gmail_labels_company_members ON lead_gmail_labels
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- ── lead_emails: per-user "which message is linked to which Lead" record,
-- parallel to project_emails ──
CREATE TABLE IF NOT EXISTS lead_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES company_table_records(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  subject text,
  from_address text,
  from_name text,
  date text,
  snippet text,
  gmail_label_applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_message_id)
);
CREATE INDEX IF NOT EXISTS lead_emails_thread_idx ON lead_emails (company_id, gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;

ALTER TABLE lead_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_emails_company_members ON lead_emails;
CREATE POLICY lead_emails_company_members ON lead_emails
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- ── lead_email_keyword_rules: admin-configured "subject contains X ->
-- propose this Lead" rules, evaluated by the leads-sync matcher when
-- sender-email and thread-id matching both come up empty ──
CREATE TABLE IF NOT EXISTS lead_email_keyword_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  match_lead_id uuid NOT NULL REFERENCES company_table_records(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_email_keyword_rules_company_idx ON lead_email_keyword_rules (company_id) WHERE is_active;

ALTER TABLE lead_email_keyword_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_email_keyword_rules_select ON lead_email_keyword_rules
  FOR SELECT USING (company_id = active_company_id());

CREATE POLICY lead_email_keyword_rules_admin_write ON lead_email_keyword_rules
  FOR ALL
  USING (company_id = active_company_id() AND is_current_user_admin())
  WITH CHECK (company_id = active_company_id() AND is_current_user_admin());

-- ── lead_email_assignment_requests: the approval queue. Rows are only ever
-- inserted by app/api/gmail/leads-sync (service role), never by a member's
-- own session -- so there's no member-insert policy, just SELECT for
-- visibility and an admin-gated UPDATE for approve/reject, same shape as
-- archive_requests_update. ──
CREATE TABLE IF NOT EXISTS lead_email_assignment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('link_existing', 'create_new')),
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  subject text,
  from_address text,
  from_name text,
  snippet text,
  date text,
  matched_lead_id uuid REFERENCES company_table_records(id) ON DELETE CASCADE,
  match_reason text CHECK (match_reason IN ('thread_id', 'sender_email', 'keyword_rule')),
  proposed_fields jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Prevents the same message from getting a second pending proposal on a
-- later sync run, while still allowing a fresh proposal after the first one
-- is approved/rejected (e.g. a re-sync after a reject with new context).
CREATE UNIQUE INDEX IF NOT EXISTS lead_email_assignment_requests_pending_msg_idx
  ON lead_email_assignment_requests (company_id, gmail_message_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS lead_email_assignment_requests_company_idx ON lead_email_assignment_requests (company_id, status);

ALTER TABLE lead_email_assignment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_email_assignment_requests_select ON lead_email_assignment_requests
  FOR SELECT USING (company_id = active_company_id());

CREATE POLICY lead_email_assignment_requests_admin_update ON lead_email_assignment_requests
  FOR UPDATE
  USING (company_id = active_company_id() AND is_current_user_admin())
  WITH CHECK (company_id = active_company_id() AND is_current_user_admin());

-- ── gmail_sync_log: additive lead_id column so lead-related label actions
-- show up in the same activity feed as project ones (SyncLog.tsx already
-- renders `action`/`gmail_label_name` generically, no change needed there) ──
ALTER TABLE gmail_sync_log ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES company_table_records(id) ON DELETE SET NULL;
