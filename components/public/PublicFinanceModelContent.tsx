"use client";

// The Finance Model shell -- two call sites:
//   1. components/dashboard/tabs/FinanceModelTab.tsx (mode="internal",
//      authenticated) -- the record tab on a Project record's dashboard.
//      Renders the full subtab strip (Overview/Transactions/Timeline/Loans).
//   2. app/public/finance-model/[pageId]/page.tsx (mode="public",
//      GENUINELY UNAUTHENTICATED, read-only, access-code gated) -- a
//      shareable link, backed by app/api/finance-model-pages/public/
//      [pageId]/route.ts. Deliberately limited to the Overview data only
//      (budget vs actual) -- Transactions/Timeline/Loans carry more
//      sensitive detail (raw ledger, loan security/guarantors, internal
//      task timeline) that nobody asked to expose over an unauthenticated
//      link, so those subtabs simply don't exist in public mode.
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Lock, TrendingUp, Receipt, GanttChartSquare, Landmark, Calculator, FileBarChart, Paperclip } from "lucide-react";
import { readPinGatedCache, writePinGatedCache, clearPinGatedCache } from "@/lib/publicPageCache";
import BudgetVsActualTable, { type BudgetLine } from "./financeModel/BudgetVsActualTable";
import OverviewSubtab from "./financeModel/OverviewSubtab";
import TransactionsSubtab from "./financeModel/TransactionsSubtab";
import TimelineSubtab from "./financeModel/TimelineSubtab";
import LoansSubtab from "./financeModel/LoansSubtab";
import DutyFeesSubtab from "./financeModel/DutyFeesSubtab";
import FeasibilitySubtab from "./financeModel/FeasibilitySubtab";
import AttachmentsSubtab from "./financeModel/AttachmentsSubtab";

interface Props {
  // Internal mode identifies the record directly (the viewer is already
  // authenticated and authorized for this company); public mode only has
  // the shareable link's opaque pageId -- the server resolves that to a
  // project (and checks accessCode) since the client never learns the
  // projectId directly.
  projectId?: string;
  pageId?: string;
  mode?: "internal" | "public";
  accessCode?: string;
  embedded?: boolean;
}

const codeCacheKey = (pageId: string) => `finance_model_code_${pageId}`;
function getCachedCode(pageId: string): string | null {
  try { return localStorage.getItem(codeCacheKey(pageId)); } catch { return null; }
}
function setCachedCode(pageId: string, code: string) {
  try { localStorage.setItem(codeCacheKey(pageId), code); } catch { /* ignore */ }
}
function clearCachedCode(pageId: string) {
  try { localStorage.removeItem(codeCacheKey(pageId)); } catch { /* ignore */ }
}

const SUBTABS = [
  { id: "overview", label: "Overview", icon: TrendingUp },
  { id: "transactions", label: "Transactions", icon: Receipt },
  { id: "timeline", label: "Timeline", icon: GanttChartSquare },
  { id: "loans", label: "Loans", icon: Landmark },
  { id: "duty_fees", label: "Duty & Fees", icon: Calculator },
  { id: "feasibility", label: "Feasibility", icon: FileBarChart },
  { id: "attachments", label: "Attachments", icon: Paperclip },
] as const;
type SubtabId = (typeof SUBTABS)[number]["id"];

