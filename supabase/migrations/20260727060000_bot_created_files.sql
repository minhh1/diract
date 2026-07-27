-- Tracks a file the bot created directly in Supabase Storage (lib/ai/botFiles.ts)
-- as a fallback for companies with no OneDrive connection -- create_file
-- previously hard-required OneDrive (lib/ai/actions.ts's createOnedriveFile),
-- which meant the whole feature was unusable without it. Reuses the same
-- private `precedent-documents` bucket already created for precedent PDFs
-- (see supabase/migrations/20260726060000_company_letterheads.sql's header
-- comment), under its own `bot-files/` prefix -- no new bucket to set up.
CREATE TABLE IF NOT EXISTS bot_created_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  storage_path text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_created_files_company_idx ON bot_created_files(company_id);

ALTER TABLE bot_created_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_created_files_company_members ON bot_created_files;
CREATE POLICY bot_created_files_company_members ON bot_created_files
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
