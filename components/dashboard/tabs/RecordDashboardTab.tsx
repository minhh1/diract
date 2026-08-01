"use client";

// The "custom_dashboard" record tab -- reuses the exact same DashboardWidget
// builder/renderer the standalone company_dashboards use (CanvasEditor in
// edit mode, StaticWidgetGrid + DashboardWidgetRenderer in view mode), just
// bound to a linked custom table's rows that point back at THIS record via
// linked_table_id/link_field_id on the record_tabs row.
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Maximize2, Minimize2, Plus, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CanvasEditor from "../builder/CanvasEditor";
import StaticWidgetGrid from "../builder/StaticWidgetGrid";
import DashboardWidgetRenderer from "../DashboardWidgetRenderer";
import CreateInvoiceModal from "../CreateInvoiceModal";
// Deferred -- same reasoning as CustomTableMasterPage.tsx's own dynamic
// import of this component: not needed for this tab's initial render, only
// once a Disbursements tab's own "Import from PDF" button is clicked.
const DisbursementInvoiceImportModal = dynamic(() => import("../DisbursementInvoiceImportModal"));
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { relationCandidates as computeRelationCandidates, parentKindLabel, type ParentSystemTable } from "@/lib/dashboardWidgets/linkField";
import type { CustomTableField, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import type { DashboardWidget } from "@/lib/dashboardWidgets/types";

interface Props {
  tabId: string;
  linkedTableId: string;
  recordId: string;
  companyId: string;
  isEditing: boolean;
  recordSystemTable?: ParentSystemTable;
}

function coalesce(v: any): any {
  return v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? v.value_record_id ?? null;
}

export default function RecordDashboardTab({ tabId, linkedTableId, recordId, companyId, isEditing, recordSystemTable }: Props) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [fields, setFields] = useState<CustomTableField[]>([]);
  const [isLedger, setIsLedger] = useState(false);
  const [tableSlug, setTableSlug] = useState<string | null>(null);
  const [records, setRecords] = useState<CustomTableRecord[]>([]);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [linkFieldId, setLinkFieldId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [isFeeSource, setIsFeeSource] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showImportInvoice, setShowImportInvoice] = useState(false);

  const fieldById = new Map(fields.map(f => [f.id, f]));

  // ── Load fields + linked table meta + link field + saved widgets ──
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const [{ data: { user } }, { data: flds }, { data: tbl }, { data: tab }, { data: widgetRow }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('company_table_fields').select('*').eq('table_id', linkedTableId).is('deleted_at', null).order('display_order'),
        supabase.from('company_tables').select('is_ledger, slug').eq('id', linkedTableId).maybeSingle(),
        supabase.from('record_tabs').select('link_field_id, billing_role').eq('id', tabId).single(),
        supabase.from('record_tab_dashboard_widgets').select('widgets').eq('tab_id', tabId).maybeSingle(),
      ]);
      if (!active) return;

      const fieldList = (flds || []) as CustomTableField[];
      setFields(fieldList);
      setIsLedger(!!tbl?.is_ledger);
      setTableSlug(tbl?.slug ?? null);
      setUserId(user?.id || '');
      setWidgets(((widgetRow?.widgets as DashboardWidget[]) || []));
      // "Create invoice" only ever makes sense from a fee-source tab (Time &
      // Fees/Disbursements) -- see lib/dashboardWidgets/defaultRecordDashboardTabs.ts,
      // the one place billing_role is set.
      setIsFeeSource(tab?.billing_role === 'fee_source');

      // Auto-set link field — scoped to this record's own system table so
      // an unrelated relation field of a different kind on the linked table
      // doesn't cause a false ambiguity (see lib/dashboardWidgets/linkField.ts).
      let lf: string | null = tab?.link_field_id ?? null;
      if (!lf) {
        const candidates = computeRelationCandidates(fieldList, recordSystemTable);
        if (candidates.length === 1) {
          lf = candidates[0].id;
          await supabase.from('record_tabs').update({ link_field_id: lf }).eq('id', tabId);
        }
      }
      setLinkFieldId(lf);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [tabId, linkedTableId, recordSystemTable]);

  // ── Load only the rows of the linked table that link back to this record ──
  const loadRecords = useCallback(async () => {
    if (!linkFieldId) { setRecords([]); return; }
    const { data } = await supabase
      .from('company_table_records')
      .select('id, table_id, created_at, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean, value_record_id)')
      .eq('table_id', linkedTableId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const fieldMap = new Map(fields.map(f => [f.id, f]));
    const matched: CustomTableRecord[] = [];
    (data || []).forEach((rec: any) => {
      const values: Record<string, any> = {};
      let linksHere = false;
      (rec.values || []).forEach((v: any) => {
        const field = fieldMap.get(v.field_id);
        if (field) values[field.field_key] = coalesce(v);
        if (v.field_id === linkFieldId && v.value_record_id === recordId) linksHere = true;
      });
      if (linksHere) matched.push({ id: rec.id, table_id: rec.table_id, created_at: rec.created_at, values, displayValues: {} });
    });
    setRecords(matched);
  }, [linkFieldId, linkedTableId, recordId, fields]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // Lets DashboardQuickAddForm skip its full-refetch fallback (onAdded ->
  // loadRecords, a real round trip re-querying every row of the linked
  // table) and instead append the just-created row straight into local
  // state -- same shape as lib/hooks/useCustomTable.ts's own
  // addRecordOptimistic, used by the standalone company-dashboard version
  // of this same quick-add form. `records` here is already scoped to rows
  // linking back to THIS record (see loadRecords above), and
  // DashboardQuickAddForm always forces the link field to recordId via
  // fixedValues, so the new row unconditionally belongs in it.
  const addRecordOptimistic = useCallback((id: string, values: Record<string, any>) => {
    setRecords(prev => {
      if (prev.some(r => r.id === id)) return prev; // a real refetch already landed it first
      const newRecord: CustomTableRecord = {
        id, table_id: linkedTableId, created_at: new Date().toISOString(), values, displayValues: {},
      };
      return [newRecord, ...prev];
    });
  }, [linkedTableId]);

  useProgressBarWhile(loading);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const setFilter = useCallback((fieldId: string, value: any) => {
    setFilters(prev => ({ ...prev, [fieldId]: value }));
  }, []);

  const filteredRecords = records.filter(r => Object.entries(filters).every(([fieldId, val]) => {
    if (val === null || val === undefined || val === '') return true;
    const field = fieldById.get(fieldId);
    if (!field) return true;
    return String(r.values[field.field_key] ?? '') === String(val);
  }));

  const saveWidgets = async (next: DashboardWidget[]) => {
    setWidgets(next);
    await supabase.from('record_tab_dashboard_widgets').upsert({
      tab_id: tabId,
      widgets: next,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tab_id' });
  };

  const relationCandidates = computeRelationCandidates(fields, recordSystemTable);
  const parentKind = parentKindLabel(recordSystemTable);
  const linkField = fields.find(f => f.id === linkFieldId);

  if (loading) return null;

  if (isEditing) {
    return (
      <div className="space-y-5">
        {(!linkFieldId && relationCandidates.length > 1) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <label className="text-[9px] font-bold text-amber-700 uppercase tracking-widest block mb-1.5">
              Which field links a record to this {parentKind}?
            </label>
            <select
              value={linkFieldId || ''}
              onChange={async e => {
                const fid = e.target.value || null;
                setLinkFieldId(fid);
                await supabase.from('record_tabs').update({ link_field_id: fid }).eq('id', tabId);
              }}
              className="w-full bg-white border border-amber-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
            >
              <option value="">Select a field...</option>
              {relationCandidates.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
        )}
        {linkFieldId && relationCandidates.length > 1 && (
          <div className="text-[10px] font-medium text-slate-400 px-1">
            Link field:{' '}
            <select
              value={linkFieldId}
              onChange={async e => {
                const fid = e.target.value;
                setLinkFieldId(fid);
                await supabase.from('record_tabs').update({ link_field_id: fid }).eq('id', tabId);
              }}
              className="bg-slate-50 border border-slate-200 rounded-full py-1 px-3 text-[11px] font-bold outline-none appearance-none"
            >
              {relationCandidates.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
        )}
        <CanvasEditor
          widgets={widgets}
          onChange={saveWidgets}
          fields={fields}
          fieldById={fieldById}
          records={records}
          tableId={linkedTableId}
          sourceKind="custom"
          companyId={companyId}
          userId={userId}
        />
      </div>
    );
  }

  if (!linkFieldId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
        <p className="text-slate-300 text-[11px] font-bold uppercase tracking-widest">Not configured</p>
        <p className="text-[12px] text-slate-400">Switch to edit mode and pick the field that links a record to this {parentKind}.</p>
      </div>
    );
  }

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-slate-50 overflow-y-auto p-8 space-y-3" : "space-y-3"}>
      {(isFeeSource) && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setFullscreen(p => !p)}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
            className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all"
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          {tableSlug === 'disbursements' && (
            <button
              onClick={() => setShowImportInvoice(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all"
            >
              <Upload size={14} /> Import from PDF
            </button>
          )}
          <button
            onClick={() => setShowCreateInvoice(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all"
          >
            <Plus size={14} /> Create invoice
          </button>
        </div>
      )}
      {tableSlug === 'trust-transactions' && (
        <div className="flex items-center justify-end">
          <a
            href={`/api/trust-ledger/${recordId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-700 text-white rounded-full text-[11px] font-bold hover:bg-teal-800 transition-all"
          >
            Print ledger
          </a>
        </div>
      )}
      <StaticWidgetGrid widgets={widgets}>
        {(w) => (
          <DashboardWidgetRenderer
            widget={w}
            sourceKind="custom"
            fields={fields}
            fieldById={fieldById}
            records={filteredRecords}
            allRecords={records}
            tableId={linkedTableId}
            companyId={companyId}
            userId={userId}
            filters={filters}
            setFilter={setFilter}
            onChanged={loadRecords}
            onOptimisticAdd={addRecordOptimistic}
            mode="view"
            isLedger={isLedger}
            fixedValues={linkField ? { [linkField.field_key]: recordId } : undefined}
          />
        )}
      </StaticWidgetGrid>
      {showCreateInvoice && (
        <CreateInvoiceModal
          matterId={recordId}
          companyId={companyId}
          userId={userId}
          onClose={() => setShowCreateInvoice(false)}
          onCreated={() => { setShowCreateInvoice(false); loadRecords(); }}
        />
      )}
      {showImportInvoice && (
        <DisbursementInvoiceImportModal
          restrictToProjectId={recordId}
          onClose={() => setShowImportInvoice(false)}
          onImported={() => { setShowImportInvoice(false); loadRecords(); }}
        />
      )}
    </div>
  );
}
