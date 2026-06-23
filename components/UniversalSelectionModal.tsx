"use client";

import { useState, useEffect } from "react";
import { X, Search, Check, Building2, Landmark, ShieldCheck, Loader2, Plus, MapPin, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function UniversalSelectionModal({ isOpen, onClose, onSelect, title, table }: any) {
  const [view, setView] = useState<"select" | "create">("select");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("Company");

  useEffect(() => {
    if (isOpen && view === "select") {
      const nameCol = table === 'properties' ? 'street_address' : 'name';
      supabase.from(table).select(`id, ${nameCol}`).ilike(nameCol, `%${search}%`).limit(8)
        .then(({ data }) => setItems(data || []));
    }
  }, [isOpen, search, table, view]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user?.id).single();

    try {
      let rId = ""; let rName = "";

      if (table === "entities") {
        const payload = {
          name: fd.get("name"),
          entity_type: entityType,
          company_id: prof?.company_id,
          abn: fd.get("abn"),
          acn: fd.get("acn"),
          tfn: fd.get("tfn"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          gst_registered: fd.get("gst") === "on",
          nab_connect_id: fd.get("nab")
        };
        const { data: ent } = await supabase.from("entities").insert([payload]).select().single();
        rId = ent.id; rName = ent.name;
      }

      if (table === "properties") {
        const payload = {
          street_address: fd.get("address"),
          suburb: fd.get("suburb"),
          state: fd.get("state"),
          postcode: fd.get("postcode"),
          folio_identifier: fd.get("folio"),
          purchase_price: fd.get("price"),
          company_id: prof?.company_id
        };
        const { data: prop } = await supabase.from("properties").insert([payload]).select().single();
        rId = prop.id; rName = prop.street_address;
      }

      onSelect(rId, rName);
      onClose();
      setView("select");
    } catch (err: any) { alert(err.message); }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md font-sans">
      <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-medium tracking-tight text-slate-900">{title}</h2>
            <div className="flex gap-4 mt-2">
              <button onClick={() => setView("select")} className={`text-[10px] font-bold uppercase tracking-widest ${view === 'select' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>Search</button>
              <button onClick={() => setView("create")} className={`text-[10px] font-bold uppercase tracking-widest ${view === 'create' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>New entry</button>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-[#F9FAFB]">
          {view === "select" ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input autoFocus placeholder={`Filter ${table}...`} className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-medium outline-none" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="space-y-1">
                {items.map(item => (
                  <button key={item.id} onClick={() => onSelect(item.id, item.name || item.street_address)} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:border-black transition-all w-full">
                    <span className="text-sm font-medium text-slate-700">{item.name || item.street_address}</span>
                    <Check size={16} className="text-indigo-600" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-6">
              {table === 'entities' && (
                <div className="space-y-4">
                  <select onChange={(e) => setEntityType(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium">
                    <option>Company</option><option>Discretionary Family Trust</option><option>Lawyer</option><option>Accountant</option>
                  </select>
                  <input name="name" required placeholder="Legal name" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium" />
                  <div className="grid grid-cols-2 gap-4">
                    <input name="abn" placeholder="ABN" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium" />
                    <input name="acn" placeholder="ACN" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input name="email" placeholder="Email" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium" />
                    <input name="nab" placeholder="NAB ID" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium" />
                  </div>
                </div>
              )}
              {table === 'properties' && (
                <div className="space-y-4">
                  <input name="address" required placeholder="Street address" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium" />
                  <div className="grid grid-cols-2 gap-4">
                    <input name="suburb" placeholder="Suburb" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium" />
                    <input name="postcode" placeholder="Postcode" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium" />
                  </div>
                </div>
              )}
              <button disabled={loading} className="w-full bg-slate-900 text-white py-4 rounded-xl font-medium text-sm">
                {loading ? <Loader2 className="animate-spin mx-auto" /> : "Verify and save record"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}