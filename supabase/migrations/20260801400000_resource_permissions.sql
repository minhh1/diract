-- Per-resource (custom table / custom dashboard) admin-editor-viewer
-- permissions, layered on top of the existing owner_user_id (private) /
-- is_default (company-mandatory) model from
-- 20260727040000_default_and_private_tables_dashboards.sql -- see that
-- file's own policies for the exact "before" state this extends.
--
-- Model:
--  - A resource (table or dashboard) is "restricted" the moment ANY row
--    exists for it in resource_permissions -- from that point on, only
--    people with an explicit role (or the owner, or a company admin) can
--    see/use it, regardless of the company-wide default below.
--  - A resource with NO resource_permissions rows falls back to
--    companies.restrict_new_tables_dashboards_by_default: false (the
--    default, and today's only behavior) keeps it open to the whole
--    company; true hides it from everyone except the owner/company admin
--    until someone explicitly grants roles.
--  - viewer: can see the resource's content. editor: can also edit it
--    (records/values for tables, widgets/config for dashboards) but not
--    delete the resource itself or manage its permissions. admin: full
--    control including deleting the resource and managing who else has
--    access.
--  - The permission LIST itself (who has which role) is readable by any
--    company member, regardless of whether they themselves have a role on
--    that resource -- only mutating it (grant/revoke/change role) is
--    admin-gated.
--  - A company admin (is_current_user_admin()) always has full access to
--    everything, same override behavior as everywhere else in this app.

alter table companies
  add column if not exists restrict_new_tables_dashboards_by_default boolean not null default false;

create table if not exists resource_permissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  resource_type text not null check (resource_type in ('table', 'dashboard')),
  resource_id uuid not null,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (resource_type, resource_id, user_id)
);

create index if not exists resource_permissions_resource_idx
  on resource_permissions (resource_type, resource_id);
create index if not exists resource_permissions_user_idx
  on resource_permissions (user_id);

-- SQL-side helpers so both RLS policies and future code stay DRY.

create or replace function user_resource_role(p_resource_type text, p_resource_id uuid, p_user_id uuid default auth.uid())
returns text
language sql stable security definer set search_path = public
as $$
  select role from resource_permissions
  where resource_type = p_resource_type and resource_id = p_resource_id and user_id = p_user_id
  limit 1
$$;

create or replace function resource_has_explicit_permissions(p_resource_type text, p_resource_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from resource_permissions
    where resource_type = p_resource_type and resource_id = p_resource_id
  )
$$;

create or replace function company_restricts_new_resources_by_default(p_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(restrict_new_tables_dashboards_by_default, false) from companies where id = p_company_id
$$;

-- ── resource_permissions RLS ──────────────────────────────────────────
alter table resource_permissions enable row level security;

drop policy if exists resource_permissions_select on resource_permissions;
drop policy if exists resource_permissions_insert on resource_permissions;
drop policy if exists resource_permissions_update on resource_permissions;
drop policy if exists resource_permissions_delete on resource_permissions;

-- Readable by any member of the company -- the access list itself is not
-- a secret, even to someone who isn't on it.
create policy resource_permissions_select on resource_permissions for select
  using (company_id = active_company_id());

-- Mutable only by a company admin or someone who already holds 'admin' on
-- this specific resource.
create policy resource_permissions_insert on resource_permissions for insert
  with check (
    company_id = active_company_id()
    and (is_current_user_admin() or user_resource_role(resource_type, resource_id) = 'admin')
  );

create policy resource_permissions_update on resource_permissions for update
  using (
    company_id = active_company_id()
    and (is_current_user_admin() or user_resource_role(resource_type, resource_id) = 'admin')
  )
  with check (
    company_id = active_company_id()
    and (is_current_user_admin() or user_resource_role(resource_type, resource_id) = 'admin')
  );

create policy resource_permissions_delete on resource_permissions for delete
  using (
    company_id = active_company_id()
    and (is_current_user_admin() or user_resource_role(resource_type, resource_id) = 'admin')
  );

-- ── company_tables: extend existing policies with resource_permissions ─
drop policy if exists ct_select on company_tables;
drop policy if exists ct_insert on company_tables;
drop policy if exists ct_update on company_tables;
drop policy if exists ct_delete on company_tables;

create policy ct_select on company_tables for select
  using (
    company_id = active_company_id()
    and (
      owner_user_id = auth.uid()
      or is_current_user_admin()
      or user_resource_role('table', id) is not null
      or (
        owner_user_id is null
        and not resource_has_explicit_permissions('table', id)
        and not company_restricts_new_resources_by_default(company_id)
      )
    )
  );

create policy ct_insert on company_tables for insert
  with check (
    company_id = active_company_id()
    and (owner_user_id is null or owner_user_id = auth.uid())
    and (is_default = false or is_current_user_admin())
  );

create policy ct_update on company_tables for update
  using (
    company_id = active_company_id()
    and (
      owner_user_id = auth.uid()
      or is_current_user_admin()
      or user_resource_role('table', id) in ('editor', 'admin')
      or (
        owner_user_id is null
        and not resource_has_explicit_permissions('table', id)
        and not company_restricts_new_resources_by_default(company_id)
      )
    )
  )
  with check (
    company_id = active_company_id()
    and (
      owner_user_id = auth.uid()
      or is_current_user_admin()
      or user_resource_role('table', id) in ('editor', 'admin')
      or (
        owner_user_id is null
        and not resource_has_explicit_permissions('table', id)
        and not company_restricts_new_resources_by_default(company_id)
      )
    )
    and (is_default = false or is_current_user_admin())
  );

-- Deleting the table itself (not its records) needs resource-admin, not
-- just editor -- same bar as before (owner or company admin), now with a
-- resource-scoped 'admin' role as an additional way to clear that bar.
create policy ct_delete on company_tables for delete
  using (
    company_id = active_company_id()
    and (
      owner_user_id = auth.uid()
      or is_current_user_admin()
      or user_resource_role('table', id) = 'admin'
    )
  );

-- ── company_table_fields / _records / _values: viewer=read, editor+=write ─
drop policy if exists ctf_select on company_table_fields;
drop policy if exists ctf_insert on company_table_fields;
drop policy if exists ctf_update on company_table_fields;
drop policy if exists ctf_delete on company_table_fields;

create policy ctf_select on company_table_fields for select
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_fields.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) is not null
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctf_insert on company_table_fields for insert
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_fields.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctf_update on company_table_fields for update
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_fields.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  )
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_fields.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctf_delete on company_table_fields for delete
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_fields.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

