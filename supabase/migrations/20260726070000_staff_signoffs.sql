-- One signoff block per staff member, reused across every precedent they're
-- selected as a signer for (see precedent_settings.signers, which now holds
-- an array of user_ids rather than free-text {name, position} -- see
-- 20260726070100_precedent_settings_signers_reset.sql) -- and rendered into
-- the letterhead's {{signoff}} tag with the name in bold (see
-- lib/precedents/signoffXml.ts). name defaults to the person's own account
-- name but is editable/overridable here since a formal signoff often differs
-- (e.g. "Jane A. Smith" vs a casual profile name).
CREATE TABLE IF NOT EXISTS staff_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  position text,
  company_name text,
  contact_number text,
  contact_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

ALTER TABLE staff_signoffs ENABLE ROW LEVEL SECURITY;

-- Every company member can read every signoff (needed to pick signers for a
-- precedent) and create/update their OWN row. Admin-or-own-row updates and
-- admin-only deletes are enforced in app/api/precedents/staff-signoffs
-- (service-role client), not by RLS -- same division of labour as
-- document_templates' company-membership-only policy.
DROP POLICY IF EXISTS staff_signoffs_company_members ON staff_signoffs;
CREATE POLICY staff_signoffs_company_members ON staff_signoffs
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
