// components/clientUpdatePages/AddMatterModal.tsx
// Search + multi-select (checkboxes) record picker -- adds every checked
// record to the given group in one go, rather than one click per record.
// recordTable picks which table (any system table or company_tables.id) --
// see client_update_pages.base_table / lib/clientUpdatePageTableResolver.ts.
// Also offers a "New <record>" affordance that opens the SAME creation
// modal used everywhere else in the app (Sidebar's +, GenericMasterTable's
// + New) and, once the record is created, adds it straight to this page/
// group -- so a brand-new matter/entity/property/loan doesn't need a
// separate detour through the main table before it can show up here.
"use client";

import { useState } from "react";
import { X, Search, Loader2, Check, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import NewProjectModal from "@/components/NewProjectModal";
import NewEntityModal from "@/components/NewEntityModal";
import NewPropertyModal from "@/components/NewPropertyModal";
import NewRecordModal, { pickCreateFields } from "@/components/dashboard/NewRecordModal";
import { createRecord } from "@/lib/services/customTableService";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";

interface RecordOption { id: string; name: string; description?: string | null; }

const RECORD_LABEL: Record<string, { singular: string; plural: string }> = {
  projects: { singular: "matter", plural: "matters" },
  entities: { singular: "entity", plural: "entities" },
  properties: { singular: "property", plural: "properties" },
};

export default function AddMatterModal({ pageId, groupId, recordTable, recordLabel, onClose, onAdded }: {
  pageId: string; groupId: string | null; recordTable: string; recordLabel?: string; onClose: () => void; onAdded: () => void;
}) {
  const label = RECORD_LABEL[recordTable] || { singular: recordLabel?.toLowerCase() || "record", plural: (recordLabel || "records").toLowerCase() };
  const [q, setQ] = useState("");
  const [results, setResults] = useState<RecordOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // recordTable isn't a system table (projects/entities/properties) -- it's
  // a company_tables.id, backed by shared company_table_records/
  // company_table_values, not a table literally named by that id. Its own
  // field catalog (name + primary field key) is fetched lazily the first
  // time "New ..." is clicked, same as RelationPicker's own "add new" flow
  // for a custom-table relation target.
  const isCustomTable = !RECORD_LABEL[recordTable];
  const [customCreateInfo, setCustomCreateInfo] = useState<{ tableName: string; primaryFieldKey: string | null; fields: CustomTableField[] } | null>(null);
  const [loadingCustomCreateInfo, setLoadingCustomCreateInfo] = useState(false);

  const search = async (query: string) => {
    setQ(query);
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/client-update-pages/records/search?table=${encodeURIComponent(recordTable)}&q=${encodeURIComponent(query)}`);
    const json = await res.json();
    setSearching(false);
    setResults(json.records || []);
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addRecordIds = async (ids: string[]) => {
    if (!ids.length) return;
    setAdding(true);
    setError(null);
    const results = await Promise.all(ids.map(recordId =>
      fetch(`/api/client-update-pages/${pageId}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, groupId }),
      })
    ));
    setAdding(false);
    const failed = results.filter(r => !r.ok).length;
    if (failed) { setError(`${failed} ${failed === 1 ? label.singular : label.plural} could not be added (already on this page?)`); }
    if (failed < results.length) onAdded();
  };

  const addSelected = () => addRecordIds([...selected]);

  // Fires once the New*Modal below has actually created the record --
  // mirrors RelationPicker's own "add new" precedent (onRefresh(newId)).
  // Adds it here immediately rather than making the user re-search for the
  // record they just typed the name of.
  const handleCreated = (newId?: string) => {
    setShowCreate(false);
    if (newId) addRecordIds([newId]);
  };

  const openCreate = async () => {
    if (isCustomTable && !customCreateInfo) {
      setLoadingCustomCreateInfo(true);
      const [{ data: table }, { data: fields }] = await Promise.all([
        supabase.from("company_tables").select("name, primary_field_key").eq("id", recordTable).maybeSingle(),
        supabase.from("company_table_fields").select("*").eq("table_id", recordTable).is("deleted_at", null).order("display_order"),
      ]);
      setCustomCreateInfo({ tableName: table?.name || label.singular, primaryFieldKey: table?.primary_field_key || null, fields: (fields || []) as CustomTableField[] });
      setLoadingCustomCreateInfo(false);
    }
    setShowCreate(true);
  };

  // Same createRecord() call CustomTableMasterPage's own "new record"
  // button makes, resolving companyId/userId itself the way
  // NewEntityModal/NewPropertyModal already do internally.
  const createCustomTableRecordHere = async (values: Record<string, any>): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "Not signed in";
    const { data: profile } = await supabase.from("profiles").select("active_company_id").eq("id", user.id).single();
    const companyId = profile?.active_company_id;
    if (!companyId) return "No active company";
    const result = await createRecord(recordTable, companyId, user.id, values, customCreateInfo?.fields || []);
    if (!result) return "Could not create record";
    if ("error" in result) return result.error;
    await handleCreated(result.id);
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <h3 className="text-[13px] font-bold text-slate-800 capitalize">Add {label.plural}</h3>
          <button onClick={onClose} title="Close" className="p-1 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="px-6 pb-3 shrink-0 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-full min-w-0">
            <Search size={14} className="text-slate-300 shrink-0" />
            <input value={q} onChange={e => search(e.target.value)} placeholder={`Search by name or any ${label.singular} field...`} autoFocus
              className="flex-1 min-w-0 text-[13px] outline-none" />
          </div>
          <button onClick={openCreate} disabled={loadingCustomCreateInfo} title={`Create a new ${label.singular}`}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0 capitalize">
            {loadingCustomCreateInfo ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} New {label.singular}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 space-y-1">
          {searching && <p className="text-[11px] text-slate-300 text-center py-4">Searching...</p>}
          {!searching && q.trim().length >= 2 && results.length === 0 && (
            <p className="text-[11px] text-slate-300 text-center py-4">No matches</p>
          )}
          {results.map(r => {
            const checked = selected.has(r.id);
            return (
              <button key={r.id} onClick={() => toggle(r.id)}
                className={`w-full flex items-center gap-3 text-left px-4 py-2.5 rounded-2xl transition-colors ${checked ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                <div className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${checked ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}>
                  {checked && <Check size={11} className="text-white" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-slate-700 truncate">{r.name}</p>
                  {r.description && <p className="text-[10px] text-slate-400 truncate">{r.description}</p>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 space-y-2">
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <button onClick={addSelected} disabled={!selected.size || adding}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 capitalize">
            {adding ? <Loader2 size={14} className="animate-spin" /> : `Add ${selected.size || ""} ${selected.size === 1 ? label.singular : label.plural}`}
          </button>
        </div>
      </div>

      {showCreate && recordTable === "projects" && (
        <NewProjectModal isOpen onClose={() => setShowCreate(false)} onRefresh={handleCreated} />
      )}
      {showCreate && recordTable === "entities" && (
        <NewEntityModal isOpen onClose={() => setShowCreate(false)} onRefresh={handleCreated} />
      )}
      {showCreate && recordTable === "properties" && (
        <NewPropertyModal isOpen onClose={() => setShowCreate(false)} onRefresh={handleCreated} />
      )}
      {showCreate && isCustomTable && customCreateInfo && (
        <NewRecordModal
          tableName={customCreateInfo.tableName}
          fields={pickCreateFields(customCreateInfo.fields, customCreateInfo.primaryFieldKey)}
          onCreate={createCustomTableRecordHere}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
