-- Consent-gated read access to a company's business data for the
-- table/dashboard-builder AI (see lib/ai/tableBuilderTools.ts's new
-- query_records/grant_ai_data_access/propose_records tools and
-- app/api/ai/chat/route.ts). Previously the assistant could only see/edit
-- schema (tables, fields, dashboards), never actual record data -- asked
-- "should any matters be archived?" it had no way to look.
--
-- data_access_granted_until on ai_chat_settings (already the per-company AI
-- config table) is the rolling grant window: query_records runs without
-- re-prompting while this is in the future, and expires on its own with no
-- separate revoke step needed.
ALTER TABLE ai_chat_settings ADD COLUMN IF NOT EXISTS data_access_granted_until timestamptz;

-- Structured candidate data for the interactive "select which to archive"
-- list rendered in chat (components/ai/ProposedRecordsList.tsx) -- set on
-- the assistant's ai_messages row for a turn where it called propose_records.
-- Parallel to the existing `citations` column, which this chat path doesn't
-- use (that's the older RAG assistant's own column, still live for the
-- Teams bot -- see lib/ai/retrieval.ts).
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS proposed_records jsonb;

-- ai_data_access_requests: the admin-relay queue for a non-admin staff
-- member's question that needs query_records access nobody has granted yet.
-- Shape copied from lead_email_assignment_requests (supabase/migrations/
-- 20260730140000_lead_email_assignments.sql) -- pending/approved/rejected,
-- requested_by/reviewed_by/reviewed_at. Unlike that table, rows here ARE
-- inserted by a member's own request flow (via the admin-client tool
-- handler, not directly from the browser), so both an insert and an admin
-- update policy exist.
CREATE TABLE IF NOT EXISTS ai_data_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question text NOT NULL,
  data_scope text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_data_access_requests_company_idx ON ai_data_access_requests (company_id, status);

ALTER TABLE ai_data_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_data_access_requests_select ON ai_data_access_requests
  FOR SELECT USING (company_id = active_company_id());

CREATE POLICY ai_data_access_requests_insert ON ai_data_access_requests
  FOR INSERT WITH CHECK (company_id = active_company_id());

CREATE POLICY ai_data_access_requests_admin_update ON ai_data_access_requests
  FOR UPDATE
  USING (company_id = active_company_id() AND is_current_user_admin())
  WITH CHECK (company_id = active_company_id() AND is_current_user_admin());
