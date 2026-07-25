// components/admin/AdminArchiveRequestsTab.tsx
// Company-admin review queue for archive_requests (see
// supabase/archive_requests.sql) -- one place for every kind of pending
// request: records and schema structure a non-admin asked to have removed,
// plus the Gmail closed-matter archive flow (entity_table =
// 'gmail_project_archive'), migrated in from what used to be a separate
// gmail_archive_requests table + its own "Requests" tab in
// AdminGmailSyncTab.tsx.
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Check, X, Archive } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface Props {
  companyId: string;
}

interface ArchiveRequestRow {
  id: string;
  entity_table: string;
  entity_id: string;
  entity_label: string;
  requester_name: string;
  created_at: string;
  error: string | null;
}

const ENTITY_TABLE_LABELS: Record<string, string> = {
  projects: "Project",
  tasks: "Task",
  entities: "Entity",
  properties: "Property",
  company_table_records: "Record",
  company_tables: "Table",
  company_table_fields: "Table field",
  company_custom_fields: "Extra field",
  // Not a real soft-delete -- "archiving" here moves the project's Gmail
  // messages into a nominated archive account instead (see
  // app/api/archive-requests/approve's gmail_project_archive special case).
  // The project itself stays fully active.
  gmail_project_archive: "Gmail closed-matter archive",
};

export default function AdminArchiveRequestsTab({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ArchiveRequestRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => { load(); }, [companyId]);
  useProgressBarWhile(loading);

  const load = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("archive_requests")
      .select("id, entity_table, entity_id, entity_label, requested_by, created_at, error")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const requestRows = (rows || []) as {
      id: string; entity_table: string; entity_id: string; entity_label: string;
      requested_by: string | null; created_at: string; error: string | null;
    }[];

    const requesterIds = Array.from(new Set(requestRows.map(r => r.requested_by).filter((id): id is string => !!id)));
    let nameById = new Map<string, string>();
    if (requesterIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", requesterIds);
      nameById = new Map((profiles || []).map(p => [p.id, p.full_name || p.email || "Unknown"]));
    }

    setRequests(requestRows.map(r => ({
      id: r.id,
      entity_table: r.entity_table,
      entity_id: r.entity_id,
      entity_label: r.entity_label,
      requester_name: r.requested_by ? (nameById.get(r.requested_by) || "Unknown") : "Unknown",
      created_at: r.created_at,
      error: r.error,
    })));
    setSelectedIds(new Set());
    setLoading(false);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === requests.length ? new Set() : new Set(requests.map(r => r.id)));
  };

  const handleApproveSelected = async () => {
    if (!selectedIds.size) return;
    setReviewing(true);
    await fetch("/api/archive-requests/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setReviewing(false);
    load();
  };

  const handleRejectSelected = async () => {
    if (!selectedIds.size) return;
    setReviewing(true);
    await fetch("/api/archive-requests/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setReviewing(false);
    load();
  };

  if (loading) return null;

  return (
    <div className="space-y-3">
      {requests.length === 0 ? (
        <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-16">
          No pending archive requests
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <button onClick={toggleSelectAll} className="text-[11px] font-bold text-slate-500 hover:text-slate-800">
              {selectedIds.size === requests.length ? "Deselect all" : "Select all"}
            </button>
            <div className="flex items-center gap-2">
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {reviewing ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Approve selected
              </button>
            </div>
          </div>

          {requests.map(r => (
            <div
              key={r.id}
              onClick={() => toggleSelected(r.id)}
              className={`bg-white border rounded-[28px] p-5 flex items-center gap-4 cursor-pointer transition-all ${
                selectedIds.has(r.id) ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-100"
              }`}
            >
              <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                selectedIds.has(r.id) ? "bg-amber-600 border-amber-600" : "border-slate-300"
              }`}>
                {selectedIds.has(r.id) && <Check size={12} className="text-white" />}
              </div>
              <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                <Archive size={16} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-800 truncate">{r.entity_label}</p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  {ENTITY_TABLE_LABELS[r.entity_table] || r.entity_table} — requested by {r.requester_name} — {new Date(r.created_at).toLocaleString()}
                </p>
                {r.error && (
                  <p className="text-[10px] text-red-500 mt-1">Last attempt failed: {r.error}</p>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
