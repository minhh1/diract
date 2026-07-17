-- Word document templates (mail-merge {{tag}} -> client-fill link -> regenerated .docx)
--
-- STORAGE BUCKET (manual setup required):
--   This feature is the FIRST use of Supabase Storage in this codebase. Before it
--   works you must create a PRIVATE Storage bucket named `document-templates` in the
--   Supabase dashboard (Storage -> New bucket -> name `document-templates`, "Public
--   bucket" left UNCHECKED). It must stay private: source and generated .docx files
--   are only ever served through short-lived signed URLs or server-side proxying via
--   the service-role key, never a public bucket URL. All reads/writes happen in API
--   routes through the service-role client (`admin.storage.from('document-templates')`),
--   never directly from the browser.
--
-- Source .docx files live at:      {companyId}/{projectId}/{uuid}.docx
-- Generated output files live at:  generated/{pageId}/{submissionId}/...

CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  storage_path text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_templates_project_id_idx ON document_templates(project_id);

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_templates_company_members ON document_templates;
CREATE POLICY document_templates_company_members ON document_templates
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
