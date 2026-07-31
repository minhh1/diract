SET request.jwt.claim.role = 'service_role';

-- Finance Model v2: repoint finance_model_pages from entity_id to
-- project_id (the model itself moved from Entity records to Project
-- records -- see 20260731310000's header comment for why). Confirmed
-- empty in production before this runs, so a straight column swap is
-- safe -- no data to migrate.
--
-- finance_model_budget_lines (the old entity-scoped system table) is
-- dropped outright: superseded by the "Finance Model Budget Lines"
-- custom table added in 20260731310000, also confirmed empty.

DROP TABLE IF EXISTS finance_model_budget_lines;

ALTER TABLE finance_model_pages ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE finance_model_pages ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE finance_model_pages DROP COLUMN entity_id;

DROP INDEX IF EXISTS finance_model_pages_entity_idx;
CREATE INDEX finance_model_pages_project_idx ON finance_model_pages (project_id);
