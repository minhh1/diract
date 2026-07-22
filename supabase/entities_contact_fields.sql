-- Generic, industry-agnostic contact fields on entities, so contacts/staff
-- imported via a marketplace template (see template_marketplace.sql) have
-- somewhere to land without inventing a parallel "contacts" table. Anything
-- more specific than this (Medicare numbers, passport details, etc.) belongs
-- in company_custom_fields for table_name='entities' instead.

ALTER TABLE entities ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS middle_name text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS mobile_phone text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS tags text[];
-- For future import/dedupe matching against a source system's own record ID
-- (e.g. a practice-management export's "Contact ID"/"External System ID").
ALTER TABLE entities ADD COLUMN IF NOT EXISTS external_ref text;
-- Lets an entity (e.g. a staff/fee-earner contact) optionally be tied to a
-- real logged-in app user, without requiring one.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS linked_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
