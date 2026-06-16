"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  CheckCircle2, 
  Circle, 
  Briefcase, 
  Clock, 
  RotateCcw, 
  Archive,
  AlertCircle,
  Loader2,
  Calendar
} from "lucide-react";

export default function AllTasksPage() {
  const [view, setView] = useState<"active" | "archived">("active");
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    let query = supabase
      .from("tasks")
      .select(`
        *,
        projects ( name ),
        task_statuses ( label )
      `)
      .eq("created_by", user?.id)
      .order("due_date", { ascending: true });

    // Filter based on the view
    if (view === "active") {
      query = query.is("deleted_at", null);
    } else {
      query = query.not("deleted_at", "is", null);
    }

    const { data, error } = await query;
    if (!error) setTasks(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
  }, [view]);

  // UNARCHIVE LOGIC: Set deleted_at back to null
  const handleUnarchive = async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: null })
      .eq("id", taskId);
    
    if (error) alert(error.message);
    else fetchTasks();
  };

  return (
    <div className="p-8 md:p-14 bg-[#fcfcfd] min-h-screen animate-in fade-in duration-700">
      <header className="mb-14 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-slate-900 italic mb-3">
            Task Management
          </h1>
          <p className="text-slate-500 font-medium max-w-md">
            Review your personal workload and retrieve archived items.
          </p>
        </div>

        {/* View Switcher - Pill Design */}
        <div className="flex p-1.5 bg-slate-200/50 rounded-full w-fit border border-slate-200 shadow-sm backdrop-blur-md">
          <button
            onClick={() => setView("active")}
            className={`flex items-center gap-2 px-8 py-2.5 rounded-full text-[12px] font-black uppercase tracking-widest transition-all ${
              view === "active" ? "bg-white text-black shadow-lg" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Clock size={16} /> Active
          </button>
          <button
            onClick={() => setView("archived")}
            className={`flex items-center gap-2 px-8 py-2.5 rounded-full text-[12px] font-black uppercase tracking-widest transition-all ${
              view === "archived" ? "bg-black text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Archive size={16} /> Archive
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto space-y-4">
        {loading ? (
          <div className="flex flex-col items-center py-20 gap-4">
             <Loader2 className="animate-spin text-slate-200" size={48} />
             <p className="text-slate-400 font-bold italic uppercase text-xs tracking-widest">Accessing Vault...</p>
          </div>
        ) : tasks.length > 0 ? (
          tasks.map((task) => (
            <div 
              key={task.id} 
              className={`bg-white border rounded-[36px] p-8 shadow-sm hover:shadow-md transition-all group flex flex-col md:flex-row items-center justify-between gap-6 ${
                view === 'archived' ? 'opacity-70 grayscale-[0.5]' : ''
              }`}
            >
              <div className="flex items-center gap-6 flex-1">
                <div className={`${view === 'archived' ? 'text-slate-300' : 'text-slate-200'}`}>
                  {task.is_completed ? <CheckCircle2 className="text-emerald-500" size={28} /> : <Circle size={28} />}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-md">
                      <Briefcase size={10} /> {task.projects?.name || "Global Portfolio"}
                    </span>
                    {view === 'archived' && (
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter bg-slate-100 px-2 py-0.5 rounded-md">
                        Archived
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-800 text-[18px] tracking-tight">{task.name}</h3>
                  <div className="flex items-center gap-3 mt-2 text-slate-400">
                    <span className="text-[10px] font-black uppercase text-red-500">{task.task_statuses?.label || 'Urgent'}</span>
                    <span className="text-[10px] font-bold text-slate-200">•</span>
                    <span className="text-[10px] font-bold">Assigned to: {task.assigned_to || 'You'}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-10 text-right shrink-0">
                <div className="flex flex-col items-end">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Deadline</p>
                  <p className="text-sm font-black text-slate-700 italic uppercase">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}
                  </p>
                </div>

                {/* Restore / Unarchive Button */}
                {view === "archived" ? (
                  <button 
                    onClick={() => handleUnarchive(task.id)}
                    className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-[11px] font-black uppercase shadow-xl hover:bg-slate-800 active:scale-95 transition-all animate-in slide-in-from-right-4"
                  >
                    <RotateCcw size={16} /> Restore
                  </button>
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-300">
                    <Calendar size={18} />
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-20 border-4 border-dashed border-slate-50 rounded-[64px] text-center text-slate-400">
            <AlertCircle className="mx-auto mb-4" size={48} />
            <p className="font-black italic text-xl">
              {view === "active" ? "Zero Tasks Found" : "Archive is Empty"}
            </p>
            <p className="text-slate-300 text-sm mt-2">All investment workflows are currently synchronized.</p>
          </div>
        )}
      </div>
    </div>
  );
}