-- The firm's library of issuable document types, shown in the "Precedent"
-- record tab (record_tabs.tab_type = 'precedents', see
-- record_tabs_precedents_type.sql) -- e.g. "Letter of Engagement", "Letter of
-- Demand". Each one carries its own ai_instructions steering the AI draft
-- (see lib/ai/precedentDraft.ts) beyond the staff member's own prompt.
-- record_table scopes which record type's tab shows it -- 'projects' (Matters)
-- is the only value used today, kept as a column rather than hardcoded so a
-- future record type can reuse the same library mechanism.

CREATE TABLE IF NOT EXISTS precedents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_table text NOT NULL DEFAULT 'projects',
  name text NOT NULL,
  description text,
  ai_instructions text,
  display_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS precedents_company_record_table_idx
  ON precedents(company_id, record_table) WHERE deleted_at IS NULL;

ALTER TABLE precedents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS precedents_company_members ON precedents;
CREATE POLICY precedents_company_members ON precedents
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
