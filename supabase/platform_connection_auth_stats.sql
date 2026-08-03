-- Cross-company Supabase connection + auth-session health for the Platform
-- Health tab's "Supabase" sub-tab -- site-admin only (see site_admin.sql).
-- Two SECURITY DEFINER functions rather than a table: this is live,
-- point-in-time state (pg_stat_activity, auth.sessions), not something to
-- store and drift out of date. Both self-guard with is_site_admin() rather
-- than relying solely on the calling API route's own requireSiteAdmin()
-- check -- a SECURITY DEFINER function is directly callable by any
-- authenticated caller via PostgREST RPC, bypassing whatever the route
-- intended, and this one reads auth.sessions (every user's session
-- metadata across every company), which is not something to expose even
-- via an unauthenticated-looking RPC name.

CREATE OR REPLACE FUNCTION get_platform_connection_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_site_admin() THEN
    RAISE EXCEPTION 'Site admin access required';
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (WHERE state = 'active'),
    'idle', count(*) FILTER (WHERE state = 'idle'),
    'idleInTransaction', count(*) FILTER (WHERE state = 'idle in transaction'),
    'maxConnections', current_setting('max_connections')::int,
    'longestActiveQuerySeconds', COALESCE(EXTRACT(EPOCH FROM max(now() - query_start) FILTER (WHERE state = 'active')), 0),
    'longestIdleInTransactionSeconds', COALESCE(EXTRACT(EPOCH FROM max(now() - state_change) FILTER (WHERE state = 'idle in transaction')), 0)
  ) INTO v_result
  FROM pg_stat_activity
  WHERE datname = current_database();

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_platform_auth_token_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_site_admin() THEN
    RAISE EXCEPTION 'Site admin access required';
  END IF;

  SELECT jsonb_build_object(
    'totalActiveSessions', count(*),
    -- A session not yet hard-expired (not_after) whose last refresh is
    -- older than one access-token lifetime (3600s, Supabase's default --
    -- confirmed against this project's own magic-link expires_in) has an
    -- already-expired access token that nothing is renewing. Real incident
    -- this app hit: a local dev-server restart broke the browser's session
    -- silently, with no error surfaced anywhere -- this is the aggregate,
    -- ongoing version of that same symptom across every user's session.
    'staleSessions', count(*) FILTER (
      WHERE (not_after IS NULL OR not_after > now())
        AND COALESCE(refreshed_at, updated_at) < now() - interval '1 hour'
    ),
    'oldestUnrefreshedMinutes', COALESCE(EXTRACT(EPOCH FROM (
      now() - min(COALESCE(refreshed_at, updated_at)) FILTER (WHERE not_after IS NULL OR not_after > now())
    )) / 60, 0),
    'sessionsCreatedLast24h', count(*) FILTER (WHERE created_at > now() - interval '24 hours')
  ) INTO v_result
  FROM auth.sessions;

  RETURN v_result;
END;
$$;
