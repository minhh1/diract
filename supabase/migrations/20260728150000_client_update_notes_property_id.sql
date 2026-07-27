-- A matter with 2+ linked properties (project_properties junction) now
-- shows one row/card per property on a Client Update Page. A note added
-- from one of those specific rows should be scoped to that property, not
-- lumped in with every other property's notes under the same matter --
-- this lets it be tagged that way. NULL means "the whole matter" (the
-- default for every note added before this existed, and for any note on a
-- single-property matter, which has nothing to disambiguate) -- those
-- still show on every one of a matter's split rows, alongside whichever
-- notes are specific to that particular property.
ALTER TABLE client_update_page_notes ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS client_update_page_notes_property_id_idx ON client_update_page_notes(property_id) WHERE property_id IS NOT NULL;
