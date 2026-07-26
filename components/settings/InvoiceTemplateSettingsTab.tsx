// components/settings/InvoiceTemplateSettingsTab.tsx
// Invoice branding/terms/template configuration -- reached via
// /dashboard/settings?view=invoice_template, and linked directly from
// CreateInvoiceModal ("Manage invoice template"). Three sections, ordered by
// how urgently a business needs them: Branding (logo -- the one thing every
// business wants immediately, whether a law firm or a trade business) is
// always visible; Terms & payment next; the per-line display toggles last,
// pre-checked with sensible defaults so a brand-new company gets a fully
// compliant invoice with zero configuration and only needs this section if
// they want to trim it down. Admin-gated, same fieldset-disable pattern as
// PrecedentsSettingsTab.tsx's formatting-defaults section.
"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Trash2, Loader2, Check, Plus, Lock, LayoutTemplate } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { supabase } from "@/lib/supabase";
import { DEFAULT_INVOICE_DISPLAY, INVOICE_LAYOUT_PRESETS, type InvoiceTemplateDisplay } from "@/lib/invoices/generateInvoicePdf";
import type { InvoiceTemplateConfig } from "@/lib/invoices/types";
import InvoiceLayoutEditor from "./InvoiceLayoutEditor";

const DISPLAY_TOGGLES: { key: keyof InvoiceTemplateDisplay; label: string }[] = [
  { key: 'showStaffInitials', label: "Show fee-earner initials next to each entry" },
  { key: 'showLineDescriptions', label: "Show each entry's own description" },
  { key: 'showRatePerLine', label: "Show the rate and time recorded per entry" },
  { key: 'showHoursPerLine', label: "Show hours recorded per entry" },
  { key: 'showAmountAndGstPerLine', label: "Show the amount (and GST) for each line" },
  { key: 'showFeeSubtotal', label: "Show a professional fees subtotal" },
  { key: 'showDisbursementSubtotal', label: "Show a disbursements subtotal" },
  { key: 'showPriorBalance', label: "Show the account's opening/prior balance" },
  { key: 'showDueDate', label: "Show the payment due date" },
  { key: 'showPaymentSummary', label: "Show a payments & trust summary" },
  { key: 'showAccountSummary', label: "Show an account activity summary" },
];

function AdminOnlyNote() {
  return <span className="flex items-center gap-1 text-[10px] text-slate-300"><Lock size={10} /> Admin only</span>;
}

export default function InvoiceTemplateSettingsTab() {
  const { isAdmin } = useCompany();
  return (
    <div className="space-y-6">
      <BrandingSection isAdmin={isAdmin} />
      <TermsSection isAdmin={isAdmin} />
      <TemplatesSection isAdmin={isAdmin} />
    </div>
  );
}

