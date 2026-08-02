// lib/precedents/library/agreementParts.ts
// The scaffolding every long-form agreement in the library shares: parties
// and recitals, standard interpretation rules, the boilerplate general
// provisions, the signing page, and the four confidentiality carve-outs
// (needed by any agreement with its own confidentiality clause, not only the
// dedicated NDAs).
//
// Split out of agreementsBatch1.ts when agreementsBatch2.ts needed the same
// pieces. Deliberately agreement-only -- deedsBatch1.ts says "this deed"
// throughout and opens execution with "Signed, sealed and delivered"; this
// file says "this agreement" and "Executed by". Sharing one set of helpers
// across both would mean threading the instrument kind through every
// sentence for no real saving, so instrumentParts.ts stays the only thing
// actually common to both.
import { field } from "./types";
import { L, executionLines, CHOOSE_EXECUTION_BLOCK_NOTE, partyDetails } from "./instrumentParts";
import { executedAsLine } from "@/lib/precedents/executionClauses";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";
import { DEED_PAGE_BREAK, deedCover } from "@/lib/precedents/deedDocx";

export interface Party {
  /** Field key, which also prefixes the short-name field. */
  key: string;
  /** How the party is described when the fields are filled in. */
  label: string;
  example: string;
  shortExample: string;
}

/**
 * The cover page, the date, the parties and the recitals.
 *
 * Every agreement built on this shared opening had gone straight from its
 * title into the date and clauses on one page -- opening() never called
 * deedCover(), because it existed before deedCover() did and was never
 * revisited when deedsBatch1.ts's own deeds got a cover page. `title` is
 * threaded through from each precedent rather than assumed, since it's the
 * one thing this shared helper can't know on its own.
 *
 * The Name/Address/Shortname table (partyDetails, shared with deedParts.ts)
 * expects a name and an address as separate fields. Party.example here still
 * holds both combined ("ACME Pty Ltd ACN 000 000 000 of Level 3, ..., email
 * ..."), across some two dozen precedents -- splitting every one of those is
 * a real but separate job, so for now the combined example goes into the
 * Name field and Address prompts on its own with a generic placeholder.
 */
export function opening(
  title: string,
  a: Party,
  b: Party,
  recitals: BodyTemplateSegment[]
): BodyTemplateSegment[] {
  return [
    ...L(null, [deedCover({
      title,
      parties: [
        `[${a.label}: name, ACN/ABN, address and email]`,
        `[${b.label}: name, ACN/ABN, address and email]`,
      ],
    })]),
    ...L(null, [DEED_PAGE_BREAK]),
    ...partyDetails(title, "Date of the agreement", [
      { key: a.key, label: a.label, nameExample: a.example, shortExample: a.shortExample },
      { key: b.key, label: b.label, nameExample: b.example, shortExample: b.shortExample },
    ]),
    ...L("DeedHeading", ["Background"]),
    ...recitals,
    ...L(null, [""]),
    ...L("DeedHeading", ["Operative Provisions"]),
  ];
}

/**
 * The four carve-outs from a definition of Confidential Information. Without
 * them the obligation is unworkable -- it would bite on information the
 * recipient already had, or that everyone has, and no recipient can run a
 * business under that.
 */
export function confidentialInformationExceptions(): BodyTemplateSegment[] {
  return [
    ...L("DeedList-Level4", [
      "is, or becomes, generally available to the public other than through a breach of this agreement or of any other obligation of confidence;",
    ]),
    ...L("DeedList-Level4", [
      "the Recipient can show by written records that it lawfully held before it was disclosed, free of any obligation of confidence;",
    ]),
    ...L("DeedList-Level4", [
      "the Recipient develops independently without using or referring to the Confidential Information; or",
    ]),
    ...L("DeedList-Level4", [
      "the Recipient lawfully receives from a third party who is entitled to disclose it without restriction.",
    ]),
  ];
}

/** The interpretation rules, identical in every agreement. */
export function interpretation(): BodyTemplateSegment[] {
  return [
    ...L("DeedList-Level1-Bold", ["Interpretation"]),
    ...L("DeedList-Level2-NoNumbering", ["In this agreement, unless the context requires otherwise:"]),
    ...L("DeedList-Level3", ["the singular includes the plural and the reverse;"]),
    ...L("DeedList-Level3", [
      "a reference to a person includes a body corporate, an unincorporated body, a partnership, a trust and a government agency;",
    ]),
    ...L("DeedList-Level3", ['"includes" and "including" are not words of limitation;']),
    ...L("DeedList-Level3", [
      "a reference to legislation includes that legislation as amended, replaced or re-enacted;",
    ]),
    ...L("DeedList-Level3", ["headings are for convenience only and do not affect interpretation; and"]),
    ...L("DeedList-Level3", [
      "no rule of construction applies to the disadvantage of a party because that party prepared this agreement.",
    ]),
  ];
}

