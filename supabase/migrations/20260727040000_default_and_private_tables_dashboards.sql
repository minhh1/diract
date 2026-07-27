-- Admin-set company defaults (mandatory for every member) + per-user private
-- tables/dashboards. See lib/hooks/useCustomTables.ts, useCustomDashboards.ts,
-- components/Sidebar.tsx, CustomTableBuilder.tsx, DashboardBuilderPage.tsx,
-- admin/AdminDefaultTablesTab.tsx for the client side of this.
--
-- owner_user_id NULL = shared/company-wide (today's only behavior, unchanged).
-- owner_user_id = a user => private, visible only to that user (and to admins,
-- for oversight -- the app's own "my sidebar" queries additionally filter to
-- owner_user_id is null or = self so an admin's daily view isn't cluttered
-- with everyone else's private items; this is a UX filter, not the security
-- boundary -- RLS below is).
-- is_default = true => admin-designated, mandatory for everyone, only an
-- admin can set it true or delete such a row.

alter table company_tables
  add column is_default boolean not null default false,
  add column owner_user_id uuid references profiles(id) on delete cascade;

alter table company_dashboards
  add column is_default boolean not null default false,
  add column owner_user_id uuid references profiles(id) on delete cascade;

-- ── company_tables ──────────────────────────────────────────────────
drop policy if exists ct_all on company_tables;

create policy ct_select on company_tables for select
  using (
    company_id = active_company_id()
    and (owner_user_id is null or owner_user_id = auth.uid() or is_current_user_admin())
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
    and (owner_user_id is null or owner_user_id = auth.uid() or is_current_user_admin())
  )
  with check (
    company_id = active_company_id()
    and (owner_user_id is null or owner_user_id = auth.uid() or is_current_user_admin())
    and (is_default = false or is_current_user_admin())
  );

create policy ct_delete on company_tables for delete
  using (
    company_id = active_company_id()
    and (owner_user_id = auth.uid() or is_current_user_admin())
  );

-- ── company_table_fields (child of company_tables via table_id) ─────
drop policy if exists ctf_all on company_table_fields;

create policy ctf_select on company_table_fields for select
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_fields.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctf_insert on company_table_fields for insert
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_fields.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctf_update on company_table_fields for update
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_fields.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  )
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_fields.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctf_delete on company_table_fields for delete
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_fields.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

-- ── company_table_records (child of company_tables via table_id) ────
drop policy if exists ctr_all on company_table_records;

create policy ctr_select on company_table_records for select
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_records.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctr_insert on company_table_records for insert
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_records.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctr_update on company_table_records for update
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_records.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  )
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_records.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctr_delete on company_table_records for delete
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_records.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

-- ── company_table_values (child of company_tables via table_id) ─────
drop policy if exists ctv_all on company_table_values;

create policy ctv_select on company_table_values for select
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_values.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctv_insert on company_table_values for insert
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_values.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctv_update on company_table_values for update
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_values.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  )
  with check (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_values.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctv_delete on company_table_values for delete
  using (
    company_id = active_company_id()
    and exists (
      select 1 from company_tables ct
      where ct.id = company_table_values.table_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

-- ── company_table_value_links (no direct table_id -- join via
--    company_table_records.record_id to reach company_tables) ───────
drop policy if exists company_table_value_links_company_members on company_table_value_links;

create policy ctvl_select on company_table_value_links for select
  using (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
    and exists (
      select 1 from company_table_records ctr
      join company_tables ct on ct.id = ctr.table_id
      where ctr.id = company_table_value_links.record_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctvl_insert on company_table_value_links for insert
  with check (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
    and exists (
      select 1 from company_table_records ctr
      join company_tables ct on ct.id = ctr.table_id
      where ctr.id = company_table_value_links.record_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctvl_update on company_table_value_links for update
  using (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
    and exists (
      select 1 from company_table_records ctr
      join company_tables ct on ct.id = ctr.table_id
      where ctr.id = company_table_value_links.record_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  )
  with check (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
    and exists (
      select 1 from company_table_records ctr
      join company_tables ct on ct.id = ctr.table_id
      where ctr.id = company_table_value_links.record_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

create policy ctvl_delete on company_table_value_links for delete
  using (
    company_id in (select company_id from company_memberships where user_id = auth.uid())
    and exists (
      select 1 from company_table_records ctr
      join company_tables ct on ct.id = ctr.table_id
      where ctr.id = company_table_value_links.record_id
        and (ct.owner_user_id is null or ct.owner_user_id = auth.uid() or is_current_user_admin())
    )
  );

-- ── company_dashboards ──────────────────────────────────────────────
drop policy if exists company_dashboards_active_company on company_dashboards;

create policy company_dashboards_select on company_dashboards for select
  using (
    company_id = active_company_id()
    and (owner_user_id is null or owner_user_id = auth.uid() or is_current_user_admin())
  );

-- Dashboards are more admin-gated than tables: unlike company_tables (where
-- any member has always been able to freely edit a SHARED table's schema),
-- dashboard mutation was 100% admin-only before this migration (see
-- components/dashboard/DashboardBuilderPage.tsx's old hard isAdmin block).
-- So -- unlike company_tables' policies above -- a non-admin here may only
-- ever act as owner_user_id = themselves; only an admin may touch a shared
-- (owner_user_id is null) or default row, or leave/set a row shared.
create policy company_dashboards_insert on company_dashboards for insert
  with check (
    company_id = active_company_id()
    and (owner_user_id = auth.uid() or is_current_user_admin())
    and (is_default = false or is_current_user_admin())
  );

create policy company_dashboards_update on company_dashboards for update
  using (
    company_id = active_company_id()
    and (owner_user_id = auth.uid() or is_current_user_admin())
  )
  with check (
    company_id = active_company_id()
    and (owner_user_id = auth.uid() or is_current_user_admin())
    and (is_default = false or is_current_user_admin())
  );

create policy company_dashboards_delete on company_dashboards for delete
  using (
    company_id = active_company_id()
    and (owner_user_id = auth.uid() or is_current_user_admin())
  );
