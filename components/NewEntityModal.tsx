"use client";

import { useState, useEffect } from "react";
import { X, Building2, Landmark, ShieldCheck, DollarSign, Loader2, Mail, Phone, MapPin, Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function NewEntityModal({ isOpen, onClose, onRefresh }: any) {
  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("Company");
  const [types, setTypes] = useState<any[]>([]);
  const [accountants, setAccountants] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen]);

  const fetchData = async () => {
    const { data: tData } = await supabase.from("entity_types").select("*");
    if (tData) setTypes(tData);

    const { data: aData } = await supabase.from("entities").select("id, name").ilike("entity_type", "%Accountant%");
    if (aData) setAccountants(aData);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();

    try {
      const { data: profile } = await supabase.from("profiles").select("active_company_id").eq("id", user?.id).single();
      const compId = profile?.active_company_id;

      let mainEntityId: string;

      // --- LOGIC FOR TRUSTS: AUTO-CREATE TRUSTEE + TRUST ---
      if (entityType.toLowerCase().includes("trust")) {
        
        // 1. Create the Trustee Record (The legal owner)
        const { data: trustee, error: tErr } = await supabase.from("entities").insert([{
          company_id: compId,
          name: fd.get("trustee_name"),
          entity_type: fd.get("trustee_type") || "Company",
          abn: fd.get("trustee_abn")
        }]).select().single();
        if (tErr) throw tErr;

        // 2. Create the Trust Record (The equitable owner)
        const { data: trust, error: trErr } = await supabase.from("entities").insert([{
          company_id: compId,
          name: fd.get("name"),
          entity_type: entityType,
          type_id: types.find(t => t.label === entityType)?.id,
          abn: fd.get("abn"),
          tfn: fd.get("tfn"),
          gst_registered: fd.get("gst") === "on",
          trust_deed_date: fd.get("trust_deed_date"),
          established_date: fd.get("established_date"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          registered_address_text: fd.get("address"),
          bank_name: fd.get("bank_name"),
          bsb: fd.get("bsb"),
          account_number: fd.get("acc_num"),
          nab_connect_id: fd.get("nab_id"),
          accountant_id: fd.get("accountant_id") || null
        }]).select().single();
        if (trErr) throw trErr;

        // 3. Link Trustee to Trust in Relationships table
        await supabase.from("entity_relationships").insert([{
          parent_entity_id: trust.id,
          child_entity_id: trustee.id,
          relationship_type: 'Trustee'
        }]);
        mainEntityId = trust.id;

      } else {
        // --- STANDARD LOGIC: SINGLE RECORD (Company/Individual/Professional) ---
        const { data: ent, error: entErr } = await supabase.from("entities").insert([{
          company_id: compId,
          name: fd.get("name"),
          entity_type: entityType,
          type_id: types.find(t => t.label === entityType)?.id,
          acn: fd.get("acn"),
          abn: fd.get("abn"),
          tfn: fd.get("tfn"),
          gst_registered: fd.get("gst") === "on",
          established_date: fd.get("established_date"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          registered_address_text: fd.get("address"),
          bank_name: fd.get("bank_name"),
          bsb: fd.get("bsb"),
          account_number: fd.get("acc_num"),
          nab_connect_id: fd.get("nab_id"),
          accountant_id: fd.get("accountant_id") || null
        }]).select().single();
        if (entErr) throw entErr;
        mainEntityId = ent.id;
      }

      // Log the event
      await supabase.from("audit_logs").insert([{
        entity_id: mainEntityId,
        user_id: user?.id,
        action: `Onboarded ${entityType}`,
        details: { entity_name: fd.get("name") }
      }]);

      onRefresh();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md font-sans">
      <div className="bg-white w-full max-w-5xl rounded-[48px] p-10 shadow-2xl overflow-y-auto max-h-[95vh] custom-scrollbar border border-slate-100">
        
        {/* HEADER */}
        <div className="flex justify-between items-start mb-10">
          <div>
            <h2 className="text-4xl font-black uppercase tracking-tighter text-slate-900 leading-none">Record Onboarding</h2>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-4">Corporate & Trust Registration Module</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-50 rounded-full transition-all text-slate-400"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* LEFT: CLASSIFICATION & REGISTRATION */}
          <div className="space-y-10">
            <section className="space-y-4">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">01. Entity Classification</label>
              <select 
                required
                onChange={(e) => setEntityType(e.target.value)} 
                className="w-full rounded-full border border-slate-100 bg-slate-50 px-8 py-5 text-sm font-bold outline-none appearance-none cursor-pointer"
              >
                {types.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
              </select>
              <input name="name" required placeholder="Legal Name (e.g. Acme Unit Trust)" className="w-full rounded-full border border-slate-100 bg-slate-50 px-8 py-5 text-sm font-bold outline-none focus:ring-8 focus:ring-black/5" />
            </section>

            <section className="space-y-4">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">02. Government Identifiers</label>
              <div className="grid grid-cols-2 gap-4">
                <input name="abn" placeholder="ABN" className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold outline-none" />
                <input name="tfn" placeholder="TFN" className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold outline-none" />
              </div>
              {!entityType.toLowerCase().includes("trust") && (
                <input name="acn" placeholder="ACN (Company Number)" className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold outline-none" />
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-slate-300 uppercase ml-6">Established Date</label>
                  <input name="established_date" type="date" className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold" />
                </div>
                <div className="flex items-center gap-4 px-6 py-4 bg-slate-50 rounded-full border border-slate-100 mt-5">
                   <input type="checkbox" name="gst" className="w-5 h-5 rounded-full border-slate-200 text-black focus:ring-0" />
                   <span className="text-[11px] font-black uppercase text-slate-500">GST Registered</span>
                </div>
              </div>
            </section>

            {/* AUTOMATED TRUSTEE INPUTS */}
            {entityType.toLowerCase().includes("trust") && (
              <section className="p-8 bg-slate-50 rounded-[40px] border border-slate-200 space-y-4 animate-in zoom-in-95">
                <label className="text-[10px] font-black uppercase text-indigo-600 tracking-widest flex items-center gap-2 mb-2"><ShieldCheck size={14}/> Trustee Automatic Entry</label>
                <input name="trustee_name" required placeholder="Trustee Name (Co or Individual)" className="w-full rounded-full border-none bg-white px-6 py-4 text-sm font-bold shadow-sm" />
                <div className="grid grid-cols-2 gap-4">
                  <select name="trustee_type" className="rounded-full border-none bg-white px-6 py-4 text-sm font-bold shadow-sm outline-none">
                    <option>Company</option><option>Individual</option>
                  </select>
                  <input name="trustee_abn" placeholder="Trustee ABN" className="rounded-full border-none bg-white px-6 py-4 text-sm font-bold shadow-sm" />
                </div>
                <div className="flex flex-col gap-2 pt-2">
                   <label className="text-[9px] font-black text-slate-400 uppercase ml-6">Trust Deed Date</label>
                   <input name="trust_deed_date" type="date" className="w-full rounded-full border-none bg-white px-6 py-4 text-sm font-bold shadow-sm" />
                </div>
              </section>
            )}
          </div>

          {/* RIGHT: BANKING & PROFESSIONAL */}
          <div className="space-y-10">
            <section className="space-y-4">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">03. Professional & Contact</label>
              <div className="grid grid-cols-2 gap-4">
                <input name="email" type="email" placeholder="Contact Email" className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold outline-none" />
                <input name="phone" placeholder="Phone Number" className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold outline-none" />
              </div>
              <textarea name="address" placeholder="Registered Address" rows={2} className="w-full rounded-[32px] border border-slate-100 bg-slate-50 px-8 py-5 text-sm font-bold outline-none resize-none" />
              <select name="accountant_id" className="w-full rounded-full border border-slate-100 bg-slate-50 px-8 py-5 text-sm font-bold outline-none cursor-pointer appearance-none">
                <option value="">Link Appointed Accountant...</option>
                {accountants.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </section>

            <section className="space-y-4">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">04. Banking & Internal</label>
              <input name="bank_name" placeholder="Primary Bank Name" className="w-full rounded-full border border-slate-100 bg-slate-50 px-8 py-4 text-sm font-bold outline-none" />
              <div className="grid grid-cols-2 gap-4">
                <input name="bsb" placeholder="BSB" className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold outline-none" />
                <input name="acc_num" placeholder="Account Number" className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold outline-none" />
              </div>
              {/* NAB ID - Styled consistent with other fields */}
              <input name="nab_id" placeholder="NAB Connect ID" className="w-full rounded-full border border-slate-100 bg-slate-50 px-8 py-4 text-sm font-bold outline-none focus:ring-8 focus:ring-black/5" />
            </section>

            <div className="pt-6">
              <button 
                disabled={loading} 
                className="w-full bg-black text-white py-6 rounded-full font-black uppercase text-xs tracking-[0.2em] shadow-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-4"
              >
                {loading ? <Loader2 className="animate-spin" /> : "Verify & Onboard Entity"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}