// components/NewProjectModal.tsx
"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SmartFieldHint from "@/components/SmartFieldHint";
import { useNameQualityCheck } from "@/lib/hooks/useNameQualityCheck";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  // newId lets a caller (e.g. RelationPicker's "add new" flow) auto-select
  // the record just created -- optional so every existing no-arg caller
  // stays valid unchanged.
  onRefresh: (newId?: string) => void;
}

export default function NewProjectModal({ isOpen, onClose, onRefresh }: Props) {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  // Assigned server-side (see next_custom_field_sequence RPC) for whichever
  // fields have auto-numbering enabled -- shown on the success state below
  // since the user never typed these themselves and has no other way to
  // know what got assigned.
  const [assignedAutoNumbers, setAssignedAutoNumbers] = useState<{ label: string; value: string }[]>([]);

  const [name, setName] = useState('');
  const nameQuality = useNameQualityCheck();
  const [status, setStatus] = useState('Open');
  const [description, setDescription] = useState('');
  const [estCompletion, setEstCompletion] = useState('');
  const [street, setStreet] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('NSW');
  const [postcode, setPostcode] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    loadData();
  }, [isOpen]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: prof } = await supabase
      .from('profiles').select('active_company_id').eq('id', user.id).single();
    const cid = prof?.active_company_id;
    setCompanyId(cid);
    if (!cid) return;
    const { data: cf } = await supabase
      .from('company_custom_fields')
      .select('id, field_key, label, field_type, is_required, select_options, display_order, auto_number_prefix, formula_type')
      .eq('table_name', 'projects')
      .eq('company_id', cid)
      .is('deleted_at', null)
      .order('display_order');
    // A sum_related (rollup) field has nothing to roll up yet on a brand-new
    // matter -- offering it as an editable input here would let a typed-in
    // value sit there un-overwritten until the first linked child record
    // changes, silently starting the rollup off wrong.
    setCustomFields((cf || []).filter(f => !f.formula_type));
  };

  const resetForm = () => {
    setName(''); setStatus('Open'); setDescription('');
    setEstCompletion(''); setStreet(''); setSuburb('');
    setState('NSW'); setPostcode(''); setCustomValues({});
    setSaved(false); setAssignedAutoNumbers([]); nameQuality.reset();
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    // Auto-numbered fields are assigned server-side below, never typed by
    // hand -- required or not, they can never be "missing" here.
    const missingRequired = customFields.filter(f => f.auto_number_prefix == null && f.is_required && !customValues[f.id]?.trim());
    if (missingRequired.length > 0) {
      alert(`Please fill in required field${missingRequired.length > 1 ? 's' : ''}: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }
    // Conveyancing matters always involve a specific property, so it's
    // required in that case even though it's optional otherwise.
    const matterTypeField = customFields.find(f => f.field_key === 'matter_type' || f.label.toLowerCase() === 'matter type');
    const isConveyancing = matterTypeField && customValues[matterTypeField.id]?.toLowerCase() === 'conveyancing';
    if (isConveyancing && !street.trim()) {
      alert('Please fill in the property address, required for Conveyancing matters.');
      return;
    }

    // Exact-name duplicate guard -- case-insensitive, so "Smith v Jones" and
    // "smith v jones" count as the same matter. Only an exact match is
    // blocked; anything less certain is left for a human to notice and
    // merge via Reconciliation.
    const trimmedName = name.trim();
    const { data: dupProject } = await supabase
      .from('projects')
      .select('id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .ilike('name', trimmedName)
      .limit(1)
      .maybeSingle();
    if (dupProject) {
      alert(`A matter named "${trimmedName}" already exists.`);
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    // Hoisted above the try block (not just declared where it's assigned)
    // so the setTimeout below can read it directly instead of the
    // assignedAutoNumbers state var, which wouldn't have this render's
    // value yet -- setAssignedAutoNumbers is async, same as any setState.
    const assigned: { label: string; value: string }[] = [];
    try {
      let propertyId: string | null = null;
      if (street.trim()) {
        const { data: prop } = await supabase
          .from('properties')
          .insert({ company_id: companyId, street_address: street.trim(), suburb: suburb.trim() || null, state: state || null, postcode: postcode.trim() || null })
          .select('id').single();
        propertyId = prop?.id || null;
      }

      const { data: proj, error: projErr } = await supabase
        .from('projects')
        .insert({ company_id: companyId, name: name.trim(), status, description: description.trim() || null, estimated_completion_date: estCompletion || null, property_id: propertyId, created_by: user?.id })
        .select('id').single();
      if (projErr) throw projErr;

      if (customFields.length > 0 && proj) {
        // Auto-numbered fields (e.g. Matter Number) are assigned server-
        // side so the sequence stays consecutive under concurrent writers
        // -- see supabase/migrations/20260730180000_custom_field_auto_numbering.sql.
        // Assigned AFTER the project row exists (not before) so a failed
        // project insert above never consumes a number for nothing.
        const autoNumberFields = customFields.filter(f => f.auto_number_prefix != null);
        const autoValues: Record<string, string> = {};
        for (const field of autoNumberFields) {
          const { data: num } = await supabase.rpc('next_custom_field_sequence', { p_field_id: field.id });
          if (num) {
            autoValues[field.id] = num;
            assigned.push({ label: field.label, value: num });
          }
        }
        setAssignedAutoNumbers(assigned);

        const cfInserts = Object.entries({ ...customValues, ...autoValues })
          .filter(([, val]) => val?.trim())
          .map(([fieldId, val]) => {
            const field = customFields.find(f => f.id === fieldId);
            const isNum = field?.field_type === 'number' || field?.field_type === 'currency';
            const isBool = field?.field_type === 'boolean';
            const isDate = field?.field_type === 'date';
            return {
              company_id: companyId,
              record_id: proj.id,
              field_id: fieldId,
              table_name: 'projects',
              ...(isNum ? { value_number: parseFloat(val) }
                : isBool ? { value_boolean: val === 'true' }
                : isDate ? { value_date: val }
                : { value_text: val }),
            };
          });
        if (cfInserts.length > 0) {
          await supabase.from('company_custom_field_values').insert(cfInserts);
        }
      }

      // Best-effort -- a project should still count as created even if Gmail
      // label setup fails (e.g. company hasn't configured Gmail sync yet).
      if (proj) {
        fetch('/api/gmail/create-project-label', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: proj.id }),
        }).catch(err => console.error('[NewProjectModal] Gmail label creation failed:', err));
      }

      setSaved(true);
      // Longer pause when there's an auto-assigned value to actually read
      // -- closing after the same 700ms as a plain save would flash it by
      // before anyone could see what got assigned.
      setTimeout(() => { onRefresh(proj?.id); handleClose(); }, assigned.length ? 2200 : 700);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md font-sans">
      <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-8 pt-8 pb-4 shrink-0">
          <div>
            <h2 className="text-2xl font-light uppercase tracking-tight text-slate-900">New Project</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Fill in the details below</p>
          </div>
          <button onClick={handleClose} className="p-2 text-slate-300 hover:text-black transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-4 space-y-6">

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Project details</p>
            <div className="space-y-3">
              <input value={name} onChange={e => setName(e.target.value)} onBlur={() => nameQuality.check(name)} placeholder="Project name *" className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none focus:ring-4 focus:ring-indigo-100" />
              <SmartFieldHint suggestions={nameQuality.suggestions}
                onApply={s => { if (s.apply) { const r = s.apply(); if ("correctedValue" in r && r.correctedValue) setName(r.correctedValue); } nameQuality.dismiss(s.id); }}
                onDismiss={nameQuality.dismiss} />
              <div className="grid grid-cols-2 gap-3">
                <select value={status} onChange={e => setStatus(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none appearance-none">
                  <option value="Open">Open</option>
                  <option value="Closed">Closed</option>
                  <option value="Pending">Pending</option>
                </select>
                <input type="date" value={estCompletion} onChange={e => setEstCompletion(e.target.value)} title="Estimated completion" className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
              </div>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 text-[13px] font-medium outline-none resize-none focus:ring-4 focus:ring-indigo-100" />
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Property (optional)</p>
            <div className="space-y-3">
              <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Street address" className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none focus:ring-4 focus:ring-indigo-100" />
              <div className="grid grid-cols-3 gap-3">
                <input value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="Suburb" className="bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
                <select value={state} onChange={e => setState(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none appearance-none">
                  {['NSW','VIC','QLD','WA','SA','TAS','NT','ACT'].map(s => <option key={s}>{s}</option>)}
                </select>
                <input value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="Postcode" className="bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
              </div>
            </div>
          </div>

          {customFields.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest mb-3">Additional fields</p>
              <div className="space-y-3">
                {customFields.map(field => (
                  <div key={field.id}>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">
                      {field.label}{field.is_required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    {field.auto_number_prefix != null ? (
                      <input
                        disabled
                        value="Auto-complete"
                        title="Assigned automatically when this project is created"
                        className="w-full bg-slate-100 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium text-slate-400 outline-none cursor-not-allowed"
                      />
                    ) : field.field_type === 'boolean' ? (
                      <div className="flex gap-3">
                        {['true', 'false'].map(v => (
                          <button key={v} type="button" onClick={() => setCustomValues(p => ({ ...p, [field.id]: v }))}
                            className={`flex-1 py-3 rounded-full text-[11px] font-bold transition-all ${customValues[field.id] === v ? 'bg-indigo-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
                            {v === 'true' ? 'Yes' : 'No'}
                          </button>
                        ))}
                      </div>
                    ) : field.field_type === 'select' && field.select_options?.length ? (
                      <select value={customValues[field.id] || ''} onChange={e => setCustomValues(p => ({ ...p, [field.id]: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none appearance-none">
                        <option value="">Select...</option>
                        {field.select_options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input
                        type={field.field_type === 'date' ? 'date' : field.field_type === 'number' || field.field_type === 'currency' ? 'number' : field.field_type === 'email' ? 'email' : 'text'}
                        value={customValues[field.id] || ''} onChange={e => setCustomValues(p => ({ ...p, [field.id]: e.target.value }))}
                        placeholder={`Enter ${field.label.toLowerCase()}...`}
                        className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none focus:ring-4 focus:ring-indigo-100" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {saved && assignedAutoNumbers.length > 0 && (
          <div className="px-8 pb-2 shrink-0">
            {assignedAutoNumbers.map(a => (
              <p key={a.label} className="text-[11px] font-bold text-emerald-600">
                {a.label}: {a.value}
              </p>
            ))}
          </div>
        )}

        <div className="px-8 py-6 border-t border-slate-100 shrink-0 flex gap-3">
          <button onClick={handleClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !name.trim()}
            className={`flex-1 py-3 rounded-full text-[11px] font-bold transition-all flex items-center justify-center gap-2 ${saved ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-black disabled:opacity-40'}`}>
            {loading ? <><Loader2 size={13} className="animate-spin" /> Creating...</>
              : saved ? <><Check size={13} /> Created</>
              : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  );
}
