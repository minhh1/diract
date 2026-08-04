SET request.jwt.claim.role = 'service_role';

-- Geocoded coordinates for the Quick Glance property-developer map widget
-- (see app/api/geocode/route.ts, components/dashboard/quickGlance/
-- PropertyDeveloperQuickGlance.tsx). Real columns, not custom fields -- this
-- is map infrastructure derived from street_address/suburb/state/postcode,
-- not per-company business data, so it belongs alongside those native
-- address columns. Nullable/no default: populated lazily, one-time per
-- property, the first time Quick Glance needs a pin for it.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lng numeric;
