// components/admin/AdminAiDataAccessTab.tsx
// Company-admin review queue for ai_data_access_requests (see
// supabase/migrations/20260808010000_ai_data_access.sql) -- created when a
// non-admin's question to the AI assistant needs to read real business data
// and no active grant exists yet (lib/ai/tableBuilderTools.ts's
// query_records). Approving sets a shared per-company access window
// (ai_chat_settings.data_access_granted_until), not a per-request one --
// approving any single pending request opens it up for everyone's next
// question too, which is the intended behavior (see this feature's plan:
// a 30-day grant is a standing "the AI may read our data" decision, not a
// one-off carve-out per question). Shape cloned from
// AdminLeadEmailAssignmentsTab.tsx.
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Check, X, Database } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface Props {
  companyId: string;
}

interface RequestRow {
  id: string;
  question: string;
  data_scope: string | null;
  requested_by: string;
  created_at: string;
  requesterName: string;
}

export default function AdminAiDataAccessTab({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState<"one_time" | "30_days">("one_time");
  const [reviewing, setReviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("ai_data_access_requests")
      .select("id, question, data_scope, requested_by, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const requestRows = (rows || []) as Omit<RequestRow, "requesterName">[];
    const requesterIds = Array.from(new Set(requestRows.map((r) => r.requested_by)));
    let nameById = new Map<string, string>();
    if (requesterIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", requesterIds);
      nameById = new Map((profiles || []).map((p) => [p.id, p.full_name || "A team member"]));
    }

    setRequests(requestRows.map((r) => ({ ...r, requesterName: nameById.get(r.requested_by) || "A team member" })));
    setSelectedIds(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);
  useProgressBarWhile(loading);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.size === requests.length ? new Set() : new Set(requests.map((r) => r.id))));
  };

  const handleApproveSelected = async () => {
    if (!selectedIds.size) return;
    setReviewing(true);
    await fetch("/api/ai-data-access-requests/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), duration }),
    });
    setReviewing(false);
    load();
  };

  const handleRejectSelected = async () => {
    if (!selectedIds.size) return;
    setReviewing(true);
    await fetch("/api/ai-data-access-requests/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setReviewing(false);
    load();
  };

  if (loading) return null;

  return (
    <div>
      <p className="text-[12px] text-slate-400 px-1 mb-4 leading-relaxed">
        Nothing sent to the AI is retained or used to retrain any model, it is auto-deleted after 90 days. Approving grants
        the AI read access to this company&apos;s business data for the duration below, letting it answer the requesting
        team member&apos;s question (and anyone else&apos;s, for the same window).
      </p>

      <div className="space-y-3">
        {requests.length === 0 ? (
          <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-16">
            No pending AI data access requests
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 flex-wrap gap-2">
              <button onClick={toggleSelectAll} className="text-[11px] font-bold text-slate-500 hover:text-slate-800">
                {selectedIds.size === requests.length ? "Deselect all" : "Select all"}
              </button>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-full bg-slate-100 p-0.5">
                  <button
                    onClick={() => setDuration("one_time")}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${duration === "one_time" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"}`}
                  >
                    One time
                  </button>
                  <button
                    onClick={() => setDuration("30_days")}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${duration === "30_days" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"}`}
                  >
                    30 days
                  </button>
                </div>
                <button
                  onClick={handleRejectSelected}
                  disabled={!selectedIds.size || reviewing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <X size={11} /> Reject
                </button>
                <button
                  onClick={handleApproveSelected}
                  disabled={!selectedIds.size || reviewing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {reviewing ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Approve selected
                </button>
              </div>
            </div>

            {requests.map((r) => (
              <div
                key={r.id}
                onClick={() => toggleSelected(r.id)}
                className={`bg-white border rounded-[28px] p-5 flex items-center gap-4 cursor-pointer transition-all ${
                  selectedIds.has(r.id) ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100"
                }`}
              >
                <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                  selectedIds.has(r.id) ? "bg-indigo-600 border-indigo-600" : "border-slate-300"
                }`}>
                  {selectedIds.has(r.id) && <Check size={12} className="text-white" />}
                </div>
                <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <Database size={16} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-slate-800 truncate">
                    {r.requesterName} is requesting AI data access
                  </p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {r.question}{r.data_scope ? ` (${r.data_scope})` : ""}, {new Date(r.created_at).toLocaleString('en-AU')}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
