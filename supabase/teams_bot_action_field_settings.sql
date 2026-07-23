-- Per-company configuration of which create_task/create_project fields the
-- Teams bot (see app/api/teams/bot/[companyId]/route.ts, lib/ai/actionFields.ts)
-- must ask the user for before creating, and what value to silently fall
-- back to when a field is left optional and the user didn't mention it.
--
-- field_key is either a built-in field name ('due_date', 'assignee_name',
-- 'notes' for create_task; 'status', 'description' for create_project) or a
-- company_custom_fields.field_key for that action's table ('tasks'/
-- 'projects'). 'name' and, for create_task, 'project_name' are always
-- required and are never rows in this table -- lib/ai/actionFields.ts
-- rejects attempts to configure them.
--
-- Absence of a row for a given field is meaningful, not "unset": see
-- lib/ai/actionFields.ts's loadFieldConfig() fallback -- create_task's
-- built-in optional fields default to required when unconfigured (the
-- user wants the bot to always ask everything for a task), while
-- create_project's optional/custom fields default to not required
-- (matching today's behavior) unless a company explicitly turns one on.

CREATE TABLE IF NOT EXISTS teams_bot_action_field_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('create_task', 'create_project')),
  field_key text NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  custom_field_id uuid REFERENCES company_custom_fields(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT false,
  default_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, action_type, field_key)
);

ALTER TABLE teams_bot_action_field_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_bot_action_field_settings_company_members ON teams_bot_action_field_settings;
CREATE POLICY teams_bot_action_field_settings_company_members ON teams_bot_action_field_settings
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Multi-turn field-gathering support for teams_bot_pending_actions (see
-- supabase/teams_bot_pending_actions.sql). Before this, a pending action
-- was always "fully resolved, awaiting yes/no" -- now it can also be
-- "still collecting answers", tracked by status/collected/next_fields.
-- params/summary are only populated once status flips to 'confirming'.
ALTER TABLE teams_bot_pending_actions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirming' CHECK (status IN ('collecting', 'confirming')),
  ADD COLUMN IF NOT EXISTS collected jsonb,
  ADD COLUMN IF NOT EXISTS next_fields jsonb;

ALTER TABLE teams_bot_pending_actions ALTER COLUMN params DROP NOT NULL;
ALTER TABLE teams_bot_pending_actions ALTER COLUMN summary DROP NOT NULL;
