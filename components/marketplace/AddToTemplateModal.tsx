"use client";

// Consolidated "Add to template" modal -- the ONLY place a company adds
// anything to a template it owns, replacing three separate scattered
// "Publish to marketplace" buttons (CustomTableBuilder.tsx,
// SchemaVisualisation.tsx, the old "Sync dashboards" button on this page),
// each of which duplicated its own always-create-a-new-template logic and
// covered only one narrow slice. Every category here posts, in one call, to
// app/api/templates/[slug]/export/route.ts, which dispatches to whichever
// sync_template_*_from_company RPC applies (see
// supabase/migrations/20260808180000_add_to_template_consolidation.sql for
// what each one does and doesn't carry over).
import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface OwnedTemplate { id: string; slug: string; name: string }

interface CompanyTable { id: string; name: string; slug: string }
interface SystemField { id: string; field_key: string; label: string }
interface Dashboard { id: string; name: string; slug: string }
interface RecordTab { id: string; title: string; record_table: string; linked_table_id: string }
interface DefaultView { id: string; table_slug: string; preset_name: string | null }
interface DetailedTablePage { id: string; title: string }
interface PublicTaskPage { id: string; title: string }
interface DocumentFillPage { id: string; title: string }

interface ExportData {
  disabledSystemTables: Record<string, boolean>;
  tables: CompanyTable[];
  systemFields: Record<"projects" | "entities" | "properties", SystemField[]>;
  dashboards: Dashboard[];
  recordTabs: RecordTab[];
  defaultViews: DefaultView[];
  detailedTablePages: DetailedTablePage[];
  publicTaskPages: PublicTaskPage[];
  documentFillPages: DocumentFillPage[];
}

const SYSTEM_TABLE_LABELS: Record<string, string> = { projects: "Matters", entities: "Entities", properties: "Properties" };

async function fetchExportData(companyId: string): Promise<ExportData> {
  const [
    { data: company }, { data: tables }, { data: sysFields },
    { data: dashboards }, { data: recordTabsRaw },
    { data: defaultViews }, { data: detailedPages }, { data: taskPages }, { data: fillPages },
  ] = await Promise.all([
    supabase.from("companies").select("disabled_system_tables").eq("id", companyId).single(),
    supabase.from("company_tables").select("id, name, slug").eq("company_id", companyId).is("deleted_at", null).order("display_order"),
    supabase.from("company_custom_fields").select("id, field_key, label, table_name").eq("company_id", companyId).is("deleted_at", null).order("display_order"),
    supabase.from("company_dashboards").select("id, name, slug").eq("company_id", companyId).is("deleted_at", null).order("display_order"),
    supabase.from("record_tabs").select("id, title, record_table, linked_table_id, created_at").eq("company_id", companyId).eq("tab_type", "custom_dashboard").not("linked_table_id", "is", null),
    supabase.from("company_default_views").select("id, table_slug, preset_name").eq("company_id", companyId).is("team_id", null).is("user_id", null),
    supabase.from("client_update_pages").select("id, title").eq("company_id", companyId),
    supabase.from("public_task_pages").select("id, title").eq("company_id", companyId),
    supabase.from("document_fill_pages").select("id, title").eq("company_id", companyId),
  ]);

  // Latest record tab per (record_table, linked_table_id) pair -- matches
  // sync_template_dashboards_from_company's own DISTINCT ON, so the id
  // offered here is exactly the one that RPC would pick anyway.
  const byPair = new Map<string, RecordTab & { created_at: string }>();
  for (const t of (recordTabsRaw || []) as any[]) {
    const key = `${t.record_table}:${t.linked_table_id}`;
    const existing = byPair.get(key);
    if (!existing || t.created_at > existing.created_at) byPair.set(key, t);
  }

  const grouped: Record<"projects" | "entities" | "properties", SystemField[]> = { projects: [], entities: [], properties: [] };
  for (const f of (sysFields || []) as any[]) {
    if (grouped[f.table_name as keyof typeof grouped]) grouped[f.table_name as keyof typeof grouped].push(f);
  }

  return {
    disabledSystemTables: company?.disabled_system_tables || {},
    tables: tables || [],
    systemFields: grouped,
    dashboards: dashboards || [],
    recordTabs: [...byPair.values()],
    defaultViews: defaultViews || [],
    detailedTablePages: detailedPages || [],
    publicTaskPages: taskPages || [],
    documentFillPages: fillPages || [],
  };
}

