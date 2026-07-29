-- Staff-controlled, page-wide option (same shape as freeze_first_column,
-- 20260727190000) to turn off the mandatory "why is this changing?" prompt
-- and per-cell change history/activity-log writes for a Client Update Page.
-- On by default -- matches every page's current (only) behavior. Only ever
-- read by the staff editing path (values PATCH route/MatterBoard's reason
-- prompt) -- a client PIN visitor never edits cells at all, so this has no
-- effect on the public read-only view.
ALTER TABLE client_update_pages ADD COLUMN IF NOT EXISTS log_cell_changes boolean NOT NULL DEFAULT true;
