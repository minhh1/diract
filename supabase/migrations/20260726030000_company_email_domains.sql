-- Per-tenant custom sending domain for branded emails (task-assigned,
-- archive-request decisions, and -- via the Supabase Auth "Send Email" hook,
-- see supabase/functions/auth-send-email -- login/signup/password-reset
-- mail too). One row per company, verified through Resend's Domains API
-- (POST /domains returns dns_records; company admin adds those to their own
-- DNS, then re-checks via /domains/{id}/verify). Companies without a
-- verified row here fall back to the platform default sender
-- (EMAIL_FROM_DEFAULT, see .env.example) -- see lib/email/sendEmail.ts.
--
-- RLS only gates company membership, not admin -- same as
-- company_teams_credentials.sql. Admin-only writes are enforced in
-- app/api/company/email-domain (the only place resend_domain_id is ever
-- created/deleted, since that requires the platform's RESEND_API_KEY).

CREATE TABLE IF NOT EXISTS company_email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  domain text NOT NULL,
  resend_domain_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  dns_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  from_name text NOT NULL DEFAULT 'Notifications',
  from_local_part text NOT NULL DEFAULT 'notifications',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_email_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_email_domains_company_members ON company_email_domains;
CREATE POLICY company_email_domains_company_members ON company_email_domains
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
