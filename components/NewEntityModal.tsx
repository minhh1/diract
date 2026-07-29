// components/NewEntityModal.tsx
"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Check, ShieldCheck, AlertCircle, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isValidABN, isValidACN } from "@/lib/validation/entityValidation";
import { writeEntityCustomFieldValues } from "@/lib/entityCustomFieldWrite";
import { ENTITY_TYPES } from "@/lib/entityTypes";
import RelationPicker from "@/components/dashboard/RelationPicker";
import SmartFieldHint from "@/components/SmartFieldHint";
import { useNameQualityCheck } from "@/lib/hooks/useNameQualityCheck";
import { checkEntityTrustStructure, type NameSuggestion } from "@/lib/smartValidation/nameQuality";

// Same officeholder role list EntityOfficeholdersPanel.tsx uses for the
// identical "add a director" flow on an existing entity -- duplicated here
// rather than shared, it's a fixed 7-item list unlikely to drift.
const OFFICEHOLDER_ROLES = ["Director", "Secretary", "Public Officer", "Shareholder", "Trustee", "Beneficiary", "Other"];

// Only these two are offered as an ADDITIONAL role today (multi-select,
// stackable with any primary Classification type) -- the concrete case the
// user asked for (a Company that's ALSO Corporate Trustee for some trust).
// Other types stay single-select via the Classification dropdown for now;
// see the plan's "Explicitly out of scope" section for why.
const ADDITIONAL_ROLE_OPTIONS = ["Corporate Trustee", "Non Corporate Trustee"];
const TRUSTEE_ROLE_TYPES = ["Corporate Trustee", "Non Corporate Trustee"];
const TRUST_TYPES = ["Discretionary Family Trust", "Fixed Unit Trust", "Unit Trust", "Discretionary Trust"];

// abn/acn/tfn/bsb/account_number/bank_name/trust_deed_date get their own
// dedicated UI below (Identifiers/Trustee details/Banking) even though
// they're now company_custom_fields, not native columns -- excluded here so
// they don't also show up a second time in the generic "Custom fields"
// section. nab_connect_id has no dedicated UI (it never did -- see
// supabase/migrations/20260729290000_entities_finance_fields_to_custom.sql),
// so it's left to render generically below like any other custom field.
const NATIVE_UI_KEYS = ['abn', 'acn', 'tfn', 'bsb', 'account_number', 'bank_name', 'trust_deed_date'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  // Called after a successful create -- passed the newly-created entity's id
  // (the trust's own id, not the trustee's, when isTrust) so a caller that
  // wants to auto-select the new entity (see RelationPicker's
  // allowCreateEntity) can do so without a second lookup. Optional/ignored
  // by every existing caller that just wants a "something changed, refetch"
  // signal.
  onRefresh: (newEntityId?: string) => void;
}

