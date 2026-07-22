// app/api/virtual-computers/_lib.ts
// Shared helpers for the virtual-computers API routes. Not a route itself
// (no exported HTTP method handlers), so Next.js ignores it for routing.
import crypto from "crypto";
import net from "net";
import { getPlatformCredentials } from "@/lib/vmProviders/platformCredentials";
import { getProvider } from "@/lib/vmProviders/registry";
import { nextLocalMidnight } from "@/lib/vmProviders/scheduling";
import { verifyWindowsRdpLogin } from "@/lib/vmProviders/windowsLoginCheck";
import type { CloudProviderId, ProviderCredentials, VmOs, VmProtocol } from "@/lib/vmProviders/types";

// A cloud provider reporting the host instance as "running" only means the
// underlying machine powered on -- for Windows on DigitalOcean (a from-
// scratch dockur/windows install, ~75-90 min) and, to a lesser extent, AWS
// (Sysprep/specialize during first boot), RDP isn't actually listening for a
// long stretch after that. Without this check, the frontend session page
// (app/dashboard/virtual-computers/[id]/page.tsx) would flip straight to the
// GuacamoleViewer and attempt a doomed connection instead of showing the
// "installing Windows" progress screen.
export function isPortReachable(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs });
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

// Classic VNC auth (TigerVNC) truncates passwords to 8 characters, so keep
// the generated password short -- used for the Linux VNC/xrdp path only.
export function generateRemotePassword(): string {
  const raw = crypto.randomBytes(6).toString("base64").replace(/[^a-zA-Z0-9]/g, "");
  return (raw + "Ax9K2qLp").slice(0, 8);
}

// Windows local-account passwords have no 8-char cap and, unlike the Linux
// path, are checked against a default complexity policy (needs 3 of:
// upper/lower/digit/symbol) -- build one that always satisfies it. The
// symbol set deliberately excludes quote/backtick/dollar/backslash
// characters, since this password gets embedded in a PowerShell double-
// quoted string in the EC2 UserData script (see lib/vmProviders/aws.ts) and
// those would need extra escaping to be safe there.
export function generateWindowsPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#%^&*_-+=";
  const all = upper + lower + digits + symbols;

  const pick = (chars: string) => chars[crypto.randomInt(chars.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 12 }, () => pick(all));

  // Fisher-Yates shuffle so the required characters aren't predictably in
  // the first 4 positions.
  const password = [...required, ...rest];
  for (let i = password.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }
  return password.join("");
}

export async function loadVm(admin: any, companyId: string, id: string) {
  const { data } = await admin.from("virtual_computers").select("*").eq("id", id).maybeSingle();
  if (!data || data.company_id !== companyId) return null;
  return data;
}

export interface CompanyVmSchedule {
  enabled: boolean;
  days: number[];
  start_time: string;
  end_time: string;
  timezone: string;
  enforce_end_time: boolean;
}

// start_time is when computers should be *awake and ready*, not when staff
// actually start work -- default to 6am so there's a real buffer (Windows
// VMs in particular can take a while to wake from a snapshot) rather than
// staff arriving to a still-booting computer. Admins should set this to at
// least 2 hours before their team's actual start time.
const DEFAULT_SCHEDULE: CompanyVmSchedule = {
  enabled: false,
  days: [1, 2, 3, 4, 5],
  start_time: "06:00",
  end_time: "17:00",
  timezone: "UTC",
  enforce_end_time: false,
};

// Companies without a configured schedule (payg companies aren't required
// to have one -- see supabase/company_vm_schedules.sql) fall back to a
// disabled default so callers can always evaluate against a schedule shape
// without a null check at every call site.
export async function getCompanySchedule(admin: any, companyId: string): Promise<CompanyVmSchedule> {
  const { data } = await admin.from("company_vm_schedules").select("*").eq("company_id", companyId).maybeSingle();
  if (!data) return DEFAULT_SCHEDULE;
  return {
    enabled: data.enabled,
    days: data.days ?? DEFAULT_SCHEDULE.days,
    start_time: data.start_time ?? DEFAULT_SCHEDULE.start_time,
    end_time: data.end_time ?? DEFAULT_SCHEDULE.end_time,
    timezone: data.timezone ?? DEFAULT_SCHEDULE.timezone,
    enforce_end_time: data.enforce_end_time ?? false,
  };
}

