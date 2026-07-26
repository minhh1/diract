-- Audit log of every document issued from a precedent (see
-- app/api/precedents/[id]/issue/route.ts) -- also drives the "recently
-- issued" history list under each precedent in the Precedent tab. storage_path
-- points at the generated PDF in the private `precedent-documents` bucket
-- (see company_letterheads.sql); downloads go through a fresh signed URL
-- fetched on demand rather than one stored here, since signed URLs expire.

CREATE TABLE IF NOT EXISTS precedent_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  precedent_id uuid NOT NULL REFERENCES precedents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  subject_line text,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS precedent_issuances_project_id_idx ON precedent_issuances(project_id);
CREATE INDEX IF NOT EXISTS precedent_issuances_precedent_id_idx ON precedent_issuances(precedent_id);

ALTER TABLE precedent_issuances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS precedent_issuances_company_members ON precedent_issuances;
CREATE POLICY precedent_issuances_company_members ON precedent_issuances
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
