"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  ChevronLeft, ChevronRight, Clock, Filter, 
  DollarSign, User, Users, Target, Calendar as CalIcon, AlertCircle 
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function CalendarModule({ tasks }: { tasks: any[] }) {
  const [view, setView] = useState<"day" | "week" | "month">("month");
  const [viewDate, setViewDate] = useState(new Date());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [monetaryFilter, setMonetaryFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
  }, []);

  // --- Logic: Filtering ---
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchStatus = statusFilter === "all" || task.task_statuses?.label === statusFilter;
      const matchMonetary = monetaryFilter === "all" || (monetaryFilter === "monetary" ? task.is_monetary : !task.is_monetary);
      const matchOwner = ownerFilter === "all" || task.created_by === currentUserId;
      return matchStatus && matchMonetary && matchOwner;
    });
  }, [tasks, statusFilter, monetaryFilter, ownerFilter, currentUserId]);

  // --- Logic: Date Math ---
  const isSameDay = (d1: Date, d2: Date) => 
    d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

  const handlePrev = () => {
    const d = new Date(viewDate);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else if (view === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setViewDate(d);
  };

  const handleNext = () => {
    const d = new Date(viewDate);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else if (view === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setViewDate(d);
  };

  const monthDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  }, [viewDate]);

  const weekDays = useMemo(() => {
    const start = new Date(viewDate);
    start.setDate(viewDate.getDate() - viewDate.getDay());
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [viewDate]);

  // Priority Styles Helper
  const getStatusColor = (label: string) => {
    if (label === 'Urgent') return 'bg-red-50 border-red-100 text-red-700';
    if (label === 'Important') return 'bg-amber-50 border-amber-100 text-amber-700';
    return 'bg-indigo-50 border-indigo-100 text-indigo-700';
  };

  return (
    <div className="flex flex-col h-full font-sans overflow-hidden">
      
      {/* 1. COMPACT FILTER BAR */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-3 bg-slate-50 border border-slate-100 rounded-[24px] shrink-0">
        <div className="flex items-center gap-2 px-3 border-r border-slate-200">
          <Filter size={12} className="text-slate-400" />
          <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Filters</span>
        </div>

        <select onChange={(e) => setStatusFilter(e.target.value)} className="bg-white border border-slate-100 rounded-full px-4 py-1.5 text-[10px] font-bold outline-none cursor-pointer">
          <option value="all">All Priorities</option>
          <option value="Urgent">🔴 Urgent Only</option>
          <option value="Important">🟠 Important Only</option>
          <option value="Standard">🔵 Standard Only</option>
        </select>

        <div className="flex bg-white border border-slate-100 rounded-full p-0.5">
          <button onClick={() => setMonetaryFilter("all")} className={`px-4 py-1 rounded-full text-[9px] font-bold transition-all ${monetaryFilter === 'all' ? 'bg-black text-white' : 'text-slate-400'}`}>All</button>
          <button onClick={() => setMonetaryFilter("monetary")} className={`px-4 py-1 rounded-full text-[9px] font-bold transition-all ${monetaryFilter === 'monetary' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>$ Monetary</button>
        </div>

        <div className="flex bg-white border border-slate-100 rounded-full p-0.5 ml-auto">
          <button onClick={() => setOwnerFilter("all")} className={`px-4 py-1 rounded-full text-[9px] font-bold transition-all ${ownerFilter === 'all' ? 'bg-black text-white' : 'text-slate-400'}`}>Team View</button>
          <button onClick={() => setOwnerFilter("mine")} className={`px-4 py-1 rounded-full text-[9px] font-bold transition-all ${ownerFilter === 'mine' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>My Tasks</button>
        </div>
      </div>

      {/* 2. CALENDAR NAV */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-6">
          <h3 className="text-2xl font-black italic tracking-tighter uppercase">
            {viewDate.toLocaleString('en-AU', { month: 'long', year: 'numeric', day: view === 'day' ? 'numeric' : undefined })}
          </h3>
          <div className="flex bg-slate-100 rounded-full p-1 border border-slate-200">
            {['day', 'week', 'month'].map(v => (
              <button key={v} onClick={() => setView(v as any)} className={`px-6 py-1.5 text-[9px] font-black uppercase rounded-full transition-all ${view === v ? 'bg-white text-black shadow-sm' : 'text-slate-400'}`}>{v}</button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setViewDate(new Date())} className="px-4 py-2 rounded-full border border-slate-100 text-[10px] font-black uppercase hover:bg-slate-50 mr-2">Today</button>
          <button onClick={handlePrev} className="p-2 hover:bg-slate-50 rounded-full border border-slate-100"><ChevronLeft size={20}/></button>
          <button onClick={handleNext} className="p-2 hover:bg-slate-50 rounded-full border border-slate-100"><ChevronRight size={20}/></button>
        </div>
      </div>

      {/* 3. GRID CONTENT */}
      <div className="flex-1 overflow-hidden">
        {/* --- MONTH VIEW --- */}
        {view === "month" && (
          <div className="h-full flex flex-col min-h-0">
            <div className="grid grid-cols-7 gap-2 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">{d}</div>)}
            </div>
            <div className="flex-1 grid grid-cols-7 grid-rows-5 gap-2">
              {monthDays.map((date, i) => {
                const dayTasks = date ? filteredTasks.filter(t => isSameDay(new Date(t.due_date), date)) : [];
                const isToday = date && isSameDay(date, new Date());
                return (
                  <div key={i} className={`rounded-[24px] border p-3 flex flex-col min-h-0 transition-all ${date ? 'bg-white border-slate-100 hover:border-slate-300' : 'bg-transparent border-transparent opacity-10'} ${isToday ? 'ring-2 ring-indigo-500 shadow-lg shadow-indigo-50' : ''}`}>
                    {date && (
                      <>
                        <span className={`text-[11px] font-black leading-none mb-2 ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>{date.getDate()}</span>
                        <div className="flex-1 flex flex-col gap-1 overflow-y-auto custom-scrollbar-thin">
                          {dayTasks.map(task => (
                            <div key={task.id} className={`px-2 py-1 rounded-lg border text-[8px] font-black truncate leading-tight ${getStatusColor(task.task_statuses?.label)}`}>
                              {task.name}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --- WEEK VIEW --- */}
        {view === "week" && (
          <div className="grid grid-cols-7 gap-3 h-full pb-2">
            {weekDays.map((date, i) => {
              const dayTasks = filteredTasks.filter(t => isSameDay(new Date(t.due_date), date));
              return (
                <div key={i} className={`flex flex-col rounded-[32px] border p-4 bg-white border-slate-100 overflow-hidden ${isSameDay(date, new Date()) ? 'ring-2 ring-indigo-500' : ''}`}>
                  <div className="text-center mb-4 border-b border-slate-50 pb-2">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Day {date.getDate()}</p>
                    <p className="text-[10px] font-bold text-slate-500">{(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])[i]}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar-thin">
                    {dayTasks.map(task => (
                      <div key={task.id} className={`p-3 rounded-2xl border ${getStatusColor(task.task_statuses?.label)}`}>
                        <p className="text-[9px] font-black leading-tight mb-1">{task.name}</p>
                        {task.due_time && <p className="text-[8px] opacity-60 font-bold flex items-center gap-1"><Clock size={10}/> {task.due_time.slice(0,5)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* --- DAY VIEW --- */}
        {view === "day" && (
          <div className="max-w-3xl mx-auto h-full overflow-y-auto pr-4 py-4">
             {filteredTasks.filter(t => isSameDay(new Date(t.due_date), viewDate)).length > 0 ? (
               filteredTasks.filter(t => isSameDay(new Date(t.due_date), viewDate)).map(task => (
                <div key={task.id} className={`bg-white border rounded-[40px] p-8 mb-4 shadow-sm flex items-center justify-between group hover:border-slate-300 transition-all ${getStatusColor(task.task_statuses?.label)}`}>
                  <div className="flex items-center gap-6">
                    <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center shadow-sm">
                      <Clock size={20} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1 italic opacity-60">Due at {task.due_time?.slice(0,5) || 'Anytime'}</p>
                      <h3 className="text-lg font-bold tracking-tight">{task.name}</h3>
                    </div>
                  </div>
                  <div className="text-[11px] font-black uppercase bg-white/50 px-6 py-2 rounded-full border border-black/5 shadow-sm">Open Details</div>
                </div>
               ))
             ) : (
                <div className="py-20 text-center border-4 border-dashed border-slate-50 rounded-[48px] text-slate-300 italic font-black uppercase tracking-widest">No Agendas</div>
             )}
          </div>
        )}
      </div>
    </div>
  );
}