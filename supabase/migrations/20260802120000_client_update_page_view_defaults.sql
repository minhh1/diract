SET request.jwt.claim.role = 'service_role';

-- Company-shared default sort/filter for a board's groups.
--
-- Until now these two lived ONLY in each viewer's own browser
-- localStorage (components/clientUpdatePages/MatterBoard.tsx's
-- filtersPrefKey/sortPrefKey), which has two consequences: a colleague
-- opening the same board sees it unsorted and unfiltered, and a public /
-- demo viewer -- who has no localStorage for it at all -- can never
-- inherit the view the admin actually works in. Status was already
-- different: it has a shared server-side default on the group
-- (default_status_names), and this table gives sort and filter the same
-- treatment.
--
-- Precedence, deliberately: a viewer's own localStorage choice still wins
-- when present, so saving a company default never yanks the board out
-- from under someone mid-session. The default is what you get when you
-- have no choice of your own -- which is every new user, and every
-- anonymous public viewer.
--
-- group_id is TEXT, not a FK: MatterBoard addresses the ungrouped view by
-- the sentinel '__ungrouped__' (never a real client_update_groups row),
-- and a board with no groups at all is the common case.
CREATE TABLE IF NOT EXISTS client_update_page_view_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES client_update_pages(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  group_id text NOT NULL,
  -- [{ fieldId, values: [...] }] and [{ fieldId, dir: 'asc'|'desc' }] --
  -- exactly the shapes MatterBoard already reads/writes to localStorage,
  -- so no translation layer is needed on either side.
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, group_id)
);

CREATE INDEX IF NOT EXISTS client_update_page_view_defaults_page_idx
  ON client_update_page_view_defaults (page_id);

ALTER TABLE client_update_page_view_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_update_page_view_defaults_company ON client_update_page_view_defaults;
CREATE POLICY client_update_page_view_defaults_company ON client_update_page_view_defaults
  FOR ALL USING (company_id = active_company_id());
