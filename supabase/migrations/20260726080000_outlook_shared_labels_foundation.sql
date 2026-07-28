-- Phase 1 foundation for Outlook parity on Shared Labels (see gmail_*
-- columns on companies / user_gmail_tokens / project_gmail_labels for the
-- Gmail equivalent this mirrors). No sync logic yet -- this migration only
-- gets a company to "admin can connect an Outlook account and we hold
-- working, auto-refreshing tokens for it."
--
-- Label analog decision: Outlook has no direct equivalent to a Gmail label
-- (a non-exclusive tag). We use two Outlook primitives together instead of
-- forcing one to do both jobs:
--   - a FOLDER (outlook_parent_folder / outlook_archive_folder) for the
--     top-level bucket Gmail's parent label provides today
--   - a CATEGORY (project_outlook_labels.category_name) applied per-message
--     for the actual matter/sublabel + [CODE], since categories -- unlike
--     folders -- are non-exclusive and don't require moving the message
-- The category name therefore only needs the sublabel + code, not the
-- parent/company name -- the folder already supplies that context.

-- ── companies: Outlook label settings, parallel to the gmail_* columns ────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS mail_provider text CHECK (mail_provider IN ('gmail', 'outlook')),
  ADD COLUMN IF NOT EXISTS outlook_parent_folder text,
  ADD COLUMN IF NOT EXISTS outlook_archive_folder text,
  ADD COLUMN IF NOT EXISTS outlook_label_tokens jsonb NOT NULL DEFAULT '["project_name"]'::jsonb,
  ADD COLUMN IF NOT EXISTS outlook_sublabel_separator text NOT NULL DEFAULT ' — ',
  ADD COLUMN IF NOT EXISTS outlook_archive_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS outlook_auto_archive_on_close boolean NOT NULL DEFAULT false;

-- Companies already mid-flight on Gmail are unambiguously 'gmail' -- leave
-- everyone else NULL until an admin actually connects a provider.
UPDATE companies
SET mail_provider = 'gmail'
WHERE mail_provider IS NULL
  AND gmail_parent_label IS NOT NULL;

-- ── user_outlook_tokens: per-user Microsoft Graph OAuth tokens ───────────
-- Same shape/semantics as user_gmail_tokens: one connected mailbox per
-- platform user (not per-company), RLS locked to the owning user so the
-- browser can never read a colleague's tokens. delta_link/subscription_*
-- are unused until the sync engine (Phase 3) but included now so that
-- phase doesn't need a second migration.
CREATE TABLE IF NOT EXISTS user_outlook_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  delta_link text,
  subscription_id text,
  subscription_expiry timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_outlook_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_outlook_tokens_owner ON user_outlook_tokens;
CREATE POLICY user_outlook_tokens_owner ON user_outlook_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── company_outlook_connections: safe "who's connected" view ─────────────
-- Same trick as company_gmail_connections_view.sql -- user_outlook_tokens'
-- RLS is user_id = auth.uid(), which would otherwise make it impossible
-- for the browser to list *other* connected members (source-of-truth
-- pickers, archive-mailbox pickers, admin "shared with" counts). Views run
-- with the owner's privileges by default, so this safely bypasses the base
-- table's RLS while the WHERE clause below does the actual scoping.
CREATE OR REPLACE VIEW company_outlook_connections AS
SELECT uot.user_id, uot.email, cm.company_id
FROM user_outlook_tokens uot
JOIN company_memberships cm ON cm.user_id = uot.user_id
WHERE cm.company_id = active_company_id();

GRANT SELECT ON company_outlook_connections TO authenticated;

-- ── project_outlook_labels: label (category) ↔ project link ──────────────
-- Parallel to project_gmail_labels, simplified: there's no full label path
-- to store since the folder is a company-wide constant, not per-label --
-- just the category name and its [CODE].
CREATE TABLE IF NOT EXISTS project_outlook_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  label_code text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  removed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_outlook_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_outlook_labels_company_members ON project_outlook_labels;
CREATE POLICY project_outlook_labels_company_members ON project_outlook_labels
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