export default function NewEntityModal({ isOpen, onClose, onRefresh }: Props) {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const [entityType, setEntityType] = useState('Company');
  const [name, setName] = useState('');
  const [abn, setAbn] = useState('');
  const [acn, setAcn] = useState('');
  const [tfn, setTfn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bankName, setBankName] = useState('');
  const [bsb, setBsb] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  // Trust specific
  const [trusteeName, setTrusteeName] = useState('');
  const [trusteeType, setTrusteeType] = useState('Company');
  const [trusteeAbn, setTrusteeAbn] = useState('');
  const [trusteeAcn, setTrusteeAcn] = useState('');
  const [trusteeEstablishedDate, setTrusteeEstablishedDate] = useState('');
  const [trustDeedDate, setTrustDeedDate] = useState('');
  const [trusteeDirectors, setTrusteeDirectors] = useState<{ directorEntityId: string | null; label: string; role: string }[]>([]);
  const [addingDirector, setAddingDirector] = useState(false);
  const [newDirectorId, setNewDirectorId] = useState<string | null>(null);
  const [newDirectorLabel, setNewDirectorLabel] = useState<string | null>(null);
  const [newDirectorRole, setNewDirectorRole] = useState('Director');
  // Additional roles (multi-select, stackable with the primary
  // Classification type below) -- e.g. a "Company" that's ALSO Corporate
  // Trustee for some specific trust, at the same time.
  const [additionalRoles, setAdditionalRoles] = useState<string[]>([]);
  const toggleAdditionalRole = (role: string) => setAdditionalRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  // Which trust this entity is trustee FOR -- only relevant when the entity
  // itself holds a trustee role (primary type or additional role), separate
  // from isTrust below (creating an actual Trust, which instead asks who
  // ITS trustee is).
  const [trustLinkId, setTrustLinkId] = useState<string | null>(null);
  const [trustLinkLabel, setTrustLinkLabel] = useState<string | null>(null);
  // Inline "create a new trust" toggle -- deliberately NOT RelationPicker's
  // own allowCreateEntity (which opens a second NewEntityModal stacked on
  // top of this one, a nested-modal pattern that's confusing here since
  // we're already inside the create flow). A plain name input right in
  // this same box creates the trust directly instead.
  const [creatingNewTrust, setCreatingNewTrust] = useState(false);
  const [newTrustName, setNewTrustName] = useState('');
  const [creatingTrustSaving, setCreatingTrustSaving] = useState(false);

  // Smart data-entry assist for the main Legal name field -- see
  // lib/smartValidation/nameQuality.ts. checkEntityTrustStructure (the
  // "atf" parse) is entity-only, so it's tracked separately here rather
  // than folded into useNameQualityCheck's generic list.
  const nameQuality = useNameQualityCheck();
  const [trustSuggestion, setTrustSuggestion] = useState<NameSuggestion | null>(null);
  const handleNameBlur = () => {
    nameQuality.check(name);
    setTrustSuggestion(checkEntityTrustStructure(name));
  };
  const handleApplyNameSuggestion = (suggestion: NameSuggestion) => {
    if (!suggestion.apply) return;
    const result = suggestion.apply();
    if ("trusteeName" in result) {
      // Switches the form into its existing Trust-creation flow (isTrust)
      // instead of any new relationship-creation logic -- name becomes the
      // TRUST's name, the nested Trustee sub-form gets the trustee's name.
      // entityType defaults to the first trust type just to reveal that
      // section; the Classification dropdown right above is the "which
      // trust type is this?" prompt -- still fully editable before saving.
      setTrusteeName(result.trusteeName);
      setTrusteeType("Company");
      setName(result.trustName);
      setEntityType(TRUST_TYPES[0]);
      setTrustSuggestion(null);
    } else if (result.correctedValue) {
      setName(result.correctedValue);
      nameQuality.dismiss(suggestion.id);
    }
  };
  const handleDismissNameSuggestion = (id: string) => {
    if (id === "atf-trust-split") setTrustSuggestion(null);
    else nameQuality.dismiss(id);
  };

  // Exact match against real trust types only -- NOT a substring check.
  // 'Corporate Trustee'/'Non Corporate Trustee' contain "trust" as a
  // substring of "trustee", which used to wrongly trigger this same "name a
  // sub-trustee" flow when picking Corporate Trustee as the type (see
  // isTrusteeRole below for the correct, opposite flow that should trigger
  // instead: "which trust is THIS entity trustee for").
  const isTrust = TRUST_TYPES.includes(entityType);
  const isTrusteeRole = TRUSTEE_ROLE_TYPES.includes(entityType) || additionalRoles.some(r => TRUSTEE_ROLE_TYPES.includes(r));
  const roles = Array.from(new Set([entityType, ...additionalRoles]));

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
      .select('id, field_key, label, field_type, is_required, select_options, display_order')
      .eq('table_name', 'entities')
      .eq('company_id', cid)
      .is('deleted_at', null)
      .order('display_order');
    setCustomFields((cf || []).filter(f => !NATIVE_UI_KEYS.includes(f.field_key)));
  };

  const resetForm = () => {
    setEntityType('Company'); setName(''); setAbn(''); setAcn(''); setTfn('');
    setEmail(''); setPhone(''); setAddress(''); setBankName(''); setBsb('');
    setAccountNumber(''); setTrusteeName(''); setTrusteeType('Company');
    setTrusteeAbn(''); setTrusteeAcn(''); setTrusteeEstablishedDate('');
    setTrustDeedDate(''); setTrusteeDirectors([]); setAddingDirector(false);
    setNewDirectorId(null); setNewDirectorLabel(null); setNewDirectorRole('Director');
    setAdditionalRoles([]); setTrustLinkId(null); setTrustLinkLabel(null);
    setCreatingNewTrust(false); setNewTrustName('');
    setCustomValues({}); setSaved(false);
    nameQuality.reset(); setTrustSuggestion(null);
  };

  const addTrusteeDirector = () => {
    if (!newDirectorLabel?.trim()) return;
    setTrusteeDirectors(prev => [...prev, { directorEntityId: newDirectorId, label: newDirectorLabel.trim(), role: newDirectorRole }]);
    setAddingDirector(false); setNewDirectorId(null); setNewDirectorLabel(null); setNewDirectorRole('Director');
  };

  // Creates the trust directly (no nested modal) and selects it, same as
  // picking an existing one from the RelationPicker above would.
  const createTrustInline = async () => {
    if (!newTrustName.trim() || !companyId || creatingTrustSaving) return;
    setCreatingTrustSaving(true);
    const { data, error } = await supabase.from('entities')
      .insert({ company_id: companyId, name: newTrustName.trim(), entity_type: TRUST_TYPES[0], roles: [TRUST_TYPES[0]] })
      .select('id').single();
    setCreatingTrustSaving(false);
    if (error || !data) { alert(error?.message || 'Could not create trust'); return; }
    setTrustLinkId(data.id); setTrustLinkLabel(newTrustName.trim());
    setNewTrustName(''); setCreatingNewTrust(false);
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (isTrust && !trusteeName.trim()) { alert('Trustee name is required'); return; }
    if (abn.trim() && !isValidABN(abn)) { alert('ABN is not valid (must be 11 digits and pass the ABN checksum)'); return; }
    if (!isTrust && acn.trim() && !isValidACN(acn)) { alert('ACN is not valid (must be 9 digits and pass the ACN checksum)'); return; }
    if (isTrust && trusteeAbn.trim() && !isValidABN(trusteeAbn)) { alert('Trustee ABN is not valid (must be 11 digits and pass the ABN checksum)'); return; }
    if (isTrust && trusteeType === 'Company' && trusteeAcn.trim() && !isValidACN(trusteeAcn)) { alert('Trustee ACN is not valid (must be 9 digits and pass the ACN checksum)'); return; }
    const missingRequired = customFields.filter(f => f.is_required && !customValues[f.id]?.trim());
    if (missingRequired.length > 0) {
      alert(`Please fill in required field${missingRequired.length > 1 ? 's' : ''}: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    try {
      let mainEntityId: string;

      if (isTrust) {
        const trusteeRoles = Array.from(new Set([trusteeType]));
        const { data: trustee, error: tErr } = await supabase
          .from('entities')
          .insert({ company_id: companyId, name: trusteeName.trim(), entity_type: trusteeType, established_date: trusteeType === 'Company' ? (trusteeEstablishedDate || null) : null, roles: trusteeRoles })
          .select('id').single();
        if (tErr) throw tErr;
        if (trusteeAbn.trim() || (trusteeType === 'Company' && trusteeAcn.trim())) {
          await writeEntityCustomFieldValues(companyId!, trustee.id, 'entities', {
            ...(trusteeAbn.trim() ? { abn: trusteeAbn.trim() } : {}),
            ...(trusteeType === 'Company' && trusteeAcn.trim() ? { acn: trusteeAcn.trim() } : {}),
          });
        }
        for (const d of trusteeDirectors) {
          await supabase.from('entity_officeholders').insert({
            entity_id: trustee.id, officeholder_entity_id: d.directorEntityId, full_name: d.label, role: d.role, is_active: true,
          });
        }

        const { data: trust, error: trErr } = await supabase
          .from('entities')
          .insert({ company_id: companyId, name: name.trim(), entity_type: entityType, email: email.trim() || null, phone: phone.trim() || null, registered_address_text: address.trim() || null, roles })
          .select('id').single();
        if (trErr) throw trErr;

        await supabase.from('entity_relationships').insert({
          parent_entity_id: trust.id, child_entity_id: trustee.id, relationship_type: 'Trustee', is_current: true,
        });
        mainEntityId = trust.id;
        await writeEntityCustomFieldValues(companyId!, mainEntityId, 'entities', {
          abn, tfn, trust_deed_date: trustDeedDate, bank_name: bankName, bsb, account_number: accountNumber,
        });
      } else {
        const { data: ent, error: entErr } = await supabase
          .from('entities')
          .insert({ company_id: companyId, name: name.trim(), entity_type: entityType, email: email.trim() || null, phone: phone.trim() || null, registered_address_text: address.trim() || null, roles })
          .select('id').single();
        if (entErr) throw entErr;
        mainEntityId = ent.id;
        await writeEntityCustomFieldValues(companyId!, mainEntityId, 'entities', {
          abn, acn, tfn, bank_name: bankName, bsb, account_number: accountNumber,
        });
        if (isTrusteeRole && trustLinkId) {
          await supabase.from('entity_relationships').insert({
            parent_entity_id: trustLinkId, child_entity_id: mainEntityId, relationship_type: 'Trustee', is_current: true,
          });
        }
      }

      if (customFields.length > 0) {
        const cfInserts = Object.entries(customValues)
          .filter(([, val]) => val?.trim())
          .map(([fieldId, val]) => {
            const field = customFields.find(f => f.id === fieldId);
            const isNum = field?.field_type === 'number' || field?.field_type === 'currency';
            const isBool = field?.field_type === 'boolean';
            const isDate = field?.field_type === 'date';
            return {
              company_id: companyId, record_id: mainEntityId, field_id: fieldId, table_name: 'entities',
              ...(isNum ? { value_number: parseFloat(val) } : isBool ? { value_boolean: val === 'true' } : isDate ? { value_date: val } : { value_text: val }),
            };
          });
        if (cfInserts.length > 0) {
          await supabase.from('company_custom_field_values').insert(cfInserts);
        }
      }

      await supabase.from('audit_logs').insert({ entity_id: mainEntityId, user_id: user?.id, action: `Created ${entityType}`, details: { entity_name: name } });

      setSaved(true);
      setTimeout(() => { onRefresh(mainEntityId); handleClose(); }, 700);
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
            <h2 className="text-2xl font-light uppercase tracking-tight text-slate-900">New Entity</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Fill in the details below</p>
          </div>
          <button onClick={handleClose} className="p-2 text-slate-300 hover:text-black transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-4 space-y-6">

          {/* Classification */}
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Classification</p>
            <div className="space-y-3">
              <select value={entityType} onChange={e => setEntityType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none appearance-none">
                {ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input value={name} onChange={e => setName(e.target.value)} onBlur={handleNameBlur} placeholder="Legal name *"
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none focus:ring-4 focus:ring-indigo-100" />
              <SmartFieldHint
                suggestions={trustSuggestion ? [trustSuggestion, ...nameQuality.suggestions] : nameQuality.suggestions}
                onApply={handleApplyNameSuggestion}
                onDismiss={handleDismissNameSuggestion}
              />
            </div>
          </div>

          {/* Additional roles -- stackable with the primary Classification
              type above, e.g. a "Company" that's ALSO Corporate Trustee for
              some specific trust at the same time. */}
          {!isTrust && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Additional roles</p>
              <div className="flex flex-wrap gap-2">
                {ADDITIONAL_ROLE_OPTIONS.filter(r => r !== entityType).map(role => (
                  <button key={role} type="button" onClick={() => toggleAdditionalRole(role)}
                    className={`px-4 py-2 rounded-full text-[11px] font-bold border transition-all ${additionalRoles.includes(role) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-indigo-200'}`}>
                    {role}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Which trust this entity is trustee FOR -- shown whenever the
              entity holds a trustee role (primary type or additional role).
              Optional/skippable, same as EntityOfficeholdersPanel's own
              "No Trust linked" empty state -- can be linked later there too. */}
          {isTrusteeRole && (
            <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-3xl space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={13} className="text-indigo-600" />
                <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest">Which trust is this the trustee for?</p>
              </div>
              <RelationPicker linkedSystemTable="entities" value={trustLinkId} initialLabel={trustLinkLabel ?? undefined}
                onSelect={(id, label) => { setTrustLinkId(id); setTrustLinkLabel(label); }}
                placeholder="Search for the trust (optional)..." />
              {creatingNewTrust ? (
                <div className="flex items-center gap-2 pt-1">
                  <input autoFocus value={newTrustName} onChange={e => setNewTrustName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createTrustInline(); if (e.key === 'Escape') { setCreatingNewTrust(false); setNewTrustName(''); } }}
                    placeholder="New trust name" className="flex-1 bg-white border border-indigo-100 rounded-full py-2 px-4 text-[12px] font-medium outline-none focus:ring-4 focus:ring-indigo-100" />
                  <button type="button" onClick={createTrustInline} disabled={!newTrustName.trim() || creatingTrustSaving}
                    className="px-3 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full disabled:opacity-40 shrink-0">
                    {creatingTrustSaving ? <Loader2 size={12} className="animate-spin" /> : 'Create'}
                  </button>
                  <button type="button" onClick={() => { setCreatingNewTrust(false); setNewTrustName(''); }}
                    className="text-[11px] text-slate-400 hover:text-slate-600 shrink-0">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setCreatingNewTrust(true)}
                  className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors">
                  <Plus size={12} /> Create a new trust
                </button>
              )}
            </div>
          )}

          {/* Trust specific -- creating an actual Trust entity, which asks
              who ITS trustee is (opposite direction from isTrusteeRole
              above). Trust-level fields (deed date) first, then a nested
              Trustee card for the sub-entity being created alongside it. */}
          {isTrust && (
            <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-3xl space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck size={13} className="text-indigo-600" />
                  <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest">Trust details</p>
                </div>
                <label className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest block mb-1.5 px-1">Trust deed date</label>
                <input type="date" value={trustDeedDate} onChange={e => setTrustDeedDate(e.target.value)}
                  className="w-full bg-white border border-indigo-100 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
              </div>

              <div className="p-4 bg-white border border-indigo-100 rounded-2xl space-y-3">
                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Trustee</p>
                <input value={trusteeName} onChange={e => setTrusteeName(e.target.value)} placeholder="Trustee name *"
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none focus:ring-4 focus:ring-indigo-100" />
                <div className="grid grid-cols-2 gap-3">
                  <select value={trusteeType} onChange={e => setTrusteeType(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none appearance-none">
                    <option>Company</option><option>Individual</option>
                  </select>
                  <div>
                    <input value={trusteeAbn} onChange={e => setTrusteeAbn(e.target.value)} placeholder="Trustee ABN"
                      className={`w-full bg-slate-50 border rounded-full py-3 px-5 text-[13px] font-medium outline-none ${trusteeAbn.trim() && !isValidABN(trusteeAbn) ? 'border-red-300 focus:ring-4 focus:ring-red-100' : 'border-slate-200'}`} />
                    {trusteeAbn.trim() && !isValidABN(trusteeAbn) && (
                      <p className="flex items-center gap-1 text-[10px] text-red-500 mt-1 px-2"><AlertCircle size={11} /> Not a valid ABN</p>
                    )}
                  </div>
                </div>
                {trusteeType === 'Company' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input value={trusteeAcn} onChange={e => setTrusteeAcn(e.target.value)} placeholder="Trustee ACN"
                        className={`w-full bg-slate-50 border rounded-full py-3 px-5 text-[13px] font-medium outline-none ${trusteeAcn.trim() && !isValidACN(trusteeAcn) ? 'border-red-300 focus:ring-4 focus:ring-red-100' : 'border-slate-200'}`} />
                      {trusteeAcn.trim() && !isValidACN(trusteeAcn) && (
                        <p className="flex items-center gap-1 text-[10px] text-red-500 mt-1 px-2"><AlertCircle size={11} /> Not a valid ACN</p>
                      )}
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">Established date</label>
                      <input type="date" value={trusteeEstablishedDate} onChange={e => setTrusteeEstablishedDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">Directors</label>
                  {trusteeDirectors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {trusteeDirectors.map((d, i) => (
                        <span key={i} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-[11px] text-slate-600">
                          {d.label} <span className="text-slate-400">· {d.role}</span>
                          <button type="button" onClick={() => setTrusteeDirectors(prev => prev.filter((_, idx) => idx !== i))}
                            className="text-slate-300 hover:text-red-500 transition-colors"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  {addingDirector ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="min-w-[180px]">
                        <RelationPicker linkedSystemTable="entities" value={newDirectorId} allowCreateEntity
                          onSelect={(id, label) => { setNewDirectorId(id); setNewDirectorLabel(label); }}
                          placeholder="Search or add a person..." size="sm" />
                      </div>
                      <select value={newDirectorRole} onChange={e => setNewDirectorRole(e.target.value)}
                        className="text-[11px] border border-slate-200 rounded-full px-2.5 py-1.5 outline-none bg-white">
                        {OFFICEHOLDER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button type="button" onClick={addTrusteeDirector} disabled={!newDirectorLabel?.trim()}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full disabled:opacity-40">Add</button>
                      <button type="button" onClick={() => { setAddingDirector(false); setNewDirectorId(null); setNewDirectorLabel(null); }}
                        className="text-[11px] text-slate-400 hover:text-slate-600">Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddingDirector(true)} className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors">
                      <Plus size={12} /> Add director/officeholder
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Identifiers */}
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Identifiers</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <input value={abn} onChange={e => setAbn(e.target.value)} placeholder="ABN"
                  className={`w-full bg-slate-50 border rounded-full py-3 px-5 text-[13px] font-medium outline-none ${abn.trim() && !isValidABN(abn) ? 'border-red-300 focus:ring-4 focus:ring-red-100' : 'border-slate-200'}`} />
                {abn.trim() && !isValidABN(abn) && (
                  <p className="flex items-center gap-1 text-[10px] text-red-500 mt-1 px-2"><AlertCircle size={11} /> Not a valid ABN</p>
                )}
              </div>
              {!isTrust && (
                <div>
                  <input value={acn} onChange={e => setAcn(e.target.value)} placeholder="ACN"
                    className={`w-full bg-slate-50 border rounded-full py-3 px-5 text-[13px] font-medium outline-none ${acn.trim() && !isValidACN(acn) ? 'border-red-300 focus:ring-4 focus:ring-red-100' : 'border-slate-200'}`} />
                  {acn.trim() && !isValidACN(acn) && (
                    <p className="flex items-center gap-1 text-[10px] text-red-500 mt-1 px-2"><AlertCircle size={11} /> Not a valid ACN</p>
                  )}
                </div>
              )}
              <input value={tfn} onChange={e => setTfn(e.target.value)} placeholder="TFN"
                className="bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Contact</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email"
                  className="bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone"
                  className="bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
              </div>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Registered address"
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
            </div>
          </div>

          {/* Banking */}
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Banking</p>
            <div className="space-y-3">
              <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Bank name"
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
              <div className="grid grid-cols-2 gap-3">
                <input value={bsb} onChange={e => setBsb(e.target.value)} placeholder="BSB"
                  className="bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
                <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Account number"
                  className="bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none" />
              </div>
            </div>
          </div>

          {/* Additional fields */}
          {customFields.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest mb-3">Additional fields</p>
              <div className="space-y-3">
                {customFields.map(field => (
                  <div key={field.id}>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">
                      {field.label}{field.is_required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    {field.field_type === 'boolean' ? (
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

        <div className="px-8 py-6 border-t border-slate-100 shrink-0 flex gap-3">
          <button onClick={handleClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !name.trim()}
            className={`flex-1 py-3 rounded-full text-[11px] font-bold transition-all flex items-center justify-center gap-2 ${saved ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-black disabled:opacity-40'}`}>
            {loading ? <><Loader2 size={13} className="animate-spin" /> Creating...</>
              : saved ? <><Check size={13} /> Created</>
              : 'Create entity'}
          </button>
        </div>
      </div>
    </div>
  );
}
