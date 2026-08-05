// components/admin/AdminLeadEmailAssignmentsTab.tsx
// Company-admin review queue for lead_email_assignment_requests (see
// supabase/migrations/20260730140000_lead_email_assignments.sql) -- every
// email app/api/gmail/leads-sync finds under the shared Leads Gmail label
// gets proposed here, either "link to this existing Lead" or "create a new
// Lead", and nothing is applied to Gmail/the Leads table until approved.
// Shape cloned from AdminArchiveRequestsTab.tsx.
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Check, X, Mail, UserPlus } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import LeadEmailKeywordRulesPanel from "@/components/admin/LeadEmailKeywordRulesPanel";

interface Props {
  companyId: string;
}

interface RequestRow {
  id: string;
  kind: "link_existing" | "create_new";
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  matched_lead_id: string | null;
  match_reason: string | null;
  proposed_fields: { lead_name?: string } | null;
  created_at: string;
  error: string | null;
  leadName: string;
}

const MATCH_REASON_LABELS: Record<string, string> = {
  thread_id: "same email thread as an existing Lead",
  sender_email: "sender's address matches a Lead",
  keyword_rule: "matched a keyword rule",
};

export default function AdminLeadEmailAssignmentsTab({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("lead_email_assignment_requests")
      .select("id, kind, subject, from_address, from_name, matched_lead_id, match_reason, proposed_fields, created_at, error")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const requestRows = (rows || []) as Omit<RequestRow, "leadName">[];

    const linkedLeadIds = Array.from(new Set(
      requestRows.filter(r => r.kind === "link_existing" && r.matched_lead_id).map(r => r.matched_lead_id as string)
    ));
    let nameById = new Map<string, string>();
    if (linkedLeadIds.length) {
      const { data: table } = await supabase
        .from("company_tables")
        .select("id, primary_field_key")
        .eq("company_id", companyId)
        .eq("slug", "leads")
        .is("deleted_at", null)
        .maybeSingle();
      if (table) {
        const { data: field } = await supabase
          .from("company_table_fields")
          .select("id")
          .eq("table_id", table.id)
          .eq("field_key", table.primary_field_key || "lead_name")
          .is("deleted_at", null)
          .maybeSingle();
        if (field) {
          const { data: values } = await supabase
            .from("company_table_values")
            .select("record_id, value_text")
            .eq("field_id", field.id)
            .in("record_id", linkedLeadIds);
          nameById = new Map((values || []).map(v => [v.record_id, v.value_text || "(unnamed lead)"]));
        }
      }
    }

    setRequests(requestRows.map(r => ({
      ...r,
      leadName: r.kind === "link_existing"
        ? (r.matched_lead_id ? (nameById.get(r.matched_lead_id) || "(unnamed lead)") : "Unknown")
        : (r.proposed_fields?.lead_name || r.from_name || r.from_address || "New lead"),
    })));
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
    await fetch("/api/lead-email-assignments/approve", {
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
    await fetch("/api/lead-email-assignments/reject", {
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
      <div className="space-y-3">
        {requests.length === 0 ? (
          <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-16">
            No pending lead email assignments
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
                  {r.kind === "create_new" ? <UserPlus size={16} className="text-indigo-600" /> : <Mail size={16} className="text-indigo-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-slate-800 truncate">
                    {r.kind === "create_new" ? `Create new Lead: ${r.leadName}` : `Assign to ${r.leadName}`}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {r.subject || "(no subject)"}, from {r.from_name || r.from_address}, {new Date(r.created_at).toLocaleString('en-AU')}
                  </p>
                  {r.match_reason && (
                    <p className="text-[10px] text-indigo-400 mt-0.5">{MATCH_REASON_LABELS[r.match_reason] || r.match_reason}</p>
                  )}
                  {r.error && (
                    <p className="text-[10px] text-red-500 mt-1">Last attempt failed: {r.error}</p>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <LeadEmailKeywordRulesPanel companyId={companyId} />
    </div>
  );
}
