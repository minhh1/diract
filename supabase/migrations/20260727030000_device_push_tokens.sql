-- Device push tokens for the mobile app (Expo push service). One row per
-- device install -- a user signed in on two phones gets two rows, both
-- notified. Mirrors the "gate by a jsonb settings column on companies"
-- pattern email_notification_settings already uses (see
-- supabase/companies_email_notification_settings.sql), so
-- notify-task-assigned (and future notification triggers) can skip push
-- the same way they already skip email.

create table if not exists device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_id_idx on device_push_tokens(user_id);

alter table device_push_tokens enable row level security;

-- Edge functions read this table via the service-role key (bypasses RLS
-- entirely), so these policies only need to cover the mobile app itself
-- registering/deregistering its own device with the anon-key client.
create policy "device_push_tokens_select_own" on device_push_tokens
  for select using (auth.uid() = user_id);
create policy "device_push_tokens_insert_own" on device_push_tokens
  for insert with check (auth.uid() = user_id);
create policy "device_push_tokens_update_own" on device_push_tokens
  for update using (auth.uid() = user_id);
create policy "device_push_tokens_delete_own" on device_push_tokens
  for delete using (auth.uid() = user_id);

alter table companies add column if not exists push_notification_settings jsonb not null default '{}'::jsonb;