function PublicOverview({ pageId, accessCode, embedded }: { pageId: string; accessCode?: string; embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const cacheKey = `finance_model_${pageId}`;

  const applyLoadedData = (json: any) => {
    setConnected(!!json.connected);
    setBudgetLines(json.budgetLines || []);
  };

  const fetchPublic = async (code?: string) => {
    const res = await fetch(`/api/finance-model-pages/public/${pageId}?code=${encodeURIComponent(code || "")}`);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    setCodeError(null);
    try {
      const code = accessCode || getCachedCode(pageId) || undefined;

      const cached = code ? readPinGatedCache<any>(cacheKey, code) : null;
      if (cached) { applyLoadedData(cached); setPageTitle(cached.title ?? null); }

      const { ok, json } = await fetchPublic(code);
      if (!ok) { setError(json.error || "This page is not available"); return; }
      setPageTitle(json.title ?? null);
      if (json.requiresCode) {
        if (code) { clearCachedCode(pageId); clearPinGatedCache(cacheKey); setConnected(false); setBudgetLines([]); }
        setNeedsCode(true);
        return;
      }
      setNeedsCode(false);
      if (code) { setCachedCode(pageId, code); writePinGatedCache(cacheKey, code, json); }
      applyLoadedData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [pageId, accessCode]);

  const handleCodeSubmit = async () => {
    if (!codeInput.trim()) return;
    setCheckingCode(true);
    setCodeError(null);
    const code = codeInput.trim();
    const { ok, json } = await fetchPublic(code);
    setCheckingCode(false);
    if (!ok || json.requiresCode) { setCodeError(json.error || "Incorrect access code"); return; }
    setNeedsCode(false);
    applyLoadedData(json);
    writePinGatedCache(cacheKey, code, json);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-400 py-10 justify-center">
        <Loader2 size={14} className="animate-spin" /> Loading finance model...
      </div>
    );
  }

  if (needsCode) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center max-w-sm mx-auto">
        <Lock size={28} className="text-indigo-600 mx-auto mb-3" />
        <p className="text-[13px] font-bold text-slate-700 mb-1">{pageTitle || "Finance Model"}</p>
        <p className="text-[12px] text-slate-400 mb-4">Enter the access code to view this page.</p>
        <input
          value={codeInput}
          onChange={e => setCodeInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCodeSubmit()}
          placeholder="Access code"
          className="w-full text-center text-[13px] border border-slate-200 rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-100 mb-2"
        />
        {codeError && <p className="text-[11px] text-rose-500 mb-2">{codeError}</p>}
        <button onClick={handleCodeSubmit} disabled={checkingCode || !codeInput.trim()} className="w-full bg-indigo-600 text-white rounded-full py-2.5 text-[12px] font-bold disabled:opacity-40">
          {checkingCode ? <Loader2 size={13} className="animate-spin mx-auto" /> : "View"}
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
        <p className="text-[13px] font-medium text-rose-600 mb-1">Couldn't load</p>
        <p className="text-[12px] text-slate-400 mb-4">{error}</p>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline">
          <RefreshCw size={11} /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!connected && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 text-[12px] text-amber-700">
          No live accounting data connected -- figures below are budgeted/manually entered.
        </div>
      )}
      <p className="text-[11px] text-slate-400 px-1">{pageTitle || (embedded ? "Finance Model" : "")}</p>
      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Budget vs Actual</p>
        </div>
        <BudgetVsActualTable budgetLines={budgetLines} editable={false} />
      </div>
    </div>
  );
}

export default function PublicFinanceModelContent({ projectId, pageId, mode = "internal", accessCode, embedded }: Props) {
  const [subtab, setSubtab] = useState<SubtabId>("overview");

  if (mode === "public" && pageId) {
    return <PublicOverview pageId={pageId} accessCode={accessCode} embedded={embedded} />;
  }

  if (!projectId) return null;

  return (
    <div className="space-y-4">
      {/* overflow-x-auto (not visible/default) so a narrow viewport scrolls
          just this strip -- otherwise the browser promotes the nearest
          overflow-y-auto ancestor's overflow-x from visible to auto per the
          CSS overflow spec, and the WHOLE page ends up horizontally
          scrollable instead of just the tab row. shrink-0 + whitespace-nowrap
          on each button stops flex from compressing/wrapping labels instead
          of overflowing, which would silently truncate them. */}
      <div className="flex items-center gap-1 border-b border-slate-100 overflow-x-auto">
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
      {subtab === "transactions" && <TransactionsSubtab projectId={projectId} />}
      {subtab === "timeline" && <TimelineSubtab projectId={projectId} />}
      {subtab === "loans" && <LoansSubtab projectId={projectId} />}
      {subtab === "duty_fees" && <DutyFeesSubtab projectId={projectId} />}
      {subtab === "feasibility" && <FeasibilitySubtab projectId={projectId} />}
      {subtab === "attachments" && <AttachmentsSubtab projectId={projectId} />}
    </div>
  );
}