// Resolves the credentials to hand a provider adapter for a given VM row,
// branching on billing_mode. Platform-billed rows have credential_id = NULL
// by design -- routes that only checked `vm.credential_id` before calling
// into a provider adapter would silently skip platform-billed VMs (destroy
// would mark the row destroyed without ever deleting the underlying
// instance; status would poll-loop stuck on "provisioning" forever).
export async function resolveCredentials(
  admin: any,
  vm: { billing_mode: string; credential_id: string | null; provider: string }
): Promise<ProviderCredentials | null> {
  if (vm.billing_mode === "platform") {
    return getPlatformCredentials(vm.provider as CloudProviderId);
  }
  if (!vm.credential_id) return null;
  const { data } = await admin
    .from("company_cloud_credentials")
    .select("credentials")
    .eq("id", vm.credential_id)
    .maybeSingle();
  return data?.credentials ?? null;
}

// Usage ledger (see supabase/virtual_computer_usage_events.sql) -- opens a
// row whenever a VM starts running (create or wake) and closes it whenever
// it stops (hibernate, destroy, or error), regardless of billing plan.
// Logged unconditionally since it's cheap and plan-agnostic; only
// pay-as-you-go companies actually have it reported to Stripe (see
// lib/billing/usageReporting.ts), but the history is there if a company
// switches plans later.
export async function openUsageEvent(admin: any, vm: { id: string; company_id: string; hourly_usd_at_creation: number | null }): Promise<void> {
  await admin.from("virtual_computer_usage_events").insert({
    vm_id: vm.id,
    company_id: vm.company_id,
    started_at: new Date().toISOString(),
    hourly_usd_at_start: vm.hourly_usd_at_creation ?? 0,
  });
}

export async function closeUsageEvent(admin: any, vmId: string): Promise<void> {
  await admin
    .from("virtual_computer_usage_events")
    .update({ ended_at: new Date().toISOString() })
    .eq("vm_id", vmId)
    .is("ended_at", null);
}

// Called from the sweep cron's inferred-disconnect paths (inactivity rule,
// midnight backstop, opt-in schedule end-of-day enforcement -- see
// app/api/virtual-computers/sweep/route.ts) -- starts (but doesn't wait
// out) the snapshot, since it can take far longer than one request should
// block for. The sweep route's own 'snapshotting' pass is what polls this
// to completion and destroys the instance once the snapshot is durable.
export async function startHibernate(admin: any, vm: { id: string; provider: string; provider_instance_id: string; region: string; billing_mode: string; credential_id: string | null }): Promise<void> {
  try {
    const credentials = await resolveCredentials(admin, vm);
    if (!credentials) throw new Error("Missing credentials for this virtual computer.");
    const adapter = getProvider(vm.provider as CloudProviderId);
    const { snapshotTaskId } = await adapter.startSnapshot(credentials, vm.provider_instance_id, vm.region);
    await admin
      .from("virtual_computers")
      .update({
        status: "snapshotting",
        snapshot_task_id: snapshotTaskId,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", vm.id);
  } catch (err) {
    // Note: the underlying instance is presumably still running here (the
    // snapshot never started) -- deliberately NOT closing the usage event,
    // since the VM is still actually accruing cost, just no longer mid an
    // active hibernate attempt.
    await admin
      .from("virtual_computers")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message : "Could not start snapshot",
        updated_at: new Date().toISOString(),
      })
      .eq("id", vm.id);
  }
}

