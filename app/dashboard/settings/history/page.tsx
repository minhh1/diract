"use client";

// Git-like history of every schema-shape change (create/rename/delete a
// custom table or a field on a custom table or on entities/projects/
// properties, plus template authoring/install/uninstall) for the caller's
// company, with the ability to revert back to any earlier point. See
// supabase/schema_change_log.sql. This is schema *shape* history, not data
// history -- reverting restores tables/fields existing/configured a certain
// way again, not any data that had been stored against them.
import { useState, useEffect, useCallback } from "react";
import { Clock, Loader2, RotateCcw, Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface LogEntry {
  seq: number;
  entity_type: string;
  entity_label: string | null;
  action: 'create' | 'update' | 'delete';
  reverted_from_seq: number | null;
  created_at: string;
}

const ENTITY_LABELS: Record<string, string> = {
  company_table: 'Custom table',
  company_table_field: 'Custom table field',
  company_custom_field: 'Custom field',
  template_definition: 'Template',
  template_definition_table: 'Template table',
  template_definition_table_field: 'Template table field',
  template_definition_system_field: 'Template field',
  company_template_install: 'Template install',
  schema_revert: 'Revert',
  company_dashboard: 'Dashboard',
};

const ACTION_ICON: Record<string, React.ElementType> = { create: Plus, update: Pencil, delete: Trash2 };

export default function SchemaHistoryPage() {
  const { companyId } = useCompany();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [revertingSeq, setRevertingSeq] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from('schema_change_log').select('seq, entity_type, entity_label, action, reverted_from_seq, created_at')
      .eq('company_id', companyId).order('seq', { ascending: false }).limit(200);
    setEntries(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  useProgressBarWhile(loading);

  const handleRevert = async (entry: LogEntry) => {
    if (!window.confirm(`Revert to right after "${entry.entity_label || entry.entity_type}" (${entry.action})? This undoes every schema change made since then — table/field shape only, not data.`)) return;
    setRevertingSeq(entry.seq);
    const res = await fetch('/api/schema/revert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logSeq: entry.seq }),
    });
    const data = await res.json();
    setRevertingSeq(null);
    if (!res.ok) { alert(data.error || 'Revert failed'); return; }
    load();
  };

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Clock size={22} className="text-indigo-600" />
        <div>
          <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">Schema history</h1>
          <p className="text-[11px] text-slate-400">Every table/field created, renamed, or deleted — revert back to any point.</p>
        </div>
      </div>

      {loading ? null : (
        <div className="space-y-2">
          {entries.map(entry => {
            const Icon = ACTION_ICON[entry.action] || Pencil;
            const isRevertMarker = entry.entity_type === 'schema_revert';
            return (
              <div key={entry.seq} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${isRevertMarker ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}>
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-slate-800">
                    {isRevertMarker ? `Reverted to step #${entry.reverted_from_seq}` : (entry.entity_label || 'Untitled')}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {ENTITY_LABELS[entry.entity_type] || entry.entity_type} · {entry.action} · {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
                {!isRevertMarker && (
                  <button
                    onClick={() => handleRevert(entry)}
                    disabled={revertingSeq !== null}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-900 hover:text-white transition-all disabled:opacity-50"
                  >
                    {revertingSeq === entry.seq ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                    Revert to here
                  </button>
                )}
              </div>
            );
          })}
          {entries.length === 0 && <p className="text-center text-[11px] text-slate-300 italic py-8">No schema changes recorded yet</p>}
        </div>
      )}
    </div>
  );
}
