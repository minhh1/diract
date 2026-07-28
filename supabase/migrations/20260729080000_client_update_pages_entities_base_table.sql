SET request.jwt.claim.role = 'service_role';

-- Generalizes Client Update Pages (previously hardcoded to projects/matters,
-- see components/clientUpdatePages/MatterBoard.tsx) to also support entities
-- as a base table -- needed for a Niksen Time "Entity Admin" board, staff-
-- only, restricted to their Administration Team. Every existing page keeps
-- working unchanged: base_table defaults to 'projects', project_id stays
-- populated on every existing item, entity_id stays null everywhere.

ALTER TABLE client_update_pages ADD COLUMN IF NOT EXISTS base_table text NOT NULL DEFAULT 'projects'
  CHECK (base_table IN ('projects', 'entities'));

ALTER TABLE client_update_page_items ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE client_update_page_items ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES entities(id) ON DELETE CASCADE;
ALTER TABLE client_update_page_items DROP CONSTRAINT IF EXISTS client_update_page_items_one_record_chk;
ALTER TABLE client_update_page_items ADD CONSTRAINT client_update_page_items_one_record_chk
  CHECK ((project_id IS NOT NULL) <> (entity_id IS NOT NULL));