// Shared by the wake route and the sweep cron's schedule wake-ahead pass --
// relaunches a hibernated VM from its saved snapshot.
export async function wakeVm(
  admin: any,
  vm: {
    id: string;
    company_id: string;
    provider: string;
    name: string;
    size_slug: string;
    region: string;
    protocol: string;
    os: VmOs;
    remote_username: string;
    remote_password: string;
    snapshot_id: string;
    billing_mode: string;
    credential_id: string | null;
    hourly_usd_at_creation: number | null;
  }
): Promise<void> {
  // Clear provider_instance_id along with the status flip -- otherwise it
  // briefly still points at the just-terminated source instance while
  // createInstance() below is in flight, and a concurrent status poll
  // (app/api/virtual-computers/[id]/status/route.ts, which polls whenever
  // status is "provisioning" AND provider_instance_id is set) would query
  // that stale, now-gone instance and incorrectly stomp status to "error".
  // Setting it null makes that poll's guard skip until the real new
  // instance ID is written below.
  await admin
    .from("virtual_computers")
    .update({ status: "provisioning", provider_instance_id: null, updated_at: new Date().toISOString() })
    .eq("id", vm.id);
  try {
    const credentials = await resolveCredentials(admin, vm);
    if (!credentials) throw new Error("Missing credentials for this virtual computer.");
    const adapter = getProvider(vm.provider as CloudProviderId);
    const result = await adapter.createInstance({
      credentials,
      name: vm.name,
      sizeSlug: vm.size_slug,
      region: vm.region,
      protocol: vm.protocol as VmProtocol,
      os: vm.os,
      remoteUsername: vm.remote_username,
      remotePassword: vm.remote_password,
      fromSnapshotId: vm.snapshot_id,
    });
    await openUsageEvent(admin, vm);
    const schedule = await getCompanySchedule(admin, vm.company_id);
    const deadline = nextLocalMidnight(new Date(), schedule.timezone);
    await admin
      .from("virtual_computers")
      .update({
        provider_instance_id: result.providerInstanceId,
        ip_address: result.ipAddress,
        last_seen_at: new Date().toISOString(),
        hibernate_deadline: deadline.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", vm.id);
  } catch (err) {
    await admin
      .from("virtual_computers")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message : "Could not wake this virtual computer",
        updated_at: new Date().toISOString(),
      })
      .eq("id", vm.id);
  }
}

// Total attempts = this + the original install. dockur/windows's unattended
// Windows 11 install occasionally leaves the guest's Administrator account
// unable to log in (confirmed directly, twice, on real VMs -- see
// lib/vmProviders/windowsLoginCheck.ts's header comment), with no way to
// fix it post-hoc, so the only real remedy is redoing the whole ~75-90 min
// install from scratch. Capped so a VM that keeps failing (a real,
// non-transient problem -- e.g. something wrong with the assigned droplet
// size/region) doesn't retry forever and rack up cost.
const MAX_WINDOWS_VERIFY_ATTEMPTS = 2;

type ProvisioningVm = {
  id: string;
  company_id: string;
  provider: string;
  provider_instance_id: string | null;
  region: string;
  billing_mode: string;
  credential_id: string | null;
  os: VmOs;
  snapshot_id: string | null;
  windows_verify_attempts: number;
  remote_username: string;
  remote_password: string;
  name: string;
  size_slug: string;
  protocol: string;
  hourly_usd_at_creation: number | null;
};

