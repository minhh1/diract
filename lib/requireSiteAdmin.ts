// lib/requireSiteAdmin.ts
// Shared guard for the Platform Health API routes (secrets registry, cost
// sync, live heartbeat check) — all of them are cross-company, so the
// per-company company_admin check (see e.g. app/api/gmail/retry-failure)
// doesn't apply; these are gated on profiles.is_site_admin instead.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function requireSiteAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: prof } = await supabase.from("profiles").select("is_site_admin").eq("id", user.id).single();
  if (!prof?.is_site_admin) {
    return { ok: false, response: NextResponse.json({ error: "Site admin access required" }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}
