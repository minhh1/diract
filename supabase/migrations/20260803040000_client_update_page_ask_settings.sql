-- Staff-controlled, page-wide options (same shape as freeze_first_column /
-- log_cell_changes) for the "ask anything about this matter" AI feature --
-- ai_ask_enabled gates whether the client viewing the page themselves sees
-- the ask-a-question input at all (staff always have it, same as every
-- other AI tool on the board); ai_ask_scope controls how much context the
-- AI is given when answering, independent of who's asking.
ALTER TABLE client_update_pages ADD COLUMN IF NOT EXISTS ai_ask_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE client_update_pages ADD COLUMN IF NOT EXISTS ai_ask_scope text NOT NULL DEFAULT 'emails';
ALTER TABLE client_update_pages DROP CONSTRAINT IF EXISTS client_update_pages_ai_ask_scope_chk;
ALTER TABLE client_update_pages ADD CONSTRAINT client_update_pages_ai_ask_scope_chk CHECK (ai_ask_scope IN ('emails', 'emails_notes', 'all'));
