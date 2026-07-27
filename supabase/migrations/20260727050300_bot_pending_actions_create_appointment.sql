-- Widens both bots' pending-action type constraint to allow
-- 'create_appointment' (see lib/ai/appointmentAction.ts,
-- lib/ai/calendarBooking.ts, lib/botEngine/handleMessage.ts) -- same shape
-- of change 20260727010000_bot_pending_actions_issue_precedent.sql made to
-- add 'issue_precedent'.

ALTER TABLE teams_bot_pending_actions DROP CONSTRAINT IF EXISTS teams_bot_pending_actions_action_type_check;
ALTER TABLE teams_bot_pending_actions ADD CONSTRAINT teams_bot_pending_actions_action_type_check
  CHECK (action_type = ANY (ARRAY['create_task', 'update_task', 'create_project', 'update_project', 'create_file', 'update_file', 'issue_precedent', 'create_appointment']));

ALTER TABLE whatsapp_bot_pending_actions DROP CONSTRAINT IF EXISTS whatsapp_bot_pending_actions_action_type_check;
ALTER TABLE whatsapp_bot_pending_actions ADD CONSTRAINT whatsapp_bot_pending_actions_action_type_check
  CHECK (action_type = ANY (ARRAY['create_task', 'update_task', 'create_project', 'update_project', 'create_file', 'update_file', 'issue_precedent', 'create_appointment']));
