-- Many-to-many "additional matters" a company_pages row references, e.g. a
-- page listing every matter matching some criteria the AI found via
-- search_matters (see lib/ai/pageBuilderTools.ts). Additive alongside
-- company_pages.project_id (the page's single "primary" matter, used by
-- record_field/record_list) -- a matter_list block (lib/pages/blockTypes.ts)
-- reads from this table instead.
CREATE TABLE IF NOT EXISTS company_page_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES company_pages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, project_id)
);

CREATE INDEX IF NOT EXISTS company_page_projects_page_id_idx ON company_page_projects(page_id);

ALTER TABLE company_page_projects ENABLE ROW LEVEL SECURITY;

-- Same nested-table shape as client_update_groups etc. (supabase/migrations/
-- 20260727100000_client_update_pages.sql) -- scoped via a join back through
-- company_pages to company_memberships, since this table has no company_id
-- column of its own.
DROP POLICY IF EXISTS company_page_projects_company_members ON company_page_projects;
CREATE POLICY company_page_projects_company_members ON company_page_projects
  FOR ALL
  USING (page_id IN (
    SELECT id FROM company_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (page_id IN (
    SELECT id FROM company_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));
