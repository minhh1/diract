// lib/precedents/library/deedsBatch1.ts
// Full deeds, written out rather than described.
//
// The 24 deed precedents shipped earlier carried drafting instructions and no
// body, on the reasoning that a long-form instrument isn't a fill-in-the-blanks
// document. That was wrong in practice: it left a solicitor with nothing to
// start from, which is the opposite of what a precedent library is for. These
// carry the whole instrument, with the parts that genuinely vary as fields.
//
// Styling comes from the firm's own deed template rather than from here --
// each line names a style (see lib/precedents/deedDocx.ts) and Word applies
// that firm's numbering and indentation. So a deed generated here comes out
// numbered the way the firm numbers things, without this file containing a
// single indent value.
//
// Batch 1 is the short instruments a general practice reaches for most often.
// Longer commercial agreements follow in later batches.
import { field, type PrecedentSeed } from "./types";
import { L, executionLines, CHOOSE_EXECUTION_BLOCK_NOTE } from "./instrumentParts";
import { executedAsLine } from "@/lib/precedents/executionClauses";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

/** The boilerplate every deed in this batch ends with. */
function generalProvisions(): BodyTemplateSegment[] {
  return [
    ...L("DeedList-Level1-Bold", ["General"]),
    ...L("DeedList-Level2-Bold", ["Entire agreement"]),
    ...L("DeedList-Level2-NoNumbering", [
      "This deed records the entire agreement between the parties about its subject matter and supersedes all previous negotiations, understandings and agreements about that subject matter.",
    ]),
    ...L("DeedList-Level2-Bold", ["Variation"]),
    ...L("DeedList-Level2-NoNumbering", [
      "No variation of this deed is effective unless it is in writing and signed by each party.",
    ]),
    ...L("DeedList-Level2-Bold", ["Further assurances"]),
    ...L("DeedList-Level2-NoNumbering", [
      "Each party must do everything reasonably necessary, including signing any document, to give full effect to this deed.",
    ]),
    ...L("DeedList-Level2-Bold", ["Counterparts"]),
    ...L("DeedList-Level2-NoNumbering", [
      "This deed may be signed in counterparts, and all counterparts together constitute one instrument.",
    ]),
    ...L("DeedList-Level2-Bold", ["Governing law"]),
    ...L("DeedList-Level2-NoNumbering", [
      "This deed is governed by the law of ",
      field("jurisdiction", "Governing law", "New South Wales"),
      ", and each party submits to the non-exclusive jurisdiction of the courts of that place.",
    ]),
    ...L("DeedList-Level2-Bold", ["Costs"]),
    ...L("DeedList-Level2-NoNumbering", [
      "Each party bears its own costs of preparing and signing this deed.",
    ]),
    ...L(null, [""]),
    ...L("DeedHeading", ["Execution"]),
    ...L(null, [executedAsLine("deed")]),
    ...L(null, [""]),
    // The signing block depends on what each party is, not on the deed, so
    // the party kind is asked for rather than assumed. See
    // lib/precedents/executionClauses.ts -- an individual signs a deed
    // differently from an agreement, and a company's block turns on whether
    // it signs under s 127(1) or s 126.
    ...L(null, [CHOOSE_EXECUTION_BLOCK_NOTE]),
    ...L(null, [""]),
    ...executionLines("individual", "deed", "First party"),
    ...L(null, [""]),
    ...executionLines("company_127_two_officers", "deed", "Second party"),
  ];
}

/** Parties and recitals, common to every deed in the batch. */
function opening(recitals: BodyTemplateSegment[]): BodyTemplateSegment[] {
  return [
    ...L(null, ["Date: ", field("deed_date", "Date of the deed", "12 August 2026")]),
    ...L(null, [""]),
    ...L("DeedHeading", ["Parties"]),
    ...L(null, [field("party_a", "First party: name, ACN/ABN and address", "ACME Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000")]),
    ...L(null, ["(", field("party_a_short", "First party short name", "the Company"), ")"]),
    ...L(null, [""]),
    ...L(null, [field("party_b", "Second party: name, ACN/ABN and address", "John Citizen of 10 Smith Street, Parramatta NSW 2150")]),
    ...L(null, ["(", field("party_b_short", "Second party short name", "the Employee"), ")"]),
    ...L(null, [""]),
    ...L("DeedHeading", ["Background"]),
    ...recitals,
    ...L(null, [""]),
    ...L("DeedHeading", ["Operative Provisions"]),
  ];
}

