"use client";

import { useState, useEffect } from "react";
import { X, Briefcase, MapPin, Loader2, Check, Users, Info } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function NewProjectModal({ isOpen, onClose, onRefresh, userProfile }: any) {
  const [loading, setLoading] = useState(false);
  
  // Data for dropdowns
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  // 1. Fetch available teams for assignment
  useEffect(() => {
    if (isOpen) {
      fetchTeams();
    }
  }, [isOpen]);

  const fetchTeams = async () => {
    const { data } = await supabase.from("teams").select("*").eq("is_active", true);
    if (data) setTeams(data);
  };

  const toggleTeam = (id: string) => {
    if (selectedTeams.includes(id)) setSelectedTeams(selectedTeams.filter(t => t !== id));
    else setSelectedTeams([...selectedTeams, id]);
  };

  // 2. Handle Project + Property + Security Creation
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();

    try {
      // Step A: Create the Property entry
      const { data: prop, error: pErr } = await supabase
        .from("properties")
        .insert([{
          street_address: fd.get("street"),
          suburb: fd.get("suburb"),
          state: fd.get("state"),
          postcode: fd.get("postcode")
        }])
        .select()
        .single();

      if (pErr) throw pErr;

      // Step B: Create the Project linked to the Property
      const { data: proj, error: prErr } = await supabase
        .from("projects")
        .insert([{
          name: fd.get("name"),
          description: fd.get("description"),
          property_id: prop.id,
          company_id: userProfile?.company_id || null, // NULL if unassigned/independent
          created_by: user?.id,
          estimated_completion_date: fd.get("est_completion")
        }])
        .select()
        .single();

      if (prErr) throw prErr;

      // Step C: Automatic Security Assignment (Link creator to the Tree)
      await supabase.from("project_members").insert([
        { project_id: proj.id, profile_id: user?.id }
      ]);

      // Step D: Link Multiple Teams
      if (selectedTeams.length > 0) {
        const teamLinks = selectedTeams.map(tid => ({ project_id: proj.id, team_id: tid }));
        await supabase.from("project_teams").insert(teamLinks);
      }

      // Step E: Create Audit Log
      await supabase.from("audit_logs").insert([{
        project_id: proj.id,
        user_id: user?.id,
        action: "Initiated new project portfolio",
        details: { project_name: proj.name, suburb: prop.suburb }
      }]);

      // Step F: Success
      onRefresh(); // Refresh sidebar tree
      onClose();   // Close modal
      setSelectedTeams([]);
    } catch (error: any) {
      alert("Project Initiation Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 font-sans antialiased">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />
      
      {/* Modal Card */}
      <div className="relative w-full max-w-4xl bg-white rounded-[48px] p-10 shadow-2xl border border-slate-100 overflow-y-auto max-h-[95vh] custom-scrollbar animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-10 text-slate-900">
          <div>
            <h2 className="text-4xl font-black italic tracking-tighter leading-none">Initiate Project</h2>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-3 italic">Investment Property Acquisition</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-50 rounded-full transition-all"><X size={28} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-10">
          
          {/* LEFT: Project & Property Identity */}
          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest flex items-center gap-2"><Briefcase size={12}/> Portfolio Name</label>
              <input name="name" required placeholder="e.g. Sydney Waterfront Trust" className="w-full rounded-full border border-slate-100 bg-slate-50 px-8 py-5 text-[15px] font-bold outline-none focus:ring-8 focus:ring-black/5 placeholder:text-slate-300 transition-all" />
              <div className="bg-slate-50 rounded-[32px] p-5 border border-slate-100">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-3 mb-2 block italic">Est. Completion Date</label>
                <input name="est_completion" type="date" required className="w-full bg-transparent px-3 text-sm font-bold outline-none cursor-pointer" />
              </div>
            </div>

            <div className="space-y-4 bg-slate-50 p-8 rounded-[40px] border border-slate-100">
              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 mb-2 italic"><MapPin size={12}/> Asset Location (AU)</label>
              <input name="street" required placeholder="Street Address" className="w-full rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
              <div className="grid grid-cols-2 gap-3">
                <input name="suburb" required placeholder="Suburb" className="w-full rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
                <select name="state" required className="rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-bold outline-none appearance-none cursor-pointer">
                  <option>NSW</option><option>VIC</option><option>QLD</option><option>WA</option><option>SA</option><option>TAS</option><option>ACT</option><option>NT</option>
                </select>
              </div>
              <input name="postcode" required placeholder="Postcode" className="w-full rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
            </div>
          </div>

          {/* RIGHT: Teams & Objectives */}
          <div className="space-y-8 text-slate-900">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest flex items-center gap-2"><Users size={12}/> Assign Portfolio Teams</label>
              <div className="flex flex-wrap gap-2">
                {teams.map(t => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleTeam(t.id)}
                    className={`px-5 py-2.5 rounded-full text-[11px] font-bold border transition-all ${selectedTeams.includes(t.id) ? 'bg-black border-black text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-black'}`}
                  >
                    {t.team_name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest flex items-center gap-2 italic"><Info size={12}/> Project Brief</label>
              <textarea name="description" rows={5} placeholder="Define the investment objectives and compliance requirements..." className="w-full rounded-[32px] border border-slate-100 bg-slate-50 p-6 text-sm font-bold outline-none resize-none focus:bg-white transition-all placeholder:text-slate-300" />
            </div>

            <div className="p-6 rounded-[32px] border border-indigo-50 bg-indigo-50/30 flex items-start gap-4">
               <Check className="text-indigo-500 mt-1 shrink-0" size={18} />
               <p className="text-[12px] text-slate-500 font-medium leading-relaxed">
                 By creating this project, you will be automatically assigned as the **Portfolio Owner** and it will be visible in your Project Tree immediately.
               </p>
            </div>
          </div>

          {/* Action Button */}
          <div className="md:col-span-2 mt-4">
            <button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-black text-white py-6 rounded-full font-black text-sm uppercase tracking-[0.2em] shadow-2xl hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-4"
            >
              {loading ? <Loader2 className="animate-spin" /> : "Authorize & Deploy Portfolio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}