"use client";

// Renders a propose_records tool call (see lib/ai/tableBuilderTools.ts,
// app/api/ai/chat/route.ts) as a selectable checklist directly inside an
// assistant message (AiChatThread.tsx) -- the interactive "review these
// specific records without leaving the chat" surface the user asked for
// when the AI proposes something like matters to archive. All/some/one/none
// selectable (defaults to all selected, since the common case is agreeing
// with the suggestion wholesale), each row expandable inline for its full
// field detail fetched on demand, and a single action button that calls
// app/api/ai/archive-records directly -- a plain UI-to-API call, not
// another model round-trip.
import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, Archive } from "lucide-react";

interface Candidate {
  record_id: string;
  table_id: string;
  label: string;
  reason: string;
}

export interface ProposedRecordsData {
  summary: string;
  action_label: string;
  candidates: Candidate[];
}

type DetailField = { label: string; value: unknown };

export default function ProposedRecordsList({ data }: { data: ProposedRecordsData }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(data.candidates.map((c) => c.record_id)));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailByRecord, setDetailByRecord] = useState<Record<string, DetailField[] | "loading" | "error">>({});
  const [archiving, setArchiving] = useState(false);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.size === data.candidates.length ? new Set() : new Set(data.candidates.map((c) => c.record_id))));
  };

  const toggleExpand = async (c: Candidate) => {
    if (expandedId === c.record_id) { setExpandedId(null); return; }
    setExpandedId(c.record_id);
    if (detailByRecord[c.record_id]) return;
    setDetailByRecord((prev) => ({ ...prev, [c.record_id]: "loading" }));
    try {
      const res = await fetch(`/api/ai/proposed-record-detail?table_id=${encodeURIComponent(c.table_id)}&record_id=${encodeURIComponent(c.record_id)}`);
      const json = await res.json().catch(() => null);
      setDetailByRecord((prev) => ({ ...prev, [c.record_id]: res.ok && json?.fields ? json.fields : "error" }));
    } catch {
      setDetailByRecord((prev) => ({ ...prev, [c.record_id]: "error" }));
    }
  };

  const handleArchiveSelected = async () => {
    const ids = data.candidates.filter((c) => selectedIds.has(c.record_id) && !archivedIds.has(c.record_id)).map((c) => c.record_id);
    if (!ids.length) return;
    setArchiving(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/archive-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_ids: ids }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to archive");
      setArchivedIds((prev) => new Set([...prev, ...(json.archivedIds ?? ids)]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setArchiving(false);
    }
  };

  const allArchived = data.candidates.every((c) => archivedIds.has(c.record_id));

  return (
    <div className="mt-3 border border-slate-200/70 rounded-2xl overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <p className="text-[13px] text-slate-600">{data.summary}</p>
        {!allArchived && (
          <button onClick={toggleSelectAll} className="text-[11px] font-bold text-slate-400 hover:text-slate-700 shrink-0">
            {selectedIds.size === data.candidates.length ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {data.candidates.map((c) => {
          const isArchived = archivedIds.has(c.record_id);
          const detail = detailByRecord[c.record_id];
          const isExpanded = expandedId === c.record_id;
          return (
            <div key={c.record_id} className={isArchived ? "opacity-50" : ""}>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <button
                  onClick={() => !isArchived && toggleSelected(c.record_id)}
                  disabled={isArchived}
                  className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                    selectedIds.has(c.record_id) ? "bg-indigo-600 border-indigo-600" : "border-slate-300"
                  }`}
                >
                  {selectedIds.has(c.record_id) && <Check size={12} className="text-white" />}
                </button>
                <button onClick={() => toggleExpand(c)} className="flex-1 min-w-0 flex items-center gap-1.5 text-left">
                  {isExpanded ? <ChevronDown size={12} className="text-slate-300 shrink-0" /> : <ChevronRight size={12} className="text-slate-300 shrink-0" />}
                  <span className="min-w-0">
                    <span className="text-[13px] font-medium text-slate-800 truncate block">{c.label}</span>
                    <span className="text-[11px] text-slate-400 truncate block">{c.reason}</span>
                  </span>
                </button>
                {isArchived && <span className="text-[10px] font-bold text-emerald-600 shrink-0">Archived</span>}
              </div>
              {isExpanded && (
                <div className="px-4 pb-3 pl-12 text-[12px] text-slate-500 space-y-1">
                  {detail === "loading" ? (
                    <Loader2 size={12} className="animate-spin text-slate-300" />
                  ) : detail === "error" || !detail ? (
                    <span>Could not load details.</span>
                  ) : (
                    detail.map((f, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="font-medium text-slate-600 shrink-0">{f.label}:</span>
                        <span className="truncate">{f.value === null || f.value === undefined || f.value === "" ? "(none)" : String(f.value)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!allArchived && (
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
          {error && <span className="text-[11px] text-red-500">{error}</span>}
          <button
            onClick={handleArchiveSelected}
            disabled={archiving || selectedIds.size === 0}
            className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
          >
            {archiving ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />}
            {data.action_label || "Apply to selected"}
          </button>
        </div>
      )}
    </div>
  );
}
