-- Lets an admin grant a team's members permission to log Time & Fee
-- Entries/Disbursements as a DIFFERENT staff member, not just themselves --
-- previously only a company_admin could do this (see lib/teamScope.ts's
-- getStaffScopeIds, which the '$team_scope' Staff-field sentinel reads).
-- Configured per-team in the existing admin Teams tab, alongside team
-- membership -- there's no separate "Permissions" page in this app yet, and
-- this is a team-scoped permission, so it lives where teams are already
-- managed.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS allow_time_entry_delegation boolean NOT NULL DEFAULT false;
