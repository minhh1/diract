"use client";

// Trash: soft-deleted custom tables and fields (see supabase/schema_soft_delete.sql).
// Deleting a table or field from CustomTableBuilder/SchemaVisualisation just
// sets deleted_at -- the records/values stored against it are never touched,
// so everything here can be restored exactly as it was. "Delete permanently"
// is the actual point of no return (a real DELETE, cascading to records/values).
import { useState, useEffect, useCallback } from "react";
import { Trash2, RotateCcw, Loader2, Table2, AlertTriangle } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { logSchemaChange } from "@/lib/services/schemaChangeLog";

interface TrashedTable { id: string; name: string; icon: string; color: string; deleted_at: string; recordCount: number }
interface TrashedTableField { id: string; label: string; field_type: string; deleted_at: string; tableName: string; valueCount: number }
interface TrashedSystemField { id: string; label: string; field_type: string; table_name: string; deleted_at: string; valueCount: number }

export default function TrashPage() {
  const { companyId, userId } = useCompany();
  const [tables, setTables] = useState<TrashedTable[]>([]);
  const [tableFields, setTableFields] = useState<TrashedTableField[]>([]);
  const [systemFields, setSystemFields] = useState<TrashedSystemField[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    const { data: trashedTables } = await supabase
      .from("company_tables").select("id, name, icon, color, deleted_at")
      .eq("company_id", companyId).not("deleted_at", "is", null).order("deleted_at", { ascending: false });

    const tablesWithCounts = await Promise.all((trashedTables || []).map(async t => {
      const { count } = await supabase.from("company_table_records").select("id", { count: "exact", head: true }).eq("table_id", t.id).is("deleted_at", null);
      return { ...t, recordCount: count ?? 0 };
    }));
    setTables(tablesWithCounts);

    const { data: trashedFields } = await supabase
      .from("company_table_fields").select("id, label, field_type, table_id, deleted_at")
      .not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    const fieldsWithContext = await Promise.all((trashedFields || []).map(async f => {
      const [{ data: parentTable }, { count }] = await Promise.all([
        supabase.from("company_tables").select("name").eq("id", f.table_id).maybeSingle(),
        supabase.from("company_table_values").select("field_id", { count: "exact", head: true }).eq("field_id", f.id),
      ]);
      return { id: f.id, label: f.label, field_type: f.field_type, deleted_at: f.deleted_at, tableName: parentTable?.name || "Unknown table", valueCount: count ?? 0 };
    }));
    setTableFields(fieldsWithContext);

    const { data: trashedSystemFields } = await supabase
      .from("company_custom_fields").select("id, label, field_type, table_name, deleted_at")
      .eq("company_id", companyId).not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    const systemFieldsWithCounts = await Promise.all((trashedSystemFields || []).map(async f => {
      const { count } = await supabase.from("company_custom_field_values").select("field_id", { count: "exact", head: true }).eq("field_id", f.id);
      return { ...f, valueCount: count ?? 0 };
    }));
    setSystemFields(systemFieldsWithCounts);

    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const restoreTable = async (t: TrashedTable) => {
    setBusyId(t.id);
    // Full-row before/after (not just {deleted_at}) -- revert_schema_change's
    // update-undo restores every column in the snapshot via
    // jsonb_populate_record, so a partial snapshot would null out name/slug/etc.
    const { data: before } = await supabase.from("company_tables").select("*").eq("id", t.id).single();
    const { data: after } = await supabase.from("company_tables").update({ deleted_at: null }).eq("id", t.id).select().single();
    if (companyId && before && after) logSchemaChange({ companyId, actorId: userId, entityType: "company_table", entityId: t.id, entityLabel: t.name, action: "update", before, after });
    setBusyId(null);
    load();
  };

  const purgeTable = async (t: TrashedTable) => {
    if (!window.confirm(`Permanently delete "${t.name}"? This cannot be undone — it will delete the table, its fields, and all ${t.recordCount} record(s) forever.`)) return;
    setBusyId(t.id);
    await supabase.from("company_tables").delete().eq("id", t.id);
    setBusyId(null);
    load();
  };

  const restoreTableField = async (f: TrashedTableField) => {
    setBusyId(f.id);
    const { data: before } = await supabase.from("company_table_fields").select("*").eq("id", f.id).single();
    const { data: after } = await supabase.from("company_table_fields").update({ deleted_at: null }).eq("id", f.id).select().single();
    if (companyId && before && after) logSchemaChange({ companyId, actorId: userId, entityType: "company_table_field", entityId: f.id, entityLabel: f.label, action: "update", before, after });
    setBusyId(null);
    load();
  };

  const purgeTableField = async (f: TrashedTableField) => {
    if (!window.confirm(`Permanently delete "${f.label}"? This cannot be undone — it will delete the field and all data stored in it for ${f.valueCount} record(s) forever.`)) return;
    setBusyId(f.id);
    await supabase.from("company_table_fields").delete().eq("id", f.id);
    setBusyId(null);
    load();
  };

  const restoreSystemField = async (f: TrashedSystemField) => {
    setBusyId(f.id);
    const { data: before } = await supabase.from("company_custom_fields").select("*").eq("id", f.id).single();
    const { data: after } = await supabase.from("company_custom_fields").update({ deleted_at: null }).eq("id", f.id).select().single();
    if (companyId && before && after) logSchemaChange({ companyId, actorId: userId, entityType: "company_custom_field", entityId: f.id, entityLabel: f.label, action: "update", before, after });
    setBusyId(null);
    load();
  };

  const purgeSystemField = async (f: TrashedSystemField) => {
    if (!window.confirm(`Permanently delete "${f.label}"? This cannot be undone — it will delete the field and all data stored in it for ${f.valueCount} record(s) forever.`)) return;
    setBusyId(f.id);
    await supabase.from("company_custom_fields").delete().eq("id", f.id);
    setBusyId(null);
    load();
  };

  const isEmpty = !loading && tables.length === 0 && tableFields.length === 0 && systemFields.length === 0;

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Trash2 size={22} className="text-indigo-600" />
        <div>
          <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">Trash</h1>
          <p className="text-[11px] text-slate-400">Deleted tables and fields — nothing here is gone for good until you permanently delete it.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
      ) : isEmpty ? (
        <p className="text-center text-[11px] text-slate-300 italic py-8">Trash is empty</p>
      ) : (
        <>
          {tables.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tables</p>
              {tables.map(t => {
                const Icon = (LucideIcons as any)[t.icon] || Table2;
                return (
                  <div key={t.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.color}20` }}>
                      <Icon size={16} style={{ color: t.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-800">{t.name}</p>
                      <p className="text-[10px] text-slate-400">{t.recordCount} record{t.recordCount === 1 ? "" : "s"} · deleted {new Date(t.deleted_at).toLocaleString()}</p>
                    </div>
                    <button onClick={() => restoreTable(t)} disabled={busyId === t.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-900 hover:text-white transition-all disabled:opacity-50">
                      {busyId === t.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Restore
                    </button>
                    <button onClick={() => purgeTable(t)} disabled={busyId === t.id} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}

          {tableFields.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Custom table fields</p>
              {tableFields.map(f => (
                <div key={f.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-800">{f.label}</p>
                    <p className="text-[10px] text-slate-400">{f.tableName} · {f.valueCount} value{f.valueCount === 1 ? "" : "s"} · deleted {new Date(f.deleted_at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => restoreTableField(f)} disabled={busyId === f.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-900 hover:text-white transition-all disabled:opacity-50">
                    {busyId === f.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Restore
                  </button>
                  <button onClick={() => purgeTableField(f)} disabled={busyId === f.id} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {systemFields.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entity / project / property fields</p>
              {systemFields.map(f => (
                <div key={f.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-800">{f.label}</p>
                    <p className="text-[10px] text-slate-400">{f.table_name} · {f.valueCount} value{f.valueCount === 1 ? "" : "s"} · deleted {new Date(f.deleted_at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => restoreSystemField(f)} disabled={busyId === f.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-900 hover:text-white transition-all disabled:opacity-50">
                    {busyId === f.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Restore
                  </button>
                  <button onClick={() => purgeSystemField(f)} disabled={busyId === f.id} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">"Delete permanently" cannot be undone — it removes the table/field and all data stored in it for good. Everything else here is just hidden and can be restored.</p>
          </div>
        </>
      )}
    </div>
  );
}
