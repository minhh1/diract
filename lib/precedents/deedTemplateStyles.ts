// lib/precedents/deedTemplateStyles.ts
// The style contract a firm's deed template has to satisfy.
//
// Deeds are not letters. A letter is prose composed into a letterhead; a deed
// is a numbered instrument where the numbering, indentation and cross-
// reference scheme are the document's structure, and a firm's house style
// dictates all of it -- 1, 1.1, (a), (i), (I), recitals lettered A, B, C,
// schedules numbered separately.
//
// So we do not generate that layout. The firm uploads its own deed template
// with its numbering already defined as named Word styles, and a generated
// deed is authored as (style, text) pairs. Word applies the firm's own
// indentation and numbering from the template, which means the output matches
// what the firm's own precedents look like without us reproducing a single
// indent value -- and it keeps working when the firm changes its house style.
//
// This module is the contract: which styles a template must define for that to
// work, and a check that reports what is missing before the template is
// accepted. Uploading a template without them produces a deed with no
// numbering at all, which is why the upload refuses rather than warns.
import PizZip from "pizzip";

/** A style the generated deed applies, and what it is for. */
export interface DeedStyle {
  /** w:styleId as it appears in styles.xml. */
  id: string;
  /** w:name, which is what the user sees in Word's style gallery. */
  name: string;
  /** What a deed uses it for. Shown in the UI so a firm can map its own styles. */
  purpose: string;
  /**
   * False where a deed can be produced without it -- schedules and definition
   * tables aren't needed by every instrument.
   */
  required: boolean;
}

/**
 * Modelled on the Huynh Lawyers deed template. The ids are that template's;
 * a firm using different ids maps them when uploading rather than renaming
 * its own styles.
 */
export const DEED_STYLES: DeedStyle[] = [
  { id: "HLHeading", name: "HL Heading", purpose: "Part headings: Background, Operative Provisions, Execution", required: true },
  { id: "HLRecital", name: "HL Recital", purpose: "Recitals, lettered A, B, C", required: true },
  { id: "HLRecital-Level2", name: "HL Recital - Level 2", purpose: "Sub-recital", required: false },
  { id: "HLRecital-Level3", name: "HL Recital - Level 3", purpose: "Third-level recital", required: false },
  { id: "HLList-Level1-Bold", name: "HL List - Level 1 - Bold", purpose: "Numbered clause heading (1, 2, 3)", required: true },
  { id: "HLList-Level1-NotBold", name: "HL List - Level 1 - Not Bold", purpose: "Level 1 clause text without a heading", required: false },
  { id: "HLList-Level1-Bold-Nonumbering-Nounderline", name: "HL List - Level 1 - Bold - No numbering - No underline", purpose: "Unnumbered level 1 heading", required: false },
  { id: "HLList-Level2-Bold", name: "HL List - Level 2 - Bold", purpose: "Sub-clause heading (1.1, 1.2)", required: true },
  { id: "HLList-Level2-Normal", name: "HL List - Level 2 - Normal", purpose: "Sub-clause body text (1.1, 1.2)", required: true },
  { id: "HLListLevel2-Nonumbering", name: "HL List Level 2 - No numbering", purpose: "Continuation paragraph at level 2, no number", required: true },
  { id: "HLListLevel2-NonumberingandBold", name: "HL List Level 2 - No numbering and Bold", purpose: "Bold continuation at level 2", required: false },
  { id: "HLList-Level3", name: "HL List - Level 3", purpose: "Third level, lettered (a), (b), (c)", required: true },
  { id: "HLList-Level3-Nonumbering", name: "HL List - Level 3 - No numbering", purpose: "Continuation at level 3", required: false },
  { id: "HLList-Level4", name: "HL List - Level 4", purpose: "Fourth level, romanised (i), (ii)", required: true },
  { id: "HLList-Level5", name: "HL List - Level 5", purpose: "Fifth level (I), (II)", required: false },
  { id: "HLSchedule", name: "HL Schedule", purpose: "Schedule headings, numbered separately from the clauses", required: false },
  { id: "HLTableDefinition-Bold", name: "HL Table Definition - Bold", purpose: "Defined term in a definitions table", required: false },
  { id: "HLTableDefinition-NotBold", name: "HL Table Definition - Not Bold", purpose: "Definition text in a definitions table", required: false },
  { id: "HLTable-Level1", name: "HL Table - Level 1", purpose: "Numbered item inside a table", required: false },
  { id: "HLTable-Level2", name: "HL Table - Level 2", purpose: "Second-level item inside a table", required: false },
  { id: "HLOfficeDetails", name: "HL Office Details", purpose: "Small print in the footer block", required: false },
];

export interface DeedTemplateCheck {
  ok: boolean;
  /** styleId -> name, for every style the uploaded template defines. */
  found: Record<string, string>;
  missingRequired: DeedStyle[];
  missingOptional: DeedStyle[];
}

/**
 * Reads the styles a .docx defines. Matches on style NAME rather than id,
 * because Word derives an id from the name when a style is created in the UI
 * and the two drift -- "HL List - Level 1 - Bold" becomes
 * "HLList-Level1-Bold", but a style created by a different route may not.
 * Comparison ignores case and spacing for the same reason.
 */
export function readDocxStyles(bytes: Buffer): Record<string, string> {
  const zip = new PizZip(bytes);
  const file = zip.file("word/styles.xml");
  if (!file) return {};
  const xml = file.asText();
  const out: Record<string, string> = {};
  const re = /<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const name = /<w:name w:val="([^"]+)"/.exec(m[2]);
    if (name) out[m[1]] = name[1];
  }
  return out;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Whether an uploaded deed template carries the styles a generated deed
 * applies. Reports the optional ones separately so a firm isn't blocked over
 * a schedule style it will never use.
 */
export function checkDeedTemplate(bytes: Buffer): DeedTemplateCheck {
  const found = readDocxStyles(bytes);
  const have = new Set(Object.values(found).map(normalise));
  const haveIds = new Set(Object.keys(found).map(normalise));
  const has = (s: DeedStyle) => have.has(normalise(s.name)) || haveIds.has(normalise(s.id));

  const missingRequired = DEED_STYLES.filter(s => s.required && !has(s));
  const missingOptional = DEED_STYLES.filter(s => !s.required && !has(s));
  return { ok: missingRequired.length === 0, found, missingRequired, missingOptional };
}

/** Shown on the upload screen, before a template is chosen. */
export const DEED_TEMPLATE_GUIDANCE =
  "Your deed template must carry your firm's numbering as named Word styles before you upload it. " +
  "Deeds are generated by applying those styles, so Word takes the indentation, numbering and " +
  "cross-reference scheme from your template rather than from us -- which is what makes a generated " +
  "deed look like your own precedents. A template without them produces a deed with no numbering at all.";
