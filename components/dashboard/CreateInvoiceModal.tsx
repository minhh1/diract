"use client";

// Create Invoice: select this matter's unbilled fees/disbursements, optionally
// apportion the selected fees, pick a debtor/template/dates, and save. On
// save: creates the Invoices-table header record, links + freezes each
// selected source entry (invoice relation + invoiced_amount, which fires the
// existing sum_related rollup automatically -- see
// supabase/invoiced_amount_field.sql), and snapshots invoice_line_items so
// the PDF never drifts if a source entry is edited later.
//
// Which tables are "this matter's fees/disbursements/invoices" is resolved
// via record_tabs.billing_role (see lib/dashboardWidgets/defaultRecordDashboardTabs.ts),
// never a hardcoded slug -- portable to a company that's since renamed those
// tables. Opened from RecordDashboardTab.tsx (Time & Fees/Disbursements) and
// InvoicesTab.tsx, all three passing the same matterId/companyId/userId.
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { X, Loader2, Check, ExternalLink, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import RelationPicker from "./RelationPicker";
import { createRecord as createCustomRecord, updateRecord as updateCustomRecord } from "@/lib/services/customTableService";
import { scaleToTarget, applyToSelectedLines, applyPercentOrAmount, splitGst, type ApportionLine, type ApportionedLine } from "@/lib/invoices/apportionment";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";

interface FeeRow { id: string; tableId: string; date: string | null; description: string; staffLabel: string; staffPosition: string | null; rate: number; hours: number; amount: number; gstStatus: string; isFixedFee: boolean }
interface DisbRow { id: string; tableId: string; date: string | null; description: string; amount: number; gstStatus: string }

interface Props {
  matterId: string;
  companyId: string;
  userId: string;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
}

type ApportionMode = 'none' | 'pct_amount' | 'target';

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

export default function CreateInvoiceModal({ matterId, companyId, userId, onClose, onCreated }: Props) {
  const { invoiceSettings } = useCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notReady, setNotReady] = useState(false);

  const [invoicesTableId, setInvoicesTableId] = useState<string | null>(null);
  const [invoiceFields, setInvoiceFields] = useState<CustomTableField[]>([]);
  const [sourceFieldsByTable, setSourceFieldsByTable] = useState<Map<string, CustomTableField[]>>(new Map());

  const [feeRows, setFeeRows] = useState<FeeRow[]>([]);
  const [disbRows, setDisbRows] = useState<DisbRow[]>([]);
  const [selectedFeeIds, setSelectedFeeIds] = useState<Set<string>>(new Set());
  const [selectedDisbIds, setSelectedDisbIds] = useState<Set<string>>(new Set());

  const [mode, setMode] = useState<ApportionMode>('none');
  const [pctAmtType, setPctAmtType] = useState<'percent' | 'amount'>('percent');
  const [pctAmtDirection, setPctAmtDirection] = useState<'discount' | 'markup'>('discount');
  const [pctAmtValue, setPctAmtValue] = useState('');
  const [targetTotal, setTargetTotal] = useState('');
  const [targetDistribution, setTargetDistribution] = useState<'all' | 'largest'>('all');
  const [largestSelectedIds, setLargestSelectedIds] = useState<Set<string>>(new Set());

  // Multiple debtors (e.g. joint purchasers/co-borrowers) -- see
  // supabase/invoices_debtor_multi.sql, which flipped this field to the
  // generic allow_multiple relation mechanism. Each entity renders as its
  // own paragraph on the invoice, with a blank line between them.
  const [debtorIds, setDebtorIds] = useState<string[]>([]);
  const [responsiblePartnerId, setResponsiblePartnerId] = useState<string | null>(null);
  const [responsiblePartnerLabel, setResponsiblePartnerLabel] = useState<string | null>(null);
  const [ourReference, setOurReference] = useState('');
  const [yourReference, setYourReference] = useState('');
  const [professionalFeesDescription, setProfessionalFeesDescription] = useState('');
  const [matterName, setMatterName] = useState('');
  // AI-drafted candidate for professionalFeesDescription -- shown as a
  // preview the admin explicitly adopts (or discards), never auto-applied,
  // so a draft they're already part-way through typing is never silently
  // overwritten.
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  // Per-invoice overrides of the Detailed template's two itemised tables
  // (InvoiceTemplateSettingsTab.tsx sets the template-wide default; these
  // let one specific invoice deviate from it without changing the
  // template or any other invoice). Re-defaulted from the selected
  // template's own setting whenever the template changes, see the effect
  // below.
  const [showProfessionalFeesTable, setShowProfessionalFeesTable] = useState(true);
  const [showSummaryFeesByLawyerTable, setShowSummaryFeesByLawyerTable] = useState(true);
  const [templateId, setTemplateId] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  // False until the viewer picks a due date themselves -- same "auto-fill
  // until deliberately overridden" idea as RelationPicker's userClearedRef.
  // Without this, the effect below would keep stomping a manual pick every
  // time issueDate itself re-renders for an unrelated reason.
  const [dueDateTouched, setDueDateTouched] = useState(false);

  // Defaults due date to issue date + the company's payment terms (Settings
  // -> Invoice template -> Terms & payment, default 14 days if unset) --
  // still just a normal date input underneath, so picking a different date
  // "adjusts" it same as always.
  useEffect(() => {
    if (dueDateTouched || !issueDate) return;
    const days = invoiceSettings.paymentTermsDays ?? 14;
    const d = new Date(issueDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setDueDate(d.toISOString().slice(0, 10));
  }, [issueDate, invoiceSettings.paymentTermsDays, dueDateTouched]);

  // Re-default the two per-invoice table overrides from whichever template
  // is selected -- switching templates mid-modal shouldn't carry over a
  // previous template's setting.
  useEffect(() => {
    const t = invoiceSettings.templates.find(x => x.id === templateId);
    setShowProfessionalFeesTable(t?.display?.showProfessionalFeesTable !== false);
    setShowSummaryFeesByLawyerTable(t?.display?.showSummaryFeesByLawyerTable !== false);
  }, [templateId, invoiceSettings.templates]);

  const [success, setSuccess] = useState<{ id: string; invoiceNumber: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);

      const { data: tabs } = await supabase
        .from('record_tabs')
        .select('linked_table_id, billing_role')
        .eq('record_id', matterId).eq('record_table', 'projects')
        .not('billing_role', 'is', null);

      const invTableId = tabs?.find(t => t.billing_role === 'invoices')?.linked_table_id || null;
      const feeSourceTableIds = (tabs || []).filter(t => t.billing_role === 'fee_source').map(t => t.linked_table_id!);
      if (!active) return;

      if (!invTableId || !feeSourceTableIds.length) {
        setNotReady(true);
        setLoading(false);
        return;
      }
      setInvoicesTableId(invTableId);

      const [{ data: invFields }, { data: project }] = await Promise.all([
        supabase.from('company_table_fields').select('*').eq('table_id', invTableId).is('deleted_at', null),
        supabase.from('projects').select('name').eq('id', matterId).maybeSingle(),
      ]);
      if (!active) return;
      setInvoiceFields((invFields || []) as CustomTableField[]);
      if (project?.name) setMatterName(project.name);

      // Debtor auto-fill (Settings -> Invoice template -> Terms & payment)
      // -- `projects` has no built-in "client"/"debtor" column, only
      // whatever entity-relation custom field a company actually uses to
      // record who's on a matter (e.g. Huynh Lawyers' "Client Name"), so
      // this has to be configured the same way "Our Reference" is below
      // rather than assumed. Still just a normal RelationPicker afterward,
      // not locked to this value.
      const debtorKey = invoiceSettings.debtorFieldKey;
      if (debtorKey?.startsWith('cf:')) {
        const { data: cfValue } = await supabase
          .from('company_custom_field_values').select('value_record_id')
          .eq('field_id', debtorKey.slice(3)).eq('record_id', matterId).maybeSingle();
        if (cfValue?.value_record_id && active) {
          setDebtorIds([cfValue.value_record_id]);
        }
      }

      // "Our Reference" auto-fill (Settings -> Invoice template -> Terms &
      // payment) -- 'name' reads the matter's own name, 'cf:<id>' reads a
      // custom field on the matter (e.g. Huynh Lawyers' Matter Number).
      // Still just a normal text input afterward, not locked to this value.
      const ourRefKey = invoiceSettings.ourReferenceFieldKey;
      if (ourRefKey === 'name') {
        if (project?.name) setOurReference(project.name);
      } else if (ourRefKey?.startsWith('cf:')) {
        const { data: cfValue } = await supabase
          .from('company_custom_field_values').select('value_text, value_number')
          .eq('field_id', ourRefKey.slice(3)).eq('record_id', matterId).maybeSingle();
        const val = cfValue?.value_text ?? cfValue?.value_number;
        if (val != null && active) setOurReference(String(val));
      }

      const defaultTemplate = invoiceSettings.templates.find(t => t.isDefault) || invoiceSettings.templates[0];
      if (defaultTemplate) setTemplateId(defaultTemplate.id);

      const fieldsByTable = new Map<string, CustomTableField[]>();
      const newFeeRows: FeeRow[] = [];
      const newDisbRows: DisbRow[] = [];

      for (const tableId of feeSourceTableIds) {
        const { data: fields } = await supabase.from('company_table_fields').select('*').eq('table_id', tableId).is('deleted_at', null);
        const fieldList = (fields || []) as CustomTableField[];
        fieldsByTable.set(tableId, fieldList);
        const matterField = fieldList.find(f => f.field_key === 'matter');
        if (!matterField) continue;
        const isFeeTable = fieldList.some(f => f.field_key === 'duration_hours');

        const { data: matterLinks } = await supabase
          .from('company_table_values').select('record_id')
          .eq('field_id', matterField.id).eq('value_record_id', matterId);
        const candidateIds = [...new Set((matterLinks || []).map(l => l.record_id))];
        if (!candidateIds.length) continue;

        const { data: aliveRecs } = await supabase
          .from('company_table_records').select('id').in('id', candidateIds).is('deleted_at', null);
        const aliveIds = (aliveRecs || []).map(r => r.id);
        if (!aliveIds.length) continue;

        const { data: valueRows } = await supabase
          .from('company_table_values')
          .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
          .in('record_id', aliveIds);

        const fieldById = new Map(fieldList.map(f => [f.id, f]));
        const byRecord = new Map<string, Record<string, any>>();
        (valueRows || []).forEach(v => {
          const field = fieldById.get(v.field_id);
          if (!field) return;
          if (!byRecord.has(v.record_id)) byRecord.set(v.record_id, {});
          byRecord.get(v.record_id)![field.field_key] = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? v.value_record_id ?? null;
        });

        const staffIds = new Set<string>();
        byRecord.forEach(row => { if (row.staff) staffIds.add(row.staff); });
        const { data: staffRows } = staffIds.size
          ? await supabase.from('entities').select('id, name').in('id', [...staffIds])
          : { data: [] as { id: string; name: string }[] };
        const staffNameById = new Map((staffRows || []).map(s => [s.id, s.name]));

        // "Position" for the Detailed template's Summary Fees by Lawyer
        // table -- entities.timekeeper_level (an existing custom field,
        // e.g. Partner/Senior Associate/Associate), snapshotted onto
        // invoice_line_items.staff_position at save time below so the
        // table never drifts if a timekeeper's level changes later.
        let staffPositionById = new Map<string, string>();
        if (isFeeTable && staffIds.size) {
          const { data: levelFieldDef } = await supabase
            .from('company_custom_fields').select('id')
            .eq('company_id', companyId).eq('table_name', 'entities').eq('field_key', 'timekeeper_level').is('deleted_at', null).maybeSingle();
          if (levelFieldDef) {
            const { data: levelValues } = await supabase
              .from('company_custom_field_values').select('record_id, value_text')
              .eq('field_id', levelFieldDef.id).in('record_id', [...staffIds]);
            staffPositionById = new Map(
              (levelValues || []).filter(v => v.value_text).map(v => [v.record_id, v.value_text as string])
            );
          }
        }

        for (const [recordId, row] of byRecord) {
          if (row.invoice) continue; // already billed -- not "unbilled"
          if (isFeeTable) {
            newFeeRows.push({
              id: recordId, tableId, date: row.date || null, description: row.description || '',
              staffLabel: staffNameById.get(row.staff) || '', staffPosition: staffPositionById.get(row.staff) || null,
              rate: Number(row.rate) || 0,
              hours: Number(row.duration_hours) || 0, amount: Number(row.amount) || 0,
              gstStatus: row.gst_status || 'GST Exclusive',
              isFixedFee: row.type === 'Fixed Fee',
            });
          } else {
            newDisbRows.push({
              id: recordId, tableId, date: row.date || null, description: row.description || '', amount: Number(row.amount) || 0,
              gstStatus: row.gst_status || 'GST Exclusive',
            });
          }
        }
      }

      if (!active) return;
      newFeeRows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      newDisbRows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      setSourceFieldsByTable(fieldsByTable);
      setFeeRows(newFeeRows);
      setDisbRows(newDisbRows);
      setSelectedFeeIds(new Set(newFeeRows.map(r => r.id)));
      setSelectedDisbIds(new Set(newDisbRows.map(r => r.id)));
      setLoading(false);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId]);

  const selectedFeeLines: ApportionLine[] = useMemo(
    () => feeRows.filter(r => selectedFeeIds.has(r.id)).map(r => ({ id: r.id, amount: r.amount })),
    [feeRows, selectedFeeIds]
  );

  // Default the "largest lines" checkbox set to just the single largest
  // selected fee the first time that mode is picked -- the common case
  // ("apply to the biggest amount") is then a one-click default; checking
  // more boxes widens it to "the few largest" without a separate mode.
  useEffect(() => {
    if (targetDistribution !== 'largest' || largestSelectedIds.size > 0) return;
    const sorted = [...selectedFeeLines].sort((a, b) => b.amount - a.amount);
    if (sorted[0]) setLargestSelectedIds(new Set([sorted[0].id]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDistribution, selectedFeeLines]);

  const apportionedFees: ApportionedLine[] = useMemo(() => {
    const unchanged = () => selectedFeeLines.map(l => ({ id: l.id, originalAmount: l.amount, billedAmount: l.amount }));
    if (selectedFeeLines.length === 0) return [];
    if (mode === 'pct_amount') {
      const value = parseFloat(pctAmtValue);
      if (!value) return unchanged();
      return applyPercentOrAmount(selectedFeeLines, { mode: pctAmtType, direction: pctAmtDirection, value });
    }
    if (mode === 'target') {
      const target = parseFloat(targetTotal);
      if (Number.isNaN(target)) return unchanged();
      return targetDistribution === 'all'
        ? scaleToTarget(selectedFeeLines, target)
        : applyToSelectedLines(selectedFeeLines, [...largestSelectedIds], target);
    }
    return unchanged();
  }, [selectedFeeLines, mode, pctAmtType, pctAmtDirection, pctAmtValue, targetTotal, targetDistribution, largestSelectedIds]);

  const hasNegativeBilled = apportionedFees.some(l => l.billedAmount < 0);
  const feesSubtotal = apportionedFees.reduce((s, l) => s + l.billedAmount, 0);
  const disbSubtotal = disbRows.filter(r => selectedDisbIds.has(r.id)).reduce((s, r) => s + r.amount, 0);

  // Per-line GST split (see lib/invoices/apportionment.ts's splitGst) drives
  // the totals preview below -- mirrors exactly what handleSave freezes onto
  // invoiced_amount/invoiced_gst_amount, so this preview never disagrees
  // with what actually gets saved.
  const feeGstSplits = apportionedFees.map(l => splitGst(l.billedAmount, feeRows.find(r => r.id === l.id)?.gstStatus));
  const disbGstSplits = disbRows.filter(r => selectedDisbIds.has(r.id)).map(r => splitGst(r.amount, r.gstStatus));
  const allGstSplits = [...feeGstSplits, ...disbGstSplits];
  const subtotal = Math.round(allGstSplits.reduce((s, l) => s + l.exGst, 0) * 100) / 100;
  const gst = Math.round(allGstSplits.reduce((s, l) => s + l.gst, 0) * 100) / 100;
  const totalIncGst = Math.round((subtotal + gst) * 100) / 100;

  const toggleFee = (id: string) => setSelectedFeeIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleDisb = (id: string) => setSelectedDisbIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleLargest = (id: string) => setLargestSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // The Detailed template's "Professional Fees" itemised table is
  // per-template optional (InvoiceTemplateSettingsTab.tsx) -- when a firm
  // turns it off, the client has no other way to see what the fees
  // covered, so this invoice needs a manually-typed description instead of
  // the itemised list (see generateDetailedInvoicePdf.ts's page-1 summary
  // row).
  const selectedTemplateConfig = invoiceSettings.templates.find(t => t.id === templateId);
  const isDetailedTemplate = selectedTemplateConfig?.style === 'detailed';
  const professionalFeesDescriptionRequired =
    isDetailedTemplate && !showProfessionalFeesTable && selectedFeeIds.size > 0;

  const handleSuggestDescription = async () => {
    const descriptions = feeRows.filter(r => selectedFeeIds.has(r.id)).map(r => r.description).filter(Boolean);
    if (!descriptions.length) return;
    setSuggesting(true);
    setSuggestError(null);
    setSuggestion(null);
    try {
      const res = await fetch('/api/ai/suggest-invoice-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matterName, feeDescriptions: descriptions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Suggestion failed');
      setSuggestion(json.text || null);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Suggestion failed');
    } finally {
      setSuggesting(false);
    }
  };

  const handleSave = async () => {
    if (!invoicesTableId) return;
    if (selectedFeeIds.size === 0 && selectedDisbIds.size === 0) {
      setError('Select at least one fee or disbursement to invoice.');
      return;
    }
    if (hasNegativeBilled) {
      setError('One or more fees would be billed at a negative amount — adjust the discount or target.');
      return;
    }
    if (professionalFeesDescriptionRequired && !professionalFeesDescription.trim()) {
      setError('This template excludes the itemised Professional Fees table — describe the fees for the client.');
      return;
    }
    setSaving(true);
    setError('');

    const record = await createCustomRecord(invoicesTableId, companyId, userId, {
      matter: matterId,
      debtor: debtorIds,
      responsible_partner: responsiblePartnerId,
      our_reference: ourReference || null,
      your_reference: yourReference || null,
      professional_fees_description: professionalFeesDescription.trim() || null,
      show_professional_fees_table: isDetailedTemplate ? showProfessionalFeesTable : null,
      show_summary_fees_by_lawyer_table: isDetailedTemplate ? showSummaryFeesByLawyerTable : null,
      issue_date: issueDate,
      due_date: dueDate || null,
      status: 'Under Review',
      template_id: templateId || null,
    }, invoiceFields);

    if (!record || 'error' in record) {
      setError((record as any)?.error || 'Could not create the invoice.');
      setSaving(false);
      return;
    }

    // Both invoiced_amount (feeds fees_total/disbursements_total ->
    // subtotal) and invoice_line_items' original_amount/billed_amount are
    // the EX-GST portion of each figure -- see lib/invoices/apportionment.ts's
    // splitGst(). For a GST Exclusive/Free line this equals the raw dollar
    // amount as before; for GST Inclusive it's the amount with GST backed
    // out, with gst_amount carrying the difference separately (what
    // InvoiceTemplateDisplay.showAmountAndGstPerLine is for).
    const lineItemRows: any[] = [];
    for (const line of apportionedFees) {
      const row = feeRows.find(r => r.id === line.id);
      if (!row) continue;
      const fields = sourceFieldsByTable.get(row.tableId) || [];
      const originalSplit = splitGst(line.originalAmount, row.gstStatus);
      const billedSplit = splitGst(line.billedAmount, row.gstStatus);
      await updateCustomRecord(row.id, row.tableId, companyId, {
        invoice: record.id, invoiced_amount: billedSplit.exGst, invoiced_gst_amount: billedSplit.gst,
      }, fields);
      lineItemRows.push({
        company_id: companyId, invoice_record_id: record.id, source_type: 'fee', source_record_id: row.id,
        description: row.description, original_amount: originalSplit.exGst, billed_amount: billedSplit.exGst,
        entry_date: row.date, staff_name: row.staffLabel || null, staff_position: row.staffPosition, rate: row.rate, hours: row.hours,
        gst_status: row.gstStatus, gst_amount: billedSplit.gst, is_fixed_fee: row.isFixedFee,
      });
    }
    for (const row of disbRows.filter(r => selectedDisbIds.has(r.id))) {
      const fields = sourceFieldsByTable.get(row.tableId) || [];
      const split = splitGst(row.amount, row.gstStatus);
      await updateCustomRecord(row.id, row.tableId, companyId, {
        invoice: record.id, invoiced_amount: split.exGst, invoiced_gst_amount: split.gst,
      }, fields);
      lineItemRows.push({
        company_id: companyId, invoice_record_id: record.id, source_type: 'disbursement', source_record_id: row.id,
        description: row.description, original_amount: split.exGst, billed_amount: split.exGst,
        entry_date: row.date, staff_name: null, rate: null, hours: null,
        gst_status: row.gstStatus, gst_amount: split.gst,
      });
    }
    if (lineItemRows.length) {
      const { error: liError } = await supabase.from('invoice_line_items').insert(lineItemRows);
      if (liError) { setError(liError.message); setSaving(false); return; }
    }

    // amount_due isn't a formula field (unlike subtotal/gst/total_inc_gst,
    // which cascade via the sum_related rollups the invoice/invoiced_amount
    // updates above trigger) -- set it from `totalIncGst`, the exact value
    // already shown in this modal's own Totals preview, rather than reading
    // total_inc_gst back from the DB. That read used to race the rollup
    // cascade itself (confirmed live: total_inc_gst ends up correct but
    // this read could still see 0 first), and total_inc_gst is computed
    // from the SAME apportioned/GST-split numbers as `totalIncGst` here, so
    // there's nothing the DB round trip could tell us that isn't already in
    // scope. payments/trust_applied are both 0 at creation time; edited
    // later via InvoicesTab's Edit action, which recomputes amount_due itself.
    const invNumberField = invoiceFields.find(f => f.field_key === 'invoice_number');
    const amountDueField = invoiceFields.find(f => f.field_key === 'amount_due');
    let invoiceNumber = '';
    if (invNumberField) {
      const { data: numRow } = await supabase
        .from('company_table_values').select('value_text').eq('record_id', record.id).eq('field_id', invNumberField.id).maybeSingle();
      invoiceNumber = numRow?.value_text || '';
    }
    if (amountDueField) {
      await updateCustomRecord(record.id, invoicesTableId, companyId, { amount_due: totalIncGst }, invoiceFields);
    }

    setSaving(false);
    setSuccess({ id: record.id, invoiceNumber });
    onCreated(record.id);
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 text-center space-y-5">
          <div className="mx-auto h-14 w-14 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center">
            <Check size={26} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Invoice created</h3>
            <p className="text-[12px] text-slate-400 mt-1">{success.invoiceNumber || 'Invoice'} is ready.</p>
          </div>
          <div className="flex gap-3">
            <a
              href={`/api/invoices/${success.id}/pdf`}
              target="_blank" rel="noreferrer"
              className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-100 transition-all"
            >
              Preview PDF
            </a>
            <a
              href={`/api/invoices/${success.id}/docx?download=1`}
              className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-100 transition-all"
            >
              Word
            </a>
            <button onClick={onClose} className="flex-1 py-3 bg-slate-900 text-white rounded-lg text-[11px] font-bold hover:bg-slate-800 transition-all">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="shrink-0 flex items-center justify-between p-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Create invoice</h3>
            <Link href="/dashboard/settings?view=invoice_template" className="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1 mt-0.5">
              Manage invoice template <ExternalLink size={10} />
            </Link>
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-black"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
          ) : notReady ? (
            <p className="text-center text-[12px] text-slate-400 py-12">
              This matter doesn't have any billable line-item tables set up yet.
            </p>
          ) : (
            <>
              {/* Header fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Debtor</label>
                  <RelationPicker
                    linkedSystemTable="entities"
                    multiple
                    values={debtorIds}
                    onSelectMulti={setDebtorIds}
                    placeholder="Select debtor(s)..."
                    allowCreateEntity
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    More than one shows as separate paragraphs on the invoice, one per line.
                  </p>
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Responsible partner</label>
                  <RelationPicker
                    linkedSystemTable="entities"
                    filterColumn="entity_type"
                    filterValue="Staff"
                    value={responsiblePartnerId}
                    initialLabel={responsiblePartnerLabel || undefined}
                    onSelect={(id, label) => { setResponsiblePartnerId(id); setResponsiblePartnerLabel(label); }}
                    placeholder="Select responsible partner (optional)..."
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Our reference</label>
                  <input value={ourReference} onChange={e => setOurReference(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-sm font-medium outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Your reference</label>
                  <input value={yourReference} onChange={e => setYourReference(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-sm font-medium outline-none" />
                </div>
                {invoiceSettings.templates.length > 0 && (
                  <div className="col-span-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Template</label>
                    <select
                      value={templateId}
                      onChange={e => setTemplateId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                    >
                      {invoiceSettings.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
                {isDetailedTemplate && (
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">For this invoice only</label>
                    <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={showProfessionalFeesTable} onChange={e => setShowProfessionalFeesTable(e.target.checked)} />
                      Include the itemised "Professional Fees" table
                    </label>
                    <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={showSummaryFeesByLawyerTable} onChange={e => setShowSummaryFeesByLawyerTable(e.target.checked)} />
                      Include the "Summary Fees by Lawyer" table
                    </label>
                  </div>
                )}
                {professionalFeesDescriptionRequired && (
                  <div className="col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        Professional fees description <span className="text-rose-400">*</span>
                      </label>
                      <button
                        type="button" onClick={handleSuggestDescription} disabled={suggesting || selectedFeeIds.size === 0}
                        title="Suggest with AI" aria-label="Suggest with AI"
                        className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 disabled:opacity-40"
                      >
                        {suggesting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Suggest
                      </button>
                    </div>
                    <textarea
                      value={professionalFeesDescription} onChange={e => setProfessionalFeesDescription(e.target.value)}
                      rows={2} placeholder="e.g. For professional services in connection with the preparation and negotiation of the Development Management Agreement"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm font-medium outline-none resize-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      This template doesn't include the itemised Professional Fees table, so the client needs this to know what the fees covered.
                    </p>
                    {suggestError && <p className="text-[10px] text-red-500 mt-1">{suggestError}</p>}
                    {suggestion && (
                      <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded-2xl p-3 space-y-2">
                        <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">AI suggestion</p>
                        <p className="text-[12px] text-slate-700">{suggestion}</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setProfessionalFeesDescription(suggestion); setSuggestion(null); }}
                            className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700"
                          >
                            Use this
                          </button>
                          <button
                            type="button" onClick={() => setSuggestion(null)}
                            className="px-3 py-1 text-slate-400 text-[10px] font-bold hover:text-slate-600"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Issue date</label>
                  <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-sm font-medium outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Due date</label>
                  <input type="date" value={dueDate} onChange={e => { setDueDate(e.target.value); setDueDateTouched(true); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-sm font-medium outline-none" />
                </div>
              </div>

              {/* Fees */}
              {feeRows.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Unbilled fees ({selectedFeeIds.size}/{feeRows.length} selected)
                  </p>
                  <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    {feeRows.map(r => (
                      <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[12px] cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" checked={selectedFeeIds.has(r.id)} onChange={() => toggleFee(r.id)} className="shrink-0" />
                        <span className="text-slate-400 w-20 shrink-0">{r.date || '—'}</span>
                        <span className="flex-1 truncate text-slate-700">{r.description || '(no description)'}</span>
                        <span className="text-slate-500 shrink-0">{r.hours.toFixed(2)}h</span>
                        <span className="font-bold text-slate-800 w-20 text-right shrink-0">{money(r.amount)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Apportionment */}
              {selectedFeeLines.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Apportion selected fees</p>
                  <div className="flex flex-col gap-2">
                    {([
                      ['none', 'No change'],
                      ['pct_amount', 'Discount / markup by % or $'],
                      ['target', 'Target a fixed fee total'],
                    ] as const).map(([v, label]) => (
                      <label key={v} className="flex items-center gap-2 text-[12px] font-medium text-slate-700 cursor-pointer">
                        <input type="radio" name="apportion-mode" checked={mode === v} onChange={() => setMode(v)} />
                        {label}
                      </label>
                    ))}
                  </div>

                  {mode === 'pct_amount' && (
                    <div className="flex items-center gap-2 pl-6">
                      <select value={pctAmtDirection} onChange={e => setPctAmtDirection(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg py-2 px-3 text-[12px] font-medium outline-none">
                        <option value="discount">Discount</option>
                        <option value="markup">Markup</option>
                      </select>
                      <input type="number" step="0.01" value={pctAmtValue} onChange={e => setPctAmtValue(e.target.value)}
                        placeholder="0" className="w-28 bg-white border border-slate-200 rounded-lg py-2 px-3 text-[12px] font-medium outline-none" />
                      <select value={pctAmtType} onChange={e => setPctAmtType(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg py-2 px-3 text-[12px] font-medium outline-none">
                        <option value="percent">%</option>
                        <option value="amount">$</option>
                      </select>
                    </div>
                  )}

                  {mode === 'target' && (
                    <div className="pl-6 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-slate-500">Target fee total $</span>
                        <input type="number" step="0.01" value={targetTotal} onChange={e => setTargetTotal(e.target.value)}
                          placeholder={feesSubtotal.toFixed(2)} className="w-32 bg-white border border-slate-200 rounded-lg py-2 px-3 text-[12px] font-medium outline-none" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-2 text-[12px] text-slate-700 cursor-pointer">
                          <input type="radio" name="target-dist" checked={targetDistribution === 'all'} onChange={() => setTargetDistribution('all')} />
                          Spread the adjustment across all fees
                        </label>
                        <label className="flex items-center gap-2 text-[12px] text-slate-700 cursor-pointer">
                          <input type="radio" name="target-dist" checked={targetDistribution === 'largest'} onChange={() => setTargetDistribution('largest')} />
                          Apply the adjustment to the largest fee(s) only
                        </label>
                      </div>
                      {targetDistribution === 'largest' && (
                        <div className="border border-slate-200 bg-white rounded-2xl divide-y divide-slate-100 max-h-40 overflow-y-auto">
                          {[...feeRows].filter(r => selectedFeeIds.has(r.id)).sort((a, b) => b.amount - a.amount).map(r => (
                            <label key={r.id} className="flex items-center gap-3 px-4 py-2 text-[11px] cursor-pointer hover:bg-slate-50">
                              <input type="checkbox" checked={largestSelectedIds.has(r.id)} onChange={() => toggleLargest(r.id)} />
                              <span className="flex-1 truncate">{r.description || '(no description)'}</span>
                              <span className="font-bold">{money(r.amount)}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {mode !== 'none' && (
                    <div className="pl-6 pt-1 space-y-1 border-t border-slate-200">
                      {apportionedFees.filter(l => Math.abs(l.billedAmount - l.originalAmount) > 0.004).map(l => {
                        const row = feeRows.find(r => r.id === l.id)!;
                        return (
                          <div key={l.id} className="flex items-center justify-between text-[11px] text-slate-500">
                            <span className="truncate">{row?.description || '(no description)'}</span>
                            <span>{money(l.originalAmount)} → <span className={l.billedAmount < l.originalAmount ? 'text-rose-500 font-bold' : 'text-emerald-600 font-bold'}>{money(l.billedAmount)}</span></span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Disbursements */}
              {disbRows.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Unbilled disbursements ({selectedDisbIds.size}/{disbRows.length} selected)
                  </p>
                  <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    {disbRows.map(r => (
                      <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[12px] cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" checked={selectedDisbIds.has(r.id)} onChange={() => toggleDisb(r.id)} className="shrink-0" />
                        <span className="text-slate-400 w-20 shrink-0">{r.date || '—'}</span>
                        <span className="flex-1 truncate text-slate-700">{r.description || '(no description)'}</span>
                        <span className="font-bold text-slate-800 w-20 text-right shrink-0">{money(r.amount)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {feeRows.length === 0 && disbRows.length === 0 && (
                <p className="text-center text-[12px] text-slate-400 py-8">No unbilled fees or disbursements on this matter.</p>
              )}

              {/* Totals preview */}
              {(feeRows.length > 0 || disbRows.length > 0) && (
                <div className="p-4 bg-slate-50 rounded-2xl space-y-1.5">
                  <div className="flex justify-between text-[12px] text-slate-500"><span>Subtotal (ex. GST)</span><span>{money(subtotal)}</span></div>
                  <div className="flex justify-between text-[12px] text-slate-500"><span>GST</span><span>{money(gst)}</span></div>
                  <div className="flex justify-between text-[13px] font-bold text-slate-800"><span>Total (inc. GST)</span><span>{money(totalIncGst)}</span></div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>
          )}
        </div>

        <div className="shrink-0 flex gap-3 p-6 pt-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3.5 bg-slate-50 text-slate-600 rounded-lg text-[11px] font-medium hover:bg-slate-100 transition-all">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || notReady || (feeRows.length === 0 && disbRows.length === 0)}
            className="flex-1 py-3.5 bg-indigo-600 text-white rounded-lg text-[11px] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Create invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}
