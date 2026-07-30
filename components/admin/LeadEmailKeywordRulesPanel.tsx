// components/admin/LeadEmailKeywordRulesPanel.tsx
// Admin-managed "subject contains X -> propose this Lead" rules — the
// third-priority signal app/api/gmail/leads-sync uses to match an incoming
// email when Gmail thread-id and sender-email matching both come up empty.
// Rendered inside AdminLeadEmailAssignmentsTab, below the pending queue.
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Plus, X } from "lucide-react";

interface Props {
  companyId: string;
}

interface RuleRow {
  id: string;
  keyword: string;
  match_lead_id: string;
  is_active: boolean;
  created_at: string;
}

interface LeadOption {
  id: string;
  name: string;
}

// The Leads table is a plain custom table (slug 'leads') with EAV-style
// value storage — same lookup pattern as lib/hooks/useCustomTable.ts, kept
// local here since this is the only place in the admin UI that needs a
// bare "id -> primary field value" list for it.
async function loadLeadOptions(companyId: string): Promise<LeadOption[]> {
  const { data: table } = await supabase
    .from("company_tables")
    .select("id, primary_field_key")
    .eq("company_id", companyId)
    .eq("slug", "leads")
    .is("deleted_at", null)
    .maybeSingle();
  if (!table) return [];

  const { data: field } = await supabase
    .from("company_table_fields")
    .select("id")
    .eq("table_id", table.id)
    .eq("field_key", table.primary_field_key || "lead_name")
    .is("deleted_at", null)
    .maybeSingle();
  if (!field) return [];

  const { data: records } = await supabase
    .from("company_table_records")
    .select("id")
    .eq("table_id", table.id)
    .is("deleted_at", null);
  if (!records?.length) return [];

  const { data: values } = await supabase
    .from("company_table_values")
    .select("record_id, value_text")
    .eq("field_id", field.id)
    .in("record_id", records.map(r => r.id));

  const nameById = new Map((values || []).map(v => [v.record_id, v.value_text || "(unnamed)"]));
  return records.map(r => ({ id: r.id, name: nameById.get(r.id) || "(unnamed)" })).sort((a, b) => a.name.localeCompare(b.name));
}

export default function LeadEmailKeywordRulesPanel({ companyId }: Props) {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [rulesRes, leads] = await Promise.all([
      fetch("/api/lead-email-assignments/keyword-rules").then(r => r.json()).catch(() => ({ rules: [] })),
      loadLeadOptions(companyId),
    ]);
    setRules(rulesRes.rules || []);
    setLeadOptions(leads);
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const nameForLead = (leadId: string) => leadOptions.find(l => l.id === leadId)?.name || "Unknown lead";

  const handleAdd = async () => {
    if (!keyword.trim() || !selectedLeadId) return;
    setSaving(true);
    await fetch("/api/lead-email-assignments/keyword-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: keyword.trim(), matchLeadId: selectedLeadId }),
    });
    setKeyword("");
    setSelectedLeadId("");
    setSaving(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/lead-email-assignments/keyword-rules?id=${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return null;

  return (
    <div className="mt-8 pt-6 border-t border-slate-100">
      <p className="text-[11px] uppercase font-bold tracking-widest text-slate-400 mb-3">Keyword match rules</p>
      <p className="text-[12px] text-slate-400 mb-4">
        If an incoming lead email&rsquo;s subject contains this text, propose assigning it to the selected Lead.
        Only used when the sender&rsquo;s address and Gmail thread don&rsquo;t already match an existing Lead.
      </p>

      <div className="space-y-2 mb-4">
        {rules.length === 0 && <p className="text-[12px] text-slate-300">No keyword rules yet.</p>}
        {rules.map(r => (
          <div key={r.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5">
            <span className="text-[12px] font-bold text-slate-700 flex-1 truncate">&ldquo;{r.keyword}&rdquo;</span>
            <span className="text-[11px] text-slate-400 truncate">→ {nameForLead(r.match_lead_id)}</span>
            <button onClick={() => handleDelete(r.id)} className="text-slate-300 hover:text-red-500 shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="Keyword or phrase in subject"
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-[12px]"
        />
        <select
          value={selectedLeadId}
          onChange={e => setSelectedLeadId(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-[12px] max-w-[200px]"
        >
          <option value="">Select a lead…</option>
          {leadOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button
          onClick={handleAdd}
          disabled={!keyword.trim() || !selectedLeadId || saving}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Add rule
        </button>
      </div>
    </div>
  );
}
