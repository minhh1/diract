-- "Trial mode" for the template marketplace: "Try it" spins up a brand-new,
-- fully isolated sandbox company (companies.company_type = 'trial_sandbox' --
-- an existing free-text, no-enforced-relationship column, see
-- components/admin/AdminTeamsTab.tsx's comment on it), installs the chosen
-- template into it with dashboards + a few sample records, and switches the
-- user into it. Deliberately NOT a flag on an install into the user's real
-- company: `entities`/`projects`/`tasks`/`company_custom_fields` all have
-- ON DELETE NO ACTION back to companies (confirmed live), so a real company
-- can never be safely torn down wholesale -- a throwaway sandbox company
-- can, without ever touching real data.
--
-- Ending a trial does NOT hard-delete the sandbox company -- companies.status
-- only accepts 'pending'/'active'/'suspended' (see companies_status_check),
-- and this codebase's own convention everywhere else (schema_soft_delete.sql,
-- Trash, uninstall_company_template) is to never truly destroy data. Instead:
-- membership is revoked and status flips to 'suspended', matching a value
-- that already exists rather than widening the CHECK constraint.

-- ── seed_template_trial_sample_data ─────────────────────────────────
-- Populates ~4 sample records per table THIS install just created (never
-- touches a 'used_existing' table -- though for a trial sandbox company
-- every table is always 'created', since the company is brand new).
-- Ledger tables (is_ledger = true, e.g. Law Firm's Trust Transactions) are
-- skipped entirely -- guard_ledger_records() (company_table_ledger.sql)
-- throws LEDGER_RPC_ONLY on any insert that doesn't go through
-- insert_ledger_record(), which would abort this whole function.
-- Auto-numbered fields get a cosmetic placeholder, NOT a real call to
-- next_field_sequence() -- that sequence is monotonic and never rewinds, so
-- calling it here would permanently burn real numbers a "kept" trial would
-- otherwise want to start fresh at.
CREATE OR REPLACE FUNCTION seed_template_trial_sample_data(p_company_id uuid, p_template_id uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row_count CONSTANT int := 4;
  v_map RECORD;
  v_fld RECORD;
  v_i int;
  v_record_id uuid;
  v_a numeric;
  v_b numeric;
  v_result numeric;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS tmp_trial_sample_records (table_id uuid, idx int, record_id uuid) ON COMMIT DROP;
  TRUNCATE tmp_trial_sample_records;

  -- Pass A: records + raw (non-relation, non-formula) values.
  FOR v_map IN
    SELECT ctm.installed_company_table_id AS table_id
    FROM company_template_table_map ctm
    JOIN company_tables ct ON ct.id = ctm.installed_company_table_id
    WHERE ctm.company_id = p_company_id AND ctm.template_id = p_template_id
      AND ctm.resolution = 'created' AND ct.is_ledger = false
  LOOP
    FOR v_i IN 1..v_row_count LOOP
      INSERT INTO company_table_records (company_id, table_id, created_by)
        VALUES (p_company_id, v_map.table_id, p_actor)
        RETURNING id INTO v_record_id;
      INSERT INTO tmp_trial_sample_records (table_id, idx, record_id) VALUES (v_map.table_id, v_i, v_record_id);

      FOR v_fld IN SELECT * FROM company_table_fields WHERE table_id = v_map.table_id AND deleted_at IS NULL LOOP
        IF v_fld.field_type IN ('table_relation', 'property', 'entity', 'project', 'link', 'abn', 'acn') THEN
          CONTINUE; -- relations handled in Pass B (or, for entity/project/property, never -- see Pass B's comment); abn/acn left blank rather than showing an invalid-looking fake checksum
        ELSIF v_fld.formula_type IS NOT NULL THEN
          CONTINUE; -- computed in Pass C (sum_related) / Pass D (multiply/add/percentage_of)
        ELSIF v_fld.auto_number_prefix IS NOT NULL THEN
          INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
            VALUES (p_company_id, v_map.table_id, v_record_id, v_fld.id, '(Sample ' || v_i || ')');
        ELSIF v_fld.field_type IN ('number', 'currency') THEN
          INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_number)
            VALUES (p_company_id, v_map.table_id, v_record_id, v_fld.id, v_i * 250);
        ELSIF v_fld.field_type = 'date' THEN
          INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_date)
            VALUES (p_company_id, v_map.table_id, v_record_id, v_fld.id, CURRENT_DATE - (v_i * 3));
        ELSIF v_fld.field_type = 'boolean' THEN
          INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_boolean)
            VALUES (p_company_id, v_map.table_id, v_record_id, v_fld.id, (v_i % 2 = 0));
        ELSIF v_fld.field_type = 'select' AND v_fld.select_options IS NOT NULL AND jsonb_array_length(v_fld.select_options) > 0 THEN
          INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
            VALUES (p_company_id, v_map.table_id, v_record_id, v_fld.id, v_fld.select_options ->> ((v_i - 1) % jsonb_array_length(v_fld.select_options)));
        ELSIF v_fld.field_type = 'email' THEN
          INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
            VALUES (p_company_id, v_map.table_id, v_record_id, v_fld.id, 'sample' || v_i || '@example.com');
        ELSIF v_fld.field_type = 'url' THEN
          INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
            VALUES (p_company_id, v_map.table_id, v_record_id, v_fld.id, 'https://example.com/sample-' || v_i);
        ELSE
          INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
            VALUES (p_company_id, v_map.table_id, v_record_id, v_fld.id, 'Sample ' || v_fld.label || ' ' || v_i);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Pass B: link relation fields between SIBLING tables created in this same
  -- install (row i of table A -> row i of table B) -- safe only because
  -- linked_table_id is exclusively a custom-table-to-custom-table relation;
  -- entity/project/property relations use linked_system_table instead and
  -- always leave linked_table_id null, so this can never link a sample row
  -- to a real entities/projects/properties row.
  FOR v_fld IN
    SELECT ctf.* FROM company_table_fields ctf
    JOIN company_template_table_map ctm ON ctm.installed_company_table_id = ctf.table_id
    WHERE ctm.company_id = p_company_id AND ctm.template_id = p_template_id AND ctm.resolution = 'created'
      AND ctf.deleted_at IS NULL AND ctf.linked_table_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM company_template_table_map ctm2
        WHERE ctm2.company_id = p_company_id AND ctm2.template_id = p_template_id
          AND ctm2.installed_company_table_id = ctf.linked_table_id AND ctm2.resolution = 'created'
      )
  LOOP
    FOR v_i IN 1..v_row_count LOOP
      SELECT record_id INTO v_record_id FROM tmp_trial_sample_records WHERE table_id = v_fld.table_id AND idx = v_i;
      IF v_record_id IS NULL THEN CONTINUE; END IF;
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_record_id)
        SELECT p_company_id, v_fld.table_id, v_record_id, v_fld.id, r.record_id
        FROM tmp_trial_sample_records r WHERE r.table_id = v_fld.linked_table_id AND r.idx = v_i;
    END LOOP;
  END LOOP;

  -- Pass C: sum_related rollups, now that Pass B populated the relation
  -- links a rollup reads (formula_relation_field_id lives on the RELATED
  -- table and points back to this one; formula_field_a_id is the related
  -- table's own field being summed -- see install_company_template's Pass 3).
  FOR v_fld IN
    SELECT ctf.* FROM company_table_fields ctf
    JOIN company_template_table_map ctm ON ctm.installed_company_table_id = ctf.table_id
    WHERE ctm.company_id = p_company_id AND ctm.template_id = p_template_id AND ctm.resolution = 'created'
      AND ctf.deleted_at IS NULL AND ctf.formula_type = 'sum_related'
  LOOP
    FOR v_i IN 1..v_row_count LOOP
      SELECT record_id INTO v_record_id FROM tmp_trial_sample_records WHERE table_id = v_fld.table_id AND idx = v_i;
      IF v_record_id IS NULL THEN CONTINUE; END IF;
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_number)
        SELECT p_company_id, v_fld.table_id, v_record_id, v_fld.id, COALESCE(SUM(av.value_number), 0)
        FROM company_table_values relv
        JOIN company_table_values av ON av.record_id = relv.record_id AND av.field_id = v_fld.formula_field_a_id
        WHERE relv.field_id = v_fld.formula_relation_field_id AND relv.value_record_id = v_record_id;
    END LOOP;
  END LOOP;

  -- Pass D: same-row multiply/add/percentage_of, in display_order so a
  -- formula chained off another formula (e.g. total_inc_gst = subtotal + gst)
  -- sees the earlier one's just-inserted result -- mirrors
  -- lib/services/customTableService.ts's computeFormulaFields semantics
  -- exactly (add treats a missing side as 0; multiply/percentage_of require
  -- their inputs and are skipped -- left blank -- otherwise).
  FOR v_map IN
    SELECT DISTINCT installed_company_table_id AS table_id FROM company_template_table_map
    WHERE company_id = p_company_id AND template_id = p_template_id AND resolution = 'created'
  LOOP
    FOR v_i IN 1..v_row_count LOOP
      SELECT record_id INTO v_record_id FROM tmp_trial_sample_records WHERE table_id = v_map.table_id AND idx = v_i;
      IF v_record_id IS NULL THEN CONTINUE; END IF;

      FOR v_fld IN
        SELECT * FROM company_table_fields
        WHERE table_id = v_map.table_id AND deleted_at IS NULL AND formula_type IN ('multiply', 'add', 'percentage_of')
        ORDER BY display_order
      LOOP
        v_a := NULL; v_b := NULL; v_result := NULL;
        SELECT value_number INTO v_a FROM company_table_values WHERE record_id = v_record_id AND field_id = v_fld.formula_field_a_id;

        IF v_fld.formula_type = 'add' THEN
          SELECT value_number INTO v_b FROM company_table_values WHERE record_id = v_record_id AND field_id = v_fld.formula_field_b_id;
          v_result := COALESCE(v_a, 0) + COALESCE(v_b, 0);
        ELSIF v_fld.formula_type = 'multiply' THEN
          IF v_a IS NULL THEN CONTINUE; END IF;
          SELECT value_number INTO v_b FROM company_table_values WHERE record_id = v_record_id AND field_id = v_fld.formula_field_b_id;
          IF v_b IS NULL THEN CONTINUE; END IF;
          v_result := v_a * v_b;
        ELSE -- percentage_of
          IF v_a IS NULL THEN CONTINUE; END IF;
          v_result := v_a * (COALESCE(v_fld.formula_percent, 0) / 100);
        END IF;

        INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_number)
          VALUES (p_company_id, v_map.table_id, v_record_id, v_fld.id, v_result);
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

