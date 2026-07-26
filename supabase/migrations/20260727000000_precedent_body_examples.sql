-- One row per real past document uploaded as an example of a precedent's
-- body content (see lib/precedents/bodyTemplateDetect.ts) -- kept (not just
-- processed-and-discarded) so an admin can add more examples later and have
-- detection re-run over all of them together, or remove one that was a bad
-- fit. storage_path lives in the same private `precedent-documents` bucket
-- the letterhead and issued PDFs already use, under examples/{companyId}/{precedentId}/.

CREATE TABLE IF NOT EXISTS precedent_body_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  precedent_id uuid NOT NULL REFERENCES precedents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS precedent_body_examples_precedent_id_idx ON precedent_body_examples(precedent_id);

ALTER TABLE precedent_body_examples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS precedent_body_examples_company_members ON precedent_body_examples;
CREATE POLICY precedent_body_examples_company_members ON precedent_body_examples
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
