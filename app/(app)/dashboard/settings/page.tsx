"use client";

import React, { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import {
  Database, Clock, Copy, ArrowLeft,
  ChevronRight, AlertCircle,
  Trash2, Building2, MapPin, LayoutGrid, CheckSquare, Table2, Upload, Wand2, X, ChevronDown, ChevronUp, Share2, Maximize2, PenSquare, Receipt,
  Loader2, ArrowLeftRight,
} from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { perfLogPageStart, perfLogPageReady } from "@/lib/perfLog";

// Deferred: the menu (this page's default landing view) doesn't need any of
// these -- each one only renders once its own view/modal is actually open,
// so there's no reason their combined weight should load before the menu
// can even show its buttons.
const ImportModal = dynamic(() => import("@/components/ImportModal"));
const DataFormattingTool = dynamic(() => import("@/components/DataFormattingTool"));
const SchemaVisualisation = dynamic(() => import("@/components/SchemaVisualisation"));
const CustomTableBuilder = dynamic(() => import("@/components/CustomTableBuilder"));
const PublicTaskPagesTab = dynamic(() => import("@/components/settings/PublicTaskPagesTab"));
const ClientUpdatePagesTab = dynamic(() => import("@/components/settings/ClientUpdatePagesTab"));
const PrecedentsSettingsTab = dynamic(() => import("@/components/settings/PrecedentsSettingsTab"));
const InvoiceTemplateSettingsTab = dynamic(() => import("@/components/settings/InvoiceTemplateSettingsTab"));


type SettingsView = "menu" | "history" | "schema" | "duplicates_menu" | "duplicates_view" | "public_pages" | "precedents" | "invoice_template";

type SystemDupTable = "properties" | "entities" | "projects" | "tasks";

// Discriminated union covering every table the duplicate scanner can run
// against -- the 4 system tables (hardcoded, they never change) plus
// whichever custom tables this company has (sourced from useCustomTables()
// below, so a new custom table shows up here automatically).
type DupType =
  | { kind: "system"; table: SystemDupTable }
  | { kind: "custom"; tableId: string; tableSlug: string; tableName: string };

function dupTypeKey(t: DupType): string {
  return t.kind === "system" ? `system:${t.table}` : `custom:${t.tableId}`;
}
function dupTypeLabel(t: DupType): string {
  return t.kind === "system" ? t.table.charAt(0).toUpperCase() + t.table.slice(1) : t.tableName;
}

interface DuplicatePair {
  idA: string;
  idB: string;
  labelA: string;
  labelB: string;
  score: number;
  reason: string;
  fieldsA: Record<string, any>;
  fieldsB: Record<string, any>;
}

// Cached via useQuery (see SettingsPage below) so revisiting either view
// within staleTime -- even just switching sub-views and back, no full
// reload needed -- shows the last result immediately instead of
// re-querying every single time.
async function fetchImportHistory() {
  const { data } = await supabase
    .from("import_history")
    .select(`*, profiles:user_id(full_name)`)
    .is("deleted_at", null)
    .order('created_at', { ascending: false });
  return data || [];
}

interface DuplicateScanResult {
  pairs: DuplicatePair[];
  // key -> human label (e.g. "custom_field:<uuid>" -> "ABN") for rendering
  // the per-record field grid below -- see app/api/duplicates/scan/
  // route.ts's fieldLabels.
  fieldLabels: Record<string, string>;
}

// Scans via the app-owned duplicate-matching engine (app/api/duplicates/
// scan/route.ts) instead of the old find_potential_duplicates/
// find_entity_duplicates/find_project_duplicates Postgres RPCs -- those were
// opaque (untracked in this repo), hardcoded to 3 system tables, and had no
// path to ever support custom tables.
async function fetchDuplicatesData(dupType: DupType): Promise<DuplicateScanResult> {
  const body = dupType.kind === "system"
    ? { tableKind: "system", table: dupType.table }
    : { tableKind: "custom", table: dupType.tableId };
  const res = await fetch("/api/duplicates/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  // A failed scan used to just come back as an empty pairs array here --
  // indistinguishable from "genuinely no duplicates" in the UI, with
  // nothing to go on to debug it. Throwing surfaces the real error via
  // useQuery's own error state instead (rendered below).
  if (!res.ok) throw new Error(json?.error || `Scan failed (${res.status})`);
  return { pairs: json?.pairs || [], fieldLabels: json?.fieldLabels || {} };
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const { companyId, userId } = useCompany();
  const { tables: customTables } = useCustomTables(userId);
  // Precedents is a Law Firm-template-exclusive feature -- see
  // Sidebar.tsx's matching hasLawFirmTemplate for the full reasoning.
  const hasLawFirmTemplate = customTables.some(t => t.slug === 'trust-transactions');
  const [view, setView] = useState<SettingsView>("menu");
  const [publicPagesTab, setPublicPagesTab] = useState<"tasks" | "client_updates">("tasks");

  // The sidebar's Settings panel deep-links straight to a view (e.g.
  // ?view=history) instead of always landing on the menu first. This is a
  // one-way sync (param → state) on top of the existing local nav -- back
  // button/menu clicks inside this page still just call setView directly.
  useEffect(() => {
    const v = searchParams.get("view");
    if (v && ["menu", "history", "schema", "duplicates_menu", "duplicates_view", "public_pages", "precedents", "invoice_template"].includes(v)) {
      setView(v as SettingsView);
    }
  }, [searchParams.get("view")]);

  const [activeDupType, setActiveDupType] = useState<DupType>({ kind: "system", table: "properties" });
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [mergingPairKey, setMergingPairKey] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFormatterOpen, setIsFormatterOpen] = useState(false);
  const [selectedPairKeys, setSelectedPairKeys] = useState<Set<string>>(new Set());
  const [keepSideByPair, setKeepSideByPair] = useState<Record<string, "A" | "B">>({});
  const [expandedPairKey, setExpandedPairKey] = useState<string | null>(null);
  const [bulkMerging, setBulkMerging] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");

  const queryClient = useQueryClient();
  const historyQueryKey = ['settings-history', companyId] as const;
  const { data: history = [], isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: historyQueryKey,
    queryFn: fetchImportHistory,
    enabled: view === "history",
    staleTime: 60 * 1000,
  });
  const duplicatesQueryKey = ['settings-duplicates', companyId, dupTypeKey(activeDupType)] as const;
  const { data: duplicatesData, isLoading: duplicatesLoading, error: duplicatesError } = useQuery({
    queryKey: duplicatesQueryKey,
    queryFn: () => fetchDuplicatesData(activeDupType),
    enabled: view === "duplicates_view" && !!companyId,
    staleTime: 60 * 1000,
  });
  const pairs = duplicatesData?.pairs ?? [];
  const fieldLabels = duplicatesData?.fieldLabels ?? {};
  const loading = view === "history" ? historyLoading : view === "duplicates_view" ? duplicatesLoading : false;

  // Selection/expansion state is keyed by pair, which only ever makes sense
  // for whichever table is currently active -- switching tables (or away
  // from this view entirely) without clearing it would let a stale
  // selection silently carry over and get bulk-merged against the wrong
  // table on the next click.
  useEffect(() => {
    setSelectedPairKeys(new Set());
    setKeepSideByPair({});
    setExpandedPairKey(null);
  }, [duplicatesQueryKey.join("|")]);

  useProgressBarWhile(loading);

  // Each sub-view here is switched client-side (no real navigation), not a
  // separate URL -- so this tracks per-view rather than per-mount, same
  // ref-keyed start pattern DashboardViewPage/CustomTableMasterPage use for
  // their own slug-keyed navigation. Unlike the old plain-useState version
  // of this, `historyLoading`/`duplicatesLoading` come from useQuery and are
  // computed synchronously as part of that hook's own render (not via a
  // subsequent effect+setState), so watching them here doesn't have the
  // stale-closure race the old "ready fires 1ms after start" bug had --
  // and it correctly reports ~0ms when a revisit is served straight from
  // the query cache instead of hitting the network again.
  const perfStartedForRef = React.useRef<string | null>(null);
  const perfPendingReadyRef = React.useRef<SettingsView | null>(null);
  useEffect(() => {
    if (perfStartedForRef.current === view) return;
    perfStartedForRef.current = view;
    perfLogPageStart("settings", view);
    if (view === "history" || view === "duplicates_view") {
      perfPendingReadyRef.current = view;
    } else {
      // Nothing to fetch for this view -- ready immediately.
      perfLogPageReady("settings", view);
    }
  }, [view]);

  useEffect(() => {
    if (view === "history" && !historyLoading && perfPendingReadyRef.current === "history") {
      perfPendingReadyRef.current = null;
      perfLogPageReady("settings", "history");
    }
  }, [historyLoading, view]);
  useEffect(() => {
    if (view === "duplicates_view" && !duplicatesLoading && perfPendingReadyRef.current === "duplicates_view") {
      perfPendingReadyRef.current = null;
      perfLogPageReady("settings", "duplicates_view");
    }
  }, [duplicatesLoading, view]);

  const handleArchiveLog = async (id: string) => {
    if (!window.confirm("Archive this import log? It will be hidden but not permanently deleted.")) return;
    const { error } = await supabase.from("import_history").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (!error) queryClient.setQueryData(historyQueryKey, (old: any[] = []) => old.filter(h => h.id !== id));
  };

  // Merges one duplicate pair: reassigns everything that referenced
  // `mergeId` onto `keepId` and archives `mergeId` -- see
  // supabase/migrations/20260729290000_duplicate_merge_rpc.sql for exactly
  // what gets reassigned. Runs via the caller's own session (not a
  // service-role API route) so the existing trg_prevent_non_admin_delete
  // trigger is what actually enforces "only a company admin can do this",
  // same as every other archive path in this app -- a non-admin gets a
  // clean rejection here, nothing partially reassigned.
  const handleMerge = async (pair: DuplicatePair, keepId: string, mergeId: string, keepLabel: string, mergeLabel: string) => {
    if (!window.confirm(`Keep "${keepLabel}" and merge "${mergeLabel}" into it? Anything referencing "${mergeLabel}" will be repointed to "${keepLabel}", then "${mergeLabel}" will be archived.`)) return;
    const pairKey = `${pair.idA}:${pair.idB}`;
    setMergingPairKey(pairKey);
    try {
      const { data, error } = await supabase.rpc("merge_duplicate_records", {
        p_company_id: companyId,
        p_table_kind: activeDupType.kind,
        p_table: activeDupType.kind === "system" ? activeDupType.table : null,
        p_table_id: activeDupType.kind === "custom" ? activeDupType.tableId : null,
        p_keep_id: keepId,
        p_merge_id: mergeId,
      });
      if (error) {
        if (error.code === "42501") {
          window.alert("Only a company admin can merge duplicates.");
        } else {
          window.alert(error.message || "Couldn't merge these records.");
        }
        return;
      }
      queryClient.setQueryData(duplicatesQueryKey, (old?: DuplicateScanResult) =>
        old ? { ...old, pairs: old.pairs.filter(p => !(p.idA === pair.idA && p.idB === pair.idB)) } : old
      );
      const reassigned = data?.reassigned ?? 0;
      window.alert(`Merged. ${reassigned} reference${reassigned === 1 ? '' : 's'} repointed to "${keepLabel}".`);
    } finally {
      setMergingPairKey(null);
    }
  };

  // Best-effort guess at which side of a pair to keep when the user bulk-
  // merges instead of picking a side by hand: whichever record has more
  // populated fields wins (less data loss), and if that's a tie, whichever
  // is older (closer to how this record actually first entered the
  // system). Purely a default -- clicking either name in a row overrides it
  // per-pair before merging.
  const fieldCompleteness = (fields: Record<string, any>) =>
    Object.entries(fields || {}).filter(([k, v]) => k !== "id" && k !== "created_at" && v !== null && v !== undefined && v !== "").length;
  const defaultKeepSide = (pair: DuplicatePair): "A" | "B" => {
    const ca = fieldCompleteness(pair.fieldsA);
    const cb = fieldCompleteness(pair.fieldsB);
    if (ca !== cb) return ca > cb ? "A" : "B";
    const da = pair.fieldsA?.created_at, db = pair.fieldsB?.created_at;
    if (da && db && da !== db) return da < db ? "A" : "B";
    return "A";
  };
  const keepSideFor = (pair: DuplicatePair): "A" | "B" =>
    keepSideByPair[`${pair.idA}:${pair.idB}`] ?? defaultKeepSide(pair);

  const allPairsSelected = pairs.length > 0 && selectedPairKeys.size === pairs.length;
  const toggleSelectAll = () =>
    setSelectedPairKeys(allPairsSelected ? new Set() : new Set(pairs.map(p => `${p.idA}:${p.idB}`)));
  const toggleSelectPair = (pairKey: string) =>
    setSelectedPairKeys(prev => {
      const next = new Set(prev);
      if (next.has(pairKey)) next.delete(pairKey); else next.add(pairKey);
      return next;
    });

  // Runs one RPC call per selected pair sequentially (not in parallel) --
  // two selected pairs can share a record (A/B and B/C both selected), so a
  // later call in the same batch can legitimately find its target already
  // archived by an earlier one. That shows up as a normal per-pair RPC
  // error here, not a crash -- counted as "skipped" and reported in the
  // summary rather than aborting the whole batch.
  const handleBulkMerge = async () => {
    const targets = pairs.filter(p => selectedPairKeys.has(`${p.idA}:${p.idB}`));
    if (!targets.length) return;
    if (!window.confirm(`Merge ${targets.length} duplicate pair${targets.length === 1 ? "" : "s"}? For each pair, the less-complete record will be repointed onto the other and then archived.`)) return;
    setBulkMerging(true);
    let merged = 0, failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const pair = targets[i];
      setBulkProgress(`${i + 1}/${targets.length}`);
      const keep = keepSideFor(pair);
      const keepId = keep === "A" ? pair.idA : pair.idB;
      const mergeId = keep === "A" ? pair.idB : pair.idA;
      const { error } = await supabase.rpc("merge_duplicate_records", {
        p_company_id: companyId,
        p_table_kind: activeDupType.kind,
        p_table: activeDupType.kind === "system" ? activeDupType.table : null,
        p_table_id: activeDupType.kind === "custom" ? activeDupType.tableId : null,
        p_keep_id: keepId,
        p_merge_id: mergeId,
      });
      if (error) failed++; else merged++;
    }
    setBulkMerging(false);
    setBulkProgress("");
    setSelectedPairKeys(new Set());
    await queryClient.invalidateQueries({ queryKey: duplicatesQueryKey });
    window.alert(`${merged} merged.${failed ? ` ${failed} skipped (already merged, or only a company admin can merge).` : ""}`);
  };

  const formatTargetTable = (table: string) =>
    (table || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const headerTitle = () => {
    if (view === 'menu') return 'Settings';
    if (view === 'schema') return 'Schema configuration';
    if (view === 'history') return 'Import history';
    if (view === 'duplicates_menu') return 'Duplicates';
    if (view === 'duplicates_view') return `Duplicates: ${dupTypeLabel(activeDupType)}`;
    if (view === 'public_pages') return 'Public pages';
    if (view === 'precedents') return 'Precedents';
    if (view === 'invoice_template') return 'Invoice template';
    return 'Settings';
  };

  const handleBack = () => {
    if (view === 'duplicates_view') setView('duplicates_menu');
    else setView('menu');
  };

  const SYSTEM_DUP_CARDS: { table: SystemDupTable; label: string; icon: typeof MapPin }[] = [
    { table: 'properties', label: 'Assets', icon: MapPin },
    { table: 'entities', label: 'Entities', icon: Building2 },
    { table: 'projects', label: 'Projects', icon: LayoutGrid },
    { table: 'tasks', label: 'Tasks', icon: CheckSquare },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">
      <header className="bg-white p-8 border-b border-slate-100 shrink-0 flex items-center gap-6">
        {view !== "menu" && (
          <button onClick={handleBack} className="p-2 hover:bg-slate-50 rounded-full transition-all text-slate-400">
            <ArrowLeft size={20}/>
          </button>
        )}
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight capitalize">{headerTitle()}</h1>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest mt-1">Management administration</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-4 pb-20">

          {/* ── MENU ── */}
          {view === "menu" && (
            <div className="grid grid-cols-1 gap-4">
              <button onClick={() => setIsImportOpen(true)} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-indigo-600 transition-colors"><Upload size={20} /></div>
                  <span className="text-[15px] font-medium text-slate-700">Mass data synchronization engine</span>
                </div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </button>

              <button onClick={() => setView("history")} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-indigo-600 transition-colors"><Clock size={20} /></div>
                  <span className="text-[15px] font-medium text-slate-700">Import history</span>
                </div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </button>

              <button onClick={() => setView("schema")} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-indigo-600 transition-colors"><Database size={20} /></div>
                  <span className="text-[15px] font-medium text-slate-700">Schema configuration</span>
                </div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </button>

              <button onClick={() => setIsFormatterOpen(true)} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-indigo-600 transition-colors"><Wand2 size={20} /></div>
                  <span className="text-[15px] font-medium text-slate-700">Database case standardizer</span>
                </div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </button>

              <button onClick={() => setView("duplicates_menu")} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-amber-600 transition-colors"><Copy size={20} /></div>
                  <span className="text-[15px] font-medium text-slate-700">Reconciliation tool (Duplicates)</span>
                </div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </button>

              <button onClick={() => setView("public_pages")} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-indigo-600 transition-colors"><Share2 size={20} /></div>
                  <span className="text-[15px] font-medium text-slate-700">Public pages</span>
                </div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </button>

              {hasLawFirmTemplate && (
                <button onClick={() => setView("precedents")} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                  <div className="flex items-center gap-5">
                    <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-amber-600 transition-colors"><PenSquare size={20} /></div>
                    <span className="text-[15px] font-medium text-slate-700">Precedents</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
                </button>
              )}

              <button onClick={() => setView("invoice_template")} className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-indigo-600 transition-colors"><Receipt size={20} /></div>
                  <span className="text-[15px] font-medium text-slate-700">Invoice template</span>
                </div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </button>
            </div>
          )}

          {/* ── PRECEDENTS ── */}
          {view === 'precedents' && hasLawFirmTemplate && <PrecedentsSettingsTab />}

          {/* ── INVOICE TEMPLATE ── */}
          {view === 'invoice_template' && <InvoiceTemplateSettingsTab />}

          {/* ── IMPORT HISTORY ── */}
          {view === "history" && (
            <div className="space-y-3 animate-in fade-in">
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map(i => <div key={i} className="h-[76px] bg-white border border-slate-200 rounded-[32px] animate-pulse" />)}
                </div>
              ) : history.length === 0 ? (
                <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-20">No import history yet</p>
              ) : (
                history.map(log => {
                  const isExpanded = expandedLogId === log.id;
                  const results = log.results_json || [];
                  const successCount = log.success_count ?? results.filter((r: any) => r.status === 'new' || r.status === 'updated').length;
                  const failedCount = log.error_count ?? results.filter((r: any) => r.status === 'failed').length;
                  const totalRows = log.total_rows ?? results.length;

                  return (
                    <div key={log.id} className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between p-6">
                        <button onClick={() => setExpandedLogId(isExpanded ? null : log.id)} className="flex items-center gap-5 flex-1 text-left">
                          <div className="p-3 bg-slate-50 rounded-2xl text-slate-400">
                            {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                          </div>
                          <div>
                            <p className="text-[15px] font-medium text-slate-900">{log.filename || 'Unnamed import'}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              {formatTargetTable(log.target_table)} · {new Date(log.created_at).toLocaleString('en-AU')} · by {log.profiles?.full_name || 'Unknown'} · {totalRows} rows · <span className="text-emerald-600">{successCount} ok</span> · <span className="text-red-500">{failedCount} failed</span>
                            </p>
                          </div>
                        </button>
                        <button onClick={() => handleArchiveLog(log.id)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all" title="Archive this log">
                          <Trash2 size={16}/>
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-100 p-6 bg-slate-50/50 overflow-x-auto">
                          {results.length === 0 ? (
                            <p className="text-[11px] text-slate-300 italic py-4">No row-level details stored for this import.</p>
                          ) : (
                            <table className="w-full text-left text-[11px] min-w-max">
                              <thead className="text-slate-400">
                                <tr>
                                  <th className="p-2 font-bold uppercase text-[9px]">Status</th>
                                  <th className="p-2 font-bold uppercase text-[9px]">Identifier</th>
                                  <th className="p-2 font-bold uppercase text-[9px]">Message</th>
                                </tr>
                              </thead>
                              <tbody>
                                {results.map((r: any, i: number) => (
                                  <tr key={i} className="border-t border-slate-100">
                                    <td className="p-2">
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${r.status === 'failed' ? 'bg-red-50 text-red-600' : r.status === 'updated' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                        {r.status}
                                      </span>
                                    </td>
                                    <td className="p-2 font-bold text-slate-700">{r.identifier}</td>
                                    <td className="p-2 text-slate-500">{r.message || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── PUBLIC PAGES (task pages + client update pages) ── */}
          {view === 'public_pages' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <button onClick={() => setPublicPagesTab("tasks")}
                  className={`px-4 py-2 rounded-full text-[11px] font-bold transition-colors ${
                    publicPagesTab === "tasks" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}>
                  Task pages
                </button>
                <button onClick={() => setPublicPagesTab("client_updates")}
                  className={`px-4 py-2 rounded-full text-[11px] font-bold transition-colors ${
                    publicPagesTab === "client_updates" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}>
                  Detailed tables
                </button>
              </div>
              {publicPagesTab === "tasks" ? <PublicTaskPagesTab /> : <ClientUpdatePagesTab />}
            </div>
          )}

          {/* ── SCHEMA VISUALISATION ── */}

          {view === 'schema' && (
            <div className="space-y-8">
              <CustomTableBuilder />
              <Link href="/dashboard/schema"
                className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-[32px] hover:border-indigo-500 transition-all group shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:text-indigo-600 transition-colors"><Maximize2 size={20} /></div>
                  <div>
                    <span className="text-[15px] font-medium text-slate-700">Open full schema map</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">View all tables and their relations at full size</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-200 group-hover:text-indigo-600 transition-all"/>
              </Link>
              <SchemaVisualisation />
            </div>
          )}


          {/* ── DUPLICATES MENU ──
              One flat list of every table -- system and custom are the same
              app-level machinery behind the scenes (see app/api/duplicates/
              scan/route.ts and the DupType union above), and that split
              isn't a distinction a user picking a table to check for
              duplicates needs to see or think about. */}
          {view === "duplicates_menu" && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in fade-in">
              {SYSTEM_DUP_CARDS.map((cat) => (
                <button key={cat.table} onClick={() => { setActiveDupType({ kind: 'system', table: cat.table }); setView("duplicates_view"); }} className="p-10 bg-white border border-slate-200 rounded-[48px] flex flex-col items-center gap-5 hover:border-indigo-500 hover:shadow-xl transition-all group">
                  <div className="p-5 bg-slate-50 rounded-[24px] text-slate-400 group-hover:text-indigo-600 transition-all"><cat.icon size={40} /></div>
                  <span className="font-medium text-slate-700 uppercase text-[11px] tracking-widest">{cat.label}</span>
                </button>
              ))}
              {customTables.map((t) => {
                const Icon = (LucideIcons as any)[t.icon] || Table2;
                return (
                  <button key={t.id} onClick={() => { setActiveDupType({ kind: 'custom', tableId: t.id, tableSlug: t.slug, tableName: t.name }); setView("duplicates_view"); }} className="p-10 bg-white border border-slate-200 rounded-[48px] flex flex-col items-center gap-5 hover:border-indigo-500 hover:shadow-xl transition-all group">
                    <div className="p-5 bg-slate-50 rounded-[24px] text-slate-400 group-hover:text-indigo-600 transition-all"><Icon size={40} /></div>
                    <span className="font-medium text-slate-700 uppercase text-[11px] tracking-widest">{t.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── DUPLICATES VIEW ──
              Rows, not one giant side-by-side card per pair (the previous
              design) -- lets a user scan a whole scan result at a glance and
              select several pairs at once. Each row still expands (chevron)
              into the original two-column field comparison + per-side merge
              buttons for a closer look before committing. */}
          {view === "duplicates_view" && (
            <div className="space-y-4 animate-in fade-in">
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map(i => <div key={i} className="h-16 bg-white border border-slate-200 rounded-2xl animate-pulse" />)}
                </div>
              ) : duplicatesError ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
                  <AlertCircle size={20} className="text-red-400" />
                  <p className="text-[11px] text-red-500 font-bold uppercase tracking-widest">Scan failed</p>
                  <p className="text-[12px] text-slate-400">{(duplicatesError as Error).message}</p>
                </div>
              ) : pairs.length === 0 ? (
                <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-20">No duplicates found</p>
              ) : (
                <>
                  <div className="flex items-center justify-between px-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={allPairsSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-indigo-600" />
                      <span className="text-[11px] font-bold text-slate-500">{selectedPairKeys.size} of {pairs.length} selected</span>
                    </label>
                    <button
                      onClick={handleBulkMerge}
                      disabled={!selectedPairKeys.size || bulkMerging}
                      className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-indigo-600 disabled:opacity-40 transition-all"
                    >
                      {bulkMerging ? <Loader2 size={12} className="animate-spin" /> : <CheckSquare size={12} />}
                      {bulkMerging ? `Merging ${bulkProgress}…` : `Merge selected (${selectedPairKeys.size})`}
                    </button>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm divide-y divide-slate-100">
                    {pairs.map((pair) => {
                      const pairKey = `${pair.idA}:${pair.idB}`;
                      const isMerging = mergingPairKey === pairKey;
                      const isSelected = selectedPairKeys.has(pairKey);
                      const isExpanded = expandedPairKey === pairKey;
                      const keep = keepSideFor(pair);
                      const sides: { id: string; label: string; fields: Record<string, any>; otherId: string; otherLabel: string }[] = [
                        { id: pair.idA, label: pair.labelA, fields: pair.fieldsA, otherId: pair.idB, otherLabel: pair.labelB },
                        { id: pair.idB, label: pair.labelB, fields: pair.fieldsB, otherId: pair.idA, otherLabel: pair.labelA },
                      ];
                      return (
                        <div key={pairKey} className={isSelected ? "bg-indigo-50/50" : ""}>
                          <div className="flex items-center gap-4 px-6 py-3.5">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelectPair(pairKey)} className="w-4 h-4 rounded accent-indigo-600 shrink-0" />
                            <button onClick={() => setExpandedPairKey(isExpanded ? null : pairKey)} className="text-slate-300 hover:text-slate-600 shrink-0" title={isExpanded ? "Collapse" : "Compare fields"}>
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <div className="flex-1 min-w-0 flex items-center gap-2.5">
                              <button onClick={() => setKeepSideByPair(prev => ({ ...prev, [pairKey]: "A" }))} title="Keep this one"
                                className={`text-[13px] font-medium truncate text-left transition-colors ${keep === "A" ? "text-slate-900" : "text-slate-400 line-through decoration-slate-300 hover:text-slate-600"}`}>
                                {pair.labelA}
                              </button>
                              <ArrowLeftRight size={11} className="text-slate-300 shrink-0" />
                              <button onClick={() => setKeepSideByPair(prev => ({ ...prev, [pairKey]: "B" }))} title="Keep this one"
                                className={`text-[13px] font-medium truncate text-left transition-colors ${keep === "B" ? "text-slate-900" : "text-slate-400 line-through decoration-slate-300 hover:text-slate-600"}`}>
                                {pair.labelB}
                              </button>
                            </div>
                            <span className="hidden md:block text-[9px] text-slate-400 uppercase font-bold tracking-widest shrink-0 max-w-[160px] truncate">{pair.reason}</span>
                            <span className="text-[11px] font-bold text-indigo-600 shrink-0 w-10 text-right">{Math.round(pair.score * 100)}%</span>
                            <button
                              onClick={() => handleMerge(pair, keep === "A" ? pair.idA : pair.idB, keep === "A" ? pair.idB : pair.idA, keep === "A" ? pair.labelA : pair.labelB, keep === "A" ? pair.labelB : pair.labelA)}
                              disabled={isMerging || bulkMerging}
                              className="px-3 py-1.5 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-indigo-600 disabled:opacity-40 transition-all shrink-0"
                            >
                              {isMerging ? <Loader2 size={12} className="animate-spin" /> : "Merge"}
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row">
                              {sides.map((side, n) => (
                                <div key={side.id} className={`flex-1 p-8 ${n === 0 ? "md:border-r border-slate-200" : ""}`}>
                                  <p className="text-[15px] font-medium text-slate-900 leading-tight uppercase mb-5">{side.label}</p>
                                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-6">
                                    {Object.entries(side.fields).filter(([key]) => key !== "id" && key !== "created_at").slice(0, 6).map(([key, value]) => (
                                      <div key={key}>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{fieldLabels[key] || key.replace(/_/g, " ")}</p>
                                        <p className="text-[13px] font-medium text-slate-700 truncate">{value === null || value === undefined || value === "" ? "-" : String(value)}</p>
                                      </div>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => handleMerge(pair, side.id, side.otherId, side.label, side.otherLabel)}
                                    disabled={isMerging || bulkMerging}
                                    className="px-4 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-indigo-600 disabled:opacity-40 transition-all"
                                  >
                                    {isMerging ? "Merging…" : "Merge into this record →"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </main>
      {isImportOpen && (
        <ImportModal isOpen onClose={() => setIsImportOpen(false)} onRefresh={() => refetchHistory()} />
      )}
      {isFormatterOpen && (
        <DataFormattingTool isOpen onClose={() => setIsFormatterOpen(false)} onRefresh={() => {}} />
      )}
    </div>
  );
}
