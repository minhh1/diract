"use client";

import { useState, useEffect } from "react";
import { X, Calendar, Clock, Users, User, DollarSign, Loader2, Tag, Bell, Target } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AddTaskModal({ isOpen, onClose, onRefresh, projectId }: any) {
  const [loading, setLoading] = useState(false);
  const [isMonetary, setIsMonetary] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) fetchDropdownData();
  }, [isOpen]);

  const fetchDropdownData = async () => {
    const { data: t } = await supabase.from("teams").select("id, team_name").eq("is_active", true);
    const { data: s } = await supabase.from("task_statuses").select("id, label").eq("is_active", true);
    const { data: p } = await supabase.from("profiles").select("id, full_name").eq("is_active", true);
    if (t) setTeams(t); if (s) setStatuses(s); if (p) setStaff(p);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("tasks").insert([{
      project_id: projectId,
      name: fd.get("name"),
      due_date: fd.get("due_date"),
      due_time: fd.get("due_time"),
      assigned_team_id: fd.get("team_id"),
      assignee_id: fd.get("assignee_id"),
      status_id: fd.get("status_id"),
      is_monetary: isMonetary,
      estimated_cost: isMonetary ? fd.get("cost") : 0,
      reminder_setting: fd.get("reminder"),
      created_by: user?.id,
      date_entered: new Date().toISOString().split('T')[0]
    }]);

    if (!error) {
      await supabase.from("audit_logs").insert([{ project_id: projectId, user_id: user?.id, action: "Created new task", details: { task_name: fd.get("name") } }]);
      onRefresh();
      onClose();
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 font-sans">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-[48px] p-12 shadow-2xl border border-slate-100 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-10 text-slate-900">
          <h2 className="text-3xl font-black italic tracking-tighter">Deploy Task</h2>
          <button onClick={onClose} className="p-3 hover:bg-slate-50 rounded-full transition-all"><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-8">
          <input name="name" required placeholder="Project Task Description..." className="w-full rounded-full border border-slate-100 bg-slate-50 px-8 py-5 text-[15px] font-bold outline-none focus:ring-8 focus:ring-black/5" />
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-[32px] p-5 border border-slate-100 flex flex-col gap-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">Deadline Date</label>
              <input name="due_date" type="date" required className="bg-transparent text-sm font-bold outline-none cursor-pointer" />
            </div>
            <div className="bg-slate-50 rounded-[32px] p-5 border border-slate-100 flex flex-col gap-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">Exact Hour</label>
              <input name="due_time" type="time" className="bg-transparent text-sm font-bold outline-none cursor-pointer" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest flex items-center gap-2 italic"><Users size={12}/> Team</label>
              <select name="team_id" required className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold outline-none appearance-none cursor-pointer hover:bg-slate-100">
                <option value="">Select Team...</option>{teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest flex items-center gap-2 italic"><Target size={12}/> Priority</label>
              <select name="status_id" required className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold outline-none appearance-none cursor-pointer hover:bg-slate-100">
                {statuses.map(s => <option key={s.id} value={s.id}>{s.label === 'Urgent' ? '🔴 ' : '🔵 '}{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest flex items-center gap-2 italic"><User size={12}/> Assign Personnel</label>
              <select name="assignee_id" required className="w-full rounded-full border border-slate-100 bg-slate-50 px-6 py-4 text-sm font-bold outline-none appearance-none cursor-pointer hover:bg-slate-100">
                <option value="">Select Staff Member...</option>{staff.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className={`p-8 rounded-[40px] border transition-all duration-500 flex items-center gap-8 ${isMonetary ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
            <label className="flex items-center gap-4 cursor-pointer shrink-0">
              <input type="checkbox" checked={isMonetary} onChange={(e) => setIsMonetary(e.target.checked)} className="w-6 h-6 rounded-full border-slate-300 text-black focus:ring-0 cursor-pointer" />
              <span className={`text-[12px] font-black uppercase tracking-widest ${isMonetary ? 'text-emerald-700' : 'text-slate-400'}`}>Monetary Impact</span>
            </label>
            {isMonetary && <input name="cost" type="number" step="0.01" required placeholder="Estimated Allocation ($)" className="flex-1 rounded-full border-2 border-emerald-100 bg-white px-8 py-4 text-sm font-bold outline-none focus:border-emerald-500 animate-in slide-in-from-left-4" />}
          </div>
          <button type="submit" disabled={loading} className="w-full bg-black text-white py-6 rounded-full font-black text-sm uppercase tracking-[0.3em] shadow-2xl hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-4">{loading ? <Loader2 className="animate-spin" /> : "Authorize & Deploy Task"}</button>
        </form>
      </div>
    </div>
  );
}