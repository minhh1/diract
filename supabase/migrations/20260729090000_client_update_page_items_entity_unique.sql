SET request.jwt.claim.role = 'service_role';

-- Mirrors whatever unique constraint already stops the same matter being
-- added twice to one page (project_id, presumably a unique index created
-- directly in the DB pre-repo, per every other base entities/client_update_pages
-- column) -- items/route.ts's 23505 handling already expects one to exist,
-- it just didn't have an entity_id equivalent yet. Partial (entity_id IS NOT
-- NULL) since most rows have project_id instead.
CREATE UNIQUE INDEX IF NOT EXISTS client_update_page_items_page_entity_uidx
  ON client_update_page_items (page_id, entity_id) WHERE entity_id IS NOT NULL;
