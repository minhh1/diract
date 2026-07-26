-- Widens both bots' pending-action type constraint to allow 'issue_precedent'
-- (see lib/ai/precedentAction.ts, lib/botEngine/handleMessage.ts) -- same
-- shape of change supabase/company_onedrive_credentials.sql made to add
-- 'create_file'/'update_file'.

ALTER TABLE teams_bot_pending_actions DROP CONSTRAINT IF EXISTS teams_bot_pending_actions_action_type_check;
ALTER TABLE teams_bot_pending_actions ADD CONSTRAINT teams_bot_pending_actions_action_type_check
  CHECK (action_type = ANY (ARRAY['create_task', 'update_task', 'create_project', 'update_project', 'create_file', 'update_file', 'issue_precedent']));

ALTER TABLE whatsapp_bot_pending_actions DROP CONSTRAINT IF EXISTS whatsapp_bot_pending_actions_action_type_check;
ALTER TABLE whatsapp_bot_pending_actions ADD CONSTRAINT whatsapp_bot_pending_actions_action_type_check
  CHECK (action_type = ANY (ARRAY['create_task', 'update_task', 'create_project', 'update_project', 'create_file', 'update_file', 'issue_precedent']));
