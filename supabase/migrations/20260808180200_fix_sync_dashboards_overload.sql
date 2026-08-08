-- CREATE OR REPLACE with a different parameter list creates a new
-- overload rather than replacing the original (confirmed live: PostgREST
-- then refuses every call with "Could not choose the best candidate
-- function", since a bare {p_template_id} now matches two signatures).
-- Drop the original 1-arg version so only the widened 3-arg one (with
-- p_dashboard_ids/p_record_tab_ids both DEFAULT NULL) exists -- every
-- existing caller (the old "Sync dashboards" button, sync-dashboards/
-- route.ts) still calls it with just p_template_id and keeps working
-- unchanged.
DROP FUNCTION IF EXISTS sync_template_dashboards_from_company(uuid);
