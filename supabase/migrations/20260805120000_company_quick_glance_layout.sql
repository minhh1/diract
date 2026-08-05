SET request.jwt.claim.role = 'service_role';

-- Customizable Quick Glance (see components/dashboard/QuickGlanceDashboard.tsx
-- and lib/dashboardWidgets/quickGlanceTypes.ts) -- lets any company member
-- add/move/resize widgets on the landing page, same drag/resize mechanism
-- (react-grid-layout) the generic dashboard builder already uses, but each
-- widget carries its OWN source table reference instead of inheriting one
-- shared dashboard-level table, since Quick Glance mixes several tables at
-- once (trust-transactions/time-fee-entries/invoices for a Law Firm;
-- properties/finance-model-loans/tasks for a Property Developer).
--
-- A dedicated table, not a column on `companies` -- companies_update RLS is
-- `is_member_of(id) AND is_current_user_admin()` (admin-only), and this is
-- meant to be editable by any company member, same as every other dashboard
-- in this app.
CREATE TABLE IF NOT EXISTS company_quick_glance_layout (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  widgets jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_quick_glance_layout ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_quick_glance_layout_members ON company_quick_glance_layout;
CREATE POLICY company_quick_glance_layout_members ON company_quick_glance_layout
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- ── Backfill ─────────────────────────────────────────────────────────────
-- Seeds every existing company with a default arrangement matching TODAY'S
-- hardcoded Quick Glance layout (LawFirmQuickGlance.tsx / PropertyDeveloperQuickGlance.tsx),
-- so nothing looks empty/different on first deploy -- from here on it's just
-- real, editable data. Guarded per-company (WHERE NOT EXISTS), safe to
-- re-run. A company whose type is neither known kind gets an empty-array row
-- (QuickGlanceDashboard.tsx already bounces those companies elsewhere
-- entirely, but a row still avoids a null-vs-missing distinction downstream).
DO $$
DECLARE
  v_company record;
  v_time_fee_entries_id uuid;
  v_widgets jsonb;
BEGIN
  FOR v_company IN SELECT id, company_type FROM companies LOOP
    IF EXISTS (SELECT 1 FROM company_quick_glance_layout WHERE company_id = v_company.id) THEN
      CONTINUE;
    END IF;

    IF v_company.company_type = 'Law Firm' THEN
      SELECT id INTO v_time_fee_entries_id FROM company_tables
        WHERE company_id = v_company.id AND slug = 'time-fee-entries' AND deleted_at IS NULL;

      v_widgets := jsonb_build_array(
        jsonb_build_object(
          'kind', 'bespoke', 'id', gen_random_uuid(), 'type', 'setup_checklist',
          'layout', jsonb_build_object('x', 0, 'y', 0, 'w', 12, 'h', 3), 'config', '{}'::jsonb
        ),
        jsonb_build_object(
          'kind', 'bespoke', 'id', gen_random_uuid(), 'type', 'quick_glance_stat',
          'layout', jsonb_build_object('x', 0, 'y', 3, 'w', 3, 'h', 2), 'config', jsonb_build_object('statKey', 'trust_balance')
        ),
        jsonb_build_object(
          'kind', 'bespoke', 'id', gen_random_uuid(), 'type', 'quick_glance_stat',
          'layout', jsonb_build_object('x', 0, 'y', 5, 'w', 3, 'h', 2), 'config', jsonb_build_object('statKey', 'dormant_trust_count')
        ),
        jsonb_build_object(
          'kind', 'bespoke', 'id', gen_random_uuid(), 'type', 'quick_glance_stat',
          'layout', jsonb_build_object('x', 0, 'y', 7, 'w', 3, 'h', 2), 'config', jsonb_build_object('statKey', 'matters_with_trust_count')
        ),
        jsonb_build_object(
          'kind', 'bespoke', 'id', gen_random_uuid(), 'type', 'unpaid_invoices',
          'layout', jsonb_build_object('x', 0, 'y', 9, 'w', 3, 'h', 8), 'config', '{}'::jsonb
        )
      );

      -- Time & Fees widgets only added when the table actually exists --
      -- same "degrade to nothing rather than an empty-forever widget"
      -- principle LawFirmQuickGlance.tsx's own header comment already
      -- documents for a renamed/uninstalled table.
      IF v_time_fee_entries_id IS NOT NULL THEN
        v_widgets := v_widgets || jsonb_build_array(
          jsonb_build_object(
            'kind', 'generic', 'id', gen_random_uuid(), 'sourceTableType', 'custom', 'sourceTableId', v_time_fee_entries_id,
            'layout', jsonb_build_object('x', 3, 'y', 3, 'w', 9, 'h', 8),
            'widget', jsonb_build_object('id', gen_random_uuid(), 'type', 'time_fees_report', 'config', '{}'::jsonb, 'layout', jsonb_build_object('x', 3, 'y', 3, 'w', 9, 'h', 8))
          ),
          jsonb_build_object(
            'kind', 'generic', 'id', gen_random_uuid(), 'sourceTableType', 'custom', 'sourceTableId', v_time_fee_entries_id,
            'layout', jsonb_build_object('x', 3, 'y', 11, 'w', 9, 'h', 8),
            'widget', jsonb_build_object('id', gen_random_uuid(), 'type', 'time_aging_report', 'config', jsonb_build_object('agingDays', 30), 'layout', jsonb_build_object('x', 3, 'y', 11, 'w', 9, 'h', 8))
          )
        );
      END IF;

      INSERT INTO company_quick_glance_layout (company_id, widgets) VALUES (v_company.id, v_widgets);

    ELSIF v_company.company_type = 'Property Developer' THEN
      v_widgets := jsonb_build_array(
        jsonb_build_object(
          'kind', 'bespoke', 'id', gen_random_uuid(), 'type', 'setup_checklist',
          'layout', jsonb_build_object('x', 0, 'y', 0, 'w', 12, 'h', 3), 'config', '{}'::jsonb
        ),
        jsonb_build_object(
          'kind', 'bespoke', 'id', gen_random_uuid(), 'type', 'property_projects_panel',
          'layout', jsonb_build_object('x', 0, 'y', 3, 'w', 12, 'h', 14), 'config', '{}'::jsonb
        )
      );
      INSERT INTO company_quick_glance_layout (company_id, widgets) VALUES (v_company.id, v_widgets);

    ELSE
      INSERT INTO company_quick_glance_layout (company_id, widgets) VALUES (v_company.id, '[]'::jsonb);
    END IF;
  END LOOP;
END $$;
