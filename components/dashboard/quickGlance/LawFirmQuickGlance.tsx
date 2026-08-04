"use client";

// Law Firm Quick Glance -- trust/billing health at a glance, rendered as
// the main content of the full-page /dashboard/quick-glance landing route
// (see QuickGlanceDashboard.tsx, which owns the page header/shell around
// this). Sources its own
// data directly from each table by slug (same useCustomTable hook
// CustomTableMasterPage.tsx uses for the URL-slug-driven table pages) since
// this needs 3 independent tables at once, which the single-source-table
// dashboard/widget-builder system doesn't support. A renamed/uninstalled
// table just means that section's useCustomTable resolves to an empty
// tableDef/records -- degrades to an empty state, not a crash.
import { useMemo } from "react";
import { Landmark, AlertTriangle, Users } from "lucide-react";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { computeTrustBalancesByMatter } from "@/lib/trust/trustBalances";
import TimeFeesReportWidget from "../TimeFeesReportWidget";
import TimeAgingReportWidget from "../TimeAgingReportWidget";
import UnpaidInvoicesWidget from "./UnpaidInvoicesWidget";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Mirrors TrustAgedBalancesWidget's own default when a company dashboard
// hasn't picked its own dormantDays -- Quick Glance has no config UI, so
// this is the only value it ever uses.
const DORMANT_DAYS = 90;

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${tone === 'warn' ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-700'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{label}</p>
        <p className={`text-[17px] font-bold truncate ${tone === 'warn' && value !== '0' ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p>
      </div>
    </div>
  );
}

export default function LawFirmQuickGlance() {
  const trust = useCustomTable('trust-transactions');
  const timeFees = useCustomTable('time-fee-entries');
  const invoices = useCustomTable('invoices');

  const trustStats = useMemo(() => {
    const balances = computeTrustBalancesByMatter(trust.records).filter(b => Math.abs(b.balance) >= 0.005);
    const now = Date.now();
    const dormantCount = balances.filter(b => {
      const days = b.lastDate ? Math.floor((now - new Date(b.lastDate).getTime()) / MS_PER_DAY) : Infinity;
      return days >= DORMANT_DAYS;
    }).length;
    const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);
    return { totalBalance, dormantCount, mattersWithTrust: balances.length };
  }, [trust.records]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div className="lg:col-span-1 flex flex-col gap-3">
        <StatCard icon={<Landmark size={16} />} label="Trust balance" value={aud.format(trustStats.totalBalance)} />
        <StatCard icon={<AlertTriangle size={16} />} label="Dormant trust" value={String(trustStats.dormantCount)} tone="warn" />
        <StatCard icon={<Users size={16} />} label="Matters with trust" value={String(trustStats.mattersWithTrust)} />
      </div>

      <div className="lg:col-span-3 flex flex-col gap-4">
        {!timeFees.loading && timeFees.records.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <TimeFeesReportWidget records={timeFees.records} />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!timeFees.loading && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <TimeAgingReportWidget records={timeFees.records} agingDays={30} />
            </div>
          )}
          {!invoices.loading && <UnpaidInvoicesWidget records={invoices.records} />}
        </div>
      </div>
    </div>
  );
}
