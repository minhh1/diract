-- Client-facing fill link (same shape as public_task_pages). One link may bundle
-- several templates (e.g. a "sale contract pack" = 3 documents filled from one form).
--
-- NOTE: the client-facing side of this feature is read/written ONLY via service-role
-- API routes (there is no anon/authenticated session on the external-client side, so
-- no anon RLS policy is needed for that path). Admin management still goes through the
-- normal authenticated RLS policies below, mirroring the other tables in this repo.

CREATE TABLE IF NOT EXISTS document_fill_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  expires_at date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_fill_pages_project_id_idx ON document_fill_pages(project_id);

ALTER TABLE document_fill_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_fill_pages_company_members ON document_fill_pages;
CREATE POLICY document_fill_pages_company_members ON document_fill_pages
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS document_fill_page_templates (
  page_id uuid NOT NULL REFERENCES document_fill_pages(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  PRIMARY KEY (page_id, template_id)
);

ALTER TABLE document_fill_page_templates ENABLE ROW LEVEL SECURITY;

-- Company-scoped via join through document_fill_pages.company_id.
DROP POLICY IF EXISTS document_fill_page_templates_company_members ON document_fill_page_templates;
CREATE POLICY document_fill_page_templates_company_members ON document_fill_page_templates
  FOR ALL
  USING (page_id IN (
    SELECT id FROM document_fill_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (page_id IN (
    SELECT id FROM document_fill_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));
