-- A company's letterhead: a single uploaded .docx (logo/header/footer already
-- laid out by the firm) with two mail-merge tags auto-inserted into the body
-- by lib/precedents/letterheadTag.ts on upload -- one for the recipient's
-- inside address, one for the rest of the letter (date/subject/salutation/
-- body/closing/signers, composed by the issue pipeline). One row per company
-- -- there is no per-matter letterhead, only per-matter formatting overrides
-- (see precedent_settings.sql).
--
-- STORAGE BUCKET (manual setup required, same as document_templates.sql):
--   Create a PRIVATE Storage bucket named `precedent-documents` in the
--   Supabase dashboard (Storage -> New bucket -> name `precedent-documents`,
--   "Public bucket" left UNCHECKED). All reads/writes happen server-side
--   through the service-role client, never a public bucket URL.
--
-- Letterhead source lives at:  letterheads/{companyId}/{uuid}.docx
-- Generated output lives at:   generated/{companyId}/{precedentId}/{issuanceId}.pdf

CREATE TABLE IF NOT EXISTS company_letterheads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text,
  address_tag_key text NOT NULL DEFAULT 'address',
  content_tag_key text NOT NULL DEFAULT 'content',
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_letterheads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_letterheads_company_members ON company_letterheads;
CREATE POLICY company_letterheads_company_members ON company_letterheads
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
