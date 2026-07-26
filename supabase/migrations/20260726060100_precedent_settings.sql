-- Formatting choices for issued precedent documents (see precedents.sql),
-- answered once instead of re-asked on every "Issue" click. project_id NULL
-- is the company-wide default row; a project_id-scoped row overrides it for
-- that one matter (see app/api/precedents/settings/route.ts, which resolves
-- matter row ?? company row ?? hard-coded fallback). The partial unique index
-- enforces at most one default row per company, since plain UNIQUE(company_id,
-- project_id) would let NULL project_id repeat (Postgres treats each NULL as
-- distinct).

CREATE TABLE IF NOT EXISTS precedent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  subject_line_style text NOT NULL DEFAULT 'sentence_case'
    CHECK (subject_line_style IN ('all_caps', 'sentence_case', 'with_re')),
  date_format text NOT NULL DEFAULT 'D MMMM YYYY',
  salutation_style text NOT NULL DEFAULT 'generic'
    CHECK (salutation_style IN ('generic', 'client_first_name', 'client_full_name')),
  -- Up to 4 { name, position } objects, enforced in the API, not here.
  signers jsonb NOT NULL DEFAULT '[]'::jsonb,
  include_firm_reference boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS precedent_settings_company_default_idx
  ON precedent_settings(company_id) WHERE project_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS precedent_settings_company_project_idx
  ON precedent_settings(company_id, project_id) WHERE project_id IS NOT NULL;

ALTER TABLE precedent_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS precedent_settings_company_members ON precedent_settings;
CREATE POLICY precedent_settings_company_members ON precedent_settings
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
