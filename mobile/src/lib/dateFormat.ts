// Verbatim port of components/clientUpdatePages/dateFormat.ts -- a client
// update page's date_format is a per-page admin setting (e.g. Huynh
// Lawyers' pages are all "D_MMM_YYYY", 27 Jul 2026), not a device locale
// default, so it has to be threaded through explicitly rather than
// falling back to toLocaleDateString.
export const DATE_FORMATS = [
  { value: 'D_MMM_YYYY', format: (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) },
  { value: 'DD_MM_YYYY', format: (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` },
  { value: 'MM_DD_YYYY', format: (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}` },
  { value: 'YYYY_MM_DD', format: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` },
] as const;

export function formatDate(value: string, dateFormat: string): string {
  const match = DATE_FORMATS.find((f) => f.value === dateFormat) || DATE_FORMATS[0];
  const d = new Date(`${value}T00:00:00`);
  if (isNaN(d.getTime())) return value;
  return match.format(d);
}
