-- Persists the serviceUrl seen at link time so this person can be messaged
-- proactively later (e.g. asking a configured signer to confirm their
-- signature -- see lib/ai/precedentAction.ts, lib/botEngine/handleMessage.ts)
-- rather than only ever being reachable by replying to an existing
-- conversation. teams_bot_link_requests already captured this at the moment
-- of linking; it just never carried forward onto the linked-account row
-- itself until now (see app/api/teams/bot/link/route.ts).

ALTER TABLE teams_bot_linked_accounts ADD COLUMN IF NOT EXISTS teams_service_url text;
