-- Live testing of the kiosk lockdown (20260808200100_kiosk_rls_lockdown.sql)
-- found a real gap: signed in as a real kiosk account and queried the
-- Supabase REST API directly with its JWT. `entities` returned every
-- entity type (clients, trusts, companies), not just the intended
-- Staff-only slice, and other tables were fully open. Root cause: 30
-- policies across 9 tables (audit_logs, entities, entity_relationships,
-- entity_types, project_teams, properties, property_bills,
-- property_credentials, property_valuations -- property_credentials holds
-- actual login credentials for property utility accounts) were written as
-- an inline `(SELECT profiles.active_company_id FROM profiles WHERE
-- profiles.id = auth.uid())` subquery instead of calling the shared
-- active_company_id() function. The kiosk lockdown only rewrote the
-- function -- it never touched policies that independently re-derive the
-- same value inline, bypassing the function (and its kiosk check)
-- entirely. This migration swaps every one of those 30 inline subqueries
-- for a call to active_company_id() -- identical result for every
-- non-kiosk session (the function's own ELSE branch is that exact
-- subquery), NULL for a kiosk session, closing the gap the same way
-- 20260808200100 already closed it everywhere else.
SET request.jwt.claim.role = 'service_role';

ALTER POLICY audit_logs_delete ON audit_logs USING (company_id = active_company_id());
ALTER POLICY audit_logs_insert ON audit_logs WITH CHECK (company_id = active_company_id());
ALTER POLICY audit_logs_select ON audit_logs USING (company_id = active_company_id());
ALTER POLICY audit_logs_update ON audit_logs USING (company_id = active_company_id());

ALTER POLICY "Company entity isolation" ON entities USING (company_id = active_company_id());

ALTER POLICY entity_relationships_delete ON entity_relationships
  USING (EXISTS (SELECT 1 FROM entities e WHERE e.id = entity_relationships.parent_entity_id AND e.company_id = active_company_id()));
ALTER POLICY entity_relationships_insert ON entity_relationships
  WITH CHECK (EXISTS (SELECT 1 FROM entities e WHERE e.id = entity_relationships.parent_entity_id AND e.company_id = active_company_id()));
ALTER POLICY entity_relationships_select ON entity_relationships
  USING (EXISTS (SELECT 1 FROM entities e WHERE e.id = entity_relationships.parent_entity_id AND e.company_id = active_company_id()));
ALTER POLICY entity_relationships_update ON entity_relationships
  USING (EXISTS (SELECT 1 FROM entities e WHERE e.id = entity_relationships.parent_entity_id AND e.company_id = active_company_id()));

ALTER POLICY entity_types_delete ON entity_types USING (company_id = active_company_id());
ALTER POLICY entity_types_insert ON entity_types WITH CHECK (company_id = active_company_id());
ALTER POLICY entity_types_select ON entity_types USING (company_id = active_company_id());
ALTER POLICY entity_types_update ON entity_types USING (company_id = active_company_id());

ALTER POLICY project_teams_delete ON project_teams
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_teams.project_id AND p.company_id = active_company_id()));
ALTER POLICY project_teams_insert ON project_teams
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_teams.project_id AND p.company_id = active_company_id()));
ALTER POLICY project_teams_select ON project_teams
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_teams.project_id AND p.company_id = active_company_id()));
ALTER POLICY project_teams_update ON project_teams
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_teams.project_id AND p.company_id = active_company_id()));

ALTER POLICY "Company property isolation" ON properties USING (company_id = active_company_id());

ALTER POLICY property_bills_delete ON property_bills
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_bills.property_id AND p.company_id = active_company_id()));
ALTER POLICY property_bills_insert ON property_bills
  WITH CHECK (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_bills.property_id AND p.company_id = active_company_id()));
ALTER POLICY property_bills_select ON property_bills
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_bills.property_id AND p.company_id = active_company_id()));
ALTER POLICY property_bills_update ON property_bills
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_bills.property_id AND p.company_id = active_company_id()));

ALTER POLICY property_credentials_delete ON property_credentials
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_credentials.property_id AND p.company_id = active_company_id()));
ALTER POLICY property_credentials_insert ON property_credentials
  WITH CHECK (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_credentials.property_id AND p.company_id = active_company_id()));
ALTER POLICY property_credentials_select ON property_credentials
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_credentials.property_id AND p.company_id = active_company_id()));
ALTER POLICY property_credentials_update ON property_credentials
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_credentials.property_id AND p.company_id = active_company_id()));

ALTER POLICY property_valuations_delete ON property_valuations
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_valuations.property_id AND p.company_id = active_company_id()));
ALTER POLICY property_valuations_insert ON property_valuations
  WITH CHECK (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_valuations.property_id AND p.company_id = active_company_id()));
ALTER POLICY property_valuations_select ON property_valuations
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_valuations.property_id AND p.company_id = active_company_id()));
ALTER POLICY property_valuations_update ON property_valuations
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_valuations.property_id AND p.company_id = active_company_id()));
