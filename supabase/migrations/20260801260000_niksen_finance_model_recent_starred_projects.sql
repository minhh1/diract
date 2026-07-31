SET request.jwt.claim.role = 'service_role';

-- Recent/Starred projects for the Finance Model dashboard search widget
-- (components/dashboard/FinanceModelSearchWidget.tsx) -- currently
-- session-local only (picking a project doesn't persist), so every visit
-- starts from a blank search box. Both tables are personal (scoped to
-- user_id, not shared across the company) -- "starred" and "recently
-- viewed" are individual preferences, not team state. company_id is
-- still stored and filtered on so switching active companies doesn't
-- leak another company's project list into these lists.
CREATE TABLE IF NOT EXISTS finance_model_project_stars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS finance_model_project_recents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS finance_model_project_recents_user_idx ON finance_model_project_recents (user_id, last_viewed_at DESC);

ALTER TABLE finance_model_project_stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_model_project_recents ENABLE ROW LEVEL SECURITY;

-- Purely personal data -- a user can only ever see/manage their own rows,
-- regardless of company membership (no "active company" scoping needed
-- here since user_id = auth.uid() is already maximally restrictive).
DROP POLICY IF EXISTS finance_model_project_stars_own ON finance_model_project_stars;
CREATE POLICY finance_model_project_stars_own ON finance_model_project_stars
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS finance_model_project_recents_own ON finance_model_project_recents;
CREATE POLICY finance_model_project_recents_own ON finance_model_project_recents
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
