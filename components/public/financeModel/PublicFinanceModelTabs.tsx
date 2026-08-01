"use client";

// The full Finance Model subtab strip for a PUBLIC share page. Renders the
// same subtab components the authenticated record tab uses -- so the demo
// can't drift from the real product -- wrapped in FinanceModelApiProvider,
// which redirects their data calls to the read-only public route and
// rejects any write outright.
//
// Two deliberate differences from the internal tab:
//   * Transactions is a notice, not the real subtab. The raw Xero ledger
//     (contact names, references, every bank line) is the one thing that
//     stays internal, and the public data route refuses to serve it at
//     all -- so this is an honest "ask us for a login", not a tease.
//   * Money is redacted server-side on a redact_figures page, so the
//     figures these subtabs display arrive already stripped. Nothing here
//     re-hides them; there is nothing left to hide.
import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Receipt, GanttChartSquare, Landmark, Calculator, FileBarChart, Lock } from "lucide-react";
import { FinanceModelApiProvider } from "./FinanceModelApiContext";
import OverviewSubtab from "./OverviewSubtab";
import TimelineSubtab from "./TimelineSubtab";
import LoansSubtab from "./LoansSubtab";
import DutyFeesSubtab from "./DutyFeesSubtab";

const SUBTABS = [
  { id: "overview", label: "Overview & Cash Flow", icon: TrendingUp },
  { id: "transactions", label: "Transactions", icon: Receipt },
  { id: "timeline", label: "Timeline", icon: GanttChartSquare },
  { id: "loans", label: "Loans", icon: Landmark },
  { id: "duty_fees", label: "Duty & Fees", icon: Calculator },
  { id: "feasibility", label: "Feasibility", icon: FileBarChart },
] as const;
type SubtabId = (typeof SUBTABS)[number]["id"];

export default function PublicFinanceModelTabs({ pageId, accessCode }: { pageId: string; accessCode?: string }) {
  const [subtab, setSubtab] = useState<SubtabId>("overview");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The subtabs are written against a projectId. The public route resolves
  // the project from the page itself and ignores any id a caller sends, so
  // handing it to them here grants nothing -- it just lets them mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = `/api/finance-model-pages/public/${pageId}/fm?resource=overview${accessCode ? `&code=${encodeURIComponent(accessCode)}` : ""}`;
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) { setError(json.error || "This page is not available"); return; }
      setProjectId(json.projectId ?? null);
      setCompanyId(json.companyId ?? null);
    })();
    return () => { cancelled = true; };
  }, [pageId, accessCode]);

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
        <p className="text-[12px] text-slate-400">{error}</p>
      </div>
    );
  }
  if (!projectId) {
    return <div className="flex items-center gap-2 text-[12px] text-slate-400 py-10 justify-center"><Loader2 size={14} className="animate-spin" /> Loading...</div>;
  }

  return (
    <FinanceModelApiProvider pageId={pageId} accessCode={accessCode} companyId={companyId}>
      <div className="space-y-4">
        <div className="flex items-center gap-1 border-b border-slate-100 overflow-x-auto tab-strip-scroll">
          {SUBTABS.map(t => {
            const Icon = t.icon;
            const active = subtab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSubtab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold border-b-2 -mb-px transition-colors shrink-0 whitespace-nowrap ${
                  active ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        {subtab === "overview" && <OverviewSubtab projectId={projectId} onOpenDutyFees={() => setSubtab("duty_fees")} />}
        {subtab === "timeline" && <TimelineSubtab projectId={projectId} />}
        {subtab === "loans" && <LoansSubtab projectId={projectId} />}
        {subtab === "duty_fees" && <DutyFeesSubtab projectId={projectId} />}

        {/* Feasibility is a NOTICE, not the real subtab. It fires a
            phases-and-rates request per loan on top of eight more, and
            those stalled on the public route -- rather than ship a tab
            that spins forever in front of a prospect, it makes no server
            call at all and says what it does. */}
        {subtab === "feasibility" && (
          <div className="bg-white border border-slate-200 rounded-[32px] p-10 text-center">
            <FileBarChart size={26} className="text-slate-300 mx-auto mb-3" />
            <p className="text-[13px] font-bold text-slate-700 mb-1">Feasibility is not shown in this preview</p>
            <p className="text-[12px] text-slate-400 max-w-lg mx-auto">
              The feasibility calculator -- GDV, total development cost, margin on cost and on equity, break-even
              sale price, residual land value, scenario comparison and sensitivity analysis, plus the dated cash
              flow, debt schedule and IC memo built on top of them -- is available to authorised users in the
              product.
            </p>
          </div>
        )}

        {subtab === "transactions" && (
          <div className="bg-white border border-slate-200 rounded-[32px] p-10 text-center">
            <Lock size={26} className="text-slate-300 mx-auto mb-3" />
            <p className="text-[13px] font-bold text-slate-700 mb-1">Transactions are not shown in this preview</p>
            <p className="text-[12px] text-slate-400 max-w-md mx-auto">
              The full transaction ledger -- every bank line synced from Xero, with contacts, references and
              descriptions, matched against budget lines and loans -- is available to authorised users in the
              product. It is withheld here because this link needs no sign-in.
            </p>
          </div>
        )}
      </div>
    </FinanceModelApiProvider>
  );
}