drop policy if exists ctr_select on company_table_records;
drop policy if exists ctr_insert on company_table_records;
drop policy if exists ctr_update on company_table_records;
drop policy if exists ctr_delete on company_table_records;

create policy ctr_select on company_table_records for select
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_records.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) is not null
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctr_insert on company_table_records for insert
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_records.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctr_update on company_table_records for update
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_records.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  )
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_records.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctr_delete on company_table_records for delete
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_records.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

drop policy if exists ctv_select on company_table_values;
drop policy if exists ctv_insert on company_table_values;
drop policy if exists ctv_update on company_table_values;
drop policy if exists ctv_delete on company_table_values;

create policy ctv_select on company_table_values for select
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_values.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) is not null
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctv_insert on company_table_values for insert
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_values.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctv_update on company_table_values for update
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_values.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  )
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_values.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctv_delete on company_table_values for delete
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_values.table_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

drop policy if exists ctvl_select on company_table_value_links;
drop policy if exists ctvl_insert on company_table_value_links;
drop policy if exists ctvl_update on company_table_value_links;
drop policy if exists ctvl_delete on company_table_value_links;

create policy ctvl_select on company_table_value_links for select
  using (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
    and exists (
      select 1 from company_table_records ctr
      join company_tables ct on ct.id = ctr.table_id
      where ctr.id = company_table_value_links.record_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) is not null
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctvl_insert on company_table_value_links for insert
  with check (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
    and exists (
      select 1 from company_table_records ctr
      join company_tables ct on ct.id = ctr.table_id
      where ctr.id = company_table_value_links.record_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctvl_update on company_table_value_links for update
  using (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
    and exists (
      select 1 from company_table_records ctr
      join company_tables ct on ct.id = ctr.table_id
      where ctr.id = company_table_value_links.record_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  )
  with check (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
    and exists (
      select 1 from company_table_records ctr
      join company_tables ct on ct.id = ctr.table_id
      where ctr.id = company_table_value_links.record_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

create policy ctvl_delete on company_table_value_links for delete
  using (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
    and exists (
      select 1 from company_table_records ctr
      join company_tables ct on ct.id = ctr.table_id
      where ctr.id = company_table_value_links.record_id
        and (
          ct.owner_user_id = auth.uid()
          or is_current_user_admin()
          or user_resource_role('table', ct.id) in ('editor', 'admin')
          or (ct.owner_user_id is null and not resource_has_explicit_permissions('table', ct.id) and not company_restricts_new_resources_by_default(ct.company_id))
        )
    )
  );

-- ── company_dashboards: extend existing (more admin-gated) policies ────
-- Unlike tables, a shared dashboard with no explicit resource_permissions
-- has never been editable by an ordinary member (only owner/company admin)
-- -- see the "before" comment in 20260727040000_...sql. That stays true
-- here: the "no explicit permissions, company default open" fallback below
-- only ever appears in the SELECT policy, never in insert/update/delete,
-- so this migration cannot newly loosen who could already edit a shared
-- dashboard -- the ONLY new way to gain edit rights on a shared dashboard
-- is an explicit editor/admin row in resource_permissions.
drop policy if exists company_dashboards_select on company_dashboards;
drop policy if exists company_dashboards_insert on company_dashboards;
drop policy if exists company_dashboards_update on company_dashboards;
drop policy if exists company_dashboards_delete on company_dashboards;

create policy company_dashboards_select on company_dashboards for select
  using (
    company_id = active_company_id()
    and (
      owner_user_id = auth.uid()
      or is_current_user_admin()
      or user_resource_role('dashboard', id) is not null
      or (
        owner_user_id is null
        and not resource_has_explicit_permissions('dashboard', id)
        and not company_restricts_new_resources_by_default(company_id)
      )
    )
  );

create policy company_dashboards_insert on company_dashboards for insert
  with check (
    company_id = active_company_id()
    and (owner_user_id = auth.uid() or is_current_user_admin())
    and (is_default = false or is_current_user_admin())
  );

create policy company_dashboards_update on company_dashboards for update
  using (
    company_id = active_company_id()
    and (
      owner_user_id = auth.uid()
      or is_current_user_admin()
      or user_resource_role('dashboard', id) in ('editor', 'admin')
    )
  )
  with check (
    company_id = active_company_id()
    and (
      owner_user_id = auth.uid()
      or is_current_user_admin()
      or user_resource_role('dashboard', id) in ('editor', 'admin')
    )
    and (is_default = false or is_current_user_admin())
  );

create policy company_dashboards_delete on company_dashboards for delete
  using (
    company_id = active_company_id()
    and (
      owner_user_id = auth.uid()
      or is_current_user_admin()
      or user_resource_role('dashboard', id) = 'admin'
    )
  );
