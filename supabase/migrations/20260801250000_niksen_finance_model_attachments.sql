SET request.jwt.claim.role = 'service_role';

-- Project-wide Finance Model attachments, optionally scoped to a specific
-- budget line or task -- no reusable generic attachment system exists
-- anywhere in this codebase today (every prior upload feature --
-- document_templates, pdf_documents, company_letterheads -- is
-- purpose-built with its own dedicated FK columns), so this is new
-- infrastructure. Follows the SAME polymorphic-pointer convention already
-- established by archive_requests (entity_table/entity_id, no FK,
-- deliberately generic) rather than inventing a new pattern:
-- attachable_table/attachable_id is NULL for a general project-level
-- attachment, or ('budget_line', <id>) / ('task', <id>) to scope it.
CREATE TABLE IF NOT EXISTS finance_model_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  attachable_table text CHECK (attachable_table IS NULL OR attachable_table IN ('budget_line', 'task')),
  attachable_id uuid,
  name text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS finance_model_attachments_project_idx ON finance_model_attachments (project_id);
CREATE INDEX IF NOT EXISTS finance_model_attachments_attachable_idx ON finance_model_attachments (attachable_table, attachable_id);

ALTER TABLE finance_model_attachments ENABLE ROW LEVEL SECURITY;

-- SELECT scoped to the user's currently active company -- same
-- cross-tenant-safe pattern as teams_select
-- (20260801190000_teams_select_scope_to_active_company.sql).
DROP POLICY IF EXISTS finance_model_attachments_select ON finance_model_attachments;
CREATE POLICY finance_model_attachments_select ON finance_model_attachments
  FOR SELECT USING (company_id = active_company_id());

DROP POLICY IF EXISTS finance_model_attachments_write ON finance_model_attachments;
CREATE POLICY finance_model_attachments_write ON finance_model_attachments
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Private bucket -- all reads/writes happen server-side through the
-- service-role client (app/api/finance-model/attachments/*), same as
-- every other private bucket in this codebase (document-templates,
-- pdf-documents). No storage.objects RLS policy needed since uploads/
-- downloads never go through anything but the service-role client;
-- scoping is enforced by the API route (authorizeCompanyMember +
-- company_id/project_id checks) and the table's own RLS above.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('finance-model-attachments', 'finance-model-attachments', false, 26214400, NULL)
ON CONFLICT (id) DO NOTHING;
