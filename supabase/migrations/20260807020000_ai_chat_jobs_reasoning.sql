-- The model's own chain-of-thought for a turn (see lib/ai/modelCall.ts's
-- callTogetherModelWithTools reasoningEffort param, applied only on the
-- tool-calling loop's first iteration) -- job-row-only, ephemeral per turn,
-- same as tool_calls already is. Deliberately never persisted into
-- ai_messages: that table is replayed as history to the model on the next
-- turn, and chain-of-thought isn't meant to be replayed as prior context.
alter table ai_chat_jobs add column if not exists reasoning text not null default '';
