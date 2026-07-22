"use client";

// Trash: soft-deleted custom tables/fields (see supabase/schema_soft_delete.sql)
// plus soft-deleted records (custom table rows, and entities/projects/properties,
// which have used their own deleted_at for archiving since before this page
// existed). Deleting any of these just sets deleted_at -- nothing is actually
// touched until "Delete permanently" (a real DELETE, cascading to dependent rows).
//
// Record sections show the 50 most recently deleted rows per type, not every
// row ever archived -- companies can accumulate a lot of archived data over
// time, and this page has no pagination. Older archived records still exist
// and can be restored directly (`update company_table_records/entities/
// projects/properties set deleted_at = null where id = ...`), just not
// through this list.
import { useState, useEffect, useCallback } from "react";
import { Trash2, RotateCcw, Loader2, Table2, AlertTriangle } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { logSchemaChange } from "@/lib/services/schemaChangeLog";
import { useProgressBarWhile } from "@/components/TopProgressBar";

const RECORD_LIMIT = 50;

interface TrashedTable { id: string; name: string; icon: string; color: string; deleted_at: string; recordCount: number; dashboardCount: number }
interface TrashedTableField { id: string; label: string; field_type: string; deleted_at: string; tableName: string; valueCount: number }
interface TrashedSystemField { id: string; label: string; field_type: string; table_name: string; deleted_at: string; valueCount: number }
interface TrashedDashboard { id: string; name: string; icon: string; color: string; deleted_at: string }
interface TrashedTableRecord { id: string; tableId: string; tableName: string; label: string; deleted_at: string }
type SystemRecordTable = "entities" | "projects" | "properties";
interface TrashedSystemRecord { id: string; sourceTable: SystemRecordTable; label: string; deleted_at: string }

