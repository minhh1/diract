-- The /dashboard/ai chat is being repurposed from a general RAG Q&A
-- assistant into a single-purpose table/dashboard-builder assistant (see
-- app/api/ai/chat/route.ts, lib/ai/tableBuilderTools.ts). Its new usage
-- allowance is 1,000,000 tokens/month, down from the previous general-chat
-- default of 2,000,000 -- non-destructive: only changes the default for
-- companies that haven't set an explicit monthly_token_cap, same as every
-- other default-only migration in this repo.
ALTER TABLE ai_chat_settings ALTER COLUMN monthly_token_cap SET DEFAULT 1000000;
