-- precedent_settings.signers changes shape from an array of free-text
-- {name, position} objects (originally typed straight into Settings) to an
-- array of staff_signoffs.user_id strings (selected from a staff picker, see
-- 20260726070000_staff_signoffs.sql) -- resolved to full signoff blocks at
-- issue time. Reset rather than migrated: this feature shipped moments ago,
-- so any existing rows hold the old free-text shape, which the new code
-- would otherwise try (and fail) to look up as user_ids.
UPDATE precedent_settings SET signers = '[]'::jsonb WHERE signers IS NOT NULL AND signers != '[]'::jsonb;
