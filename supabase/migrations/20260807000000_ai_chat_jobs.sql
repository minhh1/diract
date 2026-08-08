-- Persists AI assistant chat turns so they survive the browser tab closing
-- entirely -- app/api/ai/chat/route.ts now kicks the actual model call off
-- via Next's after()/Vercel waitUntil (same shape as
-- auto_time_entry_generation_jobs, see that migration's own header comment)
-- and writes progress here instead of streaming it straight to one
-- held-open response. user_id-scoped rather than company-wide: a
-- conversation is personal, same as ai_conversations/ai_messages already
-- are (see supabase/ai_conversations.sql).
create table if not exists ai_chat_jobs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  content text not null default '',
  tool_calls jsonb not null default '[]'::jsonb,
  error text,
  hit_iteration_limit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- AiChatThread.tsx's "is there already a running job for this conversation"
-- attach-on-open check.
create index if not exists ai_chat_jobs_conversation_lookup_idx
  on ai_chat_jobs (conversation_id, status, created_at desc);

alter table ai_chat_jobs enable row level security;

-- Read-only for the owner -- every write comes from the route's admin
-- (service-role) client (both the initial insert and every progress/final
-- update inside after()), which bypasses RLS entirely, so there's
-- deliberately no insert/update/delete policy for the authenticated role.
-- Same shape as auto_time_entry_generation_jobs_select_own.
drop policy if exists ai_chat_jobs_select_own on ai_chat_jobs;
create policy ai_chat_jobs_select_own
  on ai_chat_jobs for select
  using (user_id = auth.uid());

-- ALTER PUBLICATION has no IF NOT EXISTS form -- guarded so re-running this
-- migration against a database where the table's already live (confirmed
-- here: this table/policy already existed and Realtime was already
-- delivering postgres_changes for it, just never recorded as applied in
-- schema_migrations) doesn't error on "already member of publication".
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_chat_jobs'
  ) then
    alter publication supabase_realtime add table ai_chat_jobs;
  end if;
end $$;
