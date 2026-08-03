-- A single "default signature" -- unlike `signers` (up to 4, freely
-- selectable/deselectable per issuance in the Issue modal), this person is
-- always included on every issued document from this company/matter,
-- regardless of what's picked per issuance. Requested (2026-08-03): a firm
-- wants its own principal's signature on every letter without staff having
-- to remember to select them each time. Same company-default-or-per-matter-
-- override resolution as every other precedent_settings column (project_id
-- IS NULL row is the company default -- see precedent_settings.sql).
ALTER TABLE precedent_settings ADD COLUMN IF NOT EXISTS default_signer_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
