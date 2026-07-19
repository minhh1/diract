-- Optional fixed display size for a virtual computer's Guacamole session.
-- NULL (the default) means auto-detect from the connecting browser's own
-- screen size at connect time instead of a fixed preset -- see
-- lib/guacamole.ts and app/api/virtual-computers/[id]/session/route.ts.
ALTER TABLE virtual_computers ADD COLUMN IF NOT EXISTS resolution_width integer;
ALTER TABLE virtual_computers ADD COLUMN IF NOT EXISTS resolution_height integer;
