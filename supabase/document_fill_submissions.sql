-- A client's submitted form values + the .docx files generated from them.
-- These have no direct company_id column: RLS joins through document_fill_pages.

CREATE TABLE IF NOT EXISTS document_fill_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES document_fill_pages(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  values jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS document_fill_submissions_page_id_idx ON document_fill_submissions(page_id);

ALTER TABLE document_fill_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_fill_submissions_company_members ON document_fill_submissions;
CREATE POLICY document_fill_submissions_company_members ON document_fill_submissions
  FOR ALL
  USING (page_id IN (
    SELECT id FROM document_fill_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (page_id IN (
    SELECT id FROM document_fill_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));

CREATE TABLE IF NOT EXISTS document_fill_generated_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES document_fill_submissions(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_fill_generated_files_submission_id_idx ON document_fill_generated_files(submission_id);

ALTER TABLE document_fill_generated_files ENABLE ROW LEVEL SECURITY;

-- Company-scoped via join through document_fill_submissions -> document_fill_pages.
DROP POLICY IF EXISTS document_fill_generated_files_company_members ON document_fill_generated_files;
CREATE POLICY document_fill_generated_files_company_members ON document_fill_generated_files
  FOR ALL
  USING (submission_id IN (
    SELECT s.id FROM document_fill_submissions s
    JOIN document_fill_pages p ON p.id = s.page_id
    WHERE p.company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (submission_id IN (
    SELECT s.id FROM document_fill_submissions s
    JOIN document_fill_pages p ON p.id = s.page_id
    WHERE p.company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));
