-- Restricts WHO CAN SEE a Time & Fee Entries/Disbursements row, not just who
-- the "Staff" field's picker lets you log time AS ($team_scope, see
-- lib/teamScope.ts / RelationPicker.tsx). Until now nothing restricted reads
-- at all -- company_table_records/values' existing RLS (ctr_select/
-- ctv_select) only checks company membership + the table's owner_user_id, so
-- ANY member of the company could see every staff member's time entries in
-- the grid, the date-range navigation, and the summary chart, even though
-- they could only ever pick themselves in the Staff field when logging a
-- NEW entry. Confirmed live: a non-admin, non-delegated test account could
-- browse every date and see every staff member's hours.
--
-- Reuses $team_scope's own field-level marker (company_table_fields.
-- linked_filter_value = '$team_scope') to find which field on a table is
-- the "Staff" field, so this isn't hardcoded to time-fee-entries/
-- disbursements specifically -- any table configured with that sentinel
-- gets the same row-level scoping automatically.
--
-- Deliberately a SEPARATE permission from allow_time_entry_delegation (which
-- controls logging time AS someone else) -- an admin may want a team to see
-- everyone's hours (e.g. for review/reporting) without also letting them
-- bill work under a colleague's name, or vice versa.
alter table teams add column if not exists allow_time_entry_view boolean not null default false;

create or replace function public.time_entry_view_scope_ids()
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_ids uuid[];
begin
  v_company_id := active_company_id();
  if v_company_id is null then
    return array[]::uuid[];
  end if;

  if exists (
    select 1 from company_memberships
    where user_id = auth.uid() and company_id = v_company_id and role = 'company_admin'
  ) then
    return null; -- unrestricted: admin sees every staff member's entries
  end if;

  if exists (
    select 1
    from team_members tm
    join teams t on t.id = tm.team_id
    where tm.profile_id = auth.uid() and t.allow_time_entry_view = true
  ) then
    return null; -- unrestricted: delegated via Admin > Teams
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_ids
  from entities
  where company_id = v_company_id
    and linked_profile_id = auth.uid()
    and deleted_at is null;

  return v_ids;
end;
$$;

-- Shared by the two restrictive policies below (one per table) since a
-- record's visibility and its values' visibility must agree -- otherwise a
-- caller that queries company_table_values directly (not joined through
-- company_table_records) could still see a "hidden" record's field values.
create or replace function public.time_entry_record_visible(p_table_id uuid, p_record_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_field_id uuid;
  v_scope uuid[];
  v_value uuid;
begin
  select id into v_field_id
  from company_table_fields
  where table_id = p_table_id
    and linked_filter_value = '$team_scope'
    and deleted_at is null
  limit 1;

  if v_field_id is null then
    return true; -- table has no $team_scope field, not subject to this restriction
  end if;

  v_scope := time_entry_view_scope_ids();
  if v_scope is null then
    return true;
  end if;

  select value_record_id into v_value
  from company_table_values
  where record_id = p_record_id and field_id = v_field_id
  limit 1;

  return v_value is not null and v_value = any(v_scope);
end;
$$;

-- Restrictive policies AND with the existing permissive ctr_select/
-- ctv_select rather than replacing them -- a row must still pass the
-- existing company/owner check AND this new staff-scope check.
drop policy if exists ctr_time_entry_view_scope on company_table_records;
create policy ctr_time_entry_view_scope on company_table_records
  as restrictive for select
  using (time_entry_record_visible(table_id, id));

drop policy if exists ctv_time_entry_view_scope on company_table_values;
create policy ctv_time_entry_view_scope on company_table_values
  as restrictive for select
  using (time_entry_record_visible(table_id, record_id));
