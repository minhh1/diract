"use client";
import { useState } from "react";
import { 
  ChevronDown, ChevronUp, CheckCircle2, Circle, 
  Clock, Users, DollarSign, Bell, Calendar as CalendarIcon 
} from "lucide-react";

export default function ChecklistModule({ task }: { task: any }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-4 overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm transition-all hover:border-slate-300">
      
      {/* SIMPLE VIEW (The Row) */}
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-4">
          <button className="text-slate-200 hover:text-emerald-500 transition-colors">
            <Circle size={24} />
          </button>
          <div>
            <h3 className="font-bold text-slate-800 tracking-tight">{task.name}</h3>
            <div className="flex gap-2 mt-1">
               <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                 Urgent
               </span>
               {task.is_monetary && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">Monetary</span>}
            </div>
          </div>
        </div>

        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 rounded-full hover:bg-slate-50 text-slate-400 transition-colors"
        >
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {/* EXPANDED VIEW (The Details) */}
      {isExpanded && (
        <div className="px-10 pb-8 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="h-px bg-slate-50 mb-8" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[13px]">
            
            {/* Left Column: Dates & People */}
            <div className="space-y-6">
              <div className="flex items-center gap-4 text-slate-500">
                <CalendarIcon size={18} className="text-indigo-500" />
                <div>
                  <p className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Due Date</p>
                  <p className="text-slate-900 font-semibold">{task.due_date || 'No date set'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-slate-500">
                <Users size={18} className="text-indigo-500" />
                <div>
                  <p className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Assignment</p>
                  <p className="text-slate-900 font-semibold">Team Alpha / Minh Huynh</p>
                </div>
              </div>
            </div>

            {/* Right Column: Reminders & Costs */}
            <div className="space-y-6">
              <div className="flex items-center gap-4 text-slate-500">
                <Bell size={18} className="text-indigo-500" />
                <div>
                  <p className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Reminders</p>
                  <p className="text-slate-900 font-semibold">2 Days before at 09:00 AM</p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-slate-500">
                <DollarSign size={18} className="text-indigo-500" />
                <div>
                  <p className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Financials</p>
                  <p className="text-slate-900 font-semibold italic">Estimated: $12,500.00</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 flex gap-3">
             <button className="px-6 py-2.5 rounded-full bg-slate-900 text-white text-[12px] font-bold shadow-lg hover:bg-black transition-all">Save Changes</button>
             <button className="px-6 py-2.5 rounded-full bg-white border border-slate-200 text-slate-400 text-[12px] font-bold hover:text-red-500 hover:border-red-100 transition-all">Archive Task</button>
          </div>
        </div>
      )}
    </div>
  );
}