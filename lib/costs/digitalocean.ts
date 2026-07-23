// lib/costs/digitalocean.ts
// Real month-to-date spend via DigitalOcean's billing API, using the same
// platform token already configured for provisioning VMs (see
// lib/vmProviders/platformCredentials.ts) -- no new token needed.
import type { CostSnapshot } from "./types";

export async function fetchDigitalOceanCost(): Promise<CostSnapshot> {
  const token = process.env.DIGITALOCEAN_PLATFORM_API_TOKEN;
  if (!token) throw new Error("DIGITALOCEAN_PLATFORM_API_TOKEN is not configured.");

  const res = await fetch("https://api.digitalocean.com/v2/customers/my/balance", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DigitalOcean balance API returned ${res.status}`);
  const data = await res.json();

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const periodEnd = now.toISOString().slice(0, 10);

  return {
    amountUsd: parseFloat(data.month_to_date_usage || "0"),
    periodStart,
    periodEnd,
  };
}
