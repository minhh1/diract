// lib/precedents/library/instrumentParts.ts
// The two pieces every long-form instrument in the library needs: the styled
// paragraph helper, and the signing blocks.
//
// Split out of deedsBatch1.ts when the confidentiality agreements needed the
// same two things. Nothing else moved here -- parties, recitals and general
// provisions are worded differently in a deed and in an agreement ("this deed"
// against "this agreement", sealed and delivered against merely executed), and
// parameterising them would produce something that reads like neither.
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
