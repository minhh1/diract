-- Property auto-link approval queue: when a project's name looks like a
-- property address (e.g. "Purchase - Units 1 & 2, 305 Auburn Road, Hawthorn
-- VIC 3122"), the property-auto-link-scan edge function (pg_cron, see
-- supabase/property_auto_link_cron.sql) proposes linking the project to
-- the matching properties row(s) -- or creating new ones if no match --
-- but nothing is written to project_properties until a company_admin
-- approves it here. Mirrors archive_requests / lead_email_assignment_
-- requests' pending/approved/rejected shape and admin-only UPDATE policy --
-- rows are only ever inserted by the scan function (service role), so
-- there's no member-insert policy, just SELECT for visibility and an
-- admin-gated UPDATE for approve/reject.
CREATE TABLE IF NOT EXISTS property_auto_link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  -- One array entry per proposed property -- more than one when the
  -- project name implies multiple (e.g. "Units 1 & 2, ..."). Each entry:
  -- { streetAddress, suburb, state, postcode, propertyId }, propertyId
  -- null meaning "create a new Property row on approval", otherwise an
  -- existing properties.id this address matched. approve/route.ts fills
  -- propertyId back in as each new property is actually created, so a
  -- retry after a partial failure doesn't create duplicates.
  proposed jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A project only ever gets ONE proposal, period -- not just one pending at
-- a time. A rejected proposal doesn't get silently re-proposed on the next
-- scan tick (which would just nag the admin with the same suggestion
-- forever); an approved one obviously shouldn't be redone either. If an
-- admin wants to reconsider a rejected one, that's a manual "add property"
-- action on the project itself, not this queue re-firing.
CREATE UNIQUE INDEX IF NOT EXISTS property_auto_link_requests_project_idx
  ON property_auto_link_requests (project_id);
CREATE INDEX IF NOT EXISTS property_auto_link_requests_company_idx ON property_auto_link_requests (company_id, status);

ALTER TABLE property_auto_link_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_auto_link_requests_select ON property_auto_link_requests
  FOR SELECT USING (company_id = active_company_id());

CREATE POLICY property_auto_link_requests_admin_update ON property_auto_link_requests
  FOR UPDATE
  USING (company_id = active_company_id() AND is_current_user_admin())
  WITH CHECK (company_id = active_company_id() AND is_current_user_admin());

-- ── dispatcher_locks: register the new scan tick's overlap guard ──
INSERT INTO dispatcher_locks (name, locked_until) VALUES
  ('property-auto-link-scan', now() - interval '1 minute')
ON CONFLICT (name) DO NOTHING;
