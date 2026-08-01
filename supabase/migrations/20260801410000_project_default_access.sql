-- Wires up companies.project_default_access (previously a decorative radio
-- group in Admin > Company -- nothing read it, no storage for which teams
-- or members) to actually apply to new projects. Reuses the existing
-- per-project access_mode / project_teams / project_members machinery
-- (lib/projectAccess.ts, components/projects/ProjectAccessPanel.tsx) --
-- this migration just adds the company-wide DEFAULT template that seeds a
-- brand-new project's own access_mode/project_teams/project_members at
-- creation time, and a trigger so it applies uniformly regardless of which
-- of the several project-creation code paths (NewProjectModal, the Gmail
-- add-on, sub-project creation, CSV import, ...) inserted the row.

create table if not exists company_project_default_access (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  target_type text not null check (target_type in ('team', 'member')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, target_type, target_id)
);

alter table company_project_default_access enable row level security;

drop policy if exists cpda_select on company_project_default_access;
drop policy if exists cpda_write on company_project_default_access;

-- This is company settings, same admin-only bar as the rest of the Company
-- tab (unlike resource_permissions' ACL, which is intentionally
-- company-wide readable) -- an ordinary member has no reason to see which
-- teams/members are the default template for future projects.
create policy cpda_select on company_project_default_access for select
  using (company_id = active_company_id() and is_current_user_admin());

create policy cpda_write on company_project_default_access for all
  using (company_id = active_company_id() and is_current_user_admin())
  with check (company_id = active_company_id() and is_current_user_admin());

create or replace function apply_project_default_access()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_default_mode text;
begin
  -- Only step in when the inserting caller left access_mode at the table
  -- default ('all_members') -- an explicit non-default value (e.g. a
  -- future caller that already knows its own restriction) is left alone.
  if NEW.access_mode is distinct from 'all_members' then
    return NEW;
  end if;

  select project_default_access into v_default_mode from companies where id = NEW.company_id;
  if v_default_mode is null or v_default_mode = 'all_members' then
    return NEW;
  end if;

  update projects set access_mode = v_default_mode where id = NEW.id;

  if v_default_mode = 'specific_teams' then
    insert into project_teams (project_id, team_id)
    select NEW.id, target_id from company_project_default_access
    where company_id = NEW.company_id and target_type = 'team'
    on conflict (project_id, team_id) do nothing;
  elsif v_default_mode = 'specific_members' then
    insert into project_members (project_id, profile_id)
    select NEW.id, target_id from company_project_default_access
    where company_id = NEW.company_id and target_type = 'member'
    on conflict (project_id, profile_id) do nothing;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_apply_project_default_access on projects;
create trigger trg_apply_project_default_access
  after insert on projects
  for each row execute function apply_project_default_access();
