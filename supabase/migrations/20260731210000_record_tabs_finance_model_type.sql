SET request.jwt.claim.role = 'service_role';

-- Widens record_tabs' tab_type CHECK constraint (created directly against
-- this database -- confirmed via `supabase db query --linked`, not present
-- in any tracked migration, same situation as company_custom_fields_field_type_check
-- hit earlier) to allow 'finance_model' (components/dashboard/tabs/FinanceModelTab.tsx).
ALTER TABLE record_tabs DROP CONSTRAINT IF EXISTS record_tabs_tab_type_check;
ALTER TABLE record_tabs ADD CONSTRAINT record_tabs_tab_type_check
  CHECK (tab_type = ANY (ARRAY['fields','sub_projects','checklist','calendar','emails','document_templates','custom_dashboard','precedents','invoice_dashboard','related_matters','finance_model']));
