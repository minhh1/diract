-- Huynh Lawyers had one more real @huynhco.com staff member missing a
-- Staff entity: Katherine Dang (company_admin) -- see
-- 20260726065536_entities_default_rate.sql for the Minh/Jason/Hoang/Huy/
-- Tommy backfill and why this lives on entities, not profiles. The other 3
-- profiles on this company (Minh Personal1, Test User, Huynh Lawyers
-- Archive) are personal/test/utility accounts, not real staff, so they're
-- deliberately left without one -- creating a Staff entity for them would
-- add fake options to the Time & Fee Entries Staff picker for the whole firm.
-- default_rate left NULL -- not specified. Guarded by linked_profile_id
-- not already existing -- this was applied directly via the service role
-- client (supabase db push's DB auth was down at the time), so a later
-- `db push` re-running this file against a remote that has no migration-
-- history row for it must be a no-op, not a duplicate entity.
INSERT INTO entities (company_id, name, entity_type, linked_profile_id)
SELECT 'a49b484d-100d-4c3e-b3b6-69c1a18cc783', 'Dang, Katherine', 'Person', '9159b3ca-0e5d-405a-ab04-b64e58c6c88c'
WHERE NOT EXISTS (
  SELECT 1 FROM entities WHERE linked_profile_id = '9159b3ca-0e5d-405a-ab04-b64e58c6c88c'
);
