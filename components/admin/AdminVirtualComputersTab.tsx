// components/admin/AdminVirtualComputersTab.tsx
// Admin-only: cloud credential CRUD, cost comparison, and creating/
// reassigning/destroying virtual computers assigned to company members.
// There is no self-service launch flow for regular members -- see
// app/dashboard/virtual-computers/page.tsx for what they see instead.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Monitor, Plus, X, KeyRound, Trash2, CreditCard, Loader2, AlertTriangle, HelpCircle } from "lucide-react";
import CostComparisonTable from "@/components/virtualcomputers/CostComparisonTable";
import VmStatusBadge from "@/components/virtualcomputers/VmStatusBadge";
import CredentialsHelpDrawer from "./CredentialsHelpDrawer";
import { REGIONS, FLY_REGION_LABELS } from "@/lib/vmProviders/regions";
import type { CloudProviderId, VmProtocol, VmSizeOption } from "@/lib/vmProviders/types";

// Walks a company admin through the whole lifecycle, in order -- reused as
// the drawer's `steps` prop the same way AdminMsTeamsTab.tsx uses it for
// "where do I find these credentials", just for the broader "how does this
// whole feature work" question instead of one specific form.
const VM_LIFECYCLE_STEPS = [
  {
    title: "Add a cloud account, or use platform billing",
    description:
      "Bring your own DigitalOcean/AWS/GCP account (add its credentials above) and pay that provider directly, or choose \"Platform-billed\" when creating a VM to have it count against your subscription plan's included slots instead -- no credential of your own needed for that path.",
  },
  {
    title: "Pick a provider and operating system",
    description:
      "DigitalOcean offers a plain Ubuntu desktop (cheapest, VNC) or Windows 11 (Beta -- a real Windows 11 install inside nested virtualization, RDP only). AWS is Windows Server + Microsoft Office preinstalled, RDP only, and licensed per-hour the normal Windows Server way. Windows 11 on DigitalOcean is different: it starts on Microsoft's free evaluation license, not a bundled paid license -- whoever's assigned needs to activate it with their own Windows 11 product key inside the VM for continued/production use. Each Windows VM's row has a field for recording that key once it's activated -- if that VM is ever destroyed and recreated, the same key can usually be reused (a retail key's activation isn't tied to a particular machine), and the create form will remind you what was used last time.",
  },
  {
    title: "Choose a size and region",
    description:
      "Bigger sizes cost more per hour but handle heavier use (Windows 11 specifically needs at least the 4 vCPU/8GB tier to run at all). The \"dedicated CPU\" 4 vCPU/8GB options cost a bit more per hour but get their own physical cores instead of sharing them with other droplets -- worth it for Windows 11, since nested virtualization already adds overhead that shared cores make worse; a good way to beat a staff member's old Windows Cloud PC spec on both CPU and disk. Region affects both where the VM physically runs and which of our streaming gateways (Sydney, US, Europe, or Asia) it routes through -- pick whichever's actually closest to the person using it, not necessarily your own company's HQ.",
  },
  {
    title: "Assign it to someone",
    description:
      "Each VM is assigned to exactly one company member, who's the only non-admin able to see and open it (admins can see and open every VM). Reassigning later is just a dropdown on the VM's row -- the underlying computer and its files aren't affected.",
  },
  {
    title: "Wait for it to finish setting up",
    description:
      "A plain Ubuntu desktop is usually ready within a minute. AWS Windows + Office takes about 10-15 minutes. Windows 11 on DigitalOcean is the slowest -- it's installing a real copy of Windows from scratch, which takes roughly 75-90 minutes the first time. The status badge updates live; no need to keep refreshing.",
  },
  {
    title: "Set computer awake time (optional, recommended)",
    description:
      "Turn this on to have VMs automatically sleep overnight and on weekends instead of running (and costing money) 24/7. \"Wake up at\" is when the computer should already be on and ready -- set it at least 2 hours before your team's actual start time, since especially Windows VMs can take a while to wake from a saved snapshot. There's always a midnight safety cutoff regardless of this setting.",
  },
  {
    title: "Hibernating and waking",
    description:
      "When a VM goes idle outside its awake-time schedule, it hibernates: a snapshot of the exact machine state -- files, installed apps, everything -- gets saved, then the underlying compute shuts down so it stops costing money. \"Wake now\" restores a fresh instance from that snapshot, picking up right where it left off. Only one snapshot is ever kept per VM; a new one replaces the last automatically.",
  },
  {
    title: "Destroying a VM",
    description:
      "This is permanent -- the computer, its files, and its saved snapshot (if any) are all deleted for good, and cannot be recovered afterward. Use this when someone's finished with a VM entirely, not as a way to save costs overnight (that's what the awake-time schedule above is for).",
  },
];

