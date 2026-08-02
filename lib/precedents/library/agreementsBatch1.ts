// lib/precedents/library/agreementsBatch1.ts
// Full commercial agreements, written out rather than described.
//
// Same reasoning as deedsBatch1.ts: an agreement shipped as drafting notes
// alone leaves a solicitor with nothing to start from. These carry the whole
// instrument -- definitions, operative clauses, general provisions and the
// signing page -- with only what genuinely varies left as fields.
//
// An agreement is not a deed, and the difference shows up in two places. The
// words of execution are "Executed by", not "Signed, sealed and delivered":
// sealing and delivery are what make a deed a deed, and putting them on an
// agreement is a drafting error rather than a flourish. And the general
// provisions say "this agreement" throughout. The styled paragraph helper and
// signing blocks come from instrumentParts.ts (shared with the deeds); the
// parts specific to agreements -- opening, interpretation, general provisions,
// execution -- come from agreementParts.ts (shared across agreement batches).
//
// documentType is "deed" even so. It is the rendering hint that routes a
// document through the firm's own deed template (see the download route), and
// that is exactly where a long-form agreement's numbering and indentation
// should come from. There is no separate "agreement" document type, and adding
// one would mean a second template upload for no difference in output.
//
// Batch 1 is the two confidentiality agreements. They replace the stubs that
// shipped in commercialAgreements.ts under cagr.nda_mutual and
// cagr.nda_one_way; those keys are retired rather than reused, because
// installPrecedentLibrary only ever inserts new keys and a firm that already
// installed the stub would otherwise never see the full draft.
import { field, type PrecedentSeed } from "./types";
import { L } from "./instrumentParts";
import { opening, interpretation, generalProvisions, execution, confidentialInformationExceptions } from "./agreementParts";

