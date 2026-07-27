-- Marks the one hidden, auto-created "General Document" precedent per
-- company used when the bot's issue_precedent action can't match a real
-- precedent name and the user opts to have AI write it from scratch (see
-- lib/ai/precedentAction.ts's freeform-AI fallback). Never returned by
-- GET /api/precedents or matched by resolvePrecedentByName's normal search --
-- the bot reaches it directly by its own well-known name instead.

ALTER TABLE precedents ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
