-- Team/person-scoped Default Settings. Admin > Default Settings ("Default
-- views" / "Default tables" / "Default dashboards" -- NOT "Default tabs",
-- see below) previously supported exactly one company-wide default per
-- resource. This adds an optional team_id/user_id dimension so a Team
-- Leader (teams.leader_id) or company admin can configure a distinct
-- default for a specific team or person, with the standard "most specific
-- wins" fallback: person > team > company-wide.
--
-- "Default tabs" (company_record_tab_defaults, see template_record_tabs.sql)
-- is deliberately NOT touched here -- it governs which tabs get created on
-- a brand-new record (a record-creation-time decision), not something a
-- viewer resolves for themselves, and there's no existing notion of "which
-- team owns this record" to resolve it against. It stays company-wide only;
-- see components/admin/AdminDefaultTabsTab.tsx.
--
-- Resolution semantics deliberately differ by resource, matching what each
-- one already means:
--  - company_default_views (one filter/column preset per table_slug) is a
--    single value -- a more specific row REPLACES a less specific one.
--    Enforced here via three partial unique indexes (one row per
--    company/team/person per table_slug); the actual "pick the most
--    specific one" logic lives in the client (see usePresetTable.ts /
--    useTableColumnConfig.ts).
--  - company_tables.is_default / company_dashboards.is_default (mandatory
--    sidebar items) is a checklist, not a single value -- a team/person
--    scoped default ADDS to the company-wide mandatory set, never removes
--    from it. That's company_default_scopes below: presence of a row means
--    "also mandatory for this team/person", the pre-existing is_default
--    column is untouched and still means "mandatory for everyone".

-- ── company_default_views: add team/person scope ───────────────────
alter table company_default_views
  add column if not exists team_id uuid references teams(id) on delete cascade,
  add column if not exists user_id uuid references profiles(id) on delete cascade;

alter table company_default_views
  drop constraint if exists company_default_views_scope_one_target;
alter table company_default_views
  add constraint company_default_views_scope_one_target
    check (team_id is null or user_id is null);

-- The base table predates tracked migrations (like `teams`), so the exact
-- name of its (company_id, table_slug) unique constraint isn't known ahead
-- of time -- find and drop whatever it's called rather than guessing.
do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'company_default_views'
    and con.contype = 'u'
    and (
      select array_agg(attname order by attname)
      from unnest(con.conkey) as k(attnum)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    ) = array['company_id', 'table_slug']::name[]
  limit 1;

  if v_name is not null then
    execute format('alter table company_default_views drop constraint %I', v_name);
  end if;
end $$;

create unique index if not exists uq_company_default_views_company
  on company_default_views (company_id, table_slug)
  where team_id is null and user_id is null;
create unique index if not exists uq_company_default_views_team
  on company_default_views (company_id, table_slug, team_id)
  where team_id is not null;
create unique index if not exists uq_company_default_views_user
  on company_default_views (company_id, table_slug, user_id)
  where user_id is not null;

-- ── company_default_scopes: additive team/person defaults for tables
--    and dashboards ──────────────────────────────────────────────────
create table if not exists company_default_scopes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  resource_type text not null check (resource_type in ('table', 'dashboard')),
  resource_id uuid not null, -- company_tables.id or company_dashboards.id -- polymorphic, no FK
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint company_default_scopes_one_target check ((team_id is not null) <> (user_id is not null))
);

create unique index if not exists uq_company_default_scopes_team
  on company_default_scopes (resource_type, resource_id, team_id)
  where team_id is not null;
create unique index if not exists uq_company_default_scopes_user
  on company_default_scopes (resource_type, resource_id, user_id)
  where user_id is not null;

-- ── RLS helper functions ────────────────────────────────────────────
create or replace function is_leader_of_team(p_team_id uuid) returns boolean
language sql stable as $$
  select exists (select 1 from teams where id = p_team_id and leader_id = auth.uid());
$$;

create or replace function is_leader_of_users_team(p_user_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from team_members tm
    join teams t on t.id = tm.team_id
    where tm.profile_id = p_user_id and t.leader_id = auth.uid()
  );
$$;

-- ── company_default_views RLS ───────────────────────────────────────
-- Previously just company-membership (or possibly no RLS at all, given the
-- untracked base table) -- this is the first time this table needs to
-- distinguish "read my own effective default" from "write a scope I don't
-- own", so it gets a real policy set now, same move
-- 20260727040000_default_and_private_tables_dashboards.sql made for
-- company_tables/company_dashboards.
alter table company_default_views enable row level security;
drop policy if exists company_default_views_members on company_default_views;
drop policy if exists company_default_views_select on company_default_views;
drop policy if exists company_default_views_write on company_default_views;

create policy company_default_views_select on company_default_views for select
  using (
    company_id = active_company_id()
    and (
      (team_id is null and user_id is null)
      or user_id = auth.uid()
      or team_id in (select team_id from team_members where profile_id = auth.uid())
      or is_current_user_admin()
      or (team_id is not null and is_leader_of_team(team_id))
    )
  );

create policy company_default_views_write on company_default_views for all
  using (
    company_id = active_company_id()
    and (
      is_current_user_admin()
      or (team_id is not null and is_leader_of_team(team_id))
      or (user_id is not null and is_leader_of_users_team(user_id))
    )
  )
  with check (
    company_id = active_company_id()
    and (
      is_current_user_admin()
      or (team_id is not null and is_leader_of_team(team_id))
      or (user_id is not null and is_leader_of_users_team(user_id))
    )
  );

-- ── company_default_scopes RLS ──────────────────────────────────────
alter table company_default_scopes enable row level security;
drop policy if exists company_default_scopes_select on company_default_scopes;
drop policy if exists company_default_scopes_write on company_default_scopes;

create policy company_default_scopes_select on company_default_scopes for select
  using (
    company_id = active_company_id()
    and (
      user_id = auth.uid()
      or team_id in (select team_id from team_members where profile_id = auth.uid())
      or is_current_user_admin()
      or (team_id is not null and is_leader_of_team(team_id))
    )
  );

create policy company_default_scopes_write on company_default_scopes for all
  using (
    company_id = active_company_id()
    and (
      is_current_user_admin()
      or (team_id is not null and is_leader_of_team(team_id))
      or (user_id is not null and is_leader_of_users_team(user_id))
    )
  )
  with check (
    company_id = active_company_id()
    and (
      is_current_user_admin()
      or (team_id is not null and is_leader_of_team(team_id))
      or (user_id is not null and is_leader_of_users_team(user_id))
    )
  );
