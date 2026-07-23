// app/api/admin/secrets/route.ts
// CRUD for platform_secrets_registry — manually-tracked platform-level
// credentials (Stripe key, DO token, etc.) that have no programmatic expiry
// the app can query, so a site admin records a rotation cadence by hand.
// See supabase/platform_secrets_registry.sql.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSiteAdmin } from "@/lib/requireSiteAdmin";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guard.response;

  const admin = adminClient();
  const [{ data: secrets, error }, staleGoogle, teamsSecrets, botSecrets] = await Promise.all([
    admin.from("platform_secrets_registry").select("*").order("service"),
    // Stale Google OAuth tokens should self-heal via refresh (see
    // lib/gmail/client.ts) -- a token still expired right now is a real signal.
    admin.from("user_gmail_tokens").select("user_id, email, token_expires_at").lt("token_expires_at", new Date().toISOString()),
    // Azure/Teams client secrets, cross-company -- only non-secret columns
    // selected, never `credentials` (same rule as everywhere else these
    // tables are queried from a browser-reachable API route).
    admin.from("company_teams_credentials").select("company_id, secret_expires_at, companies:company_id(name)").not("secret_expires_at", "is", null),
    admin.from("company_teams_bot_credentials").select("company_id, secret_expires_at, companies:company_id(name)").not("secret_expires_at", "is", null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  interface AzureSecretRow { company_id: string; secret_expires_at: string; companies: { name: string } | null }
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const azureSecrets = [
    ...((teamsSecrets.data || []) as unknown as AzureSecretRow[]).map(r => ({ companyName: r.companies?.name || r.company_id, kind: "Teams (Graph API)", expires_at: r.secret_expires_at })),
    ...((botSecrets.data || []) as unknown as AzureSecretRow[]).map(r => ({ companyName: r.companies?.name || r.company_id, kind: "Teams bot (Bot Framework)", expires_at: r.secret_expires_at })),
  ].filter(r => r.expires_at <= thirtyDaysFromNow);

  return NextResponse.json({
    secrets,
    derived: {
      staleGoogleTokenCount: (staleGoogle.data || []).length,
      azureSecretsExpiringSoon: azureSecrets,
    },
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body?.service || !body?.label) {
    return NextResponse.json({ error: "service and label are required" }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin.from("platform_secrets_registry").insert({
    service: body.service,
    label: body.label,
    expires_at: body.expires_at || null,
    rotation_interval_days: body.rotation_interval_days ?? null,
    last_rotated_at: body.last_rotated_at || null,
    notes: body.notes || null,
    created_by: guard.userId,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ secret: data });
}
