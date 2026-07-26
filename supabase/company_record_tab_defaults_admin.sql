-- Admin-facing mutations for company_record_tab_defaults (see
-- supabase/template_record_tabs.sql) -- until now nothing ever wrote to
-- that table except the template-install RPCs, so there was no way for an
-- admin to add a custom-table tab that shows up on every Matter. See
-- components/admin/AdminDefaultTabsTab.tsx.
--
-- Both explicitly check company_admin membership rather than relying on
-- is_current_user_admin() (which is scoped to the CALLER's
-- active_company_id(), not the p_company_id argument) -- same direct-check
-- style next_field_sequence() already uses. The existing
-- company_record_tab_defaults RLS policy only requires membership, not
-- admin, so this check is the only thing stopping a non-admin member from
-- calling these.

-- Adds one default tab and eagerly backfills it onto every existing Matter
-- that doesn't already have a tab for this (record_table, linked_table_id)
-- pair -- eager, not lazy, so a live record_tabs row exists immediately for
-- the marketplace's existing "Sync dashboards" button to pick up (that
-- button promotes an owner company's LIVE record-tabs into the template
-- catalog; it has nothing to promote until at least one Matter has this
-- tab materialized).
CREATE OR REPLACE FUNCTION add_company_record_tab_default(
  p_company_id uuid,
  p_record_table text,
  p_title text,
  p_icon text,
  p_linked_table_id uuid,
  p_link_field_id uuid,
  p_widgets jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_display_order int;
  v_backfilled int := 0;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships
    WHERE company_id = p_company_id AND user_id = p_actor AND role = 'company_admin'
  ) THEN
    RAISE EXCEPTION 'only a company admin can add a default tab';
  END IF;

  IF EXISTS (
    SELECT 1 FROM company_record_tab_defaults
    WHERE company_id = p_company_id AND record_table = p_record_table
      AND title = p_title AND linked_table_id = p_linked_table_id
  ) THEN
    RAISE EXCEPTION 'a default tab with this title and table already exists';
  END IF;

  SELECT COALESCE(MAX(display_order) + 1, 0) INTO v_display_order
    FROM company_record_tab_defaults WHERE company_id = p_company_id AND record_table = p_record_table;

  INSERT INTO company_record_tab_defaults (company_id, record_table, title, icon, linked_table_id, display_order, widgets)
    VALUES (p_company_id, p_record_table, p_title, p_icon, p_linked_table_id, v_display_order, p_widgets);

  WITH inserted AS (
    INSERT INTO record_tabs (company_id, record_id, record_table, title, icon, tab_type, linked_table_id, link_field_id, display_order)
    SELECT
      p_company_id, p.id, p_record_table, p_title, p_icon, 'custom_dashboard', p_linked_table_id, p_link_field_id,
      COALESCE((SELECT MAX(rt.display_order) + 1 FROM record_tabs rt WHERE rt.record_id = p.id AND rt.record_table = p_record_table), 0)
    FROM projects p
    WHERE p.company_id = p_company_id
      AND NOT EXISTS (
        SELECT 1 FROM record_tabs rt2
        WHERE rt2.record_id = p.id AND rt2.record_table = p_record_table AND rt2.linked_table_id = p_linked_table_id
      )
    RETURNING id
  )
  INSERT INTO record_tab_dashboard_widgets (tab_id, widgets)
  SELECT id, p_widgets FROM inserted;

  GET DIAGNOSTICS v_backfilled = ROW_COUNT;
  RETURN v_backfilled;
END;
$$;

-- Removes a default tab. Always stops it being added to future Matters;
-- p_retroactive additionally deletes the live tab (and, via ON DELETE
-- CASCADE, its widgets row) off every Matter that currently has it -- the
-- underlying linked-table records/values are never touched, only the
-- dashboard tab. Returns how many Matters were affected (0 when not
-- retroactive).
CREATE OR REPLACE FUNCTION remove_company_record_tab_default(
  p_company_id uuid,
  p_record_table text,
  p_title text,
  p_linked_table_id uuid,
  p_retroactive boolean
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_affected int := 0;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships
    WHERE company_id = p_company_id AND user_id = p_actor AND role = 'company_admin'
  ) THEN
    RAISE EXCEPTION 'only a company admin can remove a default tab';
  END IF;

  DELETE FROM company_record_tab_defaults
  WHERE company_id = p_company_id AND record_table = p_record_table
    AND title = p_title AND linked_table_id = p_linked_table_id;

  IF p_retroactive THEN
    DELETE FROM record_tabs
    WHERE company_id = p_company_id AND record_table = p_record_table
      AND title = p_title AND linked_table_id = p_linked_table_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
  END IF;

  RETURN v_affected;
END;
$$;
