SET request.jwt.claim.role = 'service_role';

-- CRITICAL: registration_tokens had tokens_public_read USING (true), on a
-- table anon+authenticated both hold full table-level grants for -- meaning
-- a completely UNAUTHENTICATED request (anon key, no login at all) could
-- dump the entire table via plain REST, including the raw 64-char `token`
-- column itself (the bearer secret an invite link's security depends on).
-- Confirmed live: an anon-key-only curl with no Authorization user JWT
-- returned all 19 rows, full token strings included, across at least 2
-- different companies. All 11 currently-unused rows happen to have already
-- expired as of today, so there's no live-exploitable token to revoke right
-- now, but the design would have exposed every future invite (join a
-- company as its stated role, no account needed) to the entire internet
-- from the moment it's created until someone read this.
--
-- tokens_admin_insert/update/delete had the same bare-is_current_user_admin()
-- pattern already fixed elsewhere this pass -- any admin of ANY company
-- could mint, revoke, or repoint an invite token for ANY OTHER company
-- (app/(app)/dashboard/admin/page.tsx's handleRevokeToken updates by bare
-- token id with no company_id check of its own -- the RLS was the only
-- thing standing between "admin of Company A" and "revoke/mark-used an
-- invite belonging to Company B").
--
-- tokens_public_read wasn't pure accident, though -- it's genuinely
-- dual-purposed: (app/(app)/dashboard/admin/page.tsx's own token LIST for
-- admins of their own company) reuses the same policy as (an unauthenticated
-- invitee on app/(marketing)/login/page.tsx / mobile/src/lib/inviteJoin.ts
-- previewing ONE invite by the exact token string from their link, before
-- they have any session at all). RLS can't express "only if you already
-- know the exact value" -- once a row is SELECT-visible, it's visible
-- regardless of what WHERE filter the querying client happens to send, so
-- there's no way to keep this a table-level RLS policy at all without
-- re-opening the exact same enumeration hole. Splitting into two:
--
--   1. A real company-scoped SELECT policy for the admin listing use case.
--   2. A STABLE SECURITY DEFINER RPC for the pre-auth preview use case,
--      which requires the caller to already possess the token value as a
--      function argument (not a filterable/listable column via PostgREST),
--      and only returns the minimal preview fields -- never the token
--      itself back out (the client already has it).
CREATE OR REPLACE FUNCTION validate_registration_token(p_token text)
RETURNS TABLE(
  id uuid, company_id uuid, company_name text, note text,
  expires_at timestamptz, used_at timestamptz, default_team_id uuid, role text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rt.id, rt.company_id, c.name, rt.note, rt.expires_at, rt.used_at, rt.default_team_id, rt.role
  FROM registration_tokens rt
  LEFT JOIN companies c ON c.id = rt.company_id
  WHERE rt.token = p_token;
$$;
GRANT EXECUTE ON FUNCTION validate_registration_token(text) TO anon, authenticated;

DROP POLICY IF EXISTS tokens_public_read ON registration_tokens;
CREATE POLICY tokens_admin_select ON registration_tokens
  FOR SELECT
  USING (company_id = active_company_id() AND is_current_user_admin());

DROP POLICY IF EXISTS tokens_admin_insert ON registration_tokens;
CREATE POLICY tokens_admin_insert ON registration_tokens
  FOR INSERT
  WITH CHECK (company_id = active_company_id() AND is_current_user_admin());

DROP POLICY IF EXISTS tokens_admin_update ON registration_tokens;
CREATE POLICY tokens_admin_update ON registration_tokens
  FOR UPDATE
  USING (company_id = active_company_id() AND is_current_user_admin())
  WITH CHECK (company_id = active_company_id() AND is_current_user_admin());

DROP POLICY IF EXISTS tokens_admin_delete ON registration_tokens;
CREATE POLICY tokens_admin_delete ON registration_tokens
  FOR DELETE
  USING (company_id = active_company_id() AND is_current_user_admin());
