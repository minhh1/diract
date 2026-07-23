-- Microsoft OneDrive/SharePoint (Graph API) credentials, entered by each
-- company's own admin -- same BYO shape as company_teams_credentials.sql.
-- Company-wide app-only access (client-credentials OAuth grant): one Azure
-- AD app registration per company (can be, and usually will be, the exact
-- same app registration already used for the Teams sync -- this is a
-- separate table/toggle so a company can use one integration without the
-- other), with org admin consent for the Files.ReadWrite.All application
-- permission -- tenant-wide (every SharePoint/OneDrive file in the org),
-- consistent with how the existing Teams integration's permissions are
-- already tenant-wide and disclosed as such (see AdminMsTeamsTab.tsx).
--
-- credentials is a jsonb blob:
--   { "tenant_id": "...", "client_id": "...", "client_secret": "...", "site_url": "..." }
-- site_url is what the admin actually types in (e.g.
-- "https://contoso.sharepoint.com/sites/TeamName"); site_id/drive_id below
-- are resolved server-side from it (GET /sites/{hostname}:/{path} then
-- GET /sites/{site_id}/drive) and are not secret, hence separate columns
-- rather than living inside `credentials`.
--
-- API routes must NEVER select the `credentials` column into a response
-- that reaches the browser.

CREATE TABLE IF NOT EXISTS company_onedrive_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  credentials jsonb NOT NULL,
  site_id text,
  drive_id text,
  admin_consent_granted boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  last_sync_error text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_onedrive_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_onedrive_credentials_company_members ON company_onedrive_credentials;
CREATE POLICY company_onedrive_credentials_company_members ON company_onedrive_credentials
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Files synced in for RAG grounding (see supabase/functions/onedrive-sync-worker
-- and supabase/functions/ai-embed-worker) -- one row per drive item.
-- extracted_text is plain text pulled from the file (.txt/.md as-is,
-- .pdf/.docx via a text-extraction step in the sync worker) -- v1 does not
-- cover .xlsx/.pptx.
CREATE TABLE IF NOT EXISTS onedrive_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  name text NOT NULL,
  path text,
  web_url text,
  mime_type text,
  extracted_text text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, item_id)
);

ALTER TABLE onedrive_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onedrive_files_company_members ON onedrive_files;
CREATE POLICY onedrive_files_company_members ON onedrive_files
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Single delta cursor per company's configured drive -- mirrors
-- teams_sync_cursors' role but there's only ever one drive per company
-- (the one company_onedrive_credentials.drive_id points at), so no
-- resource_type/resource_id composite key is needed here.
CREATE TABLE IF NOT EXISTS onedrive_sync_cursors (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  delta_link text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE onedrive_sync_cursors ENABLE ROW LEVEL SECURITY;
-- Service-role only (Edge Function + adminClient()), no browser access needed.

-- Wire "onedrive" into the existing RAG source machinery.
ALTER TABLE ai_chat_settings ADD COLUMN IF NOT EXISTS source_onedrive boolean NOT NULL DEFAULT true;

ALTER TABLE ai_document_chunks DROP CONSTRAINT IF EXISTS ai_document_chunks_source_type_check;
ALTER TABLE ai_document_chunks ADD CONSTRAINT ai_document_chunks_source_type_check
  CHECK (source_type = ANY (ARRAY['crm_record', 'gmail', 'whatsapp', 'teams', 'onedrive']));

ALTER TABLE ai_embed_cursors DROP CONSTRAINT IF EXISTS ai_embed_cursors_source_type_check;
ALTER TABLE ai_embed_cursors ADD CONSTRAINT ai_embed_cursors_source_type_check
  CHECK (source_type = ANY (ARRAY['crm_record', 'gmail', 'whatsapp', 'teams', 'onedrive']));

-- Wire "create_file"/"update_file" into the existing bot action machinery
-- (both channels -- see lib/ai/actionTools.ts, lib/ai/actionAdvance.ts).
ALTER TABLE teams_bot_pending_actions DROP CONSTRAINT IF EXISTS teams_bot_pending_actions_action_type_check;
ALTER TABLE teams_bot_pending_actions ADD CONSTRAINT teams_bot_pending_actions_action_type_check
  CHECK (action_type = ANY (ARRAY['create_task', 'update_task', 'create_project', 'update_project', 'create_file', 'update_file']));

ALTER TABLE whatsapp_bot_pending_actions DROP CONSTRAINT IF EXISTS whatsapp_bot_pending_actions_action_type_check;
ALTER TABLE whatsapp_bot_pending_actions ADD CONSTRAINT whatsapp_bot_pending_actions_action_type_check
  CHECK (action_type = ANY (ARRAY['create_task', 'update_task', 'create_project', 'update_project', 'create_file', 'update_file']));
