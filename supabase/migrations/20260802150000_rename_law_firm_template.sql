-- Renames the existing "Law Firm" marketplace template to "Australia Law
-- Firm Seed Template" -- slug ('law-firm') stays stable since it's
-- referenced throughout the codebase/SQL; only the display name changes.
-- Mirrors the name now seeded fresh by template_law_firm_seed.sql, whose
-- own INSERT is a no-op here (ON CONFLICT DO NOTHING) since the row
-- already exists.
UPDATE template_definitions
SET name = 'Australia Law Firm Seed Template'
WHERE slug = 'law-firm' AND name <> 'Australia Law Firm Seed Template';
