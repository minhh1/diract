// app/api/admin/supabase-health/route.ts
// Powers the Platform Health tab's "Supabase" sub-tab -- connection pool
// pressure + auth-session/token-refresh health, plus plain-English advice
// derived from both. Calls the RPCs through the signed-in site admin's own
// session (not the service-role client) so get_platform_connection_stats/
// get_platform_auth_token_stats's own is_site_admin() check resolves
// auth.uid() correctly -- same reasoning as
// app/api/templates/[slug]/install/route.ts's install_company_template call.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireSiteAdmin } from "@/lib/requireSiteAdmin";

interface ConnectionStats {
  total: number; active: number; idle: number; idleInTransaction: number;
  maxConnections: number; longestActiveQuerySeconds: number; longestIdleInTransactionSeconds: number;
}
interface AuthTokenStats {
  totalActiveSessions: number; staleSessions: number; oldestUnrefreshedMinutes: number; sessionsCreatedLast24h: number;
}

// Thresholds are deliberately conservative (flag early, not at the point of
// actual failure) -- this tab exists to catch problems before they become a
// user-facing incident, not to confirm one already happened.
function buildAdvice(connection: ConnectionStats, auth: AuthTokenStats): { severity: "warning" | "critical"; message: string }[] {
  const advice: { severity: "warning" | "critical"; message: string }[] = [];

  const connectionPct = connection.maxConnections ? connection.total / connection.maxConnections : 0;
  if (connectionPct >= 0.9) {
    advice.push({ severity: "critical", message: `Connections at ${connection.total}/${connection.maxConnections} (${Math.round(connectionPct * 100)}%) -- new connections may start failing. Check for a connection leak or add PgBouncer/transaction pooling.` });
  } else if (connectionPct >= 0.7) {
    advice.push({ severity: "warning", message: `Connections at ${connection.total}/${connection.maxConnections} (${Math.round(connectionPct * 100)}%) -- worth watching, consider pooling if this keeps climbing.` });
  }

  if (connection.idleInTransaction > 0) {
    advice.push({ severity: "warning", message: `${connection.idleInTransaction} connection${connection.idleInTransaction === 1 ? "" : "s"} idle in transaction -- an uncommitted transaction can hold locks and block other queries.` });
  }

  if (connection.longestActiveQuerySeconds > 30) {
    advice.push({ severity: "warning", message: `A query has been running for ${Math.round(connection.longestActiveQuerySeconds)}s -- may be a slow or stuck query worth investigating.` });
  }

  if (auth.staleSessions > 0) {
    const pct = auth.totalActiveSessions ? Math.round((auth.staleSessions / auth.totalActiveSessions) * 100) : 0;
    advice.push({ severity: auth.staleSessions === auth.totalActiveSessions ? "critical" : "warning", message: `${auth.staleSessions} of ${auth.totalActiveSessions} sessions (${pct}%) haven't refreshed their auth token in over an hour -- likely abandoned tabs, but can also mean auto-refresh is broken for active users (e.g. after a server restart).` });
  }

  return advice;
}

export async function GET() {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guard.response;

  const supabase = await createSupabaseServerClient();
  const [{ data: connection, error: connError }, { data: auth, error: authError }] = await Promise.all([
    supabase.rpc("get_platform_connection_stats"),
    supabase.rpc("get_platform_auth_token_stats"),
  ]);

  if (connError || authError) {
    return NextResponse.json({ error: connError?.message || authError?.message }, { status: 500 });
  }

  const advice = buildAdvice(connection as ConnectionStats, auth as AuthTokenStats);

  return NextResponse.json({ connection, auth, advice });
}
