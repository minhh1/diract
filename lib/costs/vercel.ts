// lib/costs/vercel.ts
// Real month-to-date spend via Vercel's FOCUS billing-charges API
// (GET /v1/billing/charges, JSONL response) -- requires a new
// VERCEL_API_TOKEN (Owner/Member/Developer/Security/Billing/Enterprise
// Viewer role on the team) and VERCEL_TEAM_ID, neither of which this app
// had before (only Vercel-the-host, no API token was previously needed).
import type { CostSnapshot } from "./types";

export async function fetchVercelCost(): Promise<CostSnapshot> {
  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !teamId) throw new Error("VERCEL_API_TOKEN / VERCEL_TEAM_ID are not configured.");

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const params = new URLSearchParams({
    teamId,
    from: periodStart.toISOString(),
    to: now.toISOString(),
  });

  const res = await fetch(`https://api.vercel.com/v1/billing/charges?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Vercel billing API returned ${res.status}`);

  const text = await res.text();
  let totalUsd = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const charge = JSON.parse(trimmed);
      totalUsd += typeof charge.BilledCost === "number" ? charge.BilledCost : 0;
    } catch {
      // skip malformed line
    }
  }

  return {
    amountUsd: totalUsd,
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: now.toISOString().slice(0, 10),
  };
}
