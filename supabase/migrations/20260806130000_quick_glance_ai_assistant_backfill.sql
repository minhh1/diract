SET request.jwt.claim.role = 'service_role';

-- The templateless-company default in the original company_quick_glance_layout
-- backfill (20260805120000_company_quick_glance_layout.sql) was an empty
-- '[]'::jsonb row -- QuickGlanceDashboard.tsx used to swap in a separate
-- full-page onboarding screen for that case instead. Now that its AI
-- assistant is an ordinary ai_assistant bespoke widget in the same
-- customizable canvas (see lib/dashboardWidgets/defaultQuickGlanceLayout.ts's
-- templateless default), any company that already got that empty-array row
-- needs the same widgets backfilled here, or it'd land on a genuinely blank
-- canvas instead. Scoped to companies that (a) aren't one of the two known
-- types with their own purpose-built layout, (b) haven't installed a real
-- marketplace template (is_from_template), and (c) still have a literally
-- empty widgets array -- so this never overwrites anything a member has
-- actually customized since the original backfill ran.
DO $$
DECLARE
  v_company record;
  v_widgets jsonb;
BEGIN
  FOR v_company IN
    SELECT c.id
    FROM companies c
    JOIN company_quick_glance_layout l ON l.company_id = c.id
    WHERE (c.company_type IS NULL OR c.company_type NOT IN ('Law Firm', 'Property Developer'))
      AND jsonb_array_length(l.widgets) = 0
      AND NOT EXISTS (
        SELECT 1 FROM company_tables t
        WHERE t.company_id = c.id AND t.is_from_template = true AND t.deleted_at IS NULL
      )
  LOOP
    v_widgets := jsonb_build_array(
      jsonb_build_object(
        'kind', 'bespoke', 'id', gen_random_uuid(), 'type', 'setup_checklist',
        'layout', jsonb_build_object('x', 0, 'y', 0, 'w', 12, 'h', 3), 'config', '{}'::jsonb
      ),
      jsonb_build_object(
        'kind', 'bespoke', 'id', gen_random_uuid(), 'type', 'ai_assistant',
        'layout', jsonb_build_object('x', 0, 'y', 3, 'w', 6, 'h', 12), 'config', '{}'::jsonb
      )
    );

    UPDATE company_quick_glance_layout SET widgets = v_widgets, updated_at = now() WHERE company_id = v_company.id;
  END LOOP;
END $$;
