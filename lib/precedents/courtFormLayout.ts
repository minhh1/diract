// lib/precedents/courtFormLayout.ts
// How a court document's plain text maps onto the layout of the approved
// forms: which lines are section headings, which are label/value fields, and
// which are ordinary prose.
//
// Kept free of any docx/React dependency so both renderers share one answer.
// lib/precedents/courtFormDocx.ts builds the Word tables from this, and
// components/precedents/PrecedentLibraryBrowser.tsx draws the same shape in
// the preview -- otherwise the preview and the downloaded document disagree
// about what the form looks like, which is worse than either being wrong on
// its own.

/**
 * The field labels the approved forms use. Only a line whose label is in this
 * set becomes a table row.
 *
 * An allow-list rather than a "Word: value" pattern on purpose: prose in these
 * documents is full of colons ("Note: the deponent must sign each page",
 * "You can respond in one of the following ways:") and a pattern match turns
 * those into table rows, wrecking the layout. The labels are finite and come
 * from the forms, so listing them is both safer and self-documenting.
 */
const FORM_LABELS = new Set([
  // Court details
  "court", "division", "list", "registry", "case number",
  // Title of proceedings
  "first plaintiff", "first defendant", "second plaintiff", "second defendant",
  "plaintiff", "defendant", "applicant", "respondent", "appellant",
  "first applicant", "first respondent",
  // Filing / preparation details
  "filed for", "filed in relation to", "prepared for",
  "legal representative", "legal representative reference",
  "contact name and telephone", "contact email", "address for service",
  // Relief / liquidated claim
  "amount of claim", "interest", "filing fees", "service fees",
  "solicitors fees", "total",
  // Signature blocks
  "signature", "capacity", "date of signature",
  "signature of deponent", "signature of witness",
  // Deponent / affidavit
  "name", "address", "occupation", "date",
  "name of witness", "address of witness", "capacity of witness",
  // Registry address
  "street address", "postal address", "telephone",
  // Subpoena / notices
  "to", "last day for service", "date time and place for production",
  // FCFCOA affidavit field labels
  "name of person swearing/affirming this affidavit", "date of swearing/affirming",
  "applicant 1 family name", "applicant 1 given names",
  "respondent 1 family name", "respondent 1 given names",
  "address for service in australia for the party filing this affidavit",
  "phone", "email", "lawyer's code", "family name", "given names", "gender",
  "usual occupation", "independent children's lawyer",
  "signature of deponent", "place", "full name of witness (please print)",
  "witness capacity", "print name and lawyer's code",
  "signature of interpreter", "interpreter's full name", "interpreter's address",
  "filed in",
  // Submissions headers
  "matter", "case number", "date of hearing", "date of sentence",
  "file number", "applicant", "respondent", "prepared for",
  "court and division", "date",
  "person affected by orders sought", "order for discovery", "made on",
]);

/**
 * The forms' own structural section headings, which are shaded full-width
 * rows. An all-caps line that isn't one of these is a heading the pleading
 * itself introduces -- THE PARTIES, THE AGREEMENT, BREACH, PARTICULARS --
 * and in the approved forms those sit inside PLEADINGS AND PARTICULARS as
 * plain bold text, not as boxed sections. Shading them too was what made the
 * first attempt look unlike the form.
 */
const FORM_SECTIONS = new Set([
  "court details", "title of proceedings", "filing details", "preparation details",
  "type of claim", "relief claimed", "pleadings and particulars",
  "hearing details", "signature", "signature of legal representative",
  "notice to defendant", "notice to cross-defendant", "how to respond",
  "registry address", "affidavit verifying", "affidavit", "party details",
  "interpreter's affidavit",
  // Motions
  "person affected by orders sought", "orders sought",
  "notice to person affected by orders sought",
  // Appearance
  "appearance", "address for service",
  // Defence
  "defence", "affirmative defence",
  // Discovery
  "order for discovery", "solicitor's certificate", "schedule",
  "part 1 - documents in the party's possession that it does not object to producing",
  "part 2 - documents in the party's possession that it objects to producing",
  "part 3 - documents no longer in the party's possession",
  "notice to produce",
  // Subpoena
  "order to the subpoena recipient", "proposed access order",
  "notice to the subpoena recipient", "date, time and place for production",
  "issued by the court",
  // FCFCOA affidavit (0625 v1a) -- the approved family law form is organised
  // into lettered Parts rather than named sections.
  "part a", "part b", "part c", "part d", "part e", "part f",
  "about the parties", "about the independent children's lawyer (if any)",
  "about you (the deponent)", "evidence", "signature",
  "alternative jurat for non-english speaking affidavit",
  // Submissions and outlines, which have no prescribed form but do have a
  // settled shape the bench expects.
  "the application", "show cause", "unacceptable risk", "matters under s 18",
  "conditions proposed", "the offence", "objective seriousness",
  "purposes of sentencing (s 3a)", "aggravating factors (s 21a(2))",
  "mitigating factors (s 21a(3))", "plea of guilty (s 25d)",
  "sentence contended for", "orders sought", "issues in dispute", "agreed",
  "risk", "evidence relied on", "chronology",
]);

export type Block =
  | { kind: "section"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "kv"; label: string; value: string }
  | { kind: "para"; text: string };

/**
 * A standalone all-caps line is a section heading ("COURT DETAILS"). A
 * trailing colon means it introduces a value on the same line, so it isn't
 * one. Same rule the browser preview uses, so the two agree.
 */
export function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 60 || t.endsWith(":")) return false;
  return /[A-Z]/.test(t) && t === t.toUpperCase();
}

/** "Registry: Sydney" -> a table row, but only for a known form label. */
export function asKeyValue(line: string): { label: string; value: string } | null {
  const m = line.match(/^([^:]{1,60}):[ \t]*(.*)$/);
  if (!m) return null;
  const label = m[1].trim();
  // '#' marks an optional line on the forms; keep it in the label but ignore
  // it when matching.
  const normalised = label.replace(/^#/, "").trim().toLowerCase();
  if (!FORM_LABELS.has(normalised)) return null;
  return { label, value: m[2].trim() };
}

export function classify(body: string): Block[] {
  const out: Block[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) { out.push({ kind: "para", text: "" }); continue; }
    if (isHeadingLine(line)) {
      const isSection = FORM_SECTIONS.has(line.replace(/^#/, "").trim().toLowerCase());
      out.push({ kind: isSection ? "section" : "heading", text: line });
      continue;
    }
    const kv = asKeyValue(line);
    if (kv) { out.push({ kind: "kv", ...kv }); continue; }
    out.push({ kind: "para", text: line });
  }
  return out;
}


/** Whether a line is one of the forms' own structural section headings. */
export function isFormSection(line: string): boolean {
  return FORM_SECTIONS.has(line.replace(/^#/, "").trim().toLowerCase());
}

/**
 * The form label a line begins with, if any -- "Registry: Sydney" -> "Registry".
 * Lets a renderer that carries rich content (the preview, whose values contain
 * field chips) split a line without re-implementing the allow-list.
 */
export function formLabelPrefix(line: string): string | null {
  const kv = asKeyValue(line);
  return kv ? kv.label : null;
}
