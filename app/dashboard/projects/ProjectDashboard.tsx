"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  ListChecks, Calendar as CalIcon, ClipboardList, 
  ArrowLeft, Plus, History, Check, X, FileEdit 
} from "lucide-react";
import TaskItem from "@/components/TaskItem";
import CalendarModule from "@/components/CalendarModule";

// FIX: Corrected interface name and prop name
interface ProjectDashboardProps {
  projectId: string;
  onBack: () => void;
}

export default function ProjectDashboard({ projectId, onBack }: ProjectDashboardProps) {
  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("checklist");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: proj } = await supabase.from("projects").select("*").eq("id", projectId).single();
      const { data: tsk } = await supabase.from("tasks").select(`*, task_statuses(label)`).eq("project_id", projectId).is("deleted_at", null);
      const { data: logData } = await supabase.from("audit_logs").select(`*, profiles:user_id(full_name)`).eq("project_id", projectId).order('created_at', { ascending: false });
      
      if (proj) setProject(proj);
      if (tsk) setTasks(tsk);
      if (logData) setLogs(logData);
      setLoading(false);
    }
    fetchData();
  }, [projectId]);

  if (loading) return <div className="p-20 text-center text-slate-400 font-medium animate-pulse">Syncing project workspace...</div>;

  return (
    <div className="flex flex-col h-screen bg-white font-sans antialiased overflow-hidden">
      <header className="p-8 border-b border-slate-100 shrink-0 bg-white">
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase hover:text-black mb-4 transition-all">
          <ArrowLeft size={14}/> Back to Master List
        </button>
        <h1 className="text-4xl font-light text-slate-900 tracking-tight leading-none uppercase">
          {project?.name}
        </h1>
        
        <div className="flex gap-2 mt-8 bg-slate-100 p-1 rounded-full w-fit border border-slate-200">
           {[
             {id:'checklist', label:'Checklist', icon:ListChecks}, 
             {id:'calendar', label:'Calendar', icon:CalIcon}, 
             {id:'log', label:'Activity log', icon:ClipboardList}
           ].map(t => (
             <button 
               key={t.id} 
               onClick={() => setActiveTab(t.id)} 
               className={`flex items-center gap-2 px-10 py-2 rounded-full text-[11px] font-medium transition-all ${activeTab === t.id ? "bg-white text-black shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
             >
               <t.icon size={14} strokeWidth={2.5}/> {t.label}
             </button>
           ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-[#F9FAFB] p-10">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'checklist' && (
            <div className="space-y-2 animate-in fade-in">
              {tasks.length > 0 ? tasks.map(t => (
                <TaskItem key={t.id} task={t} onRefresh={() => {}} />
              )) : (
                <div className="p-20 text-center border-2 border-dashed border-slate-200 rounded-[40px] text-slate-400 font-medium">
                  No active tasks in this project
                </div>
              )}
            </div>
          )}

          {activeTab === 'calendar' && <CalendarModule tasks={tasks} />}

          {activeTab === 'log' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4">
              {logs.map(log => (
                <div key={log.id} className="p-6 bg-white border border-slate-200 rounded-[32px] flex items-start gap-4 shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] uppercase shrink-0">
                    {log.profiles?.full_name?.substring(0,2)}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-slate-900">
                      {log.profiles?.full_name} <span className="text-slate-400">{log.action}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                      {new Date(log.created_at).toLocaleString('en-AU')}
                    </p>
                    {log.details && (
                      <div className="mt-4 flex gap-4">
                        <div className="bg-slate-50 border border-slate-100 p-2 rounded-lg flex-1">
                          <span className="text-[8px] font-bold text-slate-400 block uppercase">Old</span>
                          <span className="text-[11px] line-through text-slate-400">{String(log.details.old || "None")}</span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-lg flex-1">
                          <span className="text-[8px] font-bold text-emerald-600 block uppercase">New</span>
                          <span className="text-[11px] font-medium text-emerald-900">{String(log.details.new)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}