-- Client Update Pages: a public, PIN-gated page a firm can send to a client
-- showing a curated, grouped list of that client's matters -- mixing real
-- matter/property fields (written through to projects/properties/
-- company_custom_field_values, so edits stay in sync with the normal matter
-- dashboard) with page-only "ad hoc" fields, plus a per-matter dated note
-- log both staff and the client (unauthenticated) can post into.
--
-- Modeled directly on document_fill_pages (supabase/document_fill_pages.sql):
-- same "GENUINELY UNAUTHENTICATED" split -- the client-facing side is read
-- and written ONLY via service-role API routes (see
-- lib/clientUpdatePageGate.ts), so no anon RLS policy is needed for that
-- path. Admin management goes through normal authenticated RLS below.
--
-- Unlike document_fill_pages (opaque uuid as the URL secret), this adds a
-- real human-chosen `slug` for the "custom URL per client" requirement --
-- `id` stays the internal PK, `slug` is what's in the URL.

CREATE TABLE IF NOT EXISTS client_update_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  client_label text,
  slug text NOT NULL UNIQUE,
  access_code text,
  is_active boolean NOT NULL DEFAULT true,
  expires_at date,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_update_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_update_pages_company_members ON client_update_pages;
CREATE POLICY client_update_pages_company_members ON client_update_pages
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Named, staff-editable groupings of matters within a page (e.g. one of the
-- client's several companies) -- purely organisational, not derived from
-- anything structural, so staff can create/rename/reorder/delete freely.
CREATE TABLE IF NOT EXISTS client_update_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES client_update_pages(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS client_update_groups_page_id_idx ON client_update_groups(page_id);

ALTER TABLE client_update_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_update_groups_company_members ON client_update_groups;
CREATE POLICY client_update_groups_company_members ON client_update_groups
  FOR ALL
  USING (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));

-- Which fields a page shows. 'base'/'custom' field_key points at a real
-- projects/properties column name or a company_custom_fields.id -- values
-- for those are read/written straight through to the real record, so this
-- table never stores their values. 'adhoc' fields exist only on this page;
-- their values live in client_update_page_values.
CREATE TABLE IF NOT EXISTS client_update_page_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES client_update_pages(id) ON DELETE CASCADE,
  field_source text NOT NULL CHECK (field_source IN ('base', 'custom', 'adhoc')),
  field_key text NOT NULL,
  label text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  client_visible boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS client_update_page_fields_page_id_idx ON client_update_page_fields(page_id);

ALTER TABLE client_update_page_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_update_page_fields_company_members ON client_update_page_fields;
CREATE POLICY client_update_page_fields_company_members ON client_update_page_fields
  FOR ALL
  USING (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));

-- One row per matter placed on a page. group_id is nullable -- an
-- unassigned matter just renders under an "Ungrouped" heading.
CREATE TABLE IF NOT EXISTS client_update_page_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES client_update_pages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_id uuid REFERENCES client_update_groups(id) ON DELETE SET NULL,
  display_order int NOT NULL DEFAULT 0,
  UNIQUE (page_id, project_id)
);

CREATE INDEX IF NOT EXISTS client_update_page_items_page_id_idx ON client_update_page_items(page_id);
CREATE INDEX IF NOT EXISTS client_update_page_items_group_id_idx ON client_update_page_items(group_id);

ALTER TABLE client_update_page_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_update_page_items_company_members ON client_update_page_items;
CREATE POLICY client_update_page_items_company_members ON client_update_page_items
  FOR ALL
  USING (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));

-- Values for 'adhoc' fields only -- one per (item, field).
CREATE TABLE IF NOT EXISTS client_update_page_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES client_update_page_items(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES client_update_page_fields(id) ON DELETE CASCADE,
  value_text text,
  UNIQUE (item_id, field_id)
);

ALTER TABLE client_update_page_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_update_page_values_company_members ON client_update_page_values;
CREATE POLICY client_update_page_values_company_members ON client_update_page_values
  FOR ALL
  USING (item_id IN (
    SELECT i.id FROM client_update_page_items i
    JOIN client_update_pages p ON p.id = i.page_id
    WHERE p.company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (item_id IN (
    SELECT i.id FROM client_update_page_items i
    JOIN client_update_pages p ON p.id = i.page_id
    WHERE p.company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));

-- Per-matter dated note log -- both staff (authenticated, via the normal
-- admin UI) and the client (unauthenticated, via the public page) post
-- into this. Entries accumulate rather than overwrite, each carrying its
-- own date, so this doubles as the client's "comments" -- no separate
-- comments table.
CREATE TABLE IF NOT EXISTS client_update_page_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES client_update_page_items(id) ON DELETE CASCADE,
  note_date date NOT NULL DEFAULT CURRENT_DATE,
  body text NOT NULL,
  author_name text,
  source text NOT NULL CHECK (source IN ('staff', 'client')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_update_page_notes_item_id_idx ON client_update_page_notes(item_id);

ALTER TABLE client_update_page_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_update_page_notes_company_members ON client_update_page_notes;
CREATE POLICY client_update_page_notes_company_members ON client_update_page_notes
  FOR ALL
  USING (item_id IN (
    SELECT i.id FROM client_update_page_items i
    JOIN client_update_pages p ON p.id = i.page_id
    WHERE p.company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (item_id IN (
    SELECT i.id FROM client_update_page_items i
    JOIN client_update_pages p ON p.id = i.page_id
    WHERE p.company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));
