-- Marketing/campaign email -- separate from every existing transactional
-- notification email (task assigned, archive request, etc, all sent via
-- create_notification/notify-dispatch): a campaign targets a table + email
-- field an admin picks (same table_id/table_name duality as
-- calendar_date_sources, for the same reason -- system tables vs. custom
-- tables), not a single fixed recipient, and is subject to
-- email_unsubscribes (spam-law suppression), which transactional email is
-- deliberately exempt from -- the two categories are legally different and
-- this keeps them structurally separate rather than threading an
-- "is this a campaign" flag through the existing notification pipeline.
SET request.jwt.claim.role = 'service_role';

CREATE TABLE IF NOT EXISTS email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  table_id uuid REFERENCES company_tables(id) ON DELETE CASCADE,
  table_name text,
  email_field_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  recipient_count integer,
  sent_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT email_campaigns_one_table_ref CHECK (
    (table_id IS NOT NULL AND table_name IS NULL) OR (table_id IS NULL AND table_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS email_campaigns_company_idx ON email_campaigns (company_id);

ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_campaigns_admin_all ON email_campaigns;
CREATE POLICY email_campaigns_admin_all ON email_campaigns FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin'))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin'));

-- A real suppression list, checked only for campaign sends (see
-- app/api/unsubscribe/route.ts) -- transactional email doesn't consult
-- this. No RLS policies: writes only ever happen through the unsubscribe
-- API route (service-role, verifies an HMAC signature -- see
-- lib/email/unsubscribeToken.ts -- rather than requiring a login), and
-- reads only ever happen server-side when building a campaign's recipient
-- list. Default-deny for every client role is correct here; nothing
-- legitimate needs direct table access.
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  unsubscribed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;
