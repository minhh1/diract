-- ── 1. Tables with RLS enabled but ZERO policies (blocks all client access) ──

-- teams has no company_id column (not tenant-scoped in this schema) — restore
-- the same globally-visible-read / admin-only-write behavior the app was
-- already built around (see components/admin/AdminTeamsTab.tsx).
CREATE POLICY teams_select ON teams FOR SELECT USING (true);
CREATE POLICY teams_write ON teams FOR ALL USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- task_statuses is global reference data (no company_id) — read-only for
-- everyone, admin-only to manage.
CREATE POLICY task_statuses_select ON task_statuses FOR SELECT USING (true);
CREATE POLICY task_statuses_write ON task_statuses FOR ALL USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- entity_officeholders — scope via entities.company_id, matching the existing
-- entity_relationships policy pattern.
CREATE POLICY entity_officeholders_company ON entity_officeholders FOR ALL
  USING (EXISTS (SELECT 1 FROM entities e WHERE e.id = entity_officeholders.entity_id AND e.company_id = active_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM entities e WHERE e.id = entity_officeholders.entity_id AND e.company_id = active_company_id()));

-- project_properties — scope via projects.company_id.
CREATE POLICY project_properties_company ON project_properties FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_properties.project_id AND p.company_id = active_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_properties.project_id AND p.company_id = active_company_id()));

-- ── 2. Tables with dangerously permissive qual=true (cross-tenant exposure) ──

-- checklist_template_items — any authenticated user could read/write ANY
-- company's template items. Scope via checklist_templates.company_id.
DROP POLICY IF EXISTS template_items_all ON checklist_template_items;
CREATE POLICY template_items_company ON checklist_template_items FOR ALL
  USING (EXISTS (SELECT 1 FROM checklist_templates t WHERE t.id = checklist_template_items.template_id AND t.company_id = active_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM checklist_templates t WHERE t.id = checklist_template_items.template_id AND t.company_id = active_company_id()));

-- team_members — any authenticated user could add/remove ANYONE from ANY
-- team. Keep read open (matches teams' visibility) but restrict writes to admins.
DROP POLICY IF EXISTS team_members_company ON team_members;
CREATE POLICY team_members_select ON team_members FOR SELECT USING (true);
CREATE POLICY team_members_write ON team_members FOR ALL USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- ── 3. Tables with RLS disabled entirely ──

ALTER TABLE company_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_permissions_select ON company_permissions FOR SELECT USING (profile_id = auth.uid() OR is_current_user_admin());
CREATE POLICY company_permissions_write ON company_permissions FOR ALL USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

ALTER TABLE gmail_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY gmail_sync_jobs_company ON gmail_sync_jobs FOR ALL USING (company_id = active_company_id()) WITH CHECK (company_id = active_company_id());

-- platform_settings: global config, no company/user reference, no code
-- references it client-side. Lock it down entirely — service role (which
-- bypasses RLS) is the only intended reader/writer.
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE project_email_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_email_subjects_company ON project_email_subjects FOR ALL USING (company_id = active_company_id()) WITH CHECK (company_id = active_company_id());

ALTER TABLE public_task_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_task_pages_company ON public_task_pages FOR ALL USING (company_id = active_company_id()) WITH CHECK (company_id = active_company_id());
