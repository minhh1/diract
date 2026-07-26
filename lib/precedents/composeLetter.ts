// lib/precedents/composeLetter.ts
// Small formatting helpers shared by app/api/precedents/[id]/issue/route.ts:
// how a subject line, a letter date, and a salutation are worded, per a
// company/matter's resolved precedent_settings. The actual letter body is
// assembled separately as raw OOXML paragraphs (see lib/precedents/contentXml.ts),
// since bold/spacing needs a single flat text tag can't give it.
export type SubjectLineStyle = "all_caps" | "sentence_case" | "with_re";
export type SalutationStyle = "generic" | "client_first_name" | "client_full_name";

export function formatSubjectLine(subject: string, style: SubjectLineStyle): string {
  const trimmed = subject.trim();
  if (style === "all_caps") return trimmed.toUpperCase();
  if (style === "with_re") return `RE: ${trimmed}`;
  return trimmed;
}

// Only the 3 presets offered in the settings UI (PrecedentsSettingsTab.tsx's
// DATE_OPTIONS) are recognized as exact tokens; anything else (a firm's own
// hand-typed value, or unset) falls back to the long form.
export function formatLetterDate(dateFormat: string, date: Date = new Date()): string {
  const day = date.getDate();
  const dd = String(day).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  if (dateFormat === "DD/MM/YYYY") return `${dd}/${mm}/${yyyy}`;
  if (dateFormat === "YYYY-MM-DD") return `${yyyy}-${mm}-${dd}`;
  const monthLong = date.toLocaleDateString("en-US", { month: "long" });
  return `${day} ${monthLong} ${yyyy}`;
}

export function resolveSalutation(
  salutationStyle: SalutationStyle,
  clientFirstName?: string | null,
  clientFullName?: string | null
): string {
  if (salutationStyle === "client_first_name" && clientFirstName) return `Dear ${clientFirstName},`;
  if (salutationStyle === "client_full_name" && clientFullName) return `Dear ${clientFullName},`;
  return "Dear Sir/Madam,";
}
