// components/TrialWorkspaceBanner.tsx
// Persistent banner shown across the whole dashboard shell while the
// current company is a marketplace trial sandbox (companyType ===
// 'trial_sandbox' -- see create_trial_sandbox_company in
// supabase/migrations/20260730110000_template_trial_mode.sql). "Keep it"
// clears that flag in place; "End trial" soft-closes this sandbox and
// switches back to another of the user's real companies -- both reuse the
// exact active_company_id-flip + cache-clear + hard-navigate pattern
// Sidebar.tsx's handleSwitchCompany uses, since a fresh page load is what
// makes CompanyContext pick up the change.
"use client";

import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { supabase } from "@/lib/supabase";
import { clearAllClientCaches } from "@/lib/clearClientCaches";
import { invalidateCustomTables } from "@/lib/hooks/useCustomTables";
import { invalidateCustomDashboards } from "@/lib/hooks/useCustomDashboards";

async function clearCompanySwitchCaches() {
  const { invalidateSchemaCache, clearCompanyIdCache } = await import("@/lib/services/schemaService");
  invalidateSchemaCache();
  clearCompanyIdCache();
  invalidateCustomTables();
  invalidateCustomDashboards();
  // Full wipe, not just the identity cache -- see Sidebar.tsx's
  // handleSwitchCompany for why (useCustomTables/useCustomDashboards'
  // module caches are keyed by userId alone, not companyId).
  clearAllClientCaches();
}

export default function TrialWorkspaceBanner() {
  const { companyType, companyId, userId } = useCompany();
  const [busy, setBusy] = useState<"keep" | "end" | null>(null);
  const [error, setError] = useState("");

  if (companyType !== "trial_sandbox") return null;

  const keepIt = async () => {
    setBusy("keep");
    setError("");
    const res = await fetch("/api/trial/promote", { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      setError(data.error || "Could not keep this workspace");
      return;
    }
    await clearCompanySwitchCaches();
    window.location.reload();
  };

  const endTrial = async () => {
    if (!userId || !companyId) return;
    if (!window.confirm("End this trial? This workspace and everything in it will be closed.")) return;
    setBusy("end");
    setError("");
    const res = await fetch("/api/trial/close", { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      setError(data.error || "Could not end this trial");
      return;
    }

    const { data: memberships } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", userId)
      .neq("company_id", companyId);
    const nextCompanyId = memberships?.[0]?.company_id;
    if (!nextCompanyId) {
      // Shouldn't normally happen -- starting a trial requires already
      // belonging to a real company -- but land somewhere safe either way.
      window.location.replace("/dashboard/properties");
      return;
    }

    await supabase.from("profiles").update({ active_company_id: nextCompanyId }).eq("id", userId);
    await clearCompanySwitchCaches();
    window.location.replace("/dashboard/properties");
  };

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 bg-amber-50 border-b border-amber-100 shrink-0">
      <FlaskConical size={14} className="text-amber-600 shrink-0" />
      <p className="text-[12px] font-medium text-amber-800 flex-1">
        Trial workspace: try out the template, then decide.
        {error && <span className="text-red-600 font-bold"> {error}</span>}
      </p>
      <button
        onClick={keepIt}
        disabled={busy !== null}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-amber-700 border border-amber-200 rounded-full text-[11px] font-bold hover:bg-amber-100 transition-all disabled:opacity-50"
      >
        {busy === "keep" && <Loader2 size={11} className="animate-spin" />}
        Keep it
      </button>
      <button
        onClick={endTrial}
        disabled={busy !== null}
        className="flex items-center gap-1.5 px-3 py-1.5 text-amber-700 rounded-full text-[11px] font-bold hover:bg-amber-100 transition-all disabled:opacity-50"
      >
        {busy === "end" && <Loader2 size={11} className="animate-spin" />}
        End trial
      </button>
    </div>
  );
}
