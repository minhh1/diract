-- Purchase Price moves to being a matter/project-level field instead of a
-- property-level one -- requested via Client Update Pages, where editing it
-- previously required the matter to have a linked property at all (a real
-- gap: several Niksen matters had none). properties.purchase_price is
-- intentionally left in place (not dropped) -- NewPropertyModal.tsx,
-- RecordCreatorField.tsx, and the CSV property-import pipeline
-- (lib/import/*) all still write a purchase price at property-creation
-- time, often before any project is linked to it, so there's nowhere on
-- projects to write it at that moment; migrating those flows to a
-- project-scoped price is a separate, larger product decision than this
-- migration. This backfills every already-linked project from its
-- property's existing price as a one-time snapshot; going forward the two
-- can drift (projects.purchase_price is the one Client Update Pages reads/
-- writes from here on).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS purchase_price numeric;

UPDATE projects p
SET purchase_price = pr.purchase_price
FROM properties pr
WHERE p.property_id = pr.id
  AND pr.purchase_price IS NOT NULL
  AND p.purchase_price IS NULL;
