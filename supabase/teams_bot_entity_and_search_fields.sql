-- Phase H/I additions to the Teams bot's create_task/create_project flow
-- (see lib/ai/actionAdvance.ts, lib/ai/actions.ts,
-- app/api/teams/bot/[companyId]/route.ts).

-- Real entity-record resolution for "entity"-type custom fields (e.g.
-- "Client Name" pointing at the entities table). Mirrors the sibling
-- company_table_values.value_record_id convention for the unrelated
-- custom-table-builder system -- deliberately no FK, since which table this
-- points at depends on the field's own linked_table, and it can vary. Every
-- entity-type custom field value ALSO keeps writing value_text (the
-- resolved entity's name) so existing renderers (none of which read
-- value_record_id -- see NewProjectModal.tsx, GenericMasterTable.tsx,
-- MasterTable.tsx) keep displaying the right name unchanged.
ALTER TABLE company_custom_field_values
  ADD COLUMN IF NOT EXISTS value_record_id uuid;

-- Which of a company's projects-table custom fields should also be
-- searched when resolving a project by name/reference (see
-- lib/ai/actions.ts's resolveProjectByName) -- e.g. Huynh Lawyers wants
-- "Matter Number" searchable, since staff refer to a matter by its number
-- rather than the project's literal name.
CREATE TABLE IF NOT EXISTS teams_bot_project_search_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  custom_field_id uuid NOT NULL REFERENCES company_custom_fields(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, custom_field_id)
);

ALTER TABLE teams_bot_project_search_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_bot_project_search_fields_company_members ON teams_bot_project_search_fields;
CREATE POLICY teams_bot_project_search_fields_company_members ON teams_bot_project_search_fields
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Whether the bot's create_task flow should reject a task name that
-- already exists in the same project. Off by default -- most companies
-- expect the same task name to recur across projects (e.g. "Kickoff
-- call") and don't want that blocked; Phase G had made this always-on,
-- which live testing showed was the wrong default.
ALTER TABLE ai_chat_settings
  ADD COLUMN IF NOT EXISTS require_unique_task_names boolean NOT NULL DEFAULT false;
