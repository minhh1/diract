SET request.jwt.claim.role = 'service_role';

-- Widens record_tabs' tab_type CHECK constraint (same drop-and-recreate as
-- 20260731210000_record_tabs_finance_model_type.sql, which explains why
-- the constraint lives here rather than in a tracked CREATE TABLE) to
-- allow 'residual_land_solver'
-- (components/dashboard/tabs/ResidualLandSolverTab.tsx).
ALTER TABLE record_tabs DROP CONSTRAINT IF EXISTS record_tabs_tab_type_check;
ALTER TABLE record_tabs ADD CONSTRAINT record_tabs_tab_type_check
  CHECK (tab_type = ANY (ARRAY['fields','sub_projects','checklist','calendar','emails','document_templates','custom_dashboard','precedents','invoice_dashboard','related_matters','finance_model','residual_land_solver']));
