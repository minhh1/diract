-- Lets a user pin and rename their own AI assistant conversation threads
-- (app/(app)/dashboard/ai/page.tsx's sidebar, and the Quick Glance
-- ai_assistant widget's new history dropdown). `title` stays nullable --
-- null means "still using the derived-from-first-message title" (see
-- app/api/ai/conversations/route.ts), not an empty string, so a user who
-- renames back to blank reverts to the derived title rather than showing a
-- literally empty row.
alter table ai_conversations add column if not exists title text;
alter table ai_conversations add column if not exists pinned boolean not null default false;

-- app/api/ai/conversations/route.ts orders by pinned desc, updated_at desc.
create index if not exists ai_conversations_pinned_idx
  on ai_conversations (user_id, company_id, pinned desc, updated_at desc);