// ── Branding ──────────────────────────────────────────────────────
function BrandingSection({ isAdmin }: { isAdmin: boolean }) {
  const { logoUrl, refreshLogoUrl, invoiceSettings, refreshInvoiceSettings, companyId } = useCompany();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState(invoiceSettings.firmAddress || '');
  const [addressDirty, setAddressDirty] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/company/logo', { method: 'POST', body: form });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) { setError(json.error || 'Upload failed'); return; }
    await refreshLogoUrl();
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove the invoice logo?')) return;
    setError(null);
    const res = await fetch('/api/company/logo', { method: 'DELETE' });
    if (!res.ok) { setError('Could not remove the logo.'); return; }
    await refreshLogoUrl();
  };

  const saveAddress = async () => {
    if (!companyId) { setError('Still loading your company — try again in a moment.'); return; }
    setSavingAddress(true);
    setError(null);
    // merge_company_invoice_settings does a server-side jsonb `||` merge of
    // just this patch, rather than a client-side {...invoiceSettings, ...}
    // spread + whole-object update -- the latter raced against the Terms &
    // Templates sections saving around the same time off their own stale
    // snapshots of invoiceSettings, each silently clobbering the other's
    // just-written fields. See supabase/invoice_settings_merge.sql.
    const { error: updateError } = await supabase.rpc('merge_company_invoice_settings', {
      p_company_id: companyId, p_patch: { firmAddress: address },
    });
    setSavingAddress(false);
    if (updateError) { setError(updateError.message); return; }
    await refreshInvoiceSettings();
    setAddressDirty(false);
    setAddressSaved(true);
    setTimeout(() => setAddressSaved(false), 1500);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Branding</p>
        {!isAdmin && <AdminOnlyNote />}
      </div>

      <div className="flex items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Invoice logo" className="h-16 max-w-[200px] object-contain rounded-xl border border-slate-100 p-2" />
        ) : (
          <div className="h-16 w-32 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-300">No logo</div>
        )}
        {isAdmin && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {logoUrl ? 'Replace' : 'Upload logo'}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
            </label>
            {logoUrl && <button onClick={handleRemove} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>}
          </div>
        )}
      </div>

      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Firm address (shown on invoices)</label>
        <textarea
          value={address} onChange={e => { setAddress(e.target.value); setAddressDirty(true); }} disabled={!isAdmin} rows={2}
          placeholder="Level 4, 123 Example St, Sydney NSW 2000"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none disabled:opacity-60"
        />
        {isAdmin && (
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={saveAddress} disabled={!addressDirty || savingAddress}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              {savingAddress ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save address
            </button>
            {addressSaved && <span className="text-[11px] text-emerald-500 flex items-center gap-1"><Check size={12} /> Saved</span>}
          </div>
        )}
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

// ── Terms & payment ───────────────────────────────────────────────
function TermsSection({ isAdmin }: { isAdmin: boolean }) {
  const { invoiceSettings, refreshInvoiceSettings, companyId } = useCompany();
  const [creditTerms, setCreditTerms] = useState(invoiceSettings.creditTerms || '');
  const [otherTerms, setOtherTerms] = useState(invoiceSettings.otherTerms || '');
  const [paymentTermsDays, setPaymentTermsDays] = useState(invoiceSettings.paymentTermsDays ?? 14);
  const [ourReferenceFieldKey, setOurReferenceFieldKey] = useState(invoiceSettings.ourReferenceFieldKey || '');
  const [debtorFieldKey, setDebtorFieldKey] = useState(invoiceSettings.debtorFieldKey || '');
  const [accountName, setAccountName] = useState(invoiceSettings.bankDetails?.accountName || '');
  const [bsb, setBsb] = useState(invoiceSettings.bankDetails?.bsb || '');
  const [accountNumber, setAccountNumber] = useState(invoiceSettings.bankDetails?.accountNumber || '');
  const [reference, setReference] = useState(invoiceSettings.bankDetails?.reference || '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Matter fields available to auto-fill "Our Reference" from -- the
  // matter's own name plus every custom field on `projects` (e.g. Huynh
  // Lawyers' "Matter Number"). 'cf:<id>' mirrors the same convention
  // RelationPicker.tsx's displayField2/searchFieldKeys already use to tell
  // a native column apart from a custom field.
  const [projectFieldOptions, setProjectFieldOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data } = await supabase
        .from('company_custom_fields').select('id, label, field_type')
        .eq('company_id', companyId).eq('table_name', 'projects').is('deleted_at', null)
        .in('field_type', ['text', 'number']).order('display_order');
      setProjectFieldOptions([
        { value: 'name', label: 'Matter Name' },
        ...(data || []).map(f => ({ value: `cf:${f.id}`, label: f.label })),
      ]);
    })();
  }, [companyId]);

  // Matter fields available to auto-fill "Debtor" from -- entity-type
  // custom fields on `projects` only (Debtor needs an entity id to select,
  // unlike "Our Reference" which just needs displayable text). `projects`
  // has no built-in "client"/"debtor" column -- whatever a company actually
  // uses to record who's on a matter (e.g. a "Client Name" field) is just
  // another custom field, so this has to be configured the same way "Our
  // Reference" is rather than assumed.
  const [entityFieldOptions, setEntityFieldOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data } = await supabase
        .from('company_custom_fields').select('id, label, field_type')
        .eq('company_id', companyId).eq('table_name', 'projects').is('deleted_at', null)
        .eq('field_type', 'entity').order('display_order');
      setEntityFieldOptions((data || []).map(f => ({ value: `cf:${f.id}`, label: f.label })));
    })();
  }, [companyId]);

  const save = async () => {
    if (!companyId) { setError('Still loading your company — try again in a moment.'); return; }
    setSaving(true);
    setSaved(false);
    setError(null);
    const patch = {
      creditTerms, otherTerms, paymentTermsDays,
      ourReferenceFieldKey: ourReferenceFieldKey || null,
      debtorFieldKey: debtorFieldKey || null,
      bankDetails: { accountName, bsb, accountNumber, reference },
    };
    // Server-side partial merge -- see saveAddress above for why this isn't
    // a client-side {...invoiceSettings, ...patch} spread anymore.
    const { error: updateError } = await supabase.rpc('merge_company_invoice_settings', {
      p_company_id: companyId, p_patch: patch,
    });
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    await refreshInvoiceSettings();
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  // Every field below only updates local state -- nothing persists until
  // "Save changes" is clicked. Previously each field saved individually on
  // blur, which silently no-op'd (no error shown) whenever `companyId`
  // hadn't loaded yet or the request failed, making saves look like they'd
  // gone through when they hadn't. One explicit save action + visible
  // saving/saved/error state removes that ambiguity.
  const onField = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Terms & payment</p>
        {!isAdmin && <AdminOnlyNote />}
      </div>

      <fieldset disabled={!isAdmin} className="space-y-4 disabled:opacity-60">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Credit terms</label>
          <textarea value={creditTerms} onChange={e => onField(setCreditTerms)(e.target.value)} rows={2}
            placeholder="Payment is due within 14 days of the date of this invoice."
            className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Other terms</label>
          <textarea value={otherTerms} onChange={e => onField(setOtherTerms)(e.target.value)} rows={2}
            placeholder="Any additional notices to include on every invoice."
            className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Payment terms (days)</label>
          <input
            type="number" min={0} max={365} value={paymentTermsDays}
            onChange={e => onField(setPaymentTermsDays)(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
            className="w-24 px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
          />
          <p className="text-[10px] text-slate-400 mt-1">Default due date on a new invoice = issue date + this many days. Still adjustable per invoice.</p>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">"Our Reference" auto-fills from</label>
          <select
            value={ourReferenceFieldKey}
            onChange={e => onField(setOurReferenceFieldKey)(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-full py-2.5 px-4 text-[12px] font-medium outline-none appearance-none"
          >
            <option value="">None — leave blank, fill in manually per invoice</option>
            {projectFieldOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-[10px] text-slate-400 mt-1">Still editable on each invoice — this just sets the starting value from the matter.</p>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">"Debtor" auto-fills from</label>
          <select
            value={debtorFieldKey}
            onChange={e => onField(setDebtorFieldKey)(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-full py-2.5 px-4 text-[12px] font-medium outline-none appearance-none"
          >
            <option value="">None — leave blank, select manually per invoice</option>
            {entityFieldOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-[10px] text-slate-400 mt-1">
            Whichever matter field holds "who's the client" (e.g. a "Client Name" field) — Debtor defaults to it, still editable per invoice.
            {entityFieldOptions.length === 0 && ' No entity-relation fields found on Matters yet.'}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bank details</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={accountName} onChange={e => onField(setAccountName)(e.target.value)} placeholder="Account name"
              className="px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
            <input value={bsb} onChange={e => onField(setBsb)(e.target.value)} placeholder="BSB"
              className="px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
            <input value={accountNumber} onChange={e => onField(setAccountNumber)(e.target.value)} placeholder="Account number"
              className="px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
            <input value={reference} onChange={e => onField(setReference)(e.target.value)} placeholder="Payment reference note (optional)"
              className="px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
          </div>
        </div>
      </fieldset>

      {isAdmin && (
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={save} disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-5 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save changes
          </button>
          {saved && <span className="text-[11px] text-emerald-500 flex items-center gap-1"><Check size={12} /> Saved</span>}
          {error && <span className="text-[11px] text-red-500">{error}</span>}
        </div>
      )}
    </div>
  );
}

// ── Templates & what to include ───────────────────────────────────
function TemplatesSection({ isAdmin }: { isAdmin: boolean }) {
  const { invoiceSettings, refreshInvoiceSettings, companyId, companyType } = useCompany();
  const isLawFirm = companyType === 'Law Firm';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layoutEditorId, setLayoutEditorId] = useState<string | null>(null);

  const saveTemplates = async (templates: InvoiceTemplateConfig[]) => {
    if (!companyId) { setError('Still loading your company — try again in a moment.'); return; }
    setSaving(true);
    setError(null);
    // Server-side partial merge -- see BrandingSection.saveAddress for why
    // this isn't a client-side {...invoiceSettings, templates} spread.
    const { error: updateError } = await supabase.rpc('merge_company_invoice_settings', {
      p_company_id: companyId, p_patch: { templates },
    });
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    await refreshInvoiceSettings();
  };

  const createDefault = () => saveTemplates([
    ...invoiceSettings.templates,
    { id: crypto.randomUUID(), name: invoiceSettings.templates.length ? 'New template' : 'Standard', isDefault: invoiceSettings.templates.length === 0, display: DEFAULT_INVOICE_DISPLAY, style: 'flexible' },
  ]);

  // 'detailed' -- the fixed multi-page law-firm style (see
  // generateDetailedInvoicePdf.ts) -- doesn't use `layout` or (beyond a
  // couple of fields) `display` at all, so it's created with no layout and
  // the flexible template's DEFAULT_INVOICE_DISPLAY purely as an inert
  // starting shape (kept for schema consistency, not because it's read).
  const createDetailed = () => saveTemplates([
    ...invoiceSettings.templates,
    { id: crypto.randomUUID(), name: 'Detailed', isDefault: invoiceSettings.templates.length === 0, display: DEFAULT_INVOICE_DISPLAY, style: 'detailed' },
  ]);

  const updateTemplate = (id: string, patch: Partial<InvoiceTemplateConfig>) =>
    saveTemplates(invoiceSettings.templates.map(t => t.id === id ? { ...t, ...patch } : t));

  const toggleDisplay = (id: string, key: keyof InvoiceTemplateDisplay) => {
    const template = invoiceSettings.templates.find(t => t.id === id);
    if (!template) return;
    updateTemplate(id, { display: { ...template.display, [key]: !template.display[key] } });
  };

  const setDefault = (id: string) =>
    saveTemplates(invoiceSettings.templates.map(t => ({ ...t, isDefault: t.id === id })));

  const removeTemplate = (id: string) => {
    if (invoiceSettings.templates.length <= 1) return;
    if (!window.confirm('Delete this invoice template?')) return;
    saveTemplates(invoiceSettings.templates.filter(t => t.id !== id));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">What to include on each invoice</p>
          <p className="text-[11px] text-slate-400 mt-1">Sensible defaults are already selected — only change these if you want to trim what's shown.</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={createDefault} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              <Plus size={13} /> {invoiceSettings.templates.length === 0 ? 'Create default template' : 'Add template'}
            </button>
            {isLawFirm && (
              <button onClick={createDetailed} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 text-slate-500 text-[11px] font-bold rounded-full hover:bg-slate-100 disabled:opacity-40 transition-colors">
                <Plus size={13} /> Add detailed (law firm) template
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-red-500">{error}</p>}

      {invoiceSettings.templates.length === 0 && (
        <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-8">No template configured yet</p>
      )}

      <div className="space-y-4">
        {invoiceSettings.templates.map(t => (
          <div key={t.id} className="border border-slate-200 rounded-[24px] p-5 space-y-3">
            <div className="flex items-center gap-3">
              <TemplateNameInput
                name={t.name} disabled={!isAdmin}
                onCommit={name => updateTemplate(t.id, { name })}
              />
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0">
                <input type="radio" checked={!!t.isDefault} disabled={!isAdmin} onChange={() => setDefault(t.id)} /> Default
              </label>
              {isAdmin && t.style !== 'detailed' && (
                <select
                  defaultValue=""
                  onChange={e => {
                    const preset = INVOICE_LAYOUT_PRESETS.find(p => p.id === e.target.value);
                    e.target.value = '';
                    if (!preset) return;
                    if (window.confirm(`Apply the "${preset.name}" layout preset? This replaces this template's current position, columns, margin, and fonts.`)) {
                      updateTemplate(t.id, { layout: preset.layout });
                    }
                  }}
                  title="Apply a layout preset as a starting point"
                  className="px-3 py-1.5 border border-slate-200 rounded-full text-[11px] font-bold text-slate-500 bg-white shrink-0 outline-none cursor-pointer"
                >
                  <option value="" disabled>Apply preset…</option>
                  {INVOICE_LAYOUT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {isAdmin && (
                <button onClick={() => setLayoutEditorId(t.id)} className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 text-slate-500 text-[11px] font-bold rounded-full hover:bg-slate-100 shrink-0">
                  <LayoutTemplate size={12} /> {t.style === 'detailed' ? 'Edit logo' : 'Edit layout'}
                </button>
              )}
              {isAdmin && invoiceSettings.templates.length > 1 && (
                <button onClick={() => removeTemplate(t.id)} className="p-1.5 text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
              )}
            </div>
            {t.style === 'detailed' ? (
              <p className="text-[11px] text-slate-400 bg-slate-50 rounded-2xl px-4 py-2.5">
                Uses a fixed detailed layout (summary + itemised appendix + remittance advice + notice of rights). Only the logo's position and size are customizable — use "Edit logo" above. Set "Responsible partner"/"Our reference"/"Your reference" per invoice in Create Invoice.
              </p>
            ) : (
              <fieldset disabled={!isAdmin} className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 disabled:opacity-60">
                {DISPLAY_TOGGLES.map(opt => (
                  <label key={opt.key} className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={t.display[opt.key]} onChange={() => toggleDisplay(t.id, opt.key)} />
                    {opt.label}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        ))}
      </div>

      {layoutEditorId && (() => {
        const t = invoiceSettings.templates.find(x => x.id === layoutEditorId);
        if (!t) return null;
        return (
          <InvoiceLayoutEditor
            template={t}
            onClose={() => setLayoutEditorId(null)}
            onSave={layout => { updateTemplate(t.id, { layout }); setLayoutEditorId(null); }}
          />
        );
      })()}
    </div>
  );
}

// Local-state + debounced commit, so typing a template name doesn't fire a
// network save (and a companies-table round trip) on every keystroke --
// that raced under normal typing speed: an earlier keystroke's save could
// resolve/refetch AFTER a later one, snapping the field back mid-word.
function TemplateNameInput({ name, disabled, onCommit }: { name: string; disabled: boolean; onCommit: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setValue(name); }, [name]);
  return (
    <input
      value={value} disabled={disabled}
      onChange={e => {
        const v = e.target.value;
        setValue(v);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onCommit(v), 500);
      }}
      onBlur={e => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        onCommit(e.target.value);
      }}
      className="flex-1 px-3 py-1.5 border border-slate-200 rounded-full text-[13px] font-bold outline-none focus:border-indigo-400 disabled:opacity-60"
    />
  );
}