// Destroys a Windows-on-DigitalOcean install that failed its login check and
// starts a fresh one in its place, keeping the same virtual_computers row
// (so assignment/history aren't disturbed). Only ever safe to call for a
// *fresh* install with no snapshot yet -- there's no user data to lose,
// unlike a wake-from-snapshot failure, which this deliberately never
// retries this way (see the isFreshWindowsOnDo guard in
// reconcileProvisioningVm).
async function retryFreshWindowsInstall(admin: any, vm: ProvisioningVm, credentials: ProviderCredentials): Promise<void> {
  const adapter = getProvider(vm.provider as CloudProviderId);
  if (vm.provider_instance_id) {
    await adapter.destroyInstance(credentials, vm.provider_instance_id, vm.region).catch(() => {
      // Best-effort -- proceed with the recreate regardless, same reasoning
      // as wakeVm clearing provider_instance_id below.
    });
  }
  // A fresh password each retry, in case a bad password/encoding was ever
  // the actual cause -- cheap to rule out and never harmful otherwise.
  const newPassword = generateWindowsPassword();
  await admin
    .from("virtual_computers")
    .update({
      status: "provisioning",
      provider_instance_id: null,
      ip_address: null,
      remote_password: newPassword,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vm.id);
  // Separate, best-effort update -- if the windows_verify_attempts column
  // doesn't exist yet (migration not applied: see
  // supabase/virtual_computers_windows_verify_attempts.sql), this alone
  // fails with a PostgREST "column does not exist" error without taking
  // down the actually-critical update above with it. Degrades to retrying
  // without an enforced cap until the migration lands, rather than not
  // retrying (or erroring) at all.
  await admin
    .from("virtual_computers")
    .update({ windows_verify_attempts: (vm.windows_verify_attempts ?? 0) + 1 })
    .eq("id", vm.id);
  try {
    const result = await adapter.createInstance({
      credentials,
      name: vm.name,
      sizeSlug: vm.size_slug,
      region: vm.region,
      protocol: vm.protocol as VmProtocol,
      os: vm.os,
      remoteUsername: vm.remote_username,
      remotePassword: newPassword,
    });
    await admin
      .from("virtual_computers")
      .update({
        provider_instance_id: result.providerInstanceId,
        ip_address: result.ipAddress,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vm.id);
  } catch (err) {
    await admin
      .from("virtual_computers")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message : "Retry provisioning failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", vm.id);
  }
}

// Shared by the status route (polled live while someone's dashboard tab is
// open) and the sweep cron (the reliable backstop when nobody's watching --
// this is exactly the gap that let a broken Windows VM go unnoticed for a
// full day before). Resolves the provider's own instance state and, for a
// fresh Windows-on-DigitalOcean install specifically, also verifies the RDP
// login actually works (not just that the port is open) before ever
// reporting "running" -- auto-retrying (destroy + recreate) on a confirmed
// login failure, up to MAX_WINDOWS_VERIFY_ATTEMPTS.
export async function reconcileProvisioningVm(admin: any, vm: ProvisioningVm): Promise<void> {
  if (!vm.provider_instance_id) return;
  const credentials = await resolveCredentials(admin, vm);
  if (!credentials) return;
  const adapter = getProvider(vm.provider as CloudProviderId);

  let instance;
  try {
    instance = await adapter.getInstance(credentials, vm.provider_instance_id, vm.region);
  } catch {
    // Transient provider errors shouldn't crash the caller or flip status
    // to error -- report the last known state and let the next poll retry.
    return;
  }

  const isFreshWindowsOnDo = vm.os === "windows" && vm.provider === "digitalocean" && !vm.snapshot_id;
  let reportedStatus = instance.status;

  if (reportedStatus === "running" && vm.os === "windows" && instance.ipAddress) {
    const rdpUp = await isPortReachable(instance.ipAddress, 3389);
    if (!rdpUp) {
      reportedStatus = "provisioning";
    } else if (isFreshWindowsOnDo) {
      const check = await verifyWindowsRdpLogin(vm, instance.ipAddress, vm.remote_username, vm.remote_password);
      if (check === "auth-failed") {
        // Defensive default -- if the windows_verify_attempts column/migration
        // (supabase/virtual_computers_windows_verify_attempts.sql) hasn't
        // landed yet, `vm.windows_verify_attempts` comes back undefined;
        // treating that as 0 lets retries actually happen instead of every
        // failure silently skipping straight to "attempts exhausted".
        const attemptsSoFar = vm.windows_verify_attempts ?? 0;
        if (attemptsSoFar < MAX_WINDOWS_VERIFY_ATTEMPTS) {
          await retryFreshWindowsInstall(admin, { ...vm, windows_verify_attempts: attemptsSoFar }, credentials);
        } else {
          await admin
            .from("virtual_computers")
            .update({
              status: "error",
              error_message: `Windows never accepted its own login after ${attemptsSoFar + 1} attempts. This is a rare dockur/windows install failure -- try creating the VM again, possibly in a different region.`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", vm.id);
        }
        return;
      }
      if (check === "inconclusive") reportedStatus = "provisioning";
      // "success" falls through -- reportedStatus stays "running".
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), status: reportedStatus };
  if (instance.ipAddress) updates.ip_address = instance.ipAddress;
  await admin.from("virtual_computers").update(updates).eq("id", vm.id);
}
