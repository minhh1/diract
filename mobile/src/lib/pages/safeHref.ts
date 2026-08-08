// Verbatim port of lib/safeHref.ts on the web app -- pure logic (the
// WHATWG URL constructor is available globally in RN/Hermes), kept
// identical since this is a security-relevant scheme allowlist, not just
// a display nicety -- see that file's own header comment for the full
// javascript:/data: URL rationale.
export function safeHref(url: string | null | undefined): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed, 'https://placeholder.invalid');
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return trimmed;
  } catch {
    return '';
  }
}