-- ── create_trial_sandbox_company ────────────────────────────────────
-- Creates the sandbox company + this user's sole membership + the template
-- install (dashboards always on -- a trial's whole point is showing them
-- off) + sample data, all in one transaction so a failure partway through
-- never leaves an orphaned, member-less company behind.
CREATE OR REPLACE FUNCTION create_trial_sandbox_company(p_template_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_template_name text;
  v_company_id uuid;
  v_install_result jsonb;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT name INTO v_template_name FROM template_definitions WHERE id = p_template_id;
  IF v_template_name IS NULL THEN
    RAISE EXCEPTION 'template not found';
  END IF;

  INSERT INTO companies (name, status, company_type)
    VALUES ('Trial: ' || v_template_name, 'active', 'trial_sandbox')
    RETURNING id INTO v_company_id;

  INSERT INTO company_memberships (company_id, user_id, role)
    VALUES (v_company_id, p_actor, 'company_admin');

  -- Named args: install_company_template has two overloads on file (an
  -- older 3-arg one predating p_install_dashboards) -- naming pins this to
  -- the 4-arg version unambiguously.
  v_install_result := install_company_template(
    p_company_id := v_company_id,
    p_template_id := p_template_id,
    p_resolutions := '{}'::jsonb,
    p_install_dashboards := true
  );

  PERFORM seed_template_trial_sample_data(v_company_id, p_template_id, p_actor);

  RETURN jsonb_build_object('company_id', v_company_id, 'install', v_install_result);
END;
$$;

-- ── close_trial_sandbox_company ─────────────────────────────────────
-- Soft-close, not delete -- see the file header. company_type = 'trial_sandbox'
-- is checked so this can never be pointed at a real company by mistake.
CREATE OR REPLACE FUNCTION close_trial_sandbox_company(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_company_type text;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = p_company_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  SELECT company_type INTO v_company_type FROM companies WHERE id = p_company_id;
  IF v_company_type IS DISTINCT FROM 'trial_sandbox' THEN
    RAISE EXCEPTION 'not a trial sandbox company';
  END IF;

  DELETE FROM company_memberships WHERE company_id = p_company_id;
  UPDATE companies SET status = 'suspended' WHERE id = p_company_id;

  RETURN jsonb_build_object('status', 'closed');
END;
$$;

-- ── promote_trial_sandbox_company ───────────────────────────────────
-- "Keep it": just stops treating the sandbox as a trial -- it was always a
-- real, separate company, so there's no data to migrate. The auto-generated
-- "(Sample N)" placeholder rows are left for the admin to delete themselves
-- via the normal record UI if they don't want them, same as any other
-- record.
CREATE OR REPLACE FUNCTION promote_trial_sandbox_company(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_company_type text;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = p_company_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  SELECT company_type INTO v_company_type FROM companies WHERE id = p_company_id;
  IF v_company_type IS DISTINCT FROM 'trial_sandbox' THEN
    RAISE EXCEPTION 'not a trial sandbox company';
  END IF;

  UPDATE companies SET company_type = NULL WHERE id = p_company_id;

  RETURN jsonb_build_object('status', 'promoted');
END;
$$;
