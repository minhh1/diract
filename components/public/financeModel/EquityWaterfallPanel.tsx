"use client";

// Only rendered when the project has at least one "Money Partner"
// (Loans table lender_type) loan -- per the spec, this whole feature is
// skipped for projects funded by senior debt + the developer's own
// capital alone. Runs lib/equityWaterfall.ts's return-of-capital ->
// preferred-return -> promote tiers against each Money Partner loan.
import { Info } from "lucide-react";
import { money } from "./BudgetVsActualTable";
import { calculateEquityWaterfall, type MoneyPartnerLoan } from "@/lib/equityWaterfall";

export default function EquityWaterfallPanel({
  loans, exitDate, totalDistributableProfit, preferredReturnPct, promotePct,
}: {
  loans: MoneyPartnerLoan[];
  exitDate: string | null;
  totalDistributableProfit: number;
  preferredReturnPct: number | null;
  promotePct: number | null;
}) {
  if (loans.length === 0) return null;

  if (!exitDate) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Equity Waterfall (Money Partner)</p>
        <p className="text-[12px] text-slate-400">No timed cash flow yet -- set a linked task or timing dates on your budget lines above so an exit date can be determined.</p>
      </div>
    );
  }

  const result = calculateEquityWaterfall({
    loans, exitDate, totalDistributableProfit,
    preferredReturnPct: preferredReturnPct ?? 0,
    promotePct: promotePct ?? 0,
  });

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-4">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Equity Waterfall (Money Partner)</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total LP Capital</p>
          <p className="text-[16px] font-bold text-slate-800">{money(result.totalLpCapital)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total LP Distribution</p>
          <p className="text-[16px] font-bold text-slate-800">{money(result.totalLpDistribution)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Preferred Return Accrued</p>
          <p className="text-[16px] font-bold text-slate-800">{money(result.totalPreferredReturnAccrued)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Developer (GP) Residual</p>
          <p className="text-[16px] font-bold text-emerald-600">{money(result.gpResidual)}</p>
        </div>
      </div>

      {result.shortfall > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 text-[11px] text-amber-700 flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>The distributable pool ({money(totalDistributableProfit)}) doesn&apos;t fully cover return of capital + preferred return -- shortfall of {money(result.shortfall)}, funded pro-rata below.</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] min-w-[640px]">
          <thead>
            <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
              <th className="py-1 pr-2">Loan</th>
              <th className="py-1 px-2 text-right">Capital</th>
              <th className="py-1 px-2 text-right">Return of Capital</th>
              <th className="py-1 px-2 text-right">Preferred Return</th>
              <th className="py-1 px-2 text-right">Residual</th>
              <th className="py-1 px-2 text-right">Total</th>
              <th className="py-1 px-2 text-right">Multiple</th>
              <th className="py-1 px-2 text-right">IRR</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map(r => (
              <tr key={r.loanId} className="border-t border-slate-50">
                <td className="py-1 pr-2 text-slate-600">{r.name || "(untitled)"}</td>
                <td className="py-1 px-2 text-right text-slate-500">{money(r.principalAmount)}</td>
                <td className="py-1 px-2 text-right text-slate-600">{money(r.returnOfCapital)}</td>
                <td className="py-1 px-2 text-right text-slate-600">{money(r.preferredReturnPaid)}</td>
                <td className="py-1 px-2 text-right text-slate-600">{money(r.residualShare)}</td>
                <td className="py-1 px-2 text-right font-bold text-slate-800">{money(r.totalDistribution)}</td>
                <td className="py-1 px-2 text-right text-slate-600">{r.equityMultiple != null ? `${r.equityMultiple.toFixed(2)}x` : "-"}</td>
                <td className={`py-1 px-2 text-right ${r.irrPct != null && r.irrPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{r.irrPct != null ? `${r.irrPct.toFixed(1)}%` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 text-[11px] text-slate-500 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>Single-contribution/single-exit waterfall (not dated monthly draws/distributions), no GP catch-up tier. The distributable pool is total cash the project pays equity overall -- the developer&apos;s own capital isn&apos;t separately return-of-capital&apos;d here, it&apos;s implicitly whatever&apos;s left after the Money Partner&apos;s tiers, plus the promote.</span>
      </div>
    </div>
  );
}
