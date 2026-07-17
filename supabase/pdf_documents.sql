-- Standalone PDF editor: upload a PDF, annotate/edit it in the browser, save it back.
--
-- STORAGE BUCKET (manual setup required):
--   Before this feature works you must create a PRIVATE Storage bucket named
--   `pdf-documents` in the Supabase dashboard (Storage -> New bucket -> name
--   `pdf-documents`, "Public bucket" left UNCHECKED). It must stay private: PDFs
--   are only ever served through short-lived signed URLs or server-side access
--   via the service-role key, never a public bucket URL or directly from the
--   browser. All reads/writes happen in API routes through the service-role
--   client (`admin.storage.from('pdf-documents')`).
--
-- Files live at: {companyId}/{documentId}.pdf — a save overwrites (upsert) the
-- same object, so there's a single current version per document (no history).

CREATE TABLE IF NOT EXISTS pdf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  storage_path text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pdf_documents_company_id_idx ON pdf_documents(company_id);

ALTER TABLE pdf_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdf_documents_company_members ON pdf_documents;
CREATE POLICY pdf_documents_company_members ON pdf_documents
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
