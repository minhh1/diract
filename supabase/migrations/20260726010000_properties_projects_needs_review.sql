-- Extends entities_needs_review.sql's flag to properties/projects — the
-- Gmail add-on's "type a name, we'll match or create it" resolution (see
-- resolveOrCreateRelation in supabase/functions/gmail-addon/index.ts) now
-- covers all three fixed-table relation types (entity/property/project),
-- not just "Client Name" entities, so all three need somewhere to flag an
-- auto-created record for review.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS review_reason text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
CREATE INDEX IF NOT EXISTS properties_needs_review_idx ON properties (company_id) WHERE needs_review = true;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_reason text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
CREATE INDEX IF NOT EXISTS projects_needs_review_idx ON projects (company_id) WHERE needs_review = true;
