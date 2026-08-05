"use client";

// Residual Land Value Solver -- "what is the most I can pay for this site
// and still hit my target margin?" (lib/residualLandValue.ts, which
// re-derives stamp duty/title fees at every candidate price rather than
// holding them fixed). THREE call sites, extending the "one rendering,
// multiple call sites" pattern of PublicFinanceModelContent:
//   1. components/dashboard/tabs/ResidualLandSolverTab.tsx (projectId
//      set, authenticated) -- prefills from, and saves back to, the SAME
//      feasibility-inputs row the Finance Model's Feasibility subtab uses,
//      so the two never disagree about assumptions. State prefills from
//      the linked property; GST method from the project's Finance Model
//      settings. Also hosts the Share panel that issues customer links.
//   2. app/public/residual-land-solver/[pageId]/page.tsx (pageId set,
//      GENUINELY UNAUTHENTICATED, access-code gated) -- a customer link
//      issued from the Share panel. The customer can SAVE named
//      calculations (server-side, against their page -- see
//      app/api/residual-land-solver-pages/public/[pageId]/route.ts) and
//      come back to them later from any device with the link + code.
//   3. app/public/residual-land-solver/page.tsx (neither set, GENUINELY
//      UNAUTHENTICATED, ungated) -- a pure client-side calculator:
//      nothing is fetched and nothing is saved, which is exactly why it
//      needs no gate.
import { useEffect, useState } from "react";
import { Loader2, Landmark, Lock, Share2, Copy, Check, Trash2, Save, FolderOpen, Link2, X } from "lucide-react";
import ProjectSearchPicker, { type ProjectOption } from "@/components/dashboard/ProjectSearchPicker";
import { money } from "./financeModel/BudgetVsActualTable";
import { GST_METHODS, type GstMethod, type FeasibilityInputs } from "@/lib/feasibilityCalculator";
import { AU_STATES, explainStampDuty, type AuState } from "@/lib/stampDuty";
import {
  solveResidualLandValue, runResidualLandGrid, GRID_SALE_PRICE_DELTAS,
} from "@/lib/residualLandValue";

const EMPTY_INPUTS: FeasibilityInputs = {
  dwellingsCount: null, avgDwellingSizeSqm: null, siteAreaSqm: null, expectedSalePricePerDwelling: null,
  constructionRatePerSqm: null, professionalFeesPct: null, contingencyPct: null, marketingSellingPct: null,
  otherAcquisitionCosts: null, holdingCostsAnnual: null, projectDurationMonths: null, interestRatePct: null,
  loanToCostPct: null, targetMarginPct: null, facilityLimit: null, facilityInterestRatePct: null, maxLvrPct: null,
  preferredReturnPct: null, promotePct: null,
};

// Only the fields the solver actually reads -- the facility/waterfall
// fields in FeasibilityInputs exist for other panels and aren't shown or
// saved here.
const INPUT_FIELDS: { key: keyof FeasibilityInputs; label: string; suffix?: string }[][] = [
  [
    { key: "dwellingsCount", label: "Number of dwellings" },
    { key: "avgDwellingSizeSqm", label: "Avg dwelling size", suffix: "sqm" },
    { key: "expectedSalePricePerDwelling", label: "Expected sale price / dwelling", suffix: "$" },
    { key: "projectDurationMonths", label: "Project duration", suffix: "months" },
  ],
  [
    { key: "constructionRatePerSqm", label: "Construction rate", suffix: "$/sqm" },
    { key: "professionalFeesPct", label: "Professional fees", suffix: "% of construction" },
    { key: "contingencyPct", label: "Contingency", suffix: "% of construction" },
    { key: "marketingSellingPct", label: "Marketing & selling", suffix: "% of revenue" },
    { key: "otherAcquisitionCosts", label: "Other acquisition costs", suffix: "$" },
    { key: "holdingCostsAnnual", label: "Holding costs", suffix: "$/year" },
  ],
  [
    { key: "interestRatePct", label: "Interest rate", suffix: "% p.a." },
    { key: "loanToCostPct", label: "Loan to cost", suffix: "%" },
    { key: "targetMarginPct", label: "Target margin on cost", suffix: "%" },
  ],
];

// Same localStorage code-caching contract as PublicFinanceModelContent's
// (its helpers close over a different key prefix, so they're mirrored
// rather than imported).
const codeCacheKey = (pageId: string) => `residual_land_solver_code_${pageId}`;
function getCachedCode(pageId: string): string | null {
  try { return localStorage.getItem(codeCacheKey(pageId)); } catch { return null; }
}
function setCachedCode(pageId: string, code: string) {
  try { localStorage.setItem(codeCacheKey(pageId), code); } catch { /* ignore */ }
}
function clearCachedCode(pageId: string) {
  try { localStorage.removeItem(codeCacheKey(pageId)); } catch { /* ignore */ }
}

