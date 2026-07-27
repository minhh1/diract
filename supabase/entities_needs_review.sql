-- Backs the Gmail add-on's "Create project" flow: when a required
-- entity-relation field (e.g. "Client Name") is filled in from the add-on,
-- there's no search-and-pick UI available (Google CardService can't do
-- live search), so the typed name is resolved against existing entities
-- server-side and, when the match isn't a confident single hit, a new
-- entity is created and flagged here instead of blocking project creation.
-- needs_review surfaces as an ordinary boolean column, so it's automatically
-- filterable in the existing generic table filter UI (useTableSchema);
-- review_reason is shown in the Entities page's "needs review" banner
-- (components/GenericMasterTable.tsx) so the user knows why without having
-- to guess.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS review_reason text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS entities_needs_review_idx ON entities (company_id) WHERE needs_review = true;
