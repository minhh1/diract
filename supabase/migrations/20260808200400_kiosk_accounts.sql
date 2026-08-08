-- Admin-facing record of each kiosk login (label shown in the admin list,
-- e.g. "Front desk iPad"), separate from auth.users/profiles/
-- company_memberships -- those three carry the actual login and RLS
-- identity; this table is purely bookkeeping for the admin UI.
SET request.jwt.claim.role = 'service_role';

CREATE TABLE IF NOT EXISTS kiosk_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS kiosk_accounts_company_idx ON kiosk_accounts (company_id);

ALTER TABLE kiosk_accounts ENABLE ROW LEVEL SECURITY;

-- Admin-only in both directions -- the API route uses the service-role
-- client for every write, so this policy only needs to cover the list
-- view's SELECT (a non-admin company member has no reason to see this).
-- Admin status is checked via company_memberships (per-company role), the
-- same source authorizeCompanyMember() in lib/documentTemplateAuth.ts uses
-- server-side -- not profiles.role, which only holds a default/global role.
DROP POLICY IF EXISTS kiosk_accounts_admin_select ON kiosk_accounts;
CREATE POLICY kiosk_accounts_admin_select ON kiosk_accounts FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM company_memberships
      WHERE user_id = auth.uid() AND role = 'company_admin'
    )
  );
