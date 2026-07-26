// lib/precedents/composeLetter.ts
// Turns an AI-drafted {subject, body} plus a company/matter's resolved
// precedent_settings into the single string that fills the letterhead's
// {{content}} tag (see app/api/precedents/[id]/issue/route.ts) — date,
// subject line, salutation, the drafted body, and a closing. Docxtemplater
// renders this with `linebreaks: true` (the same option already used by
// app/api/document-templates/public/[pageId]/submit/route.ts), which turns
// each \n here into a real paragraph break in the generated .docx. The
// signer block is NOT part of this string — it needs the signer's name in
// bold, which a single flat-text tag can't do, so it's rendered separately
// into its own {{signoff}} tag as raw OOXML (see lib/precedents/signoffXml.ts).
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

export interface ComposeLetterInput {
  subject: string;
  subjectLineStyle: SubjectLineStyle;
  dateFormat: string;
  salutationStyle: SalutationStyle;
  clientFirstName?: string | null;
  clientFullName?: string | null;
  body: string;
  matterReference?: string | null; // only rendered as "Our Ref" when includeFirmReference is on AND this is set
}

function resolveSalutation(input: ComposeLetterInput): string {
  if (input.salutationStyle === "client_first_name" && input.clientFirstName) return `Dear ${input.clientFirstName},`;
  if (input.salutationStyle === "client_full_name" && input.clientFullName) return `Dear ${input.clientFullName},`;
  return "Dear Sir/Madam,";
}

export function composeLetterContent(input: ComposeLetterInput): string {
  const lines: string[] = [formatLetterDate(input.dateFormat)];
  if (input.matterReference) lines.push(`Our Ref: ${input.matterReference}`);
  lines.push("", formatSubjectLine(input.subject, input.subjectLineStyle), "", resolveSalutation(input), "", input.body.trim(), "", "Yours faithfully,");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
