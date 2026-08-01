// app/api/public-demo/[token]/route.ts
// GENUINELY UNAUTHENTICATED. No session, no membership check -- the hub id
// in the URL is the whole credential (see the migration
// 20260802100000_public_demo_hubs.sql for the security posture and why
// expiry is mandatory). Uses the service-role admin client throughout.
//
// Returns the manifest of everything the hub exposes: the company's active
// client-update boards, Finance Model share pages and Residual Land Solver
// share pages. Each entry carries its own access code so the embedded
// public components unlock without prompting the viewer for a PIN they
// were never given -- the hub link IS the credential, and asking for a
// second one it can't supply would just be a dead end.
//
// READ-ONLY BY CONSTRUCTION: this route only ever SELECTs, and every
// component the hub renders uses its existing anonymous path, which is
// already view-only. There is no write endpoint anywhere in the hub.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // A malformed token would make the uuid comparison throw rather than
  // simply miss, so treat any lookup failure as "not available" -- never
  // leak whether a given id exists.
  const { data: hub } = await admin
    .from("public_demo_hubs")
    .select("id, company_id, title, is_active, expires_at, excluded_keys, mask_figures")
    .eq("id", token)
    .maybeSingle()
    .then(r => r, () => ({ data: null }));

  const notAvailable = NextResponse.json({ error: "This link is not available" }, { status: 404 });
  if (!hub || !hub.is_active) return notAvailable;
  if (new Date(hub.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This demo link has expired" }, { status: 410 });
  }

  const [boardsRes, financeRes, solverRes] = await Promise.all([
    admin.from("client_update_pages")
      .select("slug, title, access_code, is_active")
      .eq("company_id", hub.company_id).eq("is_active", true),
    admin.from("finance_model_pages")
      .select("id, title, access_code, is_active")
      .eq("company_id", hub.company_id).eq("is_active", true),
    admin.from("residual_land_solver_pages")
      .select("id, title, access_code, is_active")
      .eq("company_id", hub.company_id).eq("is_active", true),
  ]);

  const excluded = new Set(hub.excluded_keys || []);
  const sections = [
    ...(boardsRes.data || []).map(b => ({ kind: "board" as const, key: b.slug, title: b.title, accessCode: b.access_code })),
    ...(financeRes.data || []).map(f => ({ kind: "finance_model" as const, key: f.id, title: f.title, accessCode: f.access_code })),
    ...(solverRes.data || []).map(s => ({ kind: "solver" as const, key: s.id, title: s.title, accessCode: s.access_code })),
  ].filter(s => !excluded.has(s.key));

  return NextResponse.json({ title: hub.title, expiresAt: hub.expires_at, maskFigures: hub.mask_figures !== false, sections });
}