interface Props {
  companyId: string;
}

interface Credential {
  id: string;
  provider: CloudProviderId;
  label: string;
  created_at: string;
}

interface Vm {
  id: string;
  name: string;
  provider: CloudProviderId;
  protocol: VmProtocol;
  os: "linux" | "windows";
  with_office: boolean;
  size_slug: string;
  region: string;
  status: string;
  error_message: string | null;
  assigned_user_id: string | null;
  billing_mode: "byo" | "platform";
  hourly_usd_at_creation: number | null;
  windows_product_key: string | null;
}

interface Member {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface PricingResponse {
  pricing: Record<CloudProviderId, VmSizeOption[]>;
  providerLabels: Record<CloudProviderId, string>;
  provisionableProviders: CloudProviderId[];
}

interface PlatformPlan {
  id: string;
  name: string;
  includedVmSlots: number;
  allowedSizes: Partial<Record<CloudProviderId, string[]>>;
}

interface BillingStatus {
  subscription: { planId: string | null; status: string } | null;
  plan: PlatformPlan | null;
}

interface Schedule {
  enabled: boolean;
  days: number[];
  start_time: string;
  end_time: string;
  timezone: string;
  enforce_end_time: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Mirrors the server-side check in app/api/virtual-computers/create/route.ts
// -- dockur/windows (a real Windows 11 install inside nested KVM) needs
// meaningfully more resources than DigitalOcean's smallest tier.
const WINDOWS_CAPABLE_DO_SIZES = ["s-4vcpu-8gb", "s-4vcpu-8gb-intel", "s-4vcpu-8gb-240gb-intel", "s-8vcpu-16gb"];

const PROVIDER_CREDENTIAL_FIELDS: Record<CloudProviderId, { key: string; label: string; type?: string }[]> = {
  digitalocean: [{ key: "api_token", label: "API token", type: "password" }],
  aws: [
    { key: "access_key_id", label: "Access key ID" },
    { key: "secret_access_key", label: "Secret access key", type: "password" },
    { key: "region", label: "Default region" },
  ],
  gcp: [
    { key: "project_id", label: "Project ID" },
    { key: "service_account_json", label: "Service account JSON" },
  ],
};

export default function AdminVirtualComputersTab({ companyId }: Props) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  // Includes destroyed rows -- kept around only to suggest a previously-
  // activated Windows product key when creating a new VM for someone who
  // already had one destroyed (see the productKeySuggestion memo below).
  // Everywhere else in this component should use `vms` (below), not this.
  const [allVms, setAllVms] = useState<Vm[]>([]);
  const vms = useMemo(() => allVms.filter((vm) => vm.status !== "destroyed"), [allVms]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pricingData, setPricingData] = useState<PricingResponse | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCredentialForm, setShowCredentialForm] = useState(false);
  const [credProvider, setCredProvider] = useState<CloudProviderId>("digitalocean");
  const [credLabel, setCredLabel] = useState("");
  const [credFields, setCredFields] = useState<Record<string, string>>({});
  const [credError, setCredError] = useState<string | null>(null);
  const [credSaving, setCredSaving] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [vmName, setVmName] = useState("");
  const [vmProvider, setVmProvider] = useState<CloudProviderId>("digitalocean");
  // Only meaningful for provider "digitalocean" -- AWS is always "windows"
  // server-side regardless of what's sent (see create/route.ts).
  const [vmOs, setVmOs] = useState<"linux" | "windows">("linux");
  const [vmSizeSlug, setVmSizeSlug] = useState("");
  const [vmRegion, setVmRegion] = useState(() => REGIONS.digitalocean?.[0]?.slug || "");
  const [vmProtocol, setVmProtocol] = useState<VmProtocol>("rdp");
  const [vmWithOffice, setVmWithOffice] = useState(false);
  const [vmBillingMode, setVmBillingMode] = useState<"byo" | "platform">("byo");
  const [vmCredentialId, setVmCredentialId] = useState("");
  const [vmAssignedUserId, setVmAssignedUserId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [destroyingIds, setDestroyingIds] = useState<Set<string>>(new Set());
  const [wakingIds, setWakingIds] = useState<Set<string>>(new Set());
  const [actionMessage, setActionMessage] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [vmHelpOpen, setVmHelpOpen] = useState(false);

  const notify = useCallback((type: "info" | "success" | "error", text: string, autoDismissMs = 6000) => {
    setActionMessage({ type, text });
    if (autoDismissMs) {
      setTimeout(() => setActionMessage((cur) => (cur?.text === text ? null : cur)), autoDismissMs);
    }
  }, []);

  const load = useCallback(async () => {
    const [credRes, vmRes, pricingRes, billingRes, scheduleRes] = await Promise.all([
      fetch("/api/virtual-computers/credentials"),
      fetch("/api/virtual-computers/list?includeDestroyed=1"),
      fetch("/api/virtual-computers/pricing"),
      fetch("/api/billing/status"),
      fetch("/api/virtual-computers/schedule"),
    ]);
    const [credJson, vmJson, pricingJson, billingJson, scheduleJson] = await Promise.all([
      credRes.json(),
      vmRes.json(),
      pricingRes.json(),
      billingRes.json(),
      scheduleRes.json(),
    ]);
    setCredentials(credJson.credentials || []);
    setAllVms(vmJson.virtualComputers || []);
    setPricingData(pricingJson.pricing ? pricingJson : null);
    setBillingStatus(billingJson);
    setSchedule(scheduleJson.schedule || null);

    const { data: ms } = await supabase.from("company_memberships").select("user_id").eq("company_id", companyId);
    if (ms?.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name, email").in("id", ms.map((m: any) => m.user_id));
      setMembers(profs || []);
    }

    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!vms.some((vm) => vm.status === "provisioning" || vm.status === "snapshotting")) return;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [vms, load]);

  const addCredential = async () => {
    setCredError(null);
    if (!credLabel.trim()) {
      setCredError("Label is required");
      return;
    }
    for (const f of PROVIDER_CREDENTIAL_FIELDS[credProvider]) {
      if (!credFields[f.key]?.trim()) {
        setCredError(`${f.label} is required`);
        return;
      }
    }
    setCredSaving(true);
    const res = await fetch("/api/virtual-computers/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: credProvider, label: credLabel.trim(), credentials: credFields }),
    });
    const json = await res.json();
    setCredSaving(false);
    if (!res.ok) {
      setCredError(json.error || "Could not save credential");
      return;
    }
    setCredLabel("");
    setCredFields({});
    setShowCredentialForm(false);
    load();
  };

