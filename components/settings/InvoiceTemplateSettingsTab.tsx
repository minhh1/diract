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

import { useState, useRef } from "react";
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
  const [savingAddress, setSavingAddress] = useState(false);
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
    await fetch('/api/company/logo', { method: 'DELETE' });
    await refreshLogoUrl();
  };

  const saveAddress = async () => {
    if (!companyId) return;
    setSavingAddress(true);
    const next = { ...invoiceSettings, firmAddress: address };
    await supabase.from('companies').update({ invoice_settings: next }).eq('id', companyId);
    await refreshInvoiceSettings();
    setSavingAddress(false);
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
      {error && <p className="text-[11px] text-red-500">{error}</p>}

      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Firm address (shown on invoices)</label>
        <textarea
          value={address} onChange={e => setAddress(e.target.value)} onBlur={saveAddress} disabled={!isAdmin} rows={2}
          placeholder="Level 4, 123 Example St, Sydney NSW 2000"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none disabled:opacity-60"
        />
        {savingAddress && <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Saving...</p>}
      </div>
    </div>
  );
}

// ── Terms & payment ───────────────────────────────────────────────
function TermsSection({ isAdmin }: { isAdmin: boolean }) {
  const { invoiceSettings, refreshInvoiceSettings, companyId } = useCompany();
  const [creditTerms, setCreditTerms] = useState(invoiceSettings.creditTerms || '');
  const [otherTerms, setOtherTerms] = useState(invoiceSettings.otherTerms || '');
  const [accountName, setAccountName] = useState(invoiceSettings.bankDetails?.accountName || '');
  const [bsb, setBsb] = useState(invoiceSettings.bankDetails?.bsb || '');
  const [accountNumber, setAccountNumber] = useState(invoiceSettings.bankDetails?.accountNumber || '');
  const [reference, setReference] = useState(invoiceSettings.bankDetails?.reference || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    setSaved(false);
    const next = {
      ...invoiceSettings,
      creditTerms, otherTerms,
      bankDetails: { accountName, bsb, accountNumber, reference },
    };
    await supabase.from('companies').update({ invoice_settings: next }).eq('id', companyId);
    await refreshInvoiceSettings();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Terms & payment</p>
        {!isAdmin ? <AdminOnlyNote /> : (saving || saved) && (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-emerald-500" />}
            {saving ? 'Saving...' : 'Saved'}
          </span>
        )}
      </div>

      <fieldset disabled={!isAdmin} className="space-y-4 disabled:opacity-60">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Credit terms</label>
          <textarea value={creditTerms} onChange={e => setCreditTerms(e.target.value)} onBlur={save} rows={2}
            placeholder="Payment is due within 14 days of the date of this invoice."
            className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Other terms</label>
          <textarea value={otherTerms} onChange={e => setOtherTerms(e.target.value)} onBlur={save} rows={2}
            placeholder="Any additional notices to include on every invoice."
            className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none" />
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bank details</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={accountName} onChange={e => setAccountName(e.target.value)} onBlur={save} placeholder="Account name"
              className="px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
            <input value={bsb} onChange={e => setBsb(e.target.value)} onBlur={save} placeholder="BSB"
              className="px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
            <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} onBlur={save} placeholder="Account number"
              className="px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
            <input value={reference} onChange={e => setReference(e.target.value)} onBlur={save} placeholder="Payment reference note (optional)"
              className="px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
          </div>
        </div>
      </fieldset>
    </div>
  );
}

// ── Templates & what to include ───────────────────────────────────
function TemplatesSection({ isAdmin }: { isAdmin: boolean }) {
  const { invoiceSettings, refreshInvoiceSettings, companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [layoutEditorId, setLayoutEditorId] = useState<string | null>(null);

  const saveTemplates = async (templates: InvoiceTemplateConfig[]) => {
    if (!companyId) return;
    setSaving(true);
    const next = { ...invoiceSettings, templates };
    await supabase.from('companies').update({ invoice_settings: next }).eq('id', companyId);
    await refreshInvoiceSettings();
    setSaving(false);
  };

  const createDefault = () => saveTemplates([
    ...invoiceSettings.templates,
    { id: crypto.randomUUID(), name: invoiceSettings.templates.length ? 'New template' : 'Standard', isDefault: invoiceSettings.templates.length === 0, display: DEFAULT_INVOICE_DISPLAY },
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
          <button onClick={createDefault} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0">
            <Plus size={13} /> {invoiceSettings.templates.length === 0 ? 'Create default template' : 'Add template'}
          </button>
        )}
      </div>

      {invoiceSettings.templates.length === 0 && (
        <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-8">No template configured yet</p>
      )}

      <div className="space-y-4">
        {invoiceSettings.templates.map(t => (
          <div key={t.id} className="border border-slate-200 rounded-[24px] p-5 space-y-3">
            <div className="flex items-center gap-3">
              <input
                value={t.name} disabled={!isAdmin}
                onChange={e => updateTemplate(t.id, { name: e.target.value })}
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-full text-[13px] font-bold outline-none focus:border-indigo-400 disabled:opacity-60"
              />
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0">
                <input type="radio" checked={!!t.isDefault} disabled={!isAdmin} onChange={() => setDefault(t.id)} /> Default
              </label>
              {isAdmin && (
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
                  <LayoutTemplate size={12} /> Edit layout
                </button>
              )}
              {isAdmin && invoiceSettings.templates.length > 1 && (
                <button onClick={() => removeTemplate(t.id)} className="p-1.5 text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
              )}
            </div>
            <fieldset disabled={!isAdmin} className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 disabled:opacity-60">
              {DISPLAY_TOGGLES.map(opt => (
                <label key={opt.key} className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={t.display[opt.key]} onChange={() => toggleDisplay(t.id, opt.key)} />
                  {opt.label}
                </label>
              ))}
            </fieldset>
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
