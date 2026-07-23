// app/api/admin/health/check/route.ts
// Live, on-demand reachability check across every external service this app
// depends on plus a couple of our own internal routes — distinct from
// cron_heartbeats (which only tells you when a *scheduled job* last ran).
// Site-admin gated and triggered by the Platform Health tab's Heartbeat
// sub-tab, not cron — every check runs in parallel with its own timeout so
// one dead service can't hang the whole page.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { getStripe } from "@/lib/stripe";
import { requireSiteAdmin } from "@/lib/requireSiteAdmin";

interface CheckResult {
  name: string;
  group: "external" | "internal";
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

const TIMEOUT_MS = 3000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms)),
  ]);
}

async function timed(name: string, group: CheckResult["group"], fn: () => Promise<string | void>): Promise<CheckResult> {
  const started = Date.now();
  try {
    const detail = await withTimeout(fn(), TIMEOUT_MS);
    return { name, group, ok: true, latencyMs: Date.now() - started, detail: detail || undefined };
  } catch (err) {
    return { name, group, ok: false, latencyMs: Date.now() - started, detail: err instanceof Error ? err.message : "unreachable" };
  }
}

async function checkSupabase(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("not configured");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.from("cron_heartbeats").select("name", { head: true, count: "exact" }).limit(1);
  if (error) throw new Error(error.message);
}

async function checkDigitalOcean(): Promise<void> {
  const token = process.env.DIGITALOCEAN_PLATFORM_API_TOKEN;
  if (!token) throw new Error("not configured");
  const res = await fetch("https://api.digitalocean.com/v2/account", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function checkAws(): Promise<string> {
  const accessKeyId = process.env.AWS_PLATFORM_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_PLATFORM_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error("not configured");
  const sts = new STSClient({ region: "us-east-1", credentials: { accessKeyId, secretAccessKey } });
  const result = await sts.send(new GetCallerIdentityCommand({}));
  return result.Account ? `account ${result.Account}` : "";
}

async function checkStripe(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("not configured");
  await getStripe().balance.retrieve();
}

async function checkGoogle(): Promise<void> {
  // Unauthenticated connectivity check only — confirms Google's own
  // infrastructure is reachable, not that our OAuth credentials still work
  // (each user's Gmail token is refreshed independently, see lib/gmail/client.ts).
  const res = await fetch("https://www.google.com/generate_204", { method: "GET" });
  if (res.status !== 204 && !res.ok) throw new Error(`HTTP ${res.status}`);
}

async function checkTogetherAi(): Promise<void> {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error("not configured");
  const res = await fetch("https://api.together.xyz/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function checkGotenberg(): Promise<void> {
  const url = process.env.GOTENBERG_URL || "http://localhost:3033";
  const res = await fetch(`${url}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// Guacamole has no unauthenticated health endpoint — any HTTP response
// (even 401/404) proves the region's gateway is up; only a network-level
// failure (timeout, connection refused) counts as Down.
async function checkGuacamoleRegion(url: string): Promise<void> {
  await fetch(url, { method: "GET" });
}

async function checkInternalSelf(): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const res = await fetch(`${appUrl}/api/health`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return typeof data.dbLatencyMs === "number" ? `db ${data.dbLatencyMs}ms` : "";
}

export async function GET() {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guard.response;

  const guacamoleRegions: { name: string; url: string }[] = [
    { name: "Guacamole (Sydney)", url: process.env.GUACAMOLE_URL_SYD || "" },
    { name: "Guacamole (US East)", url: process.env.GUACAMOLE_URL_IAD || "" },
    { name: "Guacamole (Frankfurt)", url: process.env.GUACAMOLE_URL_FRA || "" },
    { name: "Guacamole (Singapore)", url: process.env.GUACAMOLE_URL_SIN || "" },
  ].filter(r => r.url);
  // Fall back to the single non-regional URL if no per-region envs are set
  // at all (matches lib/guacamole.ts's own fallback).
  if (guacamoleRegions.length === 0 && process.env.GUACAMOLE_URL) {
    guacamoleRegions.push({ name: "Guacamole", url: process.env.GUACAMOLE_URL });
  }

  const checks = await Promise.all([
    timed("Supabase", "external", checkSupabase),
    timed("DigitalOcean", "external", checkDigitalOcean),
    timed("AWS", "external", checkAws),
    timed("Stripe", "external", checkStripe),
    timed("Google", "external", checkGoogle),
    timed("Together AI", "external", checkTogetherAi),
    timed("Gotenberg (doc conversion)", "external", checkGotenberg),
    ...guacamoleRegions.map(r => timed(r.name, "external", () => checkGuacamoleRegion(r.url))),
    timed("Internal API (self)", "internal", checkInternalSelf),
  ]);

  return NextResponse.json({ checks });
}
