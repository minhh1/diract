// lib/precedents/library/instrumentParts.ts
// The two pieces every long-form instrument in the library needs: the styled
// paragraph helper, and the signing blocks.
//
// Split out of deedsBatch1.ts when the confidentiality agreements needed the
// same two things. Nothing else moved here -- parties, recitals and general
// provisions are worded differently in a deed and in an agreement ("this deed"
// against "this agreement", sealed and delivered against merely executed), and
// parameterising them would produce something that reads like neither.
import { field } from "./types";
import { deedLine, deedExecution } from "@/lib/precedents/deedDocx";
import { executionSpec, type PartyKind, type InstrumentKind } from "@/lib/precedents/executionClauses";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

/** One paragraph: a style id (or null for the template's default) and inline text/fields. */
export const L = (style: string | null, parts: (string | BodyTemplateSegment)[]) =>
  deedLine<BodyTemplateSegment>(style, parts);

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
  // A natural person and a company describe themselves differently -- an
  // individual has no ACN or trustee capacity to prompt for, and a company
  // example under an individual's signing block (e.g. a guarantor) reads as
  // a mistake rather than a placeholder.
  const isIndividual = kind === "individual";
  const label = isIndividual
    ? `${fieldLabel}: full name and address`
    : `${fieldLabel}: full name, ACN and any trustee capacity`;
  const example = isIndividual
    ? "Jane Citizen of 10 Smith Street, Parramatta NSW 2150"
    : "ACME Pty Ltd ACN 000 000 000 as trustee for the ACME Trust";
  // The party description is a fill-in field, but the block is rendered as a
  // table, so the field can't sit inline in a text run. The placeholder is
  // carried through and the field emitted alongside, which keeps the prompt
  // in the precedent while the layout stays a table.
  const spec = executionSpec(kind, instrument, PLACEHOLDER);
  return [
    ...L(null, [field(fieldLabel.toLowerCase().replace(/ /g, "_"), label, example)]),
    ...L(null, [deedExecution(spec)]),
  ];
}

/**
 * The note that sits above the signing page. Which block a party signs under
 * depends on what that party is, not on the instrument, so the choice is put
 * to the solicitor rather than guessed at -- see executionClauses.ts.
 */
export const CHOOSE_EXECUTION_BLOCK_NOTE =
  "[Choose the signing block for each party: individual, company under s 127(1) with two officers, company with a sole director, or company by authorised representative under s 126.]";