function Row({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? "font-bold text-slate-800" : "text-slate-600"} ${indent ? "pl-4 text-[11px]" : "text-[12px]"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

interface SharePage {
  id: string;
  title: string;
  access_code: string | null;
  is_active: boolean;
  created_at: string;
}

// Mirrors OverviewSubtab's SharePanel (finance-model-pages) against the
// residual-land-solver-pages endpoints.
function SharePanel({ projectId }: { projectId: string }) {
  const [pages, setPages] = useState<SharePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("Residual Land Solver");
  const [accessCode, setAccessCode] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/residual-land-solver-pages?projectId=${projectId}`);
    const json = await res.json();
    setPages((json.pages || []).filter((p: SharePage) => p.is_active));
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    await fetch("/api/residual-land-solver-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title: title.trim(), accessCode: accessCode.trim() || undefined }),
    });
    setAccessCode("");
    await load();
    setCreating(false);
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this link? It will stop working immediately (the customer's saved calculations are kept).")) return;
    await fetch(`/api/residual-land-solver-pages/${id}/revoke`, { method: "PATCH" });
    await load();
  };

  const copyLink = (page: SharePage) => {
    const url = `${window.location.origin}/public/residual-land-solver/${page.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(page.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-3">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Customer links (each can save its own calculations)</p>

      {loading ? (
        <p className="text-[12px] text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading...</p>
      ) : pages.length === 0 ? (
        <p className="text-[12px] text-slate-400">No customer links yet.</p>
      ) : (
        <div className="space-y-1.5">
          {pages.map(page => (
            <div key={page.id} className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-2xl">
              <p className="text-[12px] font-medium text-slate-700 flex-1">
                {page.title}
                {page.access_code && <span className="text-slate-400 font-normal"> -- code: {page.access_code}</span>}
              </p>
              <button onClick={() => copyLink(page)} className="p-1 text-slate-300 hover:text-indigo-600" title="Copy link">
                {copiedId === page.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
              <button onClick={() => revoke(page.id)} className="p-1 text-slate-300 hover:text-rose-500" title="Revoke">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-40" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Access code (optional)</label>
          <input value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="Leave blank for none" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-40" />
        </div>
        <button onClick={create} disabled={creating || !title.trim()} className="text-[11px] font-bold bg-indigo-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-40">
          {creating ? <Loader2 size={11} className="animate-spin" /> : "Create link"}
        </button>
      </div>
    </div>
  );
}

interface SavedCalc {
  id: string;
  name: string;
  inputs: Partial<FeasibilityInputs>;
  state: AuState | null;
  gst_method: GstMethod | null;
  updated_at: string;
}

export default function ResidualLandSolverContent({ projectId, pageId, allowProjectLink }: { projectId?: string; pageId?: string; allowProjectLink?: boolean }) {
  const [loading, setLoading] = useState(!!projectId || !!pageId);
  // "Generic calculator first, link later": with allowProjectLink (the
  // dashboard widget / non-project record tab), the solver starts
  // standalone and the viewer can attach it to a project on demand --
  // linking pushes whatever they've already typed into that project's
  // shared feasibility-inputs row (only the fields they filled in, so it
  // never nulls out the project's existing assumptions), then continues in
  // full project mode (persistence + Share panel). Session-local, same
  // ephemeral-select precedent as FinanceModelSearchWidget.
  const [linkedProject, setLinkedProject] = useState<ProjectOption | null>(null);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linking, setLinking] = useState(false);
  const activeProjectId = projectId ?? linkedProject?.id;
  const [inputs, setInputs] = useState<FeasibilityInputs>(EMPTY_INPUTS);
  const [state, setState] = useState<AuState | "">("");
  const [gstMethod, setGstMethod] = useState<GstMethod | "">("");
  const [saving, setSaving] = useState(false);
  const [showShare, setShowShare] = useState(false);

  // -- Shared-page (customer) mode ---------------------------------------
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [savedCalcs, setSavedCalcs] = useState<SavedCalc[]>([]);
  const [calcName, setCalcName] = useState("");
  const [savingCalc, setSavingCalc] = useState(false);
  const [calcMessage, setCalcMessage] = useState<string | null>(null);

  // Internal (project) mode -- prefill shared assumptions. Also fires when
  // the viewer links a project (activeProjectId appears), AFTER
  // linkToProject has pushed their typed values, so what comes back is the
  // merged assumption set. State/GST only overwrite what the user chose
  // when the project actually has a value, so linking never blanks a
  // manual selection.
  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [inputsRes, overviewRes, settingsRes] = await Promise.all([
          fetch(`/api/finance-model/feasibility-inputs?projectId=${activeProjectId}`),
          fetch(`/api/finance-model/overview?projectId=${activeProjectId}`),
          fetch(`/api/finance-model/settings?projectId=${activeProjectId}`),
        ]);
        const inputsJson = await inputsRes.json();
        const overviewJson = await overviewRes.json();
        const settingsJson = await settingsRes.json();
        if (cancelled) return;
        setInputs({ ...EMPTY_INPUTS, ...(inputsJson.inputs || {}) });
        setState(prev => (overviewJson.property?.state as AuState) || prev);
        setGstMethod(prev => (settingsJson.gstMethod as GstMethod) || prev);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  // Attach the generic calculator to a project: push only the fields the
  // user actually entered (the PATCH route ignores absent keys), then flip
  // to project mode -- the effect above reloads the merged row.
  const linkToProject = async (p: ProjectOption) => {
    setLinking(true);
    const entered: Record<string, number> = {};
    for (const [k, v] of Object.entries(inputs)) if (v != null) entered[k] = v;
    if (Object.keys(entered).length) {
      await fetch("/api/finance-model/feasibility-inputs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id, ...entered }),
      });
    }
    if (gstMethod) {
      await fetch("/api/finance-model/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id, gstMethod }),
      });
    }
    setLinking(false);
    setShowLinkPicker(false);
    setLinkedProject(p);
  };

  // Shared-page mode -- gate, then load the customer's saved calculations.
  const fetchPage = async (code?: string | null) => {
    const res = await fetch(`/api/residual-land-solver-pages/public/${pageId}?code=${encodeURIComponent(code || "")}`);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  };

  const loadPage = async () => {
    if (!pageId) return;
    setLoading(true);
    setPageError(null);
    setCodeError(null);
    try {
      const code = getCachedCode(pageId);
      const { ok, json } = await fetchPage(code);
      if (!ok) { setPageError(json.error || "This page is not available"); return; }
      setPageTitle(json.title ?? null);
      if (json.requiresCode) {
        if (code) clearCachedCode(pageId);
        setNeedsCode(true);
        return;
      }
      setNeedsCode(false);
      setActiveCode(code || null);
      setSavedCalcs(json.savedCalcs || []);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (pageId) loadPage(); }, [pageId]);

  const handleCodeSubmit = async () => {
    if (!pageId || !codeInput.trim()) return;
    setCheckingCode(true);
    setCodeError(null);
    const code = codeInput.trim();
    const { ok, json } = await fetchPage(code);
    setCheckingCode(false);
    if (!ok || json.requiresCode) { setCodeError(json.error || "Incorrect access code"); return; }
    setCachedCode(pageId, code);
    setActiveCode(code);
    setNeedsCode(false);
    setSavedCalcs(json.savedCalcs || []);
    setLoading(false);
  };

  const saveCalc = async () => {
    if (!pageId || !calcName.trim()) return;
    setSavingCalc(true);
    setCalcMessage(null);
    const res = await fetch(`/api/residual-land-solver-pages/public/${pageId}?code=${encodeURIComponent(activeCode || "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: calcName.trim(), inputs, state: state || null, gstMethod: gstMethod || null }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingCalc(false);
    if (!res.ok) { setCalcMessage(json.error || "Failed to save"); return; }
    setCalcMessage(json.updated ? "Updated." : "Saved.");
    setCalcName("");
    const { ok, json: reloaded } = await fetchPage(activeCode);
    if (ok && !reloaded.requiresCode) setSavedCalcs(reloaded.savedCalcs || []);
  };

  const loadCalc = (c: SavedCalc) => {
    setInputs({ ...EMPTY_INPUTS, ...(c.inputs || {}) });
    setState(c.state || "");
    setGstMethod(c.gst_method || "");
    setCalcName(c.name);
  };

  const deleteCalc = async (id: string) => {
    setSavedCalcs(prev => prev.filter(c => c.id !== id));
    const res = await fetch(`/api/residual-land-solver-pages/public/${pageId}?code=${encodeURIComponent(activeCode || "")}&id=${id}`, { method: "DELETE" });
    if (!res.ok) loadPage(); // roll back the optimistic removal
  };

  // Shared-assumptions contract: edits here land in the same
  // feasibility-inputs row the Feasibility subtab reads -- whether the
  // project came in as a prop or was linked at view time. Shared-page and
  // unlinked modes never touch it (no active project -> no-op).
  const saveInputs = async (next: FeasibilityInputs) => {
    if (!activeProjectId) return;
    setSaving(true);
    await fetch("/api/finance-model/feasibility-inputs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: activeProjectId, ...next }),
    });
    setSaving(false);
  };

  const changeGstMethod = async (value: GstMethod) => {
    setGstMethod(value);
    if (!activeProjectId) return;
    await fetch("/api/finance-model/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: activeProjectId, gstMethod: value }),
    });
  };

  const setField = (key: keyof FeasibilityInputs, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value === "" ? null : Number(value) }));
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-[12px] text-slate-400 py-10 justify-center"><Loader2 size={14} className="animate-spin" /> Loading...</div>;
  }

  if (pageId && needsCode) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center max-w-sm mx-auto">
        <Lock size={28} className="text-indigo-600 mx-auto mb-3" />
        <p className="text-[13px] font-bold text-slate-700 mb-1">{pageTitle || "Residual Land Solver"}</p>
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

  if (pageId && pageError) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
        <p className="text-[13px] font-medium text-rose-600 mb-1">Couldn&apos;t load</p>
        <p className="text-[12px] text-slate-400 mb-4">{pageError}</p>
      </div>
    );
  }

  const solved = solveResidualLandValue(inputs, state || null, gstMethod || null);
  const grid = runResidualLandGrid(inputs, state || null, gstMethod || null);
  const dutyWorking = solved && state ? explainStampDuty(state, solved.landPrice) : null;

  return (
    <div className="space-y-4">
      {pageId && pageTitle && <p className="text-[11px] text-slate-400 px-1">{pageTitle}</p>}

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Residual Land Value Solver</p>
          <div className="flex items-center gap-2">
            {saving && <Loader2 size={12} className="animate-spin text-slate-300" />}
            {allowProjectLink && !projectId && (
              linkedProject ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-3 py-1">
                  <Link2 size={11} /> {linkedProject.name}
                  <button onClick={() => setLinkedProject(null)} className="text-emerald-400 hover:text-rose-500" title="Unlink (keeps the numbers on screen)">
                    <X size={11} />
                  </button>
                </span>
              ) : (
                <button onClick={() => setShowLinkPicker(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
                  <Link2 size={11} /> Link to a project
                </button>
              )
            )}
            {activeProjectId && (
              <button onClick={() => setShowShare(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
                <Share2 size={11} /> Share
              </button>
            )}
          </div>
        </div>

        {allowProjectLink && !projectId && !linkedProject && showLinkPicker && (
          <div className="space-y-2">
            {linking ? (
              <p className="text-[12px] text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Linking -- pushing your entered values to the project...</p>
            ) : (
              <>
                <ProjectSearchPicker onSelect={linkToProject} placeholder="Search a project to link..." />
                <p className="text-[10px] text-slate-400">Linking pushes the values you&apos;ve entered into the project&apos;s shared feasibility assumptions (blank fields are left alone) and turns on saving + customer share links.</p>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[9px] text-slate-400 mb-1 block">State (drives stamp duty & title fees{activeProjectId ? "; prefilled from the linked property" : ""})</label>
            <select value={state} onChange={e => setState(e.target.value as AuState | "")} className="w-full text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
              <option value="">Select...</option>
              {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] text-slate-400 mb-1 block">GST method</label>
            <select value={gstMethod} onChange={e => changeGstMethod(e.target.value as GstMethod)} className="w-full text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
              <option value="">Select...</option>
              {GST_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {INPUT_FIELDS.map((group, gi) => (
          <div key={gi} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {group.map(f => (
              <div key={f.key}>
                <label className="text-[9px] text-slate-400 mb-1 block">{f.label}{f.suffix ? ` (${f.suffix})` : ""}</label>
                <input
                  type="number"
                  value={inputs[f.key] ?? ""}
                  onChange={e => setField(f.key, e.target.value)}
                  onBlur={() => saveInputs(inputs)}
                  placeholder="-"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400 bg-white"
                />
              </div>
            ))}
          </div>
        ))}

        <div className="border-t border-slate-100 pt-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Residual Land Value (max site bid at target margin)</p>
          <p className={`text-[26px] font-bold ${solved ? "text-emerald-600" : "text-slate-300"}`}>
            {solved ? money(solved.landPrice) : inputs.targetMarginPct == null ? "- set a target margin" : "- not achievable at any price"}
          </p>
        </div>

        {solved && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">At That Price</p>
            <Row label="Land price" value={money(solved.landPrice)} indent />
            <Row label="Stamp duty (re-derived at the solved price)" value={money(solved.stampDuty)} indent />
            <Row label="Title transfer fee" value={solved.titleTransferFee != null ? money(solved.titleTransferFee) : state ? "- unverified for this state, enter manually" : "-"} indent />
            <Row label="Other acquisition costs" value={money(inputs.otherAcquisitionCosts ?? 0)} indent />
            <Row label="Total acquisition" value={money(solved.result.acquisition)} bold />
            <Row label="Total development cost" value={money(solved.result.totalDevelopmentCost)} indent />
            <Row label="Net profit" value={money(solved.result.netProfit)} indent />
            <Row label="Margin on cost" value={solved.result.marginOnCostPct != null ? `${solved.result.marginOnCostPct.toFixed(1)}%` : "-"} indent />
            <Row label="Required equity" value={money(solved.result.requiredEquity)} indent />
            <Row label="Return on equity" value={solved.result.returnOnEquityPct != null ? `${solved.result.returnOnEquityPct.toFixed(1)}%` : "-"} indent />
            {dutyWorking && <p className="text-[10px] text-slate-400 mt-2">{dutyWorking.explanation}</p>}
          </div>
        )}
      </div>

      {activeProjectId && showShare && <SharePanel projectId={activeProjectId} />}

      {/* ── Saved calculations (shared-page mode only -- server-side, per link) ── */}
      {pageId && (
        <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Your Saved Calculations</p>
          {savedCalcs.length === 0 && <p className="text-[12px] text-slate-400">Nothing saved yet -- name the current calculation below to keep it.</p>}
          {savedCalcs.map(c => (
            <div key={c.id} className="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-2xl">
              <div>
                <p className="text-[12px] font-bold text-slate-700">{c.name}</p>
                <p className="text-[10px] text-slate-400">
                  {c.state || "No state"}{c.gst_method ? ` · ${c.gst_method}` : ""} · saved {new Date(c.updated_at).toLocaleDateString("en-AU")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => loadCalc(c)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
                  <FolderOpen size={12} /> Load
                </button>
                <button onClick={() => deleteCalc(c.id)} className="p-1 text-slate-300 hover:text-rose-500" title="Delete">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <input
              placeholder="Name this calculation"
              value={calcName}
              onChange={e => setCalcName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveCalc()}
              className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-52"
            />
            <button onClick={saveCalc} disabled={savingCalc || !calcName.trim()} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full disabled:opacity-40">
              {savingCalc ? <Loader2 size={11} className="animate-spin" /> : <><Save size={12} /> Save</>}
            </button>
            {calcMessage && <p className="text-[11px] text-emerald-600">{calcMessage}</p>}
          </div>
          <p className="text-[10px] text-slate-400">Saving an existing name overwrites it. Saved calculations stay with this link -- reopen it (with your access code) from any device to get them back.</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 overflow-x-auto">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Residual Land Value Grid</p>
        <p className="text-[10px] text-slate-400 mb-3">Rows: target margin on cost. Columns: sale price change. Each cell is the max supportable land price for that combination.</p>
        <table className="w-full text-[11px] min-w-[480px] text-center">
          <thead>
            <tr className="text-slate-400 text-[9px] font-bold">
              <th></th>
              {GRID_SALE_PRICE_DELTAS.map(d => <th key={d} className="py-1">{d > 0 ? "+" : ""}{d}%</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map(row => (
              <tr key={row.targetMarginPct} className={row.targetMarginPct === inputs.targetMarginPct ? "bg-indigo-50/50" : ""}>
                <td className="text-slate-400 font-bold pr-2 whitespace-nowrap">{row.targetMarginPct}%</td>
                {row.cells.map(c => (
                  <td key={c.salePriceDeltaPct} className={`py-1 ${c.landPrice == null ? "text-slate-300" : "text-slate-700"}`}>
                    {c.landPrice != null ? money(c.landPrice) : "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-[11px] text-slate-400 flex items-start gap-2">
        <Landmark size={13} className="mt-0.5 shrink-0" />
        <span>
          Solved by bisection with stamp duty and title fees re-derived at every candidate price (the land-price → duty → cost → margin circularity is resolved, not approximated). Finance cost still uses the standard feasibility shorthand -- a progressively-drawn loan&apos;s average balance ≈ 50% of peak debt -- not a dated monthly drawdown schedule. Duty rates are general (non-PPR, no concessions or foreign surcharges); treat the result as a bid ceiling to test, not a quote.
          {activeProjectId ? " Assumptions are shared with the Finance Model's Feasibility subtab -- editing them here updates there, and vice versa." : ""}
        </span>
      </div>
    </div>
  );
}
