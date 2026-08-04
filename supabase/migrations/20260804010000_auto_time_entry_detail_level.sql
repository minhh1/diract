-- Per-user default detail level for Auto Time Recording's AI-generated
-- descriptions (brief/standard/detailed) -- read/written directly from the
-- client the same way profiles.sidebar_visible_tables and
-- notification_preferences already are, no dedicated API route.
alter table profiles add column if not exists auto_time_entry_detail_level text not null default 'standard';

alter table profiles drop constraint if exists profiles_auto_time_entry_detail_level_check;
alter table profiles add constraint profiles_auto_time_entry_detail_level_check
  check (auto_time_entry_detail_level in ('brief', 'standard', 'detailed'));
