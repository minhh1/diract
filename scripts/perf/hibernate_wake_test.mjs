// Mirrors app/api/virtual-computers/_lib.ts's startHibernate() exactly (one
// DO snapshot-action call + a DB status update to "snapshotting"), then lets
// the REAL production sweep cron (running every 5 min) complete the
// hibernate exactly as it would for a genuine idle-triggered one -- only the
// trigger step is manual, since there's no dedicated "hibernate now" API
// route to call directly. Wake uses the real, existing wake API route.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { readFileSync } from "fs";
import { join } from "path";

const STORAGE_STATE = join(import.meta.dirname, "auth-state.json");

const envPath = join(import.meta.dirname, "..", "..", ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE_URL = "http://localhost:3000";
const VM_ID = process.argv[2];
if (!VM_ID) {
  console.error("Usage: node hibernate_wake_test.mjs <vmId>");
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DO_API = "https://api.digitalocean.com/v2";
const DO_TOKEN = process.env.DIGITALOCEAN_PLATFORM_API_TOKEN;

async function doFetch(path, init) {
  const res = await fetch(`${DO_API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DO_TOKEN}`, ...init?.headers },
  });
  if (!res.ok) throw new Error(`DO ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const { data: vm } = await admin.from("virtual_computers").select("*").eq("id", VM_ID).single();
  console.log("VM:", vm.name, vm.status, vm.provider_instance_id, vm.region);
  if (vm.status !== "running") {
    console.error(`VM is not "running" (currently "${vm.status}") -- aborting.`);
    process.exit(1);
  }

  const t0 = Date.now();
  console.log(`[${new Date(t0).toISOString()}] Starting snapshot (hibernate trigger)...`);
  const action = await doFetch(`/droplets/${vm.provider_instance_id}/actions`, {
    method: "POST",
    body: JSON.stringify({ type: "snapshot", name: `hibernate-${vm.provider_instance_id}-${Date.now()}` }),
  });
  const snapshotTaskId = String(action.action.id);
  await admin
    .from("virtual_computers")
    .update({ status: "snapshotting", snapshot_task_id: snapshotTaskId, updated_at: new Date().toISOString() })
    .eq("id", VM_ID);
  console.log(`snapshot_task_id: ${snapshotTaskId} -- now waiting for the real sweep cron to complete this...`);

  // Poll our own DB row (not DO directly) so this measures the exact same
  // thing a real user waiting on the dashboard would see.
  let hibernatedAt = null;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    const { data: row } = await admin.from("virtual_computers").select("status, snapshot_id, error_message").eq("id", VM_ID).single();
    console.log(`[+${Math.round((Date.now() - t0) / 1000)}s] status: ${row.status}`);
    if (row.status === "hibernated") {
      hibernatedAt = Date.now();
      console.log(`HIBERNATED after ${Math.round((hibernatedAt - t0) / 1000)}s total. snapshot_id: ${row.snapshot_id}`);
      break;
    }
    if (row.status === "error") {
      console.error("Hibernate failed:", row.error_message);
      process.exit(1);
    }
  }
  if (!hibernatedAt) {
    console.error("Timed out waiting for hibernate to complete.");
    process.exit(1);
  }

  // Now wake it via the real, existing wake API route (authenticated as the
  // real admin session, same as every other real test this session).
  const t1 = Date.now();
  console.log(`\n[${new Date(t1).toISOString()}] Calling real wake API...`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const wakeRes = await context.request.post(`${BASE_URL}/api/virtual-computers/${VM_ID}/wake`, { timeout: 60000 });
  console.log("wake call status:", wakeRes.status(), JSON.stringify(await wakeRes.json().catch(() => ({}))));

  console.log("Polling status until running again...");
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const res = await context.request.get(`${BASE_URL}/api/virtual-computers/${VM_ID}/status`);
    const body = await res.json();
    console.log(`[+${Math.round((Date.now() - t1) / 1000)}s] status: ${body.status} ip: ${body.ipAddress}`);
    if (body.status === "running") {
      console.log(`WOKE (status=running) after ${Math.round((Date.now() - t1) / 1000)}s from wake call.`);
      break;
    }
    if (body.status === "error") {
      console.error("Wake failed:", body.errorMessage);
      break;
    }
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