/** Notices and the boilerplate every agreement ends with, before execution. */
export function generalProvisions(): BodyTemplateSegment[] {
  return [
    ...L("DeedList-Level1-Bold", ["Notices"]),
    ...L("DeedList-Level2-Normal", [
      "A notice under this agreement must be in writing and sent to the address or email address of the party set out at the beginning of this agreement, or to any other address that party notifies in writing.",
    ]),
    ...L("DeedList-Level2-Normal", ["A notice is taken to be received:"]),
    ...L("DeedList-Level3", ["if delivered by hand, on delivery;"]),
    ...L("DeedList-Level3", ["if sent by post within Australia, on the third Business Day after posting; and"]),
    ...L("DeedList-Level3", [
      "if sent by email, at the time the email enters the addressee's information system, unless the sender receives an automated message that it has not been delivered.",
    ]),
    ...L("DeedList-Level1-Bold", ["General"]),
    ...L("DeedList-Level2-Bold", ["Entire agreement"]),
    ...L("DeedList-Level2-NoNumbering", [
      "This agreement records the entire agreement between the parties about its subject matter and supersedes all previous negotiations, understandings and agreements about that subject matter.",
    ]),
    ...L("DeedList-Level2-Bold", ["Variation"]),
    ...L("DeedList-Level2-NoNumbering", [
      "No variation of this agreement is effective unless it is in writing and signed by each party.",
    ]),
    ...L("DeedList-Level2-Bold", ["Waiver"]),
    ...L("DeedList-Level2-NoNumbering", [
      "A right under this agreement may only be waived in writing signed by the party giving the waiver. Failure to exercise a right, or delay in exercising it, is not a waiver of that right or of any other right.",
    ]),
    ...L("DeedList-Level2-Bold", ["Assignment"]),
    ...L("DeedList-Level2-NoNumbering", [
      "A party must not assign or otherwise deal with its rights under this agreement without the prior written consent of the other party.",
    ]),
    ...L("DeedList-Level2-Bold", ["Severance"]),
    ...L("DeedList-Level2-NoNumbering", [
      "If a provision of this agreement is void, voidable or unenforceable, it is to be read down so far as necessary to make it valid, and if it cannot be read down it is severed, without affecting the validity of the rest of this agreement.",
    ]),
    ...L("DeedList-Level2-Bold", ["No partnership or agency"]),
    ...L("DeedList-Level2-NoNumbering", [
      "Nothing in this agreement creates a partnership, joint venture, employment or agency relationship between the parties.",
    ]),
    ...L("DeedList-Level2-Bold", ["Counterparts"]),
    ...L("DeedList-Level2-NoNumbering", [
      "This agreement may be signed in counterparts, including by exchange of signed copies sent by email, and all counterparts together constitute one agreement.",
    ]),
    ...L("DeedList-Level2-Bold", ["Costs"]),
    ...L("DeedList-Level2-NoNumbering", [
      "Each party bears its own costs of preparing and signing this agreement.",
    ]),
    ...L("DeedList-Level2-Bold", ["Governing law"]),
    ...L("DeedList-Level2-NoNumbering", [
      "This agreement is governed by the law of ",
      field("jurisdiction", "Governing law", "New South Wales"),
      ", and each party submits to the non-exclusive jurisdiction of the courts of that place and of the courts of appeal from them.",
    ]),
  ];
}

/** The signing page. Both parties are companies in the example; the note tells the drafter to swap either block. */
export function execution(firstPartyLabel: string, secondPartyLabel: string): BodyTemplateSegment[] {
  return [
    ...L(null, [""]),
    // The signing page starts a fresh page: a deed that is signed halfway
    // down a page of clauses reads as an afterthought, and the block can be
    // separated from what it signs.
    ...L(null, [DEED_PAGE_BREAK]),
    ...L("DeedHeading", ["Execution"]),
    ...L(null, [executedAsLine("agreement")]),
    ...L(null, [""]),
    // An individual's block differs between a deed and an agreement, and a
    // company's turns on whether it signs under s 127(1) or s 126, so the
    // choice is put to the solicitor -- see executionClauses.ts.
    ...L(null, [CHOOSE_EXECUTION_BLOCK_NOTE]),
    ...L(null, [""]),
    ...executionLines("company_127_two_officers", "agreement", firstPartyLabel),
    ...L(null, [""]),
    ...executionLines("company_127_two_officers", "agreement", secondPartyLabel),
  ];
}
