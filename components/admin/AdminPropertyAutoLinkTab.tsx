// components/admin/AdminPropertyAutoLinkTab.tsx
// Company-admin review queue for property_auto_link_requests (see
// supabase/migrations/20260730160000_property_auto_link_requests.sql) --
// property-auto-link-scan proposes linking a project (whose name looks
// like a property address) to one or more Property records, either
// existing ones or new ones to create, and nothing is written to
// project_properties/properties until approved here. Shape cloned from
// AdminLeadEmailAssignmentsTab.tsx.
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Check, X, Home, Plus } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface Props {
  companyId: string;
}

interface ProposedProperty {
  streetAddress: string;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  propertyId: string | null;
}

interface RequestRow {
  id: string;
  project_id: string;
  project_name: string;
  proposed: ProposedProperty[];
  created_at: string;
  error: string | null;
}

function addressLabel(p: ProposedProperty): string {
  const tail = [p.suburb, p.state, p.postcode].filter(Boolean).join(" ");
  return tail ? `${p.streetAddress}, ${tail}` : p.streetAddress;
}

export default function AdminPropertyAutoLinkTab({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [existingLabels, setExistingLabels] = useState<Map<string, string>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("property_auto_link_requests")
      .select("id, project_id, project_name, proposed, created_at, error")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const requestRows = (rows || []) as RequestRow[];

    const existingIds = Array.from(new Set(
      requestRows.flatMap(r => r.proposed.filter(p => p.propertyId).map(p => p.propertyId as string))
    ));
    let labels = new Map<string, string>();
    if (existingIds.length) {
      const { data: props } = await supabase.from("properties").select("id, street_address").in("id", existingIds);
      labels = new Map((props || []).map(p => [p.id, p.street_address]));
    }

    setRequests(requestRows);
    setExistingLabels(labels);
    setSelectedIds(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);
  useProgressBarWhile(loading);

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
    await fetch("/api/property-auto-link/approve", {
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
    await fetch("/api/property-auto-link/reject", {
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
          No pending property links
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
              className={`bg-white border rounded-[28px] p-5 flex items-start gap-4 cursor-pointer transition-all ${
                selectedIds.has(r.id) ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100"
              }`}
            >
              <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                selectedIds.has(r.id) ? "bg-indigo-600 border-indigo-600" : "border-slate-300"
              }`}>
                {selectedIds.has(r.id) && <Check size={12} className="text-white" />}
              </div>
              <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Home size={16} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-800 truncate">
                  Link project &quot;{r.project_name}&quot; to {r.proposed.length} propert{r.proposed.length === 1 ? "y" : "ies"}
                </p>
                <div className="mt-1.5 space-y-1">
                  {r.proposed.map((p, i) => (
                    <p key={i} className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      {p.propertyId ? (
                        <>
                          <Home size={11} className="text-slate-300 shrink-0" />
                          {existingLabels.get(p.propertyId) || addressLabel(p)}
                        </>
                      ) : (
                        <>
                          <Plus size={11} className="text-emerald-400 shrink-0" />
                          {addressLabel(p)} <span className="text-emerald-500 font-bold">(new)</span>
                        </>
                      )}
                    </p>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">{new Date(r.created_at).toLocaleString('en-AU')}</p>
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