  const deleteCredential = async (id: string) => {
    if (!confirm("Delete this credential?")) return;
    await fetch(`/api/virtual-computers/credentials/${id}`, { method: "DELETE" });
    load();
  };

  const createVm = async () => {
    setCreateError(null);
    if (!vmName.trim() || !vmSizeSlug || !vmRegion.trim() || !vmAssignedUserId) {
      setCreateError("All fields are required");
      return;
    }
    if (vmBillingMode === "byo" && !vmCredentialId) {
      setCreateError("Credential is required for bring-your-own billing");
      return;
    }
    const trimmedName = vmName.trim();
    setCreating(true);
    notify(
      "info",
      `Creating "${trimmedName}"... ${
        vmProvider === "aws"
          ? "Windows + Office setup can take 10-15 minutes."
          : windowsOnDo
          ? "Windows 11 installs from scratch inside the VM -- this can take 75-90 minutes."
          : officeOnDo
          ? "The Ubuntu desktop will be ready in a few minutes. Microsoft Office installs in the background over the first hour or so -- its icons appear in the app grid once it's done."
          : "This usually takes about a minute."
      }`,
      0
    );
    const res = await fetch("/api/virtual-computers/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        provider: vmProvider,
        os: vmProvider === "digitalocean" ? vmOs : undefined,
        withOffice: officeOnDo || undefined,
        sizeSlug: vmSizeSlug,
        region: vmRegion.trim(),
        protocol: vmProtocol,
        billingMode: vmBillingMode,
        credentialId: vmBillingMode === "byo" ? vmCredentialId : undefined,
        assignedUserId: vmAssignedUserId,
      }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      const message = json.error || "Could not create virtual computer";
      setCreateError(message);
      notify("error", `Could not create "${trimmedName}": ${message}`);
      return;
    }
    notify("success", `"${trimmedName}" is being set up now -- watch its status below.`);
    setVmName("");
    setVmOs("linux");
    setVmWithOffice(false);
    setVmSizeSlug("");
    setVmRegion("");
    setVmCredentialId("");
    setVmAssignedUserId("");
    setShowCreateForm(false);
    load();
  };

  const reassignVm = async (id: string, userId: string) => {
    await fetch(`/api/virtual-computers/${id}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedUserId: userId }),
    });
    load();
  };

  const updateProductKey = async (id: string, productKey: string) => {
    await fetch(`/api/virtual-computers/${id}/product-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productKey: productKey || null }),
    });
    load();
  };

  const destroyVm = async (id: string) => {
    const vm = vms.find((v) => v.id === id);
    if (!confirm("Destroy this virtual computer? This can't be undone.")) return;
    const label = vm?.name || "virtual computer";
    setDestroyingIds((prev) => new Set(prev).add(id));
    notify("info", `Destroying "${label}"...`, 0);
    const res = await fetch(`/api/virtual-computers/${id}/destroy`, { method: "POST" });
    setDestroyingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      notify("error", `Could not destroy "${label}": ${json.error || "Unknown error"}`);
    } else {
      notify("success", `"${label}" destroyed.`);
    }
    load();
  };

  const wakeVm = async (id: string) => {
    const vm = vms.find((v) => v.id === id);
    const label = vm?.name || "virtual computer";
    setWakingIds((prev) => new Set(prev).add(id));
    notify("info", `Waking "${label}" from its saved snapshot...`, 0);
    const res = await fetch(`/api/virtual-computers/${id}/wake`, { method: "POST" });
    setWakingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      notify("error", `Could not wake "${label}": ${json.error || "Unknown error"}`);
    } else {
      notify("success", `"${label}" is waking up -- watch its status below.`);
    }
    load();
  };

  const saveSchedule = async (next: Schedule) => {
    setSchedule(next);
    setScheduleSaving(true);
    await fetch("/api/virtual-computers/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: next.enabled,
        days: next.days,
        startTime: next.start_time,
        endTime: next.end_time,
        timezone: next.timezone,
        enforceEndTime: next.enforce_end_time,
      }),
    });
    setScheduleSaving(false);
  };

  if (loading) return <p className="text-[11px] text-slate-400">Loading...</p>;

  const credentialsForProvider = credentials.filter((c) => c.provider === vmProvider);
  const activePlan =
    billingStatus?.plan && billingStatus.subscription && ["active", "trialing"].includes(billingStatus.subscription.status)
      ? billingStatus.plan
      : null;
  const platformSlotsUsed = vms.filter((vm) => vm.billing_mode === "platform").length;
  const platformSlotsAvailable = activePlan ? activePlan.includedVmSlots - platformSlotsUsed : 0;
  const platformAllowedSizeSlugs = activePlan?.allowedSizes[vmProvider] || [];
  const windowsOnDo = vmProvider === "digitalocean" && vmOs === "windows";
  // Office-on-Linux runs the same dockur/windows guest in the background,
  // so it shares the Windows size floor (mirrors the server-side check in
  // app/api/virtual-computers/create/route.ts).
  const officeOnDo = vmProvider === "digitalocean" && vmOs === "linux" && vmProtocol === "rdp" && vmWithOffice;
  const sizesForProvider = (
    vmBillingMode === "platform"
      ? (pricingData?.pricing[vmProvider] || []).filter((s) => platformAllowedSizeSlugs.includes(s.slug))
      : pricingData?.pricing[vmProvider] || []
  ).filter((s) => !(windowsOnDo || officeOnDo) || WINDOWS_CAPABLE_DO_SIZES.includes(s.slug));
  const platformBillingBlocked = vmBillingMode === "platform" && (!activePlan || platformSlotsAvailable <= 0);

  // Reuse a Windows product key across a destroy+recreate for the same
  // person -- e.g. a retail key's activation isn't tied to any particular
  // VM, just to however many times Microsoft's own activation servers have
  // seen it, so re-entering the same one on a fresh install for the same
  // assignee usually just works. Most-recent destroyed row wins if there's
  // more than one. allVms (not vms) deliberately includes destroyed rows.
  const productKeySuggestion =
    vmOs === "windows" && vmAssignedUserId
      ? allVms.find((v) => v.assigned_user_id === vmAssignedUserId && v.os === "windows" && v.windows_product_key)
          ?.windows_product_key || null
      : null;

  return (
    <div className="space-y-6">
      {/* Cloud credentials */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cloud credentials</p>
          <button onClick={() => setShowCredentialForm((v) => !v)} className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors">
            <Plus size={14} />
          </button>
        </div>

        {credentials.length === 0 && !showCredentialForm && (
          <p className="text-[12px] text-slate-400">No cloud credentials yet. Add one to start provisioning virtual computers.</p>
        )}

        <div className="space-y-2 mb-2">
          {credentials.map((cred) => (
            <div key={cred.id} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl">
              <KeyRound size={13} className="text-slate-400 shrink-0" />
              <p className="text-[12px] font-medium text-slate-700 flex-1">{cred.label}</p>
              <span className="text-[10px] text-slate-400 uppercase tracking-wide">{cred.provider}</span>
              <button onClick={() => deleteCredential(cred.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {showCredentialForm && (
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex gap-3">
              <select
                value={credProvider}
                onChange={(e) => {
                  setCredProvider(e.target.value as CloudProviderId);
                  setCredFields({});
                }}
                className="px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
              >
                {pricingData &&
                  (Object.keys(pricingData.providerLabels) as CloudProviderId[]).map((p) => (
                    <option key={p} value={p}>
                      {pricingData.providerLabels[p]}
                    </option>
                  ))}
              </select>
              <input
                value={credLabel}
                onChange={(e) => setCredLabel(e.target.value)}
                placeholder="Label (e.g. Production account)"
                className="flex-1 px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
              />
            </div>
            {PROVIDER_CREDENTIAL_FIELDS[credProvider].map((f) => (
              <input
                key={f.key}
                type={f.type || "text"}
                value={credFields[f.key] || ""}
                onChange={(e) => setCredFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.label}
                className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
              />
            ))}
            {credError && <p className="text-[11px] text-red-500">{credError}</p>}
            <div className="flex gap-2">
              <button
                onClick={addCredential}
                disabled={credSaving}
                className="px-5 py-2 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {credSaving ? "Saving..." : "Save credential"}
              </button>
              <button onClick={() => setShowCredentialForm(false)} className="px-4 py-2 text-[12px] text-slate-400 hover:text-slate-700">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cost comparison */}
      {pricingData && (
        <div className="bg-white border border-slate-200 rounded-[32px] p-6">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Cost comparison</p>
          <CostComparisonTable
            pricing={pricingData.pricing}
            providerLabels={pricingData.providerLabels}
            provisionableProviders={pricingData.provisionableProviders}
          />
        </div>
      )}

      {/* VM schedule */}
      {schedule && (
        <div className="bg-white border border-slate-200 rounded-[32px] p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Computer awake time</p>
            <button
              type="button"
              onClick={() => saveSchedule({ ...schedule, enabled: !schedule.enabled })}
              className={`px-4 py-1.5 text-[11px] font-bold rounded-full transition-colors ${
                schedule.enabled ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {schedule.enabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mb-3">
            This is when computers should be awake and ready -- not when your team actually starts work. Set it at
            least 2 hours earlier than that (e.g. 6am if staff start at 8am) so nobody's waiting on a still-booting
            computer, especially for Windows VMs, which can take longer to wake.
          </p>

          {activePlan && activePlan.id !== "payg" && !schedule.enabled && (
            <p className="text-[12px] text-amber-700 bg-amber-50 rounded-2xl px-4 py-3 mb-4">
              {`The ${activePlan.name} plan is priced assuming bounded usage hours -- turn this on so idle time outside your team's schedule doesn't run up cost. Pay-as-you-go plans can leave this off.`}
            </p>
          )}

          <div className="space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              {DAY_LABELS.map((label, idx) => {
                const selected = schedule.days.includes(idx);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      saveSchedule({
                        ...schedule,
                        days: selected ? schedule.days.filter((d) => d !== idx) : [...schedule.days, idx].sort(),
                      })
                    }
                    className={`w-10 py-1.5 text-[11px] font-bold rounded-full transition-colors ${
                      selected ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="block text-[10px] text-slate-400 pl-1">Wake up at</span>
                <input
                  type="time"
                  value={schedule.start_time}
                  onChange={(e) => saveSchedule({ ...schedule, start_time: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] text-slate-400 pl-1">Sleep at</span>
                <input
                  type="time"
                  value={schedule.end_time}
                  onChange={(e) => saveSchedule({ ...schedule, end_time: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] text-slate-400 pl-1">Timezone</span>
                <input
                  value={schedule.timezone}
                  onChange={(e) => saveSchedule({ ...schedule, timezone: e.target.value })}
                  placeholder="e.g. Australia/Sydney"
                  className="w-full px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-slate-500">
              <input
                type="checkbox"
                checked={schedule.enforce_end_time}
                onChange={(e) => saveSchedule({ ...schedule, enforce_end_time: e.target.checked })}
              />
              End time is a hard stop (log everyone off exactly then, even mid-session). Off by default -- VMs
              stay up as long as someone&rsquo;s using them, with a midnight safety cutoff either way.
            </label>
            {scheduleSaving && <p className="text-[10px] text-slate-300">Saving...</p>}
          </div>
        </div>
      )}

      {/* Create + list virtual computers */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Virtual computers</p>
            <button
              type="button"
              onClick={() => setVmHelpOpen(true)}
              className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline"
            >
              <HelpCircle size={12} /> How does this work?
            </button>
          </div>
          <button onClick={() => setShowCreateForm((v) => !v)} className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors">
            <Plus size={14} />
          </button>
        </div>

        {actionMessage && (
          <div
            className={`flex items-start gap-2 px-4 py-2.5 rounded-2xl text-[12px] mb-4 ${
              actionMessage.type === "error"
                ? "bg-red-50 text-red-600"
                : actionMessage.type === "success"
                ? "bg-emerald-50 text-emerald-600"
                : "bg-indigo-50 text-indigo-600"
            }`}
          >
            {actionMessage.type === "info" && <Loader2 size={13} className="shrink-0 mt-0.5 animate-spin" />}
            <span className="flex-1">{actionMessage.text}</span>
            <button onClick={() => setActionMessage(null)} className="shrink-0 opacity-60 hover:opacity-100">
              <X size={12} />
            </button>
          </div>
        )}

        {showCreateForm && (
          <div className="space-y-3 pb-4 mb-4 border-b border-slate-100">
            <input
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
              placeholder="Name (e.g. Jane's workstation)"
              className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setVmBillingMode("byo");
                  setVmSizeSlug("");
                }}
                className={`flex-1 px-4 py-2 text-[12px] font-bold rounded-full border transition-colors ${
                  vmBillingMode === "byo"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                Bring your own cloud account
              </button>
              <button
                type="button"
                onClick={() => {
                  setVmBillingMode("platform");
                  setVmSizeSlug("");
                  setVmCredentialId("");
                }}
                className={`flex-1 px-4 py-2 text-[12px] font-bold rounded-full border transition-colors ${
                  vmBillingMode === "platform"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                Platform-billed
              </button>
            </div>

            {vmBillingMode === "platform" && (
              <div
                className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-[12px] ${
                  activePlan ? "bg-slate-50 text-slate-500" : "bg-amber-50 text-amber-700"
                }`}
              >
                <CreditCard size={14} className="shrink-0" />
                {activePlan ? (
                  <span>
                    {activePlan.name} plan -- {platformSlotsAvailable}/{activePlan.includedVmSlots} slot{activePlan.includedVmSlots !== 1 ? "s" : ""} available.
                  </span>
                ) : (
                  <span>
                    Platform-billed VMs require an active subscription.{" "}
                    <Link href="/dashboard/billing" className="underline font-bold">
                      Set up billing
                    </Link>
                  </span>
                )}
                {activePlan && platformSlotsAvailable <= 0 && (
                  <Link href="/dashboard/billing" className="ml-auto underline font-bold shrink-0">
                    Upgrade
                  </Link>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <select
                value={vmProvider}
                onChange={(e) => {
                  const nextProvider = e.target.value as CloudProviderId;
                  setVmProvider(nextProvider);
                  setVmOs("linux");
                  setVmSizeSlug("");
                  setVmCredentialId("");
                  setVmRegion(REGIONS[nextProvider]?.[0]?.slug || "");
                  if (nextProvider === "aws") setVmProtocol("rdp");
                  else setVmProtocol("vnc");
                }}
                className="px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
              >
                {pricingData?.provisionableProviders.map((p) => (
                  <option key={p} value={p}>
                    {pricingData.providerLabels[p]}
                  </option>
                ))}
              </select>
              {vmProvider === "aws" || (vmProvider === "digitalocean" && vmOs === "windows") ? (
                <div className="px-3 py-2 border border-slate-200 rounded-full text-[12px] text-slate-500">RDP</div>
              ) : (
                <select
                  value={vmProtocol}
                  onChange={(e) => {
                    const nextProtocol = e.target.value as VmProtocol;
                    setVmProtocol(nextProtocol);
                    if (nextProtocol === "vnc") setVmWithOffice(false);
                  }}
                  className="px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
                >
                  <option value="rdp">RDP (GNOME desktop)</option>
                  <option value="vnc">VNC (lightweight XFCE)</option>
                </select>
              )}
            </div>
            {vmProvider === "digitalocean" && (
              <select
                value={vmOs}
                onChange={(e) => {
                  const nextOs = e.target.value as "linux" | "windows";
                  setVmOs(nextOs);
                  setVmSizeSlug("");
                  setVmProtocol("rdp");
                  if (nextOs === "windows") setVmWithOffice(false);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
              >
                <option value="linux">Ubuntu Desktop</option>
                <option value="windows">Windows 11 (Beta -- nested virtualization)</option>
              </select>
            )}
            {vmProvider === "digitalocean" && vmOs === "linux" && vmProtocol === "rdp" && (
              <label className="flex items-start gap-2 text-[12px] text-slate-600 px-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vmWithOffice}
                  onChange={(e) => {
                    setVmWithOffice(e.target.checked);
                    // Office shares the Windows size floor -- clear a
                    // too-small selection instead of silently keeping it.
                    if (e.target.checked && vmSizeSlug && !WINDOWS_CAPABLE_DO_SIZES.includes(vmSizeSlug)) {
                      setVmSizeSlug("");
                    }
                  }}
                  className="mt-0.5 accent-indigo-600"
                />
                <span>
                  Include Microsoft Office (Word, Excel, PowerPoint, Outlook) -- runs a hidden Windows guest in the
                  background and shows Office as normal app windows on the Ubuntu desktop. Needs a 4 vCPU / 8 GB size
                  or bigger; Office finishes installing in the background during the first hour. Whoever&rsquo;s
                  assigned signs in with their own Microsoft 365 account to activate it.
                </span>
              </label>
            )}
            {vmProvider === "digitalocean" && vmOs === "windows" && (
              <p className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 rounded-2xl px-4 py-3">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>
                  First boot takes ~75-90 minutes -- Windows 11 installs from scratch, much longer than any other
                  option here. It starts on Microsoft&rsquo;s free evaluation license; whoever&rsquo;s assigned needs
                  to activate it with their own Windows 11 product key inside the VM for continued/production use.
                  This relies on nested virtualization, which DigitalOcean doesn&rsquo;t officially support (verified
                  working directly, but not guaranteed by DO).
                </span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <select
                value={vmSizeSlug}
                onChange={(e) => setVmSizeSlug(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
              >
                <option value="">Size...</option>
                {sizesForProvider.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label} (${s.hourlyUsd.toFixed(3)}/hr)
                  </option>
                ))}
              </select>
              <select
                value={vmRegion}
                onChange={(e) => setVmRegion(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
              >
                <option value="">Region...</option>
                {(REGIONS[vmProvider] || []).map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const region = (REGIONS[vmProvider] || []).find((r) => r.slug === vmRegion);
              if (!region) return null;
              return (
                <p className="text-[11px] text-slate-500 bg-slate-50 rounded-2xl px-4 py-2">
                  Streams through our {FLY_REGION_LABELS[region.flyRegion]} gateway -- the nearest one to this region.
                </p>
              );
            })()}
            <div className={vmBillingMode === "byo" ? "grid grid-cols-2 gap-3" : ""}>
              {vmBillingMode === "byo" && (
                <select
                  value={vmCredentialId}
                  onChange={(e) => setVmCredentialId(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
                >
                  <option value="">Credential...</option>
                  {credentialsForProvider.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={vmAssignedUserId}
                onChange={(e) => setVmAssignedUserId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
              >
                <option value="">Assign to...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </div>
            {productKeySuggestion && (
              <p className="text-[11px] text-slate-400">
                This person previously activated Windows with{" "}
                <span className="font-mono text-slate-600">{productKeySuggestion}</span> on a since-destroyed VM --
                re-entering the same key inside the new one usually works, since a retail key's activation isn't tied
                to any particular machine. Add it below once this VM is ready.
              </p>
            )}
            {createError && <p className="text-[11px] text-red-500">{createError}</p>}
            <div className="flex gap-2">
              <button
                onClick={createVm}
                disabled={creating || platformBillingBlocked}
                className="px-5 py-2 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button onClick={() => setShowCreateForm(false)} className="px-4 py-2 text-[12px] text-slate-400 hover:text-slate-700">
                Cancel
              </button>
            </div>
          </div>
        )}

        {vms.length === 0 ? (
          <p className="text-[12px] text-slate-400">No virtual computers yet.</p>
        ) : (
          <div className="space-y-2">
            {vms.map((vm) => (
              <div key={vm.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-2xl">
                <Monitor size={14} className="text-indigo-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-medium text-slate-800 truncate">{vm.name}</p>
                    {vm.os === "windows" && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-sky-50 text-sky-600">
                        Windows + Office
                      </span>
                    )}
                    {vm.billing_mode === "platform" && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-600">
                        Platform-billed
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">
                    {vm.provider} · {vm.protocol.toUpperCase()}
                    {vm.with_office ? " · Office" : ""} · {vm.size_slug} · {vm.region}
                  </p>
                  {vm.status === "provisioning" && !destroyingIds.has(vm.id) && (
                    <p className="text-[10px] text-indigo-400 truncate mt-0.5">
                      {vm.os === "windows" && vm.provider === "digitalocean"
                        ? "Installing Windows 11 from scratch -- can take 75-90 minutes."
                        : vm.os === "windows"
                        ? "Booting instance and installing Office -- can take 10-15 minutes."
                        : "Booting instance -- usually ready within a minute."}
                    </p>
                  )}
                  {vm.os === "windows" && (
                    <input
                      key={`${vm.id}-${vm.windows_product_key || ""}`}
                      type="text"
                      defaultValue={vm.windows_product_key || ""}
                      placeholder="Windows product key (none set)"
                      onBlur={(e) => {
                        if (e.target.value.trim() !== (vm.windows_product_key || "")) {
                          updateProductKey(vm.id, e.target.value.trim());
                        }
                      }}
                      className="mt-1 w-full px-2 py-1 border border-slate-200 rounded-full text-[10px] font-mono outline-none focus:border-indigo-400 bg-white"
                    />
                  )}
                </div>
                <select
                  value={vm.assigned_user_id || ""}
                  onChange={(e) => reassignVm(vm.id, e.target.value)}
                  disabled={destroyingIds.has(vm.id)}
                  className="px-2 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-400 disabled:opacity-40"
                >
                  <option value="" disabled>
                    Unassigned
                  </option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name || m.email}
                    </option>
                  ))}
                </select>
                {destroyingIds.has(vm.id) ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500">
                    <Loader2 size={11} className="animate-spin" />
                    Destroying...
                  </span>
                ) : (
                  <VmStatusBadge status={vm.status} />
                )}
                {vm.status === "hibernated" && (
                  <button
                    onClick={() => wakeVm(vm.id)}
                    disabled={wakingIds.has(vm.id)}
                    className="px-3 py-1.5 bg-sky-600 text-white text-[11px] font-bold rounded-full hover:bg-sky-700 disabled:opacity-40 transition-colors"
                  >
                    {wakingIds.has(vm.id) ? "Waking..." : "Wake now"}
                  </button>
                )}
                <button
                  onClick={() => destroyVm(vm.id)}
                  disabled={destroyingIds.has(vm.id)}
                  className="p-1.5 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-30 disabled:hover:text-slate-300"
                >
                  {destroyingIds.has(vm.id) ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <CredentialsHelpDrawer
        isOpen={vmHelpOpen}
        onClose={() => setVmHelpOpen(false)}
        title="How virtual computers work"
        intro="A step-by-step walkthrough of the whole lifecycle, from adding a cloud account through to destroying a VM."
        steps={VM_LIFECYCLE_STEPS}
      />
    </div>
  );
}
