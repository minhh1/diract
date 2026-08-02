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
// with its numbering defined as named Word styles, and a generated deed is
// authored as (style, text) pairs. Word applies the firm's own indentation and
// numbering from the template, which means the output matches what the firm's
// own precedents look like without us reproducing a single indent value -- and
// it keeps working when the firm changes its house style.
//
// A firm that has no such styles is not turned away. Refusing the upload would
// leave them to build a numbering scheme in Word before they can use the
// feature at all, which is a poor trade for a problem we can solve: the
// missing styles are added to their template on upload, and they can edit
// them afterwards. See defaultDeedStyles.json, which holds style and numbering
// definitions only -- no logo, header, footer or content comes with them.
import PizZip from "pizzip";
import DEFAULT_DEED_STYLES from "@/lib/precedents/forms/deed/defaultDeedStyles.json";

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
 * The ids match the default scheme in defaultDeedStyles.json. A firm whose
 * template names these differently is matched on the style NAME instead, so
 * it never has to rename its own styles to suit us.
 */
export const DEED_STYLES: DeedStyle[] = [
  { id: "HLHeading", name: "HL Heading", purpose: "Every heading, whatever it introduces -- Background, Operative Provisions, Schedule, Execution. One heading style, not one per section.", required: true },
  { id: "HLRecital", name: "HL Recital", purpose: "The recitals themselves, lettered A, B, C. The word \"Background\" above them is a heading, not a recital.", required: true },
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
  /** True when the template already defines every required style itself. */
  ok: boolean;
  /**
   * True when we would add a default numbering scheme on upload. Not a
   * failure: a firm without house styles gets a working one rather than an
   * error telling them to go and build one.
   */
  needsDefaults: boolean;
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
  return {
    ok: missingRequired.length === 0,
    needsDefaults: missingRequired.length > 0,
    found, missingRequired, missingOptional,
  };
}

/** Shown on the upload screen, before a template is chosen. */
export const DEED_TEMPLATE_GUIDANCE =
  "If your deed template already has your firm's numbering set up as named Word styles, add them " +
  "before uploading and generated deeds will use them -- Word takes the indentation, numbering and " +
  "cross-reference scheme from your template, so the result looks like your own precedents. " +
  "If it doesn't, upload it anyway: a standard numbering scheme will be added for you, and you can " +
  "adjust it in Word afterwards.";

/** Shown after upload when the default scheme was added. */
export const DEED_TEMPLATE_DEFAULTS_ADDED =
  "Your template didn't define deed numbering, so a standard scheme has been added to it: numbered " +
  "clauses (1, 1.1), lettered sub-paragraphs ((a), (i)), lettered recitals and a heading style. " +
  "Only styles were added -- your logo, header, footer and content are untouched. Edit any of the " +
  "styles in Word to match your house style and re-upload.";


/** Namespace URIs for the prefixes the default definitions can carry. */
const NS_URI: Record<string, string> = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
  w14: "http://schemas.microsoft.com/office/word/2010/wordml",
  w15: "http://schemas.microsoft.com/office/word/2012/wordml",
};

/**
 * Adds xmlns declarations to `xml`'s root for any prefix `content` uses that
 * the root doesn't already declare.
 */
function ensureNamespaces(xml: string, content: string): string {
  const used = new Set<string>();
  for (const m of content.matchAll(/<([a-zA-Z0-9]+):/g)) used.add(m[1]);
  for (const m of content.matchAll(/\s([a-zA-Z0-9]+):[a-zA-Z]+=/g)) used.add(m[1]);

  const rootMatch = /<w:numbering\b[^>]*>/.exec(xml);
  if (!rootMatch) return xml;
  let root = rootMatch[0];
  let changed = false;
  for (const prefix of used) {
    const uri = NS_URI[prefix];
    if (!uri || root.includes(`xmlns:${prefix}=`)) continue;
    root = root.replace(/>$/, ` xmlns:${prefix}="${uri}">`);
    changed = true;
  }
  return changed ? xml.replace(rootMatch[0], root) : xml;
}

/**
 * Adds the default deed styles to a template that doesn't define them, and
 * returns the amended .docx.
 *
 * Styles and numbering only. The template's own content, headers, footers and
 * images are untouched -- this appends definitions to styles.xml and
 * numbering.xml and changes nothing else.
 *
 * Numbering ids are renumbered above whatever the template already uses.
 * w:numId and w:abstractNumId are document-wide, so copying them across at
 * their original values would collide with the template's own lists and
 * silently renumber them.
 */
