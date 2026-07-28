-- Per-cell change history for Client Update Pages. client_update_page_logs
-- already has one human-readable row per change (see the migration that
-- created it) but there was no way to filter it down to "just this one
-- cell's history", no captured before/after value, and no room for the
-- reason a staff member gives for a specific edit -- all needed so a client
-- can click a single date/amount cell and see exactly what changed on it,
-- by whom, and why, without wading through the whole page's activity log.
-- item_id/field_id are only populated for action = 'value_changed' rows;
-- every other action (group renamed, matter added, etc.) leaves them null
-- and keeps behaving exactly as before.
ALTER TABLE client_update_page_logs ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES client_update_page_items(id) ON DELETE CASCADE;
ALTER TABLE client_update_page_logs ADD COLUMN IF NOT EXISTS field_id uuid REFERENCES client_update_page_fields(id) ON DELETE CASCADE;
ALTER TABLE client_update_page_logs ADD COLUMN IF NOT EXISTS old_value text;
ALTER TABLE client_update_page_logs ADD COLUMN IF NOT EXISTS new_value text;
ALTER TABLE client_update_page_logs ADD COLUMN IF NOT EXISTS reason text;

CREATE INDEX IF NOT EXISTS client_update_page_logs_cell_idx ON client_update_page_logs(item_id, field_id, created_at DESC);
