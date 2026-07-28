-- Ledger of every platform-sent email (auth mail via the Send Email hook,
-- task-assigned, archive-request decisions, ...) -- same auditing role
-- sms_messages.sql plays for outbound SMS. sent_by is null for
-- system-triggered sends (e.g. the task-assigned DB trigger) rather than a
-- human action. company_id is nullable because auth emails can fire before
-- a user has joined/created a company (e.g. the very first signup-
-- confirmation email).
CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  from_address text NOT NULL,
  resend_message_id text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error text,
  sent_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_log_company_id_idx ON email_log(company_id);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_log_company_members ON email_log;
CREATE POLICY email_log_company_members ON email_log
  FOR SELECT USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
