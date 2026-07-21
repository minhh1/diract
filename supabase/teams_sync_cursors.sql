-- Per-resource Graph API delta-query cursors, so teams-sync-worker only
-- fetches new messages each pass instead of re-walking every channel/chat
-- from scratch (mirrors what Gmail history IDs would do, if this repo
-- tracked those explicitly).

CREATE TABLE IF NOT EXISTS teams_sync_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('channel', 'chat')),
  resource_id text NOT NULL,
  delta_link text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, resource_type, resource_id)
);

ALTER TABLE teams_sync_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_sync_cursors_company_members ON teams_sync_cursors;
CREATE POLICY teams_sync_cursors_company_members ON teams_sync_cursors
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
