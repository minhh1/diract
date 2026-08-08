-- Tag a roster shift with one of the company's existing teams (the same
-- `teams`/`team_members` the app already has, managed in Admin -> Teams,
-- see components/admin/AdminTeamsTab.tsx) -- NOT a new roster-specific team
-- concept. Team is a property of the SHIFT, not fixed to the staff member,
-- because a team member can work under different teams (they can belong to
-- several) on different days -- the weekly view groups shifts under
-- whichever of their teams a shift is actually tagged with.
ALTER TABLE roster_shifts ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS roster_shifts_team_idx ON roster_shifts (team_id);
