-- A page-scoped override for a card's displayed title, independent of the
-- real projects.name and independent of whether a "Matter" column is even
-- configured for that group (it's deletable -- see
-- 20260727150000_client_update_page_fields_per_group.sql). NULL falls back
-- to the real matter name. Deliberately not a write-through to projects.name
-- (unlike the "Matter" base field, which does write through) -- a
-- client-facing report label commonly differs from the internal matter
-- name, and renaming the real record as a side effect of relabeling a card
-- here would be surprising.
ALTER TABLE client_update_page_items ADD COLUMN IF NOT EXISTS display_name text;
