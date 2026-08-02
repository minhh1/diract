// lib/precedents/library/instrumentParts.ts
// The two pieces every long-form instrument in the library needs: the styled
// paragraph helper, and the signing blocks.
//
// Split out of deedsBatch1.ts when the confidentiality agreements needed the
// same two things. Nothing else moved here -- parties, recitals and general
// provisions are worded differently in a deed and in an agreement ("this deed"
// against "this agreement", sealed and delivered against merely executed), and
// parameterising them would produce something that reads like neither.
import { deedLine, deedExecution, partyRow, ruleAbove, BOLD_MARK } from "@/lib/precedents/deedDocx";
import { executionSpec, type PartyKind, type InstrumentKind } from "@/lib/precedents/executionClauses";
import { field } from "./types";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

/** One paragraph: a style id (or null for the template's default) and inline text/fields. */
export const L = (style: string | null, parts: (string | BodyTemplateSegment)[]) =>
  deedLine<BodyTemplateSegment>(style, parts);

export interface PartyDetail {
  /** Field key prefix -- the three fields below become `${key}_name` etc. */
  key: string;
  /** How the party is described when prompting for its details, e.g. "First party". */
  label: string;
  nameExample: string;
  addressExample?: string;
  shortExample: string;
}

/**
 * The block a firm's own deeds open with, overleaf from the cover page: the
 * title again with a rule above it, the date, and a Name/Address/Shortname
 * table per party. Matches a real signed deed of the firm's own -- see the
 * top-of-deed formatting request this was built from.
 *
 * This is the first and only place a party's name and address are actually
 * asked for, so the table holds real fields, not illustrative text the way
 * the cover page's party lines do. Shared between deeds and agreements
 * because none of it is instrument-specific -- the words "deed" and
 * "agreement" don't appear anywhere in this block.
 */
export function partyDetails(
  title: string,
  dateFieldLabel: string,
  parties: PartyDetail[]
): BodyTemplateSegment[] {
  const out: BodyTemplateSegment[] = [
    ...L("DeedHeading", [ruleAbove(4, title)]),
    ...L("DeedHeading", [ruleAbove(0, "Date")]),
    ...L(null, [field("instrument_date", dateFieldLabel, "12 August 2026")]),
    ...L(null, [""]),
    ...L("DeedHeading", [ruleAbove(8, "Parties")]),
  ];
  parties.forEach((p, i) => {
    out.push(...L(null, [
      partyRow("Name"), BOLD_MARK,
      field(`${p.key}_name`, `${p.label}: full name, and ACN/ABN if a company`, p.nameExample),
      BOLD_MARK,
    ]));
    out.push(...L(null, [
      partyRow("Address"),
      field(`${p.key}_address`, `${p.label}: address`, p.addressExample ?? "[address]"),
    ]));
    out.push(...L(null, [
      partyRow("Shortname"), "the ", BOLD_MARK,
      field(`${p.key}_short`, `${p.label}: short name`, p.shortExample),
      BOLD_MARK,
    ]));
    if (i < parties.length - 1) out.push(...L(null, [partyRow("")]));
  });
  out.push(...L("DeedHeading", [ruleAbove(8, "")]));
  return out;
}

/** One party's signing block, with the party description left as a field. */
export function executionLines(
  kind: PartyKind,
  instrument: InstrumentKind,
  fieldLabel: string
): BodyTemplateSegment[] {
  // Readable in the table, since the cells are plain text -- the fill-in
  // field is emitted just above the block, and a control-character
  // placeholder would be stripped to a bare word here ("Signature of PARTY").
  const PLACEHOLDER = `[${fieldLabel}]`;
  // No separate fill-in field here: the parties are already prompted for at
  // the top of the instrument, and asking again on the signing page produced
  // a stray "[Individual party: full name and address]" line above every
  // block. The placeholder below refers back to that party instead.
  const spec = executionSpec(kind, instrument, PLACEHOLDER);
  return L(null, [deedExecution(spec)]);
}

/**
 * The note that sits above the signing page. Which block a party signs under
 * depends on what that party is, not on the instrument, so the choice is put
 * to the solicitor rather than guessed at -- see executionClauses.ts.
 */
export const CHOOSE_EXECUTION_BLOCK_NOTE =
  "[Choose the signing block for each party: individual, company under s 127(1) with two officers, company with a sole director, or company by authorised representative under s 126.]";
