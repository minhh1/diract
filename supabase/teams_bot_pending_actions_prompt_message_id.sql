-- Lets a "like" reaction's target be verified against the actual
-- confirmation message we sent, rather than assumed -- see
-- app/api/teams/bot/[companyId]/route.ts and
-- app/api/whatsapp/webhook/[companyId]/route.ts. Only ever set when
-- status = 'confirming' (a "collecting" batched question isn't something
-- a reaction can answer).
ALTER TABLE teams_bot_pending_actions ADD COLUMN IF NOT EXISTS prompt_message_id text;
ALTER TABLE whatsapp_bot_pending_actions ADD COLUMN IF NOT EXISTS prompt_message_id text;
