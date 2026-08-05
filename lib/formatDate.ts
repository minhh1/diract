// Single shared "format an ISO date string for display" helper -- en-AU
// (DD/MM/YYYY), the locale every Australian law firm using this template
// expects, instead of leaving it to `toLocaleDateString()`'s default (which
// follows the browser/OS locale and can silently render US MM/DD/YYYY) or a
// raw unformatted ISO string. Distinct call sites across the app previously
// each rolled their own local version of this exact function; new code
// should import this one instead of adding another.
export function formatDateAU(d: string | null | undefined): string {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return String(d).slice(0, 10); }
}

// Longer form ("1 Aug 2026"), for headers/PDFs where the short numeric form
// reads ambiguously out of context.
export function formatDateAULong(d: string | null | undefined): string {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d).slice(0, 10); }
}
