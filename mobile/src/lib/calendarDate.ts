// Local-date helpers for the kiosk calendar views, mirroring the web app's
// lib/hooks/useCalendarNav.ts exactly (Monday-start week, local not UTC
// date components) so the native app's date math produces the same
// start/end range strings the shared API routes expect.

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getWeekDays(viewDate: Date): Date[] {
  const day = viewDate.getDay(); // 0=Sun..6=Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(viewDate);
  monday.setDate(viewDate.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function getMonthDays(viewDate: Date): (Date | null)[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
  return days;
}
