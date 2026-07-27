-- Tracks an issue_precedent bot action that's paused waiting on one or more
-- configured signers to confirm they want their signature on the document
-- (see lib/ai/precedentAction.ts, lib/botEngine/handleMessage.ts). One
-- request row per issuance attempt; one signer row per person proactively
-- messaged. linked_account_id/requester_linked_account_id are NOT foreign
-- keys -- they point at a row in EITHER teams_bot_linked_accounts or
-- whatsapp_bot_linked_accounts depending on `channel`, so there's no single
-- table to reference.

CREATE TABLE IF NOT EXISTS precedent_signoff_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  precedent_id uuid NOT NULL REFERENCES precedents(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('teams', 'whatsapp')),
  requester_linked_account_id uuid NOT NULL,
  pending_issue_params jsonb NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_signoffs' CHECK (status IN ('awaiting_signoffs', 'issued', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX IF NOT EXISTS precedent_signoff_requests_company_idx ON precedent_signoff_requests(company_id);

ALTER TABLE precedent_signoff_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS precedent_signoff_requests_company_members ON precedent_signoff_requests;
CREATE POLICY precedent_signoff_requests_company_members ON precedent_signoff_requests
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS precedent_signoff_request_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES precedent_signoff_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  linked_account_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined')),
  prompt_message_id text,
  responded_at timestamptz
);

CREATE INDEX IF NOT EXISTS precedent_signoff_request_signers_request_idx ON precedent_signoff_request_signers(request_id);

ALTER TABLE precedent_signoff_request_signers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS precedent_signoff_request_signers_company_members ON precedent_signoff_request_signers;
CREATE POLICY precedent_signoff_request_signers_company_members ON precedent_signoff_request_signers
  FOR ALL
  USING (request_id IN (
    SELECT id FROM precedent_signoff_requests
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (request_id IN (
    SELECT id FROM precedent_signoff_requests
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));
