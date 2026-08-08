// app/dashboard/billing/page.tsx
// Company billing: manage an existing subscription (Stripe Billing Portal).
// Any company member can view; only a company_admin sees the Manage button --
// mirrors the admin-gating pattern in app/dashboard/admin/page.tsx.
//
// The virtual-computer plan grid (Starter/Standard/Pro/PAYG -- selling new
// VM-hosting capacity) was removed here: VM hosting is no longer sold. This
// page now only shows/manages a subscription a company already has (nothing
// left to subscribe to going forward). lib/billing/plans.ts, the checkout
// route, and the VM feature itself (Admin -> Virtual computers) are
// untouched -- existing VM subscribers can still manage/cancel via the
// Stripe Portal button below.
"use client";

import { useCompany } from "@/components/CompanyContext";
import { CreditCard, AlertCircle } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

interface Subscription {
  planId: string | null;
  status: string;
  currentPeriodEnd: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-600",
  trialing: "bg-blue-50 text-blue-600",
  past_due: "bg-amber-50 text-amber-600",
  incomplete: "bg-amber-50 text-amber-600",
  incomplete_expired: "bg-red-50 text-red-600",
  canceled: "bg-red-50 text-red-600",
  unpaid: "bg-red-50 text-red-600",
  paused: "bg-slate-100 text-slate-500",
};

interface BillingStatus {
  subscription: Subscription | null;
  planName: string | null;
}

async function fetchBillingStatus(): Promise<BillingStatus> {
  const res = await fetch("/api/billing/status");
  const json = await res.json();
  return {
    subscription: json.subscription,
    planName: json.plan?.name ?? null,
  };
}

export default function BillingPage() {
  // CompanyContext already resolved isAdmin (per-company role check) once
  // for the whole dashboard shell -- no need to re-derive it here via
  // auth.getUser()/profiles/company_memberships, same fix already applied
  // to app/dashboard/admin/page.tsx and settings/page.tsx.
  const { isAdmin } = useCompany();

  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading: loading } = useQuery({
    queryKey: ["billing-status"],
    queryFn: fetchBillingStatus,
    staleTime: 60 * 1000,
  });
  const subscription = data?.subscription ?? null;
  const planName = data?.planName ?? null;

  useProgressBarWhile(loading);

  const manageBilling = async () => {
    setError(null);
    setOpeningPortal(true);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not open billing portal");
      setOpeningPortal(false);
      return;
    }
    window.location.href = json.url;
  };

  if (loading) {
    return null;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto min-h-screen">
      <h1 className="text-xl font-bold text-slate-800 mb-1">Billing</h1>
      <p className="text-[13px] text-slate-400 mb-8">
        {subscription?.planId ? "Manage your subscription." : "No active subscription."}
      </p>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-6 bg-red-50 text-red-600 rounded-2xl text-[12px]">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {subscription?.planId && (
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-[32px] p-6">
          <div className="w-11 h-11 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
            <CreditCard size={18} className="text-indigo-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-slate-800">
              Current plan: {planName || subscription.planId}
            </p>
            {subscription.currentPeriodEnd && (
              <p className="text-[11px] text-slate-400">
                Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-AU')}
              </p>
            )}
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
              STATUS_STYLES[subscription.status] || "bg-slate-100 text-slate-500"
            }`}
          >
            {subscription.status.replace("_", " ")}
          </span>
          {isAdmin && (
            <button
              onClick={manageBilling}
              disabled={openingPortal}
              className="px-4 py-2 bg-slate-900 text-white text-[12px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              {openingPortal ? "Opening..." : "Manage billing"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
