-- Two-level grouping for Client Update Pages: a top-level user-created
-- group (e.g. "Conveyancing") can itself contain user-created sub-groups
-- (e.g. "In Progress"/"Settled"/"Terminated"), navigated as a second row
-- of tabs beneath the first. Both levels use the same table -- a group
-- with parent_group_id = null is top-level; one with it set is a subgroup
-- of that group. Deliberately capped at 2 levels by convention (UI only
-- ever renders two tab rows), not enforced in the schema.
ALTER TABLE client_update_groups ADD COLUMN IF NOT EXISTS parent_group_id uuid REFERENCES client_update_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS client_update_groups_parent_group_id_idx ON client_update_groups(parent_group_id);

-- Per-page date display preference -- edited from the page itself (staff
-- mode), not Settings. A closed set of format tokens rather than a
-- free-form pattern string, applied client-side.
ALTER TABLE client_update_pages ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'D_MMM_YYYY';
