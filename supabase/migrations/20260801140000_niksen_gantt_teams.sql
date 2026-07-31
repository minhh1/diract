SET request.jwt.claim.role = 'service_role';

-- Seeds the 5 discipline teams the Finance Model's Gantt/Timeline needs
-- for task-team tagging, alongside the "Administration Team" that already
-- exists for this company. Niksen-scoped, idempotent by (company_id,
-- team_name), same direct-provisioning pattern as
-- 20260729280000_niksen_contacts_table_and_rule.sql.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
BEGIN
  INSERT INTO teams (company_id, team_name, is_active)
  SELECT v_company_id, v.team_name, true
  FROM (VALUES ('Legal'), ('Property Management'), ('Design'), ('Development'), ('Finance')) AS v(team_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM teams t WHERE t.company_id = v_company_id AND t.team_name = v.team_name AND t.is_active
  );
END $$;