export const DEEDS_BATCH_1: PrecedentSeed[] = [
  {
    key: "deed.settlement_and_release",
    name: "Deed of Settlement and Release",
    description: "Settles a dispute: payment, mutual release, bar to proceedings, no admission and confidentiality.",
    category: "Commercial",
    subcategory: "Settlement",
    documentType: "deed",
    requiresReview: true,
    reviewNote:
      "Check whether the release should be mutual or one way, and whether it covers claims not yet known -- a release of unknown claims must say so expressly. Where a party is bankrupt, in liquidation or under administration, confirm who can bind it. Consider whether the settlement sum attracts GST and whether a tax invoice is required.",
    aiInstructions:
      "The operative parts are the payment, the release and the bar. Get the release wording right: identify precisely what is released, by whom, in favour of whom, and whether it extends to claims the parties do not yet know about. A release that recites 'all claims' without defining the Dispute is worth little. Include the bar to proceedings so the deed can be pleaded in answer to any later claim. Keep 'no admission' -- it is what makes settlement possible.",
    segments: [
      ...L(null, ["DEED OF SETTLEMENT AND RELEASE"]),
      ...L(null, [""]),
      ...opening([
        ...L("DeedRecital", [
          "A dispute has arisen between the parties concerning ",
          field("dispute", "The dispute", "the supply of goods under invoice 1043 dated 15 April 2025"),
          " (the Dispute).",
        ]),
        ...L("DeedRecital", [
          "The parties have agreed to settle the Dispute on the terms set out in this deed, without any admission of liability.",
        ]),
      ]),
      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this deed:"]),
      ...L("DeedList-Level3", [
        "Claim means any claim, demand, action, suit or proceeding of any kind, whether present or future, known or unknown, and whether arising at law, in equity, under statute or otherwise.",
      ]),
      ...L("DeedList-Level3", ["Dispute has the meaning given in Recital A."]),
      ...L("DeedList-Level3", [
        "Settlement Sum means ",
        field("settlement_sum", "Settlement sum", "$50,000"),
        ".",
      ]),
      ...L("DeedList-Level1-Bold", ["Settlement"]),
      ...L("DeedList-Level2-Normal", [
        "In full and final settlement of the Dispute, ",
        field("payer", "Who pays", "the Company"),
        " must pay the Settlement Sum to ",
        field("payee", "Who is paid", "the Employee"),
        " by ",
        field("payment_date", "Payment date", "26 August 2026"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Payment must be made by electronic transfer to the account nominated in writing by the payee, and is taken to be made when the funds are credited to that account.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Settlement Sum is inclusive of interest and costs, and no further amount is payable by either party in respect of the Dispute.",
      ]),
      ...L("DeedList-Level1-Bold", ["Release"]),
      ...L("DeedList-Level2-Normal", [
        "On payment of the Settlement Sum, each party releases and discharges the other from every Claim that it has, or but for this deed would have had, arising out of or in connection with the Dispute.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "This release extends to Claims that a party does not know of at the date of this deed, and each party acknowledges that it has entered into this deed knowing that it may later discover facts it does not now know.",
      ]),
      ...L("DeedList-Level1-Bold", ["Bar to proceedings"]),
      ...L("DeedList-Level2-Normal", [
        "This deed may be pleaded as a complete bar and defence to any Claim brought contrary to clause 3.",
      ]),
      ...L("DeedList-Level1-Bold", ["No admission"]),
      ...L("DeedList-Level2-Normal", [
        "This deed is entered into by way of compromise only. Nothing in it is an admission of liability by any party, and it is not to be treated as one in any proceeding.",
      ]),
      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "The parties must keep the terms of this deed confidential, except where disclosure is required by law, to a professional adviser, or to enforce this deed.",
      ]),
      ...generalProvisions(),
    ],
  },

  {
    key: "deed.confidentiality",
    name: "Deed of Confidentiality",
    description: "One-way or mutual confidentiality undertaking, with permitted disclosures, return of material and a defined term.",
    category: "Commercial",
    subcategory: "Confidentiality",
    documentType: "deed",
    requiresReview: true,
    reviewNote:
      "Decide whether the obligation is one way or mutual before sending -- the drafting below is mutual and needs cutting back if only one party discloses. Check the term: an indefinite obligation over ordinary commercial information is often unenforceable as an unreasonable restraint, whereas trade secrets can properly be protected without limit.",
    aiInstructions:
      "Define Confidential Information by reference to what is actually being disclosed rather than reciting a generic definition, and carve out what is already public, independently developed, or received from a third party without restriction -- without those carve-outs the obligation is unworkable. State the permitted purpose precisely, because everything else follows from it. Include the compelled-disclosure exception and the obligation to notify before disclosing.",
    segments: [
      ...L(null, ["DEED OF CONFIDENTIALITY"]),
      ...L(null, [""]),
      ...opening([
        ...L("DeedRecital", [
          "The parties are discussing ",
          field("purpose", "The permitted purpose", "a possible acquisition of the business of the Company"),
          " (the Purpose).",
        ]),
        ...L("DeedRecital", [
          "In the course of those discussions each party may disclose confidential information to the other, and the parties have agreed to protect that information on the terms of this deed.",
        ]),
      ]),
      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this deed:"]),
      ...L("DeedList-Level3", [
        "Confidential Information means all information disclosed by or on behalf of one party to the other in connection with the Purpose, in any form, including ",
        field("ci_examples", "What is being disclosed", "financial records, customer lists, pricing, and the fact and content of the discussions themselves"),
        ", but does not include information that:",
      ]),
      ...L("DeedList-Level4", ["is or becomes public other than through a breach of this deed;"]),
      ...L("DeedList-Level4", ["the recipient already lawfully held free of any obligation of confidence;"]),
      ...L("DeedList-Level4", ["the recipient develops independently without using the Confidential Information; or"]),
      ...L("DeedList-Level4", ["the recipient lawfully receives from a third party who is free to disclose it."]),
      ...L("DeedList-Level3", ["Purpose has the meaning given in Recital A."]),
      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must keep the other's Confidential Information confidential, use it only for the Purpose, and not disclose it to anyone except as permitted by clause 3.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Each party must protect the other's Confidential Information with at least the care it applies to its own confidential information of similar importance, and in any event with reasonable care.",
      ]),
      ...L("DeedList-Level1-Bold", ["Permitted disclosure"]),
      ...L("DeedList-Level2-Normal", ["A party may disclose Confidential Information:"]),
      ...L("DeedList-Level3", [
        "to its officers, employees and professional advisers who need it for the Purpose, provided that party ensures they comply with this deed as if bound by it;",
      ]),
      ...L("DeedList-Level3", ["with the discloser's prior written consent; or"]),
      ...L("DeedList-Level3", [
        "where required by law, a court, or a stock exchange, provided that the party gives the discloser as much notice as is reasonably practicable so the discloser may seek a protective order.",
      ]),
      ...L("DeedList-Level1-Bold", ["Return of material"]),
      ...L("DeedList-Level2-Normal", [
        "On written request, a party must promptly return or destroy all Confidential Information in its possession and certify that it has done so, except for one copy retained for its records or to comply with a legal or regulatory requirement, which remains subject to this deed.",
      ]),
      ...L("DeedList-Level1-Bold", ["Term"]),
      ...L("DeedList-Level2-Normal", [
        "This deed applies to Confidential Information disclosed at any time, and the obligations continue for ",
        field("term", "How long the obligation lasts", "three years from the date of this deed"),
        ", except that obligations in respect of trade secrets and personal information continue for so long as the information retains its character.",
      ]),
      ...L("DeedList-Level1-Bold", ["Remedies"]),
      ...L("DeedList-Level2-Normal", [
        "The parties agree that damages may not be an adequate remedy for breach of this deed and that injunctive relief is an appropriate remedy in addition to any other remedy available.",
      ]),
      ...L("DeedList-Level1-Bold", ["No licence or representation"]),
      ...L("DeedList-Level2-Normal", [
        "Nothing in this deed transfers any intellectual property, obliges a party to disclose anything, or is a representation as to the accuracy or completeness of any Confidential Information.",
      ]),
      ...generalProvisions(),
    ],
  },
];
