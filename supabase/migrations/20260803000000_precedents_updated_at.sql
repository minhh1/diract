-- Tracks when a precedent's own content (name/description/body template)
-- was last prepared -- shown "slightly prominent" in both the Precedent
-- library (Settings) and the matter-level Precedent tab, so staff can spot a
-- precedent that's due for a refresh (law changes, outdated wording) at a
-- glance instead of only finding out when something goes wrong. See
-- app/api/precedents/[id]/route.ts and lib/precedents/redetectBodyTemplate.ts,
-- which set this on every edit -- no DB trigger, matching this app's existing
-- convention for company_letterheads.updated_at.
--
-- Backfilled to each row's own created_at rather than left at the moment of
-- this migration -- a plain `DEFAULT now()` would otherwise stamp every
-- existing precedent as "just prepared", which is exactly the false
-- impression this column exists to prevent.
ALTER TABLE precedents ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE precedents SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE precedents ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE precedents ALTER COLUMN updated_at SET NOT NULL;
