-- Same problem as time_entry_view_scope.sql (20260728220000), different
-- table: tasks' only RLS (tasks_company_members) checks company membership
-- and nothing else, so any member could see every task in the company
-- regardless of who it's assigned to. Confirmed live: a non-admin test
-- account saw all of a company's tasks, not just its own.
--
-- Separate permission from allow_time_entry_view -- tasks and time entries
-- are different domains (project management vs. billing), and Tasks is a
-- universal system table every company has (unlike Time & Fee Entries,
-- which only exists for law-firm-seed companies), so this isn't gated to
-- any particular company type.
alter table teams add column if not exists allow_task_view boolean not null default false;

-- Per-team, admin-configurable: for a member of THIS team who doesn't
-- already have full view-all authority (admin, or another team's
-- allow_task_view), should a task assigned to this team (tasks.
-- assigned_team_id) also count as "theirs" to see, on top of tasks
-- assigned directly to them (assignee_id)? Defaults true since a
-- team-assigned task is presumptively relevant to that whole team; an
-- admin can turn it off per team for a stricter "assignee only" scope.
alter table teams add column if not exists include_team_tasks_in_scope boolean not null default true;

create or replace function public.task_visible_to_current_user(p_assignee_id uuid, p_assigned_team_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if is_current_user_admin() then
    return true;
  end if;

  if exists (
    select 1 from team_members tm join teams t on t.id = tm.team_id
    where tm.profile_id = auth.uid() and t.allow_task_view = true
  ) then
    return true;
  end if;

  if p_assignee_id = auth.uid() then
    return true;
  end if;

  if p_assigned_team_id is not null and exists (
    select 1 from team_members tm join teams t on t.id = tm.team_id
    where tm.profile_id = auth.uid()
      and tm.team_id = p_assigned_team_id
      and t.include_team_tasks_in_scope = true
  ) then
    return true;
  end if;

  return false;
end;
$$;

-- Restrictive so it ANDs with the existing permissive tasks_company_members
-- policy rather than replacing it -- a row must still pass the company
-- check AND this new assignee/team-scope check.
drop policy if exists tasks_view_scope on tasks;
create policy tasks_view_scope on tasks
  as restrictive for select
  using (task_visible_to_current_user(assignee_id, assigned_team_id));