export const AGREEMENTS_BATCH_1: PrecedentSeed[] = [
  {
    key: "agr.confidentiality_mutual",
    name: "Confidentiality Agreement (Mutual)",
    description:
      "Two-way NDA in full: defined permitted purpose, carve-outs, permitted disclosees, privacy, return or destruction, term and remedies.",
    category: "Commercial",
    subcategory: "Confidentiality",
    documentType: "deed",
    requiresReview: true,
    reviewNote:
      "Settle the permitted purpose before sending -- every other obligation is measured against it, and a purpose drawn as 'discussing a possible transaction' gives the recipient almost unlimited use. Check the term is proportionate: an indefinite obligation over ordinary commercial information can be attacked as an unreasonable restraint, while a genuine trade secret can properly be protected without limit. Delete clause 9 (non-solicitation) if it was not agreed; an unnegotiated restraint in an NDA is one of the most common reasons they come back marked up. If the parties are in different states, settle the governing law rather than leaving the example in. Where either party is listed, check its continuous disclosure obligations before it agrees to clause 8.",
    aiInstructions:
      "This is a genuinely mutual agreement: every obligation is expressed by reference to a Recipient and a Discloser, so it works whichever way information happens to flow. Keep it that way -- redrafting it as 'Party A must' is how a mutual NDA quietly becomes one-sided. Define Confidential Information by reference to what is actually being disclosed rather than reciting a generic list, and never cut the four carve-outs: information that is public, already lawfully held, independently developed, or received from a third party free to disclose it. Keep the compelled-disclosure exception together with the obligation to give notice first, because notice is what allows the discloser to seek a protective order. Keep it proportionate. An oppressive NDA delays the deal it was meant to protect and is often simply refused.",
    segments: [
      ...L(null, ["CONFIDENTIALITY AGREEMENT (MUTUAL)"]),
      ...L(null, [""]),
      ...opening(
        {
          key: "party_a",
          label: "First party",
          example: "ACME Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email legal@acme.com.au",
          shortExample: "ACME",
        },
        {
          key: "party_b",
          label: "Second party",
          example: "Brightside Holdings Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email admin@brightside.com.au",
          shortExample: "Brightside",
        },
        [
          ...L("DeedRecital", [
            "The parties are discussing ",
            field("purpose", "The permitted purpose, stated precisely", "a possible acquisition by Brightside of the business assets of ACME"),
            " (the Permitted Purpose).",
          ]),
          ...L("DeedRecital", [
            "In connection with the Permitted Purpose each party may disclose to the other information that is confidential to it.",
          ]),
          ...L("DeedRecital", [
            "The parties have agreed that information disclosed in connection with the Permitted Purpose is to be treated on the terms set out in this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", [
        "Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement.",
      ]),
      ...L("DeedList-Level3", [
        "Confidential Information means all information of or relating to a Discloser or any of its Related Bodies Corporate that is disclosed to, or observed by, a Recipient or its Representatives in connection with the Permitted Purpose, whether before or after the date of this agreement, in any form and whether or not marked or described as confidential, including ",
        field(
          "ci_examples",
          "What is actually being disclosed",
          "financial records, management accounts, customer and supplier lists, pricing, employee details and the terms of any offer made"
        ),
        ", the fact that the parties are in discussions, the existence and content of this agreement, and any note, analysis, model or other material prepared by the Recipient or its Representatives to the extent it contains or is derived from that information, but does not include information that:",
      ]),
      ...confidentialInformationExceptions(),
      ...L("DeedList-Level3", [
        "Discloser means, in relation to Confidential Information, the party that discloses it or on whose behalf it is disclosed.",
      ]),
      ...L("DeedList-Level3", ["Permitted Purpose has the meaning given in Recital A."]),
      ...L("DeedList-Level3", ["Personal Information has the meaning given in the Privacy Act 1988 (Cth)."]),
      ...L("DeedList-Level3", [
        "Recipient means, in relation to Confidential Information, the party to which it is disclosed.",
      ]),
      ...L("DeedList-Level3", ["Related Body Corporate has the meaning given in the Corporations Act 2001 (Cth)."]),
      ...L("DeedList-Level3", [
        "Representative means, in relation to a party, its Related Bodies Corporate and the officers, employees, professional advisers and financiers of that party and of its Related Bodies Corporate.",
      ]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must, in respect of Confidential Information of which it is the Recipient:",
      ]),
      ...L("DeedList-Level3", ["keep it confidential;"]),
      ...L("DeedList-Level3", ["use it only for the Permitted Purpose;"]),
      ...L("DeedList-Level3", ["not disclose it to any person except as permitted by clause 4;"]),
      ...L("DeedList-Level3", ["not copy or reproduce it except to the extent reasonably required for the Permitted Purpose;"]),
      ...L("DeedList-Level3", [
        "protect it with at least the degree of care it applies to its own confidential information of similar importance, and in any event with reasonable care; and",
      ]),
      ...L("DeedList-Level3", [
        "not use it to obtain a commercial advantage over the Discloser or to compete with the Discloser.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "A Recipient is responsible for any act or omission of its Representatives in relation to Confidential Information as if it were the Recipient's own act or omission.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "A Recipient must notify the Discloser as soon as it becomes aware of any unauthorised use, disclosure, access to or loss of Confidential Information, and must take the steps the Discloser reasonably requires to prevent, stop and remedy it.",
      ]),

      ...L("DeedList-Level1-Bold", ["Permitted disclosure"]),
      ...L("DeedList-Level2-Normal", ["A Recipient may disclose Confidential Information:"]),
      ...L("DeedList-Level3", [
        "to a Representative who needs it for the Permitted Purpose, provided the Recipient first informs that Representative of its confidential nature and ensures that it is dealt with in accordance with this agreement;",
      ]),
      ...L("DeedList-Level3", ["with the Discloser's prior written consent, on any conditions of that consent; or"]),
      ...L("DeedList-Level3", [
        "to the extent required by law, by a court, by a government agency or by the rules of a securities exchange, subject to clause 4.2.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Before making a disclosure under clause 4.1(c), the Recipient must, unless prohibited by law from doing so, notify the Discloser as soon as practicable so the Discloser may seek a protective order or other relief, give the Discloser the assistance it reasonably requires for that purpose, and disclose only that part of the Confidential Information it is legally required to disclose.",
      ]),

      ...L("DeedList-Level1-Bold", ["Personal information"]),
      ...L("DeedList-Level2-Normal", [
        "Where Confidential Information includes Personal Information, the Recipient must handle it in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles as if the Recipient were an APP entity, whether or not it is one, and must use it only for the Permitted Purpose.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Recipient must notify the Discloser immediately if it becomes aware of unauthorised access to, or unauthorised disclosure or loss of, Personal Information, and must give the Discloser the assistance it reasonably requires to assess whether the incident is an eligible data breach and to make any notification required under Part IIIC of the Privacy Act 1988 (Cth).",
      ]),

      ...L("DeedList-Level1-Bold", ["Return or destruction"]),
      ...L("DeedList-Level2-Normal", [
        "On written demand by the Discloser, and in any event promptly after the parties cease to pursue the Permitted Purpose, the Recipient must:",
      ]),
      ...L("DeedList-Level3", [
        "return to the Discloser, or destroy, all Confidential Information in its possession or control and all copies of it;",
      ]),
      ...L("DeedList-Level3", [
        "destroy any note, analysis, model or other material prepared by it or its Representatives to the extent it contains or is derived from Confidential Information; and",
      ]),
      ...L("DeedList-Level3", [
        "if the Discloser asks, certify in writing within 10 Business Days, by an officer of the Recipient, that it has complied with this clause.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Clause 6.1 does not require the deletion of material held in a routine electronic backup, or retained to comply with a law, a regulator's requirement or a professional obligation, provided that material is not accessed except for the purpose for which it is retained and remains subject to this agreement.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Returning or destroying Confidential Information does not release the Recipient from any obligation under this agreement.",
      ]),

      ...L("DeedList-Level1-Bold", ["No licence, no representation and no obligation to proceed"]),
      ...L("DeedList-Level2-Normal", [
        "All right, title and interest in Confidential Information remains with the Discloser. Nothing in this agreement transfers, or grants any licence in, any intellectual property, except the limited right to use the Confidential Information for the Permitted Purpose.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Neither party makes any representation or gives any warranty as to the accuracy or completeness of its Confidential Information. Each party relies on its own enquiries and its own advisers, and neither party is liable to the other for any loss arising from reliance on Confidential Information, except under a binding agreement the parties may later enter into.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Nothing in this agreement obliges a party to disclose any information, to continue discussions or to enter into any transaction. Either party may end the discussions at any time, without liability and without giving reasons.",
      ]),

      ...L("DeedList-Level1-Bold", ["Announcements"]),
      ...L("DeedList-Level2-Normal", [
        "A party must not make any public announcement or media statement about the Permitted Purpose, the discussions between the parties or this agreement without the other party's prior written consent, except to the extent required by law or by the rules of a securities exchange, and then only after consulting the other party so far as practicable about the form and content of the announcement.",
      ]),

      ...L(null, ["[Delete clause 9 if a non-solicitation restraint was not agreed.]"]),
      ...L("DeedList-Level1-Bold", ["Non-solicitation"]),
      ...L("DeedList-Level2-Normal", [
        "For ",
        field("non_solicit_period", "Non-solicitation period", "12 months from the date of this agreement"),
        ", a party must not solicit or entice away from the other party any employee or contractor of that other party with whom it dealt as a result of the Permitted Purpose, except in response to a general advertisement that is not directed at that person.",
      ]),

      ...L("DeedList-Level1-Bold", ["Term"]),
      ...L("DeedList-Level2-Normal", [
        "This agreement commences on the date set out at the beginning of it and applies to Confidential Information disclosed at any time, whether before, on or after that date.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The obligations in this agreement continue for ",
        field("confidentiality_term", "How long the obligations last", "three years from the date of this agreement"),
        ", except that obligations in respect of a trade secret and in respect of Personal Information continue for so long as the information retains that character.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The end of this agreement does not affect any right or obligation that has accrued before it ends.",
      ]),

      ...L("DeedList-Level1-Bold", ["Remedies"]),
      ...L("DeedList-Level2-Normal", [
        "Each party acknowledges that damages may not be an adequate remedy for a breach of this agreement, and that the other party is entitled to seek an injunction or specific performance in addition to any other remedy available at law or in equity.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "A Recipient indemnifies the Discloser against any loss, damage, cost or expense the Discloser suffers arising out of a breach of this agreement by the Recipient or its Representatives.",
      ]),

      ...generalProvisions(),
      ...execution("First party", "Second party"),
    ],
  },

  {
    key: "agr.confidentiality_one_way",
    name: "Confidentiality Agreement (One Way)",
    description:
      "One-way NDA in full, drafted for the disclosing party: broad definition, no-contact and no-analysis clauses, return or destruction, term and indemnity.",
    category: "Commercial",
    subcategory: "Confidentiality",
    documentType: "deed",
    requiresReview: true,
    reviewNote:
      "This is drafted for the DISCLOSER. If the firm acts for the recipient, the terms to push back on are the breadth of 'observed or obtained' and 'whether disclosed deliberately or inadvertently'; the no-analysis clause where the recipient has its own development programme; the indemnity in clause 12; the non-solicitation period; and an unlimited term. Check the recipient can actually comply with the return-and-destroy obligation given how its backups work -- a clause it cannot comply with is a breach waiting to be found. Confirm who the nominated contact under clause 5 is before sending, or the no-contact clause has nothing to point at.",
    aiInstructions:
      "Everything flows one way here: the Discloser discloses and the Recipient receives, and no obligation should be expressed reciprocally. The definition of Confidential Information is deliberately wider than in the mutual form -- it catches what the recipient observes on a site visit or in a data room, not only what is handed over -- but the four carve-outs stay, because a definition without them is unenforceable rather than merely wide. Keep the acknowledgment that the Discloser gives no warranty as to accuracy and that the Recipient relies on its own enquiries: it is the clause that stops the NDA being used as a springboard for a misleading-conduct claim. If asked to draft the recipient-side markup instead, work from this document and say which clauses you are narrowing and why.",
    segments: [
      ...L(null, ["CONFIDENTIALITY AGREEMENT (ONE WAY)"]),
      ...L(null, [""]),
      ...opening(
        {
          key: "discloser",
          label: "Disclosing party",
          example: "ACME Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email legal@acme.com.au",
          shortExample: "the Discloser",
        },
        {
          key: "recipient",
          label: "Receiving party",
          example: "Brightside Holdings Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email admin@brightside.com.au",
          shortExample: "the Recipient",
        },
        [
          ...L("DeedRecital", [
            "The Discloser and the Recipient are discussing ",
            field("purpose", "The permitted purpose, stated precisely", "the Recipient's evaluation of a possible purchase of the Discloser's business"),
            " (the Permitted Purpose).",
          ]),
          ...L("DeedRecital", [
            "In connection with the Permitted Purpose the Discloser may disclose to the Recipient information that is confidential to it.",
          ]),
          ...L("DeedRecital", [
            "The Recipient has agreed to keep that information confidential on the terms set out in this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", [
        "Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement.",
      ]),
      ...L("DeedList-Level3", [
        "Confidential Information means all information of or relating to the Discloser or any of its Related Bodies Corporate that is disclosed to, or observed or obtained by, the Recipient or its Representatives in connection with the Permitted Purpose, whether before or after the date of this agreement, in any form, whether or not marked or described as confidential and whether disclosed deliberately or inadvertently, including ",
        field(
          "ci_examples",
          "What is actually being disclosed",
          "financial records, management accounts, customer and supplier lists, pricing, methods of operation, employee details and anything observed during a site visit"
        ),
        ", the fact that the parties are in discussions, the existence and content of this agreement, and any note, analysis, model or other material prepared by the Recipient or its Representatives to the extent it contains or is derived from that information, but does not include information that:",
      ]),
      ...confidentialInformationExceptions(),
      ...L("DeedList-Level3", ["Permitted Purpose has the meaning given in Recital A."]),
      ...L("DeedList-Level3", ["Personal Information has the meaning given in the Privacy Act 1988 (Cth)."]),
      ...L("DeedList-Level3", ["Related Body Corporate has the meaning given in the Corporations Act 2001 (Cth)."]),
      ...L("DeedList-Level3", [
        "Representative means, in relation to the Recipient, its Related Bodies Corporate and the officers, employees, professional advisers and financiers of the Recipient and of its Related Bodies Corporate.",
      ]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", ["The Recipient must:"]),
      ...L("DeedList-Level3", ["keep the Confidential Information confidential;"]),
      ...L("DeedList-Level3", ["use it only for the Permitted Purpose;"]),
      ...L("DeedList-Level3", ["not disclose it to any person except as permitted by clause 4;"]),
      ...L("DeedList-Level3", ["not copy or reproduce it except to the extent reasonably required for the Permitted Purpose;"]),
      ...L("DeedList-Level3", [
        "protect it with at least the degree of care it applies to its own confidential information of similar importance, and in any event with reasonable care;",
      ]),
      ...L("DeedList-Level3", [
        "not use it to obtain a commercial advantage over the Discloser or to compete with the Discloser; and",
      ]),
      ...L("DeedList-Level3", [
        "not analyse, reverse engineer, decompile or disassemble any sample, prototype, source code or other material forming part of the Confidential Information.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Recipient is responsible for any act or omission of its Representatives in relation to the Confidential Information as if it were the Recipient's own act or omission.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Recipient must notify the Discloser as soon as it becomes aware of any unauthorised use, disclosure, access to or loss of Confidential Information, and must take the steps the Discloser reasonably requires to prevent, stop and remedy it.",
      ]),

      ...L("DeedList-Level1-Bold", ["Permitted disclosure"]),
      ...L("DeedList-Level2-Normal", ["The Recipient may disclose Confidential Information:"]),
      ...L("DeedList-Level3", [
        "to a Representative who needs it for the Permitted Purpose, provided the Recipient first informs that Representative of its confidential nature and ensures that it is dealt with in accordance with this agreement;",
      ]),
      ...L("DeedList-Level3", ["with the Discloser's prior written consent, on any conditions of that consent; or"]),
      ...L("DeedList-Level3", [
        "to the extent required by law, by a court, by a government agency or by the rules of a securities exchange, subject to clause 4.2.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Before making a disclosure under clause 4.1(c), the Recipient must, unless prohibited by law from doing so, notify the Discloser as soon as practicable so the Discloser may seek a protective order or other relief, give the Discloser the assistance it reasonably requires for that purpose, and disclose only that part of the Confidential Information it is legally required to disclose.",
      ]),

      ...L("DeedList-Level1-Bold", ["No contact"]),
      ...L("DeedList-Level2-Normal", [
        "The Recipient must not contact any officer, employee, customer, supplier, financier or landlord of the Discloser about the Permitted Purpose except through ",
        field("nominated_contact", "The Discloser's nominated contact", "Jane Smith, Chief Financial Officer of ACME"),
        " or any other person the Discloser nominates in writing.",
      ]),

      ...L("DeedList-Level1-Bold", ["Personal information"]),
      ...L("DeedList-Level2-Normal", [
        "Where Confidential Information includes Personal Information, the Recipient must handle it in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles as if the Recipient were an APP entity, whether or not it is one, and must use it only for the Permitted Purpose.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Recipient must notify the Discloser immediately if it becomes aware of unauthorised access to, or unauthorised disclosure or loss of, Personal Information, and must give the Discloser the assistance it reasonably requires to assess whether the incident is an eligible data breach and to make any notification required under Part IIIC of the Privacy Act 1988 (Cth).",
      ]),

      ...L("DeedList-Level1-Bold", ["Return or destruction"]),
      ...L("DeedList-Level2-Normal", [
        "On written demand by the Discloser, and in any event promptly after the parties cease to pursue the Permitted Purpose, the Recipient must:",
      ]),
      ...L("DeedList-Level3", [
        "return to the Discloser, or destroy, all Confidential Information in its possession or control and all copies of it;",
      ]),
      ...L("DeedList-Level3", [
        "destroy any note, analysis, model or other material prepared by it or its Representatives to the extent it contains or is derived from Confidential Information; and",
      ]),
      ...L("DeedList-Level3", [
        "if the Discloser asks, certify in writing within 10 Business Days, by an officer of the Recipient, that it has complied with this clause.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Clause 7.1 does not require the deletion of material held in a routine electronic backup, or retained to comply with a law, a regulator's requirement or a professional obligation, provided that material is not accessed except for the purpose for which it is retained and remains subject to this agreement.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Returning or destroying Confidential Information does not release the Recipient from any obligation under this agreement.",
      ]),

      ...L("DeedList-Level1-Bold", ["No licence, no representation and no obligation to proceed"]),
      ...L("DeedList-Level2-Normal", [
        "All right, title and interest in the Confidential Information remains with the Discloser. Nothing in this agreement transfers, or grants any licence in, any intellectual property, except the limited right to use the Confidential Information for the Permitted Purpose.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Discloser makes no representation and gives no warranty as to the accuracy or completeness of the Confidential Information. The Recipient relies on its own enquiries and its own advisers, and the Discloser is not liable for any loss the Recipient suffers as a result of relying on the Confidential Information, except under a binding agreement the parties may later enter into.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Nothing in this agreement obliges the Discloser to disclose any information, to continue discussions or to enter into any transaction, or restricts the Discloser from negotiating with any other person.",
      ]),

      ...L("DeedList-Level1-Bold", ["Announcements"]),
      ...L("DeedList-Level2-Normal", [
        "The Recipient must not make any public announcement or media statement about the Permitted Purpose, the discussions between the parties or this agreement without the Discloser's prior written consent, except to the extent required by law or by the rules of a securities exchange, and then only after consulting the Discloser so far as practicable about the form and content of the announcement.",
      ]),

      ...L(null, ["[Delete clause 10 if a non-solicitation restraint was not agreed.]"]),
      ...L("DeedList-Level1-Bold", ["Non-solicitation"]),
      ...L("DeedList-Level2-Normal", [
        "For ",
        field("non_solicit_period", "Non-solicitation period", "12 months from the date of this agreement"),
        ", the Recipient must not solicit or entice away from the Discloser any employee or contractor of the Discloser with whom it dealt as a result of the Permitted Purpose, except in response to a general advertisement that is not directed at that person.",
      ]),

      ...L("DeedList-Level1-Bold", ["Term"]),
      ...L("DeedList-Level2-Normal", [
        "This agreement commences on the date set out at the beginning of it and applies to Confidential Information disclosed at any time, whether before, on or after that date.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The obligations in this agreement continue for ",
        field("confidentiality_term", "How long the obligations last", "three years from the date of this agreement"),
        ", except that obligations in respect of a trade secret and in respect of Personal Information continue for so long as the information retains that character.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The end of this agreement does not affect any right or obligation that has accrued before it ends.",
      ]),

      ...L("DeedList-Level1-Bold", ["Remedies"]),
      ...L("DeedList-Level2-Normal", [
        "The Recipient acknowledges that damages may not be an adequate remedy for a breach of this agreement, and that the Discloser is entitled to seek an injunction or specific performance in addition to any other remedy available at law or in equity.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Recipient indemnifies the Discloser against any loss, damage, cost or expense the Discloser suffers arising out of a breach of this agreement by the Recipient or its Representatives.",
      ]),

      ...generalProvisions(),
      ...execution("Disclosing party", "Receiving party"),
    ],
  },
];
