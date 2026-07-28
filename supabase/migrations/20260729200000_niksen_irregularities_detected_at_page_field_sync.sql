SET request.jwt.claim.role = 'service_role';

-- 20260729180000 switched company_table_fields.field_type for detected_at
-- from 'date' to 'text' (to carry time-of-day), but client_update_page_fields
-- keeps its own independent snapshot of field_type (see
-- 20260729140000_niksen_irregularities_status_detected_columns.sql, which
-- hardcoded 'date' there) -- MatterBoard.tsx's isDateField reads THIS copy,
-- not company_table_fields, so the board kept rendering/parsing "Detected
-- At" as a bare date and silently dropping the time it now stores. Syncs
-- the page-field snapshot to match.
UPDATE client_update_page_fields pf
SET field_type = 'text'
FROM company_table_fields ctf
WHERE pf.field_source = 'base'
  AND pf.field_key = ctf.id::text
  AND ctf.field_key = 'detected_at'
  AND pf.field_type <> 'text';
