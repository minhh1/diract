-- user_gmail_tokens RLS is `user_id = auth.uid()` — correctly locks down
-- access_token/refresh_token so no client can read a colleague's OAuth
-- credentials. But that also means the browser client can never see WHO
-- ELSE in the company is connected, breaking every "pick from connected
-- accounts" picker (source-of-truth emails, archive accounts, "shared
-- with" counts on the Gmail sync admin tab).
--
-- Fix: a narrow view exposing only user_id + email (never the tokens),
-- pre-scoped to the caller's active company. Views run with the owner's
-- privileges by default (Postgres, no security_invoker set), so this
-- safely bypasses the base table's RLS while the WHERE clause below does
-- the actual scoping instead.
CREATE OR REPLACE VIEW company_gmail_connections AS
SELECT ugt.user_id, ugt.email, cm.company_id
FROM user_gmail_tokens ugt
JOIN company_memberships cm ON cm.user_id = ugt.user_id
WHERE cm.company_id = active_company_id();

GRANT SELECT ON company_gmail_connections TO authenticated;
