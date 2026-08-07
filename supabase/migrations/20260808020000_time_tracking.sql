-- Phase 1 of automatic time tracking: a browser extension (Manifest V3)
-- passively tracks a timekeeper's active tab, syncs raw segments here, and
-- they're folded into the EXISTING auto-generate/submit drafting pipeline
-- (app/api/time-entries/auto-generate, lib/ai/autoTimeEntryDraft.ts,
-- app/api/time-entries/submit) as a third input alongside completed tasks
-- and matter-linked emails -- never a separate review flow. This is how the
-- same underlying work never gets billed twice from two different signals
-- (a completed task AND the browser activity that did it): the drafting
-- LLM already merges related items on the same matter/day into one entry,
-- and this migration just gives it a third tagged-ref type to merge.
--
-- time_tracking_settings mirrors ai_chat_settings' shape/precedent -- a
-- company-level admin opt-in gate, off by default. Nothing privacy-
-- sensitive in this app defaults to on.
CREATE TABLE IF NOT EXISTS time_tracking_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE time_tracking_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_tracking_settings_company_members ON time_tracking_settings;
CREATE POLICY time_tracking_settings_company_members ON time_tracking_settings
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- time_tracking_segments: raw tracked activity, domain + title only (never
-- full URLs with query strings, never page content) -- see
-- app/api/time-tracking/sync/route.ts, which is the only writer (admin
-- client) and also the one that resolves matched_project_id via
-- lib/ai/actions.ts's resolveProjectByName. A segment with no confident
-- match stays unmatched and is excluded from drafting in v1.
CREATE TABLE IF NOT EXISTS time_tracking_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  domain text NOT NULL,
  title text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  matched_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_tracking_segments_user_date_idx ON time_tracking_segments (user_id, started_at);
CREATE INDEX IF NOT EXISTS time_tracking_segments_company_idx ON time_tracking_segments (company_id);

ALTER TABLE time_tracking_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_tracking_segments_owner ON time_tracking_segments;
CREATE POLICY time_tracking_segments_owner ON time_tracking_segments
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS time_tracking_segments_admin_select ON time_tracking_segments;
CREATE POLICY time_tracking_segments_admin_select ON time_tracking_segments
  FOR SELECT
  USING (company_id = active_company_id() AND is_current_user_admin());

-- time_entry_ai_sources (supabase/migrations/20260803080000_time_entry_ai_sources.sql)
-- already generically claims a source via {source_type, source_id} through
-- submit_auto_time_entry's p_sources jsonb array (jsonb_to_recordset, no
-- schema-level knowledge of which source types exist) -- only its CHECK
-- constraint needs to widen. No RPC change needed at all.
ALTER TABLE time_entry_ai_sources DROP CONSTRAINT IF EXISTS time_entry_ai_sources_source_type_check;
ALTER TABLE time_entry_ai_sources ADD CONSTRAINT time_entry_ai_sources_source_type_check
  CHECK (source_type IN ('task', 'email', 'time_tracking_segment'));
