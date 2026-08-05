"use client";

// One of Quick Glance's 3 trust stat cards (Trust balance / Dormant trust /
// Matters with trust), addressable/movable individually as its own widget
// instance -- was inline `StatCard` usage hardcoded 3x in LawFirmQuickGlance.tsx,
// now a single self-fetching widget parameterized by `statKey`. Fetches
// trust-transactions itself (same table 3 sibling instances would all read;
// useCustomTable's own query-cache layer already dedupes concurrent calls
// for the same table, so 3 stat cards don't triple the network cost).
import { useMemo } from "react";
import { Landmark, AlertTriangle, Users } from "lucide-react";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { computeTrustBalancesByMatter } from "@/lib/trust/trustBalances";
import { QUICK_GLANCE_STAT_LABELS, type QuickGlanceStatKey } from "@/lib/dashboardWidgets/quickGlanceTypes";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Mirrors TrustAgedBalancesWidget's own default when a company dashboard
// hasn't picked its own dormantDays -- Quick Glance has no config UI for
// this, so it's the only value it ever uses.
const DORMANT_DAYS = 90;

const ICON_BY_STAT: Record<QuickGlanceStatKey, React.ReactNode> = {
  trust_balance: <Landmark size={16} />,
  dormant_trust_count: <AlertTriangle size={16} />,
  matters_with_trust_count: <Users size={16} />,
};

export default function QuickGlanceStatWidget({ statKey }: { statKey: QuickGlanceStatKey }) {
  const trust = useCustomTable("trust-transactions");

  const stats = useMemo(() => {
    const balances = computeTrustBalancesByMatter(trust.records).filter(b => Math.abs(b.balance) >= 0.005);
    const now = Date.now();
    const dormantCount = balances.filter(b => {
      const days = b.lastDate ? Math.floor((now - new Date(b.lastDate).getTime()) / MS_PER_DAY) : Infinity;
      return days >= DORMANT_DAYS;
    }).length;
    const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);
    return { trust_balance: aud.format(totalBalance), dormant_trust_count: String(dormantCount), matters_with_trust_count: String(balances.length) };
  }, [trust.records]);

  const tone = statKey === "dormant_trust_count" ? "warn" : undefined;
  const value = stats[statKey];

  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 h-full">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${tone === "warn" ? "bg-rose-50 text-rose-700" : "bg-teal-50 text-teal-700"}`}>
        {ICON_BY_STAT[statKey]}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{QUICK_GLANCE_STAT_LABELS[statKey]}</p>
        <p className={`text-[17px] font-bold truncate ${tone === "warn" && value !== "0" ? "text-rose-600" : "text-slate-900"}`}>{value}</p>
      </div>
    </div>
  );
}