function Section({ title, count, defaultOpen, children }: { title: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
        <span className="text-[11px] font-bold text-slate-700">{title}</span>
        <span className="flex items-center gap-2">
          {count > 0 && <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-full text-[9px] font-bold">{count}</span>}
          {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </span>
      </button>
      {open && <div className="p-4 space-y-2">{children}</div>}
    </div>
  );
}

function CheckRow({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <label className="flex items-center gap-2.5 py-1 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="shrink-0" />
      <span className="text-[12px] text-slate-700">{label}</span>
      {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
    </label>
  );
}

export default function AddToTemplateModal({
  companyId, ownedTemplates, onClose, onDone,
}: {
  companyId: string;
  ownedTemplates: OwnedTemplate[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [data, setData] = useState<ExportData | null>(null);
  const [loading, setLoading] = useState(true);

  const [targetMode, setTargetMode] = useState<"existing" | "new">(ownedTemplates.length ? "existing" : "new");
  const [targetSlug, setTargetSlug] = useState(ownedTemplates[0]?.slug || "");
  const [newName, setNewName] = useState("");

  const [tablesVisibility, setTablesVisibility] = useState(false);
  const [tableIds, setTableIds] = useState<Set<string>>(new Set());
  const [systemFieldIds, setSystemFieldIds] = useState<{ projects: Set<string>; entities: Set<string>; properties: Set<string> }>({ projects: new Set(), entities: new Set(), properties: new Set() });
  const [dashboardIds, setDashboardIds] = useState<Set<string>>(new Set());
  const [recordTabIds, setRecordTabIds] = useState<Set<string>>(new Set());
  const [defaultViewIds, setDefaultViewIds] = useState<Set<string>>(new Set());
  const [detailedTableIds, setDetailedTableIds] = useState<Set<string>>(new Set());
  const [publicTaskIds, setPublicTaskIds] = useState<Set<string>>(new Set());
  const [documentFillIds, setDocumentFillIds] = useState<Set<string>>(new Set());
  const [tableLabelOverrides, setTableLabelOverrides] = useState(false);
  const [invoiceSettings, setInvoiceSettings] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchExportData(companyId).then(d => { if (active) { setData(d); setLoading(false); } });
    return () => { active = false; };
  }, [companyId]);

  const toggle = useCallback((set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  }, []);

  const totalSelected =
    (tablesVisibility ? 1 : 0) + tableIds.size + systemFieldIds.projects.size + systemFieldIds.entities.size + systemFieldIds.properties.size
    + dashboardIds.size + recordTabIds.size + defaultViewIds.size + detailedTableIds.size + publicTaskIds.size + documentFillIds.size
    + (tableLabelOverrides ? 1 : 0) + (invoiceSettings ? 1 : 0);

  const handleSubmit = async () => {
    if (targetMode === "new" && !newName.trim()) { setError("Give the new template a name."); return; }
    if (totalSelected === 0) { setError("Select at least one thing to add."); return; }
    setSubmitting(true);
    setError("");

    const body: any = {
      selections: {
        tablesVisibility,
        tableIds: [...tableIds],
        systemFields: { projects: [...systemFieldIds.projects], entities: [...systemFieldIds.entities], properties: [...systemFieldIds.properties] },
        dashboardIds: [...dashboardIds],
        recordTabIds: [...recordTabIds],
        defaultViewIds: [...defaultViewIds],
        pages: { detailedTable: [...detailedTableIds], publicTask: [...publicTaskIds], documentFillPack: [...documentFillIds] },
        settings: { tableLabelOverrides, invoiceSettings },
      },
    };
    if (targetMode === "new") body.createNew = { name: newName.trim() };

    const res = await fetch(`/api/templates/${targetMode === "new" ? "new" : targetSlug}/export`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(json.error || "Could not add to template."); return; }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white rounded-[40px] p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">Add to template</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-black"><X size={18} /></button>
        </div>

        {/* Target template picker */}
        <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setTargetMode("existing")} disabled={!ownedTemplates.length}
              className={`px-4 py-2 rounded-full text-[11px] font-bold transition-all disabled:opacity-40 ${targetMode === "existing" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
              Existing template
            </button>
            <button onClick={() => setTargetMode("new")}
              className={`px-4 py-2 rounded-full text-[11px] font-bold transition-all ${targetMode === "new" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
              + New template
            </button>
          </div>
          {targetMode === "existing" ? (
            <select value={targetSlug} onChange={e => setTargetSlug(e.target.value)} className="w-full bg-white border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none">
              {ownedTemplates.map(t => <option key={t.id} value={t.slug}>{t.name}</option>)}
            </select>
          ) : (
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="New template name"
              className="w-full bg-white border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none" />
          )}
        </div>

        {loading || !data ? (
          <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
        ) : (
          <div className="space-y-3">
            <Section title="Tables visibility" count={tablesVisibility ? 1 : 0}>
              <CheckRow checked={tablesVisibility} onChange={setTablesVisibility}
                label="Include which system tables are shown/hidden" sub={Object.keys(data.disabledSystemTables).length ? `${Object.keys(data.disabledSystemTables).length} hidden today` : "none hidden today"} />
            </Section>

            <Section title="Custom tables & fields" count={tableIds.size}>
              {data.tables.length === 0 && <p className="text-[11px] text-slate-300 italic">No custom tables</p>}
              {data.tables.map(t => (
                <CheckRow key={t.id} checked={tableIds.has(t.id)} onChange={() => toggle(tableIds, t.id, setTableIds)} label={t.name} />
              ))}
            </Section>

            <Section title="Matter / entity / property fields" count={systemFieldIds.projects.size + systemFieldIds.entities.size + systemFieldIds.properties.size}>
              {(["projects", "entities", "properties"] as const).map(tableName => (
                <div key={tableName} className="space-y-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-1">{SYSTEM_TABLE_LABELS[tableName]}</p>
                  {data.systemFields[tableName].length === 0 && <p className="text-[11px] text-slate-300 italic">No custom fields</p>}
                  {data.systemFields[tableName].map(f => (
                    <CheckRow key={f.id} checked={systemFieldIds[tableName].has(f.id)}
                      onChange={() => toggle(systemFieldIds[tableName], f.id, s => setSystemFieldIds(prev => ({ ...prev, [tableName]: s })))}
                      label={f.label} />
                  ))}
                </div>
              ))}
            </Section>

            <Section title="Dashboards & record tabs" count={dashboardIds.size + recordTabIds.size}>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Dashboards</p>
              {data.dashboards.length === 0 && <p className="text-[11px] text-slate-300 italic">No dashboards</p>}
              {data.dashboards.map(d => (
                <CheckRow key={d.id} checked={dashboardIds.has(d.id)} onChange={() => toggle(dashboardIds, d.id, setDashboardIds)} label={d.name} />
              ))}
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-2">Record tabs</p>
              {data.recordTabs.length === 0 && <p className="text-[11px] text-slate-300 italic">No record tabs</p>}
              {data.recordTabs.map(t => (
                <CheckRow key={t.id} checked={recordTabIds.has(t.id)} onChange={() => toggle(recordTabIds, t.id, setRecordTabIds)}
                  label={t.title} sub={`on every ${t.record_table} record`} />
              ))}
            </Section>

            <Section title="Default views (sort & filter included)" count={defaultViewIds.size}>
              {data.defaultViews.length === 0 && <p className="text-[11px] text-slate-300 italic">No saved default views</p>}
              {data.defaultViews.map(v => (
                <CheckRow key={v.id} checked={defaultViewIds.has(v.id)} onChange={() => toggle(defaultViewIds, v.id, setDefaultViewIds)}
                  label={v.table_slug} sub={v.preset_name || undefined} />
              ))}
            </Section>

            <Section title="Pages" count={detailedTableIds.size + publicTaskIds.size + documentFillIds.size}>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Detailed table pages</p>
              {data.detailedTablePages.length === 0 && <p className="text-[11px] text-slate-300 italic">None</p>}
              {data.detailedTablePages.map(p => (
                <CheckRow key={p.id} checked={detailedTableIds.has(p.id)} onChange={() => toggle(detailedTableIds, p.id, setDetailedTableIds)} label={p.title} />
              ))}
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-2">Public task pages</p>
              {data.publicTaskPages.length === 0 && <p className="text-[11px] text-slate-300 italic">None</p>}
              {data.publicTaskPages.map(p => (
                <CheckRow key={p.id} checked={publicTaskIds.has(p.id)} onChange={() => toggle(publicTaskIds, p.id, setPublicTaskIds)} label={p.title} />
              ))}
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-2">Document fill packs</p>
              {data.documentFillPages.length === 0 && <p className="text-[11px] text-slate-300 italic">None</p>}
              {data.documentFillPages.map(p => (
                <CheckRow key={p.id} checked={documentFillIds.has(p.id)} onChange={() => toggle(documentFillIds, p.id, setDocumentFillIds)}
                  label={p.title} sub="exported as a suggested document bundle, not a live link" />
              ))}
            </Section>

            <Section title="Settings" count={(tableLabelOverrides ? 1 : 0) + (invoiceSettings ? 1 : 0)}>
              <CheckRow checked={tableLabelOverrides} onChange={setTableLabelOverrides} label={'Table label renames (e.g. "Matters" → "Jobs")'} />
              <CheckRow checked={invoiceSettings} onChange={setInvoiceSettings} label="Invoice display & terms" sub="never includes bank details" />
            </Section>
          </div>
        )}

        {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}

        <button onClick={handleSubmit} disabled={submitting || loading}
          className="w-full py-3.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} /> Add to template{totalSelected > 0 ? ` (${totalSelected})` : ""}</>}
        </button>
      </div>
    </div>
  );
}