export default function TrashPage() {
  const { companyId, userId } = useCompany();
  const [tables, setTables] = useState<TrashedTable[]>([]);
  const [tableFields, setTableFields] = useState<TrashedTableField[]>([]);
  const [systemFields, setSystemFields] = useState<TrashedSystemField[]>([]);
  const [dashboards, setDashboards] = useState<TrashedDashboard[]>([]);
  const [tableRecords, setTableRecords] = useState<TrashedTableRecord[]>([]);
  const [systemRecords, setSystemRecords] = useState<TrashedSystemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    const { data: trashedTables } = await supabase
      .from("company_tables").select("id, name, icon, color, deleted_at")
      .eq("company_id", companyId).not("deleted_at", "is", null).order("deleted_at", { ascending: false });

    const tablesWithCounts = await Promise.all((trashedTables || []).map(async t => {
      const [{ count: recordCount }, { count: dashboardCount }] = await Promise.all([
        supabase.from("company_table_records").select("id", { count: "exact", head: true }).eq("table_id", t.id).is("deleted_at", null),
        supabase.from("company_dashboards").select("id", { count: "exact", head: true }).eq("source_table_id", t.id).is("deleted_at", null),
      ]);
      return { ...t, recordCount: recordCount ?? 0, dashboardCount: dashboardCount ?? 0 };
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

    const { data: trashedDashboards } = await supabase
      .from("company_dashboards").select("id, name, icon, color, deleted_at")
      .eq("company_id", companyId).not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    setDashboards(trashedDashboards || []);

    // ── Custom table records ──────────────────────────────────────
    const { data: trashedRecords } = await supabase
      .from("company_table_records").select("id, table_id, deleted_at")
      .eq("company_id", companyId).not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }).limit(RECORD_LIMIT);

    const recordTableIds = Array.from(new Set((trashedRecords || []).map(r => r.table_id)));
    const [{ data: parentTables }, { data: parentFields }] = await Promise.all([
      recordTableIds.length ? supabase.from("company_tables").select("id, name, primary_field_key").in("id", recordTableIds) : Promise.resolve({ data: [] as any[] }),
      recordTableIds.length ? supabase.from("company_table_fields").select("id, table_id, field_key").in("table_id", recordTableIds).is("deleted_at", null) : Promise.resolve({ data: [] as any[] }),
    ]);
    const tableById = new Map((parentTables || []).map(t => [t.id, t]));
    const primaryFieldIdByTable = new Map<string, string>();
    recordTableIds.forEach(tid => {
      const t = tableById.get(tid);
      const fieldsForTable = (parentFields || []).filter(f => f.table_id === tid);
      const primary = fieldsForTable.find(f => f.field_key === t?.primary_field_key) || fieldsForTable[0];
      if (primary) primaryFieldIdByTable.set(tid, primary.id);
    });

    const tableRecordsWithLabels = await Promise.all((trashedRecords || []).map(async r => {
      const fieldId = primaryFieldIdByTable.get(r.table_id);
      let label = "Untitled";
      if (fieldId) {
        const { data: v } = await supabase
          .from("company_table_values").select("value_text, value_number, value_date, value_boolean")
          .eq("record_id", r.id).eq("field_id", fieldId).maybeSingle();
        const raw = v?.value_text ?? v?.value_number ?? v?.value_date ?? (v?.value_boolean != null ? String(v.value_boolean) : null);
        if (raw !== null && raw !== undefined && raw !== "") label = String(raw);
      }
      return { id: r.id, tableId: r.table_id, tableName: tableById.get(r.table_id)?.name || "Unknown table", label, deleted_at: r.deleted_at };
    }));
    setTableRecords(tableRecordsWithLabels);

    // ── Entity / project / property records ─────────────────────────
    const [{ data: delEntities }, { data: delProjects }, { data: delProperties }] = await Promise.all([
      supabase.from("entities").select("id, name, deleted_at").eq("company_id", companyId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(RECORD_LIMIT),
      supabase.from("projects").select("id, name, deleted_at").eq("company_id", companyId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(RECORD_LIMIT),
      supabase.from("properties").select("id, street_address, deleted_at").eq("company_id", companyId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(RECORD_LIMIT),
    ]);
    const combinedSystemRecords: TrashedSystemRecord[] = [
      ...(delEntities || []).map(e => ({ id: e.id, sourceTable: "entities" as const, label: e.name || "Unnamed entity", deleted_at: e.deleted_at })),
      ...(delProjects || []).map(p => ({ id: p.id, sourceTable: "projects" as const, label: p.name || "Unnamed project", deleted_at: p.deleted_at })),
      ...(delProperties || []).map(p => ({ id: p.id, sourceTable: "properties" as const, label: p.street_address || "Unnamed property", deleted_at: p.deleted_at })),
    ].sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
    setSystemRecords(combinedSystemRecords);

    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  useProgressBarWhile(loading);

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
    const dashboardWarning = t.dashboardCount > 0
      ? ` This will also permanently delete ${t.dashboardCount} dashboard${t.dashboardCount === 1 ? "" : "s"} built on this table.`
      : "";
    if (!window.confirm(`Permanently delete "${t.name}"? This cannot be undone — it will delete the table, its fields, and all ${t.recordCount} record(s) forever.${dashboardWarning}`)) return;
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

  const restoreDashboard = async (d: TrashedDashboard) => {
    setBusyId(d.id);
    const { data: before } = await supabase.from("company_dashboards").select("*").eq("id", d.id).single();
    const { data: after } = await supabase.from("company_dashboards").update({ deleted_at: null }).eq("id", d.id).select().single();
    if (companyId && before && after) logSchemaChange({ companyId, actorId: userId, entityType: "company_dashboard", entityId: d.id, entityLabel: d.name, action: "update", before, after });
    setBusyId(null);
    load();
  };

  const purgeDashboard = async (d: TrashedDashboard) => {
    if (!window.confirm(`Permanently delete "${d.name}"? This cannot be undone.`)) return;
    setBusyId(d.id);
    await supabase.from("company_dashboards").delete().eq("id", d.id);
    setBusyId(null);
    load();
  };

  // Record-level restore/purge is data, not schema — deliberately not logged
  // to schema_change_log (see supabase/schema_change_log.sql: that log is
  // scoped to shape changes only, and its entity_type CHECK constraint
  // doesn't include record types).
  const restoreTableRecord = async (r: TrashedTableRecord) => {
    setBusyId(r.id);
    await supabase.from("company_table_records").update({ deleted_at: null }).eq("id", r.id);
    setBusyId(null);
    load();
  };

  const purgeTableRecord = async (r: TrashedTableRecord) => {
    if (!window.confirm(`Permanently delete this record from "${r.tableName}"? This cannot be undone.`)) return;
    setBusyId(r.id);
    await supabase.from("company_table_records").delete().eq("id", r.id);
    setBusyId(null);
    load();
  };

  const restoreSystemRecord = async (r: TrashedSystemRecord) => {
    setBusyId(r.id);
    await supabase.from(r.sourceTable).update({ deleted_at: null }).eq("id", r.id);
    setBusyId(null);
    load();
  };

  const purgeSystemRecord = async (r: TrashedSystemRecord) => {
    if (!window.confirm(`Permanently delete "${r.label}"? This cannot be undone.`)) return;
    setBusyId(r.id);
    await supabase.from(r.sourceTable).delete().eq("id", r.id);
    setBusyId(null);
    load();
  };

  const systemRecordTableLabel = (t: SystemRecordTable) => t === "entities" ? "Entity" : t === "projects" ? "Project" : "Property";

  const isEmpty = !loading && tables.length === 0 && tableFields.length === 0 && systemFields.length === 0
    && dashboards.length === 0 && tableRecords.length === 0 && systemRecords.length === 0;

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Trash2 size={22} className="text-indigo-600" />
        <div>
          <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">Trash</h1>
          <p className="text-[11px] text-slate-400">Deleted tables, fields, and records — nothing here is gone for good until you permanently delete it.</p>
        </div>
      </div>

      {loading ? null : isEmpty ? (
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
                      <p className="text-[10px] text-slate-400">{t.recordCount} record{t.recordCount === 1 ? "" : "s"}{t.dashboardCount > 0 ? ` · ${t.dashboardCount} dashboard${t.dashboardCount === 1 ? "" : "s"} depend on it` : ""} · deleted {new Date(t.deleted_at).toLocaleString()}</p>
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

          {dashboards.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dashboards</p>
              {dashboards.map(d => {
                const Icon = (LucideIcons as any)[d.icon] || Table2;
                return (
                  <div key={d.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${d.color}20` }}>
                      <Icon size={16} style={{ color: d.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-800">{d.name}</p>
                      <p className="text-[10px] text-slate-400">deleted {new Date(d.deleted_at).toLocaleString()}</p>
                    </div>
                    <button onClick={() => restoreDashboard(d)} disabled={busyId === d.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-900 hover:text-white transition-all disabled:opacity-50">
                      {busyId === d.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Restore
                    </button>
                    <button onClick={() => purgeDashboard(d)} disabled={busyId === d.id} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}

          {tableRecords.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Custom table records{tableRecords.length === RECORD_LIMIT ? ` (most recent ${RECORD_LIMIT})` : ""}</p>
              {tableRecords.map(r => (
                <div key={r.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-800 truncate">{r.label}</p>
                    <p className="text-[10px] text-slate-400">{r.tableName} · deleted {new Date(r.deleted_at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => restoreTableRecord(r)} disabled={busyId === r.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-900 hover:text-white transition-all disabled:opacity-50">
                    {busyId === r.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Restore
                  </button>
                  <button onClick={() => purgeTableRecord(r)} disabled={busyId === r.id} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {systemRecords.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entity / project / property records{systemRecords.length >= RECORD_LIMIT ? ` (most recent ${RECORD_LIMIT} per type)` : ""}</p>
              {systemRecords.map(r => (
                <div key={r.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-800 truncate">{r.label}</p>
                    <p className="text-[10px] text-slate-400">{systemRecordTableLabel(r.sourceTable)} · deleted {new Date(r.deleted_at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => restoreSystemRecord(r)} disabled={busyId === r.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-900 hover:text-white transition-all disabled:opacity-50">
                    {busyId === r.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Restore
                  </button>
                  <button onClick={() => purgeSystemRecord(r)} disabled={busyId === r.id} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">"Delete permanently" cannot be undone — it removes the item and all data stored against it for good. Everything else here is just hidden and can be restored.</p>
          </div>
        </>
      )}
    </div>
  );
}
