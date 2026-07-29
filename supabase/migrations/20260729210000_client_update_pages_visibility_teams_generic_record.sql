SET request.jwt.claim.role = 'service_role';

-- Generalizes Client Update Pages ("Detailed table page" in the UI, see
-- components/settings/ClientUpdatePagesTab.tsx) from 3 hardcoded base_table
-- values to any table, and adds the two things the old 3-value model never
-- had at all: a visibility mode (public link vs signed-in team-only) and
-- multi-team scoping. This is an ADDITIVE migration only -- the old
-- project_id/entity_id/custom_record_id columns, their CHECK, and their
-- partial unique indexes are left exactly as they are. A later cleanup
-- migration drops them once every code path reads/writes record_table/
-- record_id exclusively (see lib/clientUpdatePageTableResolver.ts).

-- ── Visibility ───────────────────────────────────────────────────────
-- 'public' = today's existing behaviour unchanged (slug + optional PIN
-- access_code + optional expires_at, servable with no session at all).
-- 'team' = requires a real signed-in session, restricted to the page's
-- client_update_page_teams (see below) -- no PIN, no expiry (enforced by
-- the check constraint: a team-only page can't also carry an expiry date,
-- since "expiry" is specifically the public-link-sharing risk this dates).
ALTER TABLE client_update_pages ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'team'));

ALTER TABLE client_update_pages DROP CONSTRAINT IF EXISTS client_update_pages_expiry_public_only_chk;
ALTER TABLE client_update_pages ADD CONSTRAINT client_update_pages_expiry_public_only_chk
  CHECK (visibility = 'public' OR expires_at IS NULL);

-- ── Open up base_table beyond the 3-value enum ──────────────────────
-- Same convention already used elsewhere in this codebase for "any table,
-- system or custom" (see record_tabs.record_table / company_record_tab_
-- defaults.record_table, lib/dashboardWidgets/defaultRecordDashboardTabs.ts):
-- base_table is either a system table name ('projects', 'entities',
-- 'properties', ...) or a company_tables.id cast to text. Validated in
-- application code (lib/clientUpdatePageTableResolver.ts), not a DB CHECK --
-- a fixed enum can never enumerate every company's custom tables anyway.
ALTER TABLE client_update_pages DROP CONSTRAINT IF EXISTS client_update_pages_base_table_check;

-- ── Multi-team scoping ───────────────────────────────────────────────
-- One list, two jobs (matches how Public Task Pages' single team_id
-- already implicitly does both): who can VIEW a 'team'-visibility page,
-- and who can MANAGE (add/edit items on) any page regardless of
-- visibility. Plural by design -- unlike public_task_pages.team_id and
-- company_dashboards.restricted_to_team_id, which are both single-team.
CREATE TABLE IF NOT EXISTS client_update_page_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES client_update_pages(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  UNIQUE (page_id, team_id)
);

CREATE INDEX IF NOT EXISTS client_update_page_teams_page_id_idx ON client_update_page_teams(page_id);
CREATE INDEX IF NOT EXISTS client_update_page_teams_team_id_idx ON client_update_page_teams(team_id);

ALTER TABLE client_update_page_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_update_page_teams_company_members ON client_update_page_teams;
CREATE POLICY client_update_page_teams_company_members ON client_update_page_teams
  FOR ALL
  USING (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));

-- ── Generic item pointer, replacing the 3-dedicated-FK-columns pattern ──
-- No FK on record_id -- it's polymorphic (points at projects/entities/
-- properties/company_table_records depending on record_table), same
-- no-FK-on-a-polymorphic-column tradeoff already accepted this session for
-- company_default_scopes.resource_id.
ALTER TABLE client_update_page_items ADD COLUMN IF NOT EXISTS record_table text;
ALTER TABLE client_update_page_items ADD COLUMN IF NOT EXISTS record_id uuid;

UPDATE client_update_page_items
  SET record_table = 'projects', record_id = project_id
  WHERE project_id IS NOT NULL AND record_id IS NULL;

UPDATE client_update_page_items
  SET record_table = 'entities', record_id = entity_id
  WHERE entity_id IS NOT NULL AND record_id IS NULL;

UPDATE client_update_page_items i
  SET record_table = p.source_table_id::text, record_id = i.custom_record_id
  FROM client_update_pages p
  WHERE p.id = i.page_id AND i.custom_record_id IS NOT NULL AND i.record_id IS NULL;

ALTER TABLE client_update_page_items ALTER COLUMN record_table SET NOT NULL;
ALTER TABLE client_update_page_items ALTER COLUMN record_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS client_update_page_items_page_record_uidx
  ON client_update_page_items (page_id, record_table, record_id);
