-- Column configuration can now differ per top-level group -- a group_id
-- (nullable) scopes each field row. NULL = the "Ungrouped" bucket's field
-- set. A real top-level group always gets its own explicit rows (seeded by
-- copying another group's fields at creation time, see the groups POST
-- route) rather than silently falling back to a shared default -- avoids
-- the surprising "first customization suddenly hides everything else"
-- behaviour a fallback model would have. Subgroups don't get their own
-- scope; they always show their parent top-level group's fields.
ALTER TABLE client_update_page_fields ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES client_update_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS client_update_page_fields_group_id_idx ON client_update_page_fields(group_id);
