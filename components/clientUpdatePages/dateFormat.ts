// components/clientUpdatePages/dateFormat.ts
// A closed set of date display formats a page can be set to (see the
// date-format PATCH route) -- values are stable tokens stored in
// client_update_pages.date_format, not the display label itself, so
// relabelling here never breaks stored data.
export const DATE_FORMATS = [
  { value: "D_MMM_YYYY", label: "27 Jul 2026", format: (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) },
  { value: "DD_MM_YYYY", label: "27/07/2026", format: (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` },
  { value: "MM_DD_YYYY", label: "07/27/2026", format: (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}` },
  { value: "YYYY_MM_DD", label: "2026-07-27", format: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` },
] as const;

export function formatDate(value: string, dateFormat: string): string {
  const match = DATE_FORMATS.find(f => f.value === dateFormat) || DATE_FORMATS[0];
  const d = new Date(`${value}T00:00:00`);
  if (isNaN(d.getTime())) return value;
  return match.format(d);
}
