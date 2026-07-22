// components/dashboard/tabs/CalendarTab.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

export default function CalendarTab({ recordId }: { recordId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useProgressBarWhile(loading);

  useEffect(() => {
    supabase
      .from('project_checklist_items')
      .select('id, title, is_done, due_date')
      .eq('project_id', recordId)
      .not('due_date', 'is', null)
      .is('deleted_at', null)
      .then(({ data }) => { setItems(data || []); setLoading(false); });
  }, [recordId]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const itemsByDate = items.reduce<Record<string, any[]>>((acc, item) => {
    if (!item.due_date) return acc;
    const key = item.due_date.slice(0, 10);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const today = new Date();

  if (loading) return null;

  return (
    <div>
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
          className="p-2 hover:bg-slate-100 rounded-full transition-all"
        >
          <ChevronLeft size={16} className="text-slate-500" />
        </button>
        <p className="text-[14px] font-bold text-slate-800">
          {MONTH_NAMES[month]} {year}
        </p>
        <button
          onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
          className="p-2 hover:bg-slate-100 rounded-full transition-all"
        >
          <ChevronRight size={16} className="text-slate-500" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-[9px] font-bold text-slate-400 uppercase py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayItems = itemsByDate[dateKey] || [];
          const isToday =
            today.getDate() === day &&
            today.getMonth() === month &&
            today.getFullYear() === year;

          return (
            <div
              key={day}
              className={`min-h-[60px] p-1.5 rounded-xl border transition-all ${
                isToday
                  ? 'border-indigo-300 bg-indigo-50/40'
                  : dayItems.length > 0
                  ? 'border-slate-200 bg-slate-50'
                  : 'border-transparent'
              }`}
            >
              <p className={`text-[11px] font-bold mb-1 ${
                isToday ? 'text-indigo-600' : 'text-slate-500'
              }`}>
                {day}
              </p>
              {dayItems.slice(0, 2).map(item => (
                <div
                  key={item.id}
                  className={`text-[9px] font-medium px-1.5 py-0.5 rounded-md mb-0.5 truncate ${
                    item.is_done
                      ? 'bg-emerald-100 text-emerald-700 line-through'
                      : 'bg-indigo-100 text-indigo-700'
                  }`}
                >
                  {item.title}
                </div>
              ))}
              {dayItems.length > 2 && (
                <p className="text-[9px] text-slate-400">+{dayItems.length - 2} more</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}