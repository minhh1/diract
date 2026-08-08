-- 20260809_company_messaging.sql created the channels/channel_members/
-- messages/message_reactions tables and their RLS, but never added them to
-- the supabase_realtime publication -- postgres_changes only fires for
-- tables explicitly published, so every useTableRealtime/useRealtimeChannel
-- subscription against them (new-channel-appears-live, new-message-appears-
-- live, reaction toggles, unread badges, on both web and mobile) was
-- silently a no-op until now. Same guarded pattern as
-- 20260807000000_ai_chat_jobs.sql -- ALTER PUBLICATION has no IF NOT EXISTS
-- form.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channels'
  ) then
    alter publication supabase_realtime add table channels;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_members'
  ) then
    alter publication supabase_realtime add table channel_members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table message_reactions;
  end if;
end $$;
