-- Lets a viewer who can see MORE THAN their own rows on a $current_user/
-- $team_scope-scoped filter (see RelationPicker.tsx's autoSelectSelf and
-- lib/teamScope.ts) pin a persistent default for that filter -- "All",
-- themselves, or one specific colleague -- instead of it always silently
-- re-narrowing to "just me" on every fresh visit (today's only behavior,
-- non-configurable). One row per (user, dashboard, field); value_record_id
-- null means "All", any other value is the entity id to default to.
-- Restricted viewers (no view-scope permission) never get a row here --
-- the client only ever writes one when it already confirmed they can see
-- multiple people's data (see lib/teamScope.ts's getTimeEntryViewScopeIds).
create table if not exists user_field_filter_defaults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  dashboard_id uuid not null references company_dashboards(id) on delete cascade,
  field_id uuid not null references company_table_fields(id) on delete cascade,
  value_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dashboard_id, field_id)
);

alter table user_field_filter_defaults enable row level security;

-- Purely a personal preference -- a user can only ever see/write their own
-- rows, no company-membership check needed beyond that (the dashboard_id/
-- field_id FKs already tie it to whatever they had access to when saved).
drop policy if exists user_field_filter_defaults_own on user_field_filter_defaults;
create policy user_field_filter_defaults_own on user_field_filter_defaults
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
