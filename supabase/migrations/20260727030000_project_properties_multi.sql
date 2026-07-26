-- Parent Property on a project used to be a single FK column
-- (projects.parent_property_id), so a project could only ever have one
-- property attached to it. This adds a junction table so a project can
-- have two or more properties, without dropping parent_property_id itself
-- (kept as-is for any code that still reads it directly; the app now
-- treats this junction table as the source of truth for the field going
-- forward -- see the `junction` entry on parent_property_id in
-- lib/schema/systemTableRelations.ts).
CREATE TABLE IF NOT EXISTS project_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, property_id)
);

CREATE INDEX IF NOT EXISTS project_properties_project_id_idx ON project_properties(project_id);
CREATE INDEX IF NOT EXISTS project_properties_property_id_idx ON project_properties(property_id);

ALTER TABLE project_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_properties_company_members ON project_properties;
CREATE POLICY project_properties_company_members ON project_properties
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Backfill: carry forward each project's existing single parent property.
INSERT INTO project_properties (company_id, project_id, property_id)
SELECT company_id, id, parent_property_id
FROM projects
WHERE parent_property_id IS NOT NULL
ON CONFLICT (project_id, property_id) DO NOTHING;
