"use client";

// Shared month/week/day navigation state for the /dashboard/calendar page --
// same prev/next/today/monthDays date-math CalendarModule.tsx already has,
// pulled out as its own hook rather than forcing that component's
// task-specific rendering (priority/monetary filters, a day-column-with-
// task-list week layout) to also serve staff rostering's structurally
// different staff x day-of-week grid. weekDays here is Monday-start (the
// rostering convention), not CalendarModule's Sunday-start.
import { useMemo, useState, useCallback } from "react";

export type CalendarView = "day" | "week" | "month";

// Local-date formatting (not toISOString, which is UTC and can shift the
// date by one depending on local time of day) -- these Date objects are
// always constructed from local year/month/day components in the first
// place, so reading them back the same way is what stays consistent.
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useCalendarNav(initialView: CalendarView = "week") {
  const [view, setView] = useState<CalendarView>(initialView);
  const [viewDate, setViewDate] = useState(new Date());

  const handlePrev = useCallback(() => {
    setViewDate((prev) => {
      const d = new Date(prev);
      if (view === "month") d.setMonth(d.getMonth() - 1);
      else if (view === "week") d.setDate(d.getDate() - 7);
      else d.setDate(d.getDate() - 1);
      return d;
    });
  }, [view]);

  const handleNext = useCallback(() => {
    setViewDate((prev) => {
      const d = new Date(prev);
      if (view === "month") d.setMonth(d.getMonth() + 1);
      else if (view === "week") d.setDate(d.getDate() + 7);
      else d.setDate(d.getDate() + 1);
      return d;
    });
  }, [view]);

  const goToday = useCallback(() => setViewDate(new Date()), []);

  const monthDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  }, [viewDate]);

  const weekDays = useMemo(() => {
    const d = new Date(viewDate);
    const day = d.getDay(); // 0=Sun..6=Sat
    const diffToMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diffToMonday);
    return Array.from({ length: 7 }).map((_, i) => {
      const x = new Date(d);
      x.setDate(d.getDate() + i);
      return x;
    });
  }, [viewDate]);

  return { view, setView, viewDate, setViewDate, handlePrev, handleNext, goToday, monthDays, weekDays };
}