export function applyDefaultDeedStyles(bytes: Buffer): Buffer {
  const zip = new PizZip(bytes);
  const stylesFile = zip.file("word/styles.xml");
  if (!stylesFile) return bytes;

  const existing = readDocxStyles(bytes);
  const haveIds = new Set(Object.keys(existing).map(normalise));
  const haveNames = new Set(Object.values(existing).map(normalise));
  const alreadyHas = (id: string, name: string) =>
    haveIds.has(normalise(id)) || haveNames.has(normalise(name));

  const missing = Object.entries(DEFAULT_DEED_STYLES.styles).filter(([id, xml]) => {
    const name = /<w:name w:val="([^"]+)"/.exec(xml)?.[1] ?? id;
    return !alreadyHas(id, name);
  });
  if (!missing.length) return bytes;

  let numberingXml = zip.file("word/numbering.xml")?.asText();
  const hadNumbering = !!numberingXml;
  if (!numberingXml) {
    // The copied definitions carry w14: and mc: prefixed attributes, so the
    // root has to declare those namespaces or Word rejects the part as
    // malformed rather than ignoring the attributes.
    numberingXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:numbering ' +
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
      'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
      'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" ' +
      'mc:Ignorable="w14 w15"></w:numbering>';
  }

  // Shift our ids clear of the template's own.
  const maxAbstract = Math.max(-1, ...[...numberingXml.matchAll(/w:abstractNumId="(\d+)"/g)].map(m => Number(m[1])));
  const maxNum = Math.max(-1, ...[...numberingXml.matchAll(/<w:num w:numId="(\d+)"/g)].map(m => Number(m[1])));
  const absOffset = maxAbstract + 1;
  const numOffset = maxNum + 1;

  let abstractBlock = "";
  for (const [absId, xml] of Object.entries(DEFAULT_DEED_STYLES.abstractNums)) {
    abstractBlock += xml.replace(
      /w:abstractNumId="(\d+)"/g,
      (_, v) => `w:abstractNumId="${Number(v) + absOffset}"`
    );
  }
  let numBlock = "";
  const numIdMap: Record<string, number> = {};
  for (const [numId, absId] of Object.entries(DEFAULT_DEED_STYLES.numIdToAbstract)) {
    const newNum = Number(numId) + numOffset;
    numIdMap[numId] = newNum;
    numBlock += `<w:num w:numId="${newNum}"><w:abstractNumId w:val="${Number(absId) + absOffset}"/></w:num>`;
  }

  // An existing numbering.xml declares whatever namespaces ITS content needed,
  // which is not necessarily what ours uses -- Form 3A declares w14 but not
  // w15, and a w15-prefixed attribute against an undeclared prefix makes the
  // part malformed. Declare anything our definitions use that the root lacks.
  numberingXml = ensureNamespaces(numberingXml, abstractBlock + numBlock);

  // The schema requires every w:abstractNum before any w:num, so when the
  // template already has lists the definitions go in ahead of the first
  // w:num rather than on the end.
  const firstNum = numberingXml.search(/<w:num\s/);
  numberingXml = firstNum >= 0
    ? numberingXml.slice(0, firstNum) + abstractBlock + numberingXml.slice(firstNum)
        .replace(/<\/w:numbering>\s*$/, `${numBlock}</w:numbering>`)
    : numberingXml.replace(/<\/w:numbering>\s*$/, `${abstractBlock}${numBlock}</w:numbering>`);
  zip.file("word/numbering.xml", numberingXml);

  const styleBlock = missing
    .map(([, xml]) => xml.replace(/<w:numId w:val="(\d+)"\/>/g, (whole, v) =>
      numIdMap[v] !== undefined ? `<w:numId w:val="${numIdMap[v]}"/>` : whole))
    .join("");
  zip.file("word/styles.xml", stylesFile.asText().replace(/<\/w:styles>\s*$/, `${styleBlock}</w:styles>`));

  // A template that had no numbering.xml needs it declared, or Word treats the
  // file as corrupt rather than ignoring the part.
  if (!hadNumbering) {
    const ct = zip.file("[Content_Types].xml")?.asText();
    if (ct && !ct.includes("numbering+xml")) {
      zip.file("[Content_Types].xml", ct.replace(/<\/Types>\s*$/,
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>'));
    }
    const rels = zip.file("word/_rels/document.xml.rels")?.asText();
    if (rels && !rels.includes("numbering.xml")) {
      const nextId = 1 + Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map(m => Number(m[1])));
      zip.file("word/_rels/document.xml.rels", rels.replace(/<\/Relationships>\s*$/,
        `<Relationship Id="rId${nextId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`));
    }
  }

  // DEFLATE explicitly: PizZip stores uncompressed by default, which turned a
  // 17KB template into 237KB.
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
