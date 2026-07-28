SET request.jwt.claim.role = 'service_role';

-- teams has never been company-scoped (see supabase/rls_fix.sql's own comment:
-- "teams has no company_id column (not tenant-scoped in this schema)") --
-- every company's admin sees and can rename/deactivate every OTHER
-- company's teams in AdminTeamsTab. Fixing this now because Niksen Time
-- Pty Ltd needs its own "Administration Team" that Huynh Lawyers (or any
-- other company on this platform) must not see or be able to edit.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

-- Backfill every existing team to the company its real members belong to.
-- All 6 existing teams (Asset Management, Finance & Accounting,
-- Conveyancing, Legal & Compliance, Property Operations, Administration
-- Team) resolve unambiguously to Huynh Lawyers once minh@huynhco.com's own
-- dual company_admin membership (he's admin of both Huynh Lawyers and
-- Niksen Time) is set aside -- every other member of every one of these 6
-- teams belongs only to Huynh Lawyers.
UPDATE teams SET company_id = 'a49b484d-100d-4c3e-b3b6-69c1a18cc783' WHERE company_id IS NULL;

ALTER TABLE teams ALTER COLUMN company_id SET NOT NULL;

DROP POLICY IF EXISTS teams_select ON teams;
DROP POLICY IF EXISTS teams_write ON teams;
CREATE POLICY teams_select ON teams FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
CREATE POLICY teams_write ON teams FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin'))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin'));

-- Niksen Time Pty Ltd's own Administration Team (see AGENTS/task: gates the
-- Irregularities dashboard to this team's leader + company_admin). Members:
-- Niksen Time's only two company_admins today (Minh Huynh, Michael Pao) --
-- Minh Huynh set as leader, changeable later via AdminTeamsTab like any
-- other team.
INSERT INTO teams (team_name, company_id, is_active, leader_id)
SELECT 'Administration Team', '32d4fb0e-007d-41e7-bc5e-638163c28e3d', true, '6a4a8543-0627-4f88-900d-2272b119a865'
WHERE NOT EXISTS (
  SELECT 1 FROM teams WHERE company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND team_name = 'Administration Team'
);

INSERT INTO team_members (team_id, profile_id)
SELECT t.id, p.id
FROM teams t
CROSS JOIN (VALUES ('6a4a8543-0627-4f88-900d-2272b119a865'::uuid), ('75ed254f-a8ec-4c5d-8afd-67f412b49c9e'::uuid)) AS p(id)
WHERE t.company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND t.team_name = 'Administration Team'
  AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.profile_id = p.id);
