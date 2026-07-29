SET request.jwt.claim.role = 'service_role';

-- client_update_page_items_one_record_chk (num_nonnulls(project_id,
-- entity_id, custom_record_id) = 1) predates the generic record_table/
-- record_id columns added in 20260729210000_client_update_pages_visibility_
-- teams_generic_record.sql, which switched the actual insert code
-- (app/api/client-update-pages/[id]/items/route.ts) over to writing only
-- record_table/record_id -- but never dropped this now-stale constraint.
-- Confirmed live: it silently blocks EVERY new "Add matter"/auto-add insert
-- (found while testing 20260729300000_client_update_auto_add_rules.sql's
-- trigger -- zero existing rows have record_table set without a legacy
-- column also set, meaning nothing has been able to insert via the generic
-- path since that migration went in). record_table/record_id are both
-- NOT NULL already, so they alone already guarantee exactly one record
-- reference -- the old three-column constraint has nothing left to enforce.
ALTER TABLE client_update_page_items DROP CONSTRAINT IF EXISTS client_update_page_items_one_record_chk;
