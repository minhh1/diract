"use client";

// Renders the construction facility drawdown simulation
// (lib/cashFlowEngine.ts's simulateFacility) -- Peak Debt, total
// capitalized interest, and any equity injections fall out of the
// monthly schedule itself rather than being estimated parametrically.
import { Info } from "lucide-react";
import { money } from "./BudgetVsActualTable";
import type { FacilitySimulationResult } from "@/lib/cashFlowEngine";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-[18px] font-bold ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

export default function DebtSchedulePanel({ simulation, hasFacilityConfig }: { simulation: FacilitySimulationResult; hasFacilityConfig: boolean }) {
  if (!hasFacilityConfig) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Debt Schedule</p>
        <p className="text-[12px] text-slate-400">Set a facility limit and interest rate above to see the monthly drawdown/capitalized-interest schedule and real Peak Debt.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-4">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Debt Schedule</p>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Peak Debt" value={money(simulation.peakDebt)} />
        <StatCard label="Total Interest Capitalized" value={money(simulation.totalInterestCapitalized)} />
        <StatCard label="Total Equity Injected" value={money(simulation.totalEquityInjected)} tone={simulation.totalEquityInjected > 0 ? "bad" : "good"} />
      </div>

      {simulation.lvrBreached && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 text-[11px] text-amber-700 flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>The Max LVR covenant is breached in at least one month of this schedule.</span>
        </div>
      )}

      {simulation.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[640px]">
            <thead>
              <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                <th className="py-1 pr-2">Month</th>
                <th className="py-1 px-2 text-right">Drawdown</th>
                <th className="py-1 px-2 text-right">Interest</th>
                <th className="py-1 px-2 text-right">Repayment</th>
                <th className="py-1 px-2 text-right">Balance</th>
                <th className="py-1 px-2 text-right">Equity</th>
                <th className="py-1 px-2 text-right">LVR%</th>
              </tr>
            </thead>
            <tbody>
              {simulation.rows.map(r => (
                <tr key={r.month} className="border-t border-slate-50">
                  <td className="py-1 pr-2 text-slate-500">{r.month}</td>
                  <td className="py-1 px-2 text-right text-slate-600">{r.drawdown > 0 ? money(r.drawdown) : "-"}</td>
                  <td className="py-1 px-2 text-right text-slate-400">{r.interestCapitalized > 0 ? money(r.interestCapitalized) : "-"}</td>
                  <td className="py-1 px-2 text-right text-emerald-600">{r.repayment > 0 ? money(r.repayment) : "-"}</td>
                  <td className="py-1 px-2 text-right font-bold text-slate-800">{money(r.debtBalance)}</td>
                  <td className="py-1 px-2 text-right text-rose-600">{r.equityInjected > 0 ? money(r.equityInjected) : "-"}</td>
                  <td className={`py-1 px-2 text-right ${r.lvrPct != null && r.lvrPct > 100 ? "text-rose-600" : "text-slate-400"}`}>{r.lvrPct != null ? `${r.lvrPct.toFixed(1)}%` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
