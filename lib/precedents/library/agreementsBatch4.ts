// lib/precedents/library/agreementsBatch4.ts
// Full commercial agreements, continuing agreementsBatch1.ts -- 3.ts: a
// shareholders agreement.
//
// A shareholders agreement is written for three parties, not two: two (or
// more) Shareholders and the Company itself, which needs to be a party so it
// can be bound by, and enforce, things a constitution alone can't reach --
// registering a transfer only if it complies with this agreement, calling
// board meetings the way this agreement requires. agreementParts.ts's shared
// opening()/execution() are built for exactly two parties, so this document
// has its own, on the same pattern agr.terms_of_trade used in
// agreementsBatch2.ts for the same reason. The bracketed note at the top
// tells the drafter how to extend it past two Shareholders, since most
// real companies this precedent will be used for have more than two.
//
// documentType is "deed" for the same reason as every other agreement in
// this library -- it's the rendering hint that routes generation through the
// firm's own deed template, not a signal that this document is executed with
// deed words. It says "Executed by" throughout, not "Signed, sealed and
// delivered".
import { field, type PrecedentSeed } from "./types";
import { L, executionLines, CHOOSE_EXECUTION_BLOCK_NOTE } from "./instrumentParts";
import { interpretation, confidentialInformationExceptions } from "./agreementParts";
import { executedAsLine } from "@/lib/precedents/executionClauses";
import { DEED_PAGE_BREAK, deedCover } from "@/lib/precedents/deedDocx";

export const AGREEMENTS_BATCH_4: PrecedentSeed[] = [
  {
    key: "agr.shareholders_agreement",
    name: "Shareholders Agreement",
    description:
      "Full shareholders agreement for two or more shareholders and the company: board rights, reserved matters, funding default, transfer restrictions with pre-emption and tag/drag-along, compulsory transfer events, a valuation mechanism and deadlock resolution.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    requiresReview: true,
    reviewNote:
      "This is drafted for exactly two Shareholders plus the Company -- for a third or further Shareholder, duplicate the party block in the opening, add them to every shareholding percentage and reserved-matter threshold, and add their own execution block. The two clauses that matter most and are most often left vague are the valuation mechanism (clause 12) and the compulsory transfer triggers (clause 11) -- confirm both against what these specific Shareholders actually want to happen on death, incapacity, bankruptcy and cessation of employment, rather than leaving the drafted defaults. Check the deadlock mechanism in clause 13 is genuinely workable for these Shareholders -- a shotgun/buy-sell clause only works between parties who can each plausibly afford to buy the other out; if the Shareholders are not evenly resourced, a different deadlock mechanism may be needed. Confirm the reserved matters in clause 5 are amended to match the Company's constitution, and that the constitution itself is (or will be) amended for consistency -- clause 3 records that this agreement prevails between the Shareholders, but a constitution that still says something different is a standing source of confusion for anyone who doesn't have a copy of this agreement.",
    aiInstructions:
      "Draft a shareholders agreement between two Shareholders and the Company. Give each Shareholder board appointment rights proportional to what was actually agreed (by shareholding, or a fixed number regardless of shareholding) rather than assuming an even split. Draft reserved matters as a genuine list of major decisions requiring special or unanimous Shareholder consent -- issuing shares, borrowing above a threshold, selling the business, changing the constitution, appointing or removing the CEO -- specific enough to be checked against a real board minute, not a generic reference to 'major decisions'. On funding default, give a real consequence: dilution calculated by a stated formula, or a shareholder loan on stated terms, not just a bare obligation to contribute. Build pre-emption, tag-along and drag-along as three distinct mechanisms operating in sequence on a proposed transfer, not one blended clause. Make the valuation mechanism concrete -- an independent expert appointed by a named professional body if the parties can't agree one, valuing on a stated basis (fair market value, no minority discount) -- because a valuation clause that just says 'fair value' invites exactly the dispute it exists to avoid. Build deadlock resolution as an escalation: negotiation, then mediation, then a buy-sell mechanism as the last resort, not straight to a forced sale. Keep the relationship with the constitution explicit: this agreement prevails between the Shareholders, and they must vote to keep the constitution consistent with it.",
    segments: [
      ...L(null, [deedCover({
        title: "SHAREHOLDERS AGREEMENT",
        parties: [
          "[First Shareholder: name, ACN/ABN, address and email]",
          "[Second Shareholder: name, ACN/ABN, address and email]",
          "[Company: name, ACN and registered office]",
        ],
      })]),
      ...L(null, [DEED_PAGE_BREAK]),
      ...L(null, [
        "[This precedent is drafted for two Shareholders. For a third or further Shareholder, duplicate the party block below, and add them to every shareholding percentage, reserved-matter threshold and execution block throughout.]",
      ]),
      ...L(null, [""]),
      ...L(null, ["Date: ", field("agreement_date", "Date of the agreement", "12 August 2026")]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Parties"]),
      ...L(null, [field("shareholder_a", "First Shareholder: name, ACN/ABN, address and email", "Jane Citizen of 10 Smith Street, Parramatta NSW 2150, email jane@example.com.au")]),
      ...L(null, ["(", field("shareholder_a_short", "First Shareholder short name", "Jane"), ")"]),
      ...L(null, [""]),
      ...L(null, [field("shareholder_b", "Second Shareholder: name, ACN/ABN, address and email", "John Citizen of 15 Smith Street, Parramatta NSW 2150, email john@example.com.au")]),
      ...L(null, ["(", field("shareholder_b_short", "Second Shareholder short name", "John"), ")"]),
      ...L(null, [""]),
      ...L(null, [field("company", "Company: name, ACN and registered office", "ACME Trading Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000")]),
      ...L(null, ["(the ", field("company_short", "Company short name", "Company"), ")"]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Background"]),
      ...L("DeedRecital", [
        "The Shareholders are the registered holders of the whole of the issued share capital of the Company, in the proportions set out in Schedule 1.",
      ]),
      ...L("DeedRecital", [
        "The Shareholders and the Company have agreed to regulate their relationship as shareholders, and the affairs of the Company, on the terms of this agreement.",
      ]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Operative Provisions"]),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Board means the board of directors of the Company."]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", ["Business means the business carried on by the Company from time to time."]),
      ...L("DeedList-Level3", ["Compulsory Transfer Event has the meaning given in clause 11.1."]),
      ...L("DeedList-Level3", [
        "Confidential Information means all information of or relating to a party or the Company that is disclosed to, or obtained by, another party in connection with this agreement or the Business, but does not include information that:",
      ]),
      ...confidentialInformationExceptions(),
      ...L("DeedList-Level3", ["Constitution means the constitution of the Company in effect from time to time."]),
      ...L("DeedList-Level3", ["Directors means the directors of the Company for the time being."]),
      ...L("DeedList-Level3", ["Fair Value has the meaning given in clause 12."]),
      ...L("DeedList-Level3", ["Reserved Matter means a matter listed in Schedule 2."]),
      ...L("DeedList-Level3", ["Shareholders means the parties named above as Shareholders, and Shareholder means any one of them."]),
      ...L("DeedList-Level3", ["Shares means the shares in the capital of the Company held by a Shareholder from time to time."]),
      ...L("DeedList-Level3", ["Transfer means a sale, transfer, assignment, grant of an option or security interest, or other disposal of a Share or any interest in it."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Relationship with the constitution"]),
      ...L("DeedList-Level2-Normal", [
        "If there is any inconsistency between this agreement and the Constitution, this agreement prevails between the Shareholders and the Company to the extent permitted by law, and the Shareholders must exercise their votes and other powers to amend the Constitution to remove the inconsistency.",
      ]),

      ...L("DeedList-Level1-Bold", ["Board of directors"]),
      ...L("DeedList-Level2-Normal", [
        "Each Shareholder holding at least ",
        field("board_appointment_threshold", "Minimum shareholding to appoint a director", "20%"),
        " of the Shares may appoint and remove ",
        field("directors_per_shareholder", "Directors each qualifying Shareholder may appoint", "one director"),
        " by written notice to the Company and the other Shareholders.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Board must meet at least ",
        field("board_meeting_frequency", "Minimum board meeting frequency", "quarterly"),
        ", on reasonable notice to every Director, and a quorum is ",
        field("board_quorum", "Board quorum", "at least one director appointed by each Shareholder entitled to appoint one"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Subject to the Reserved Matters, the Board manages the Business and may decide any matter by a majority of the Directors present at a quorate meeting.",
      ]),

      ...L("DeedList-Level1-Bold", ["Reserved matters"]),
      ...L("DeedList-Level2-Normal", [
        "The Company must not, and the Shareholders must ensure the Company does not, do anything listed in Schedule 2 (a Reserved Matter) without the prior written consent of Shareholders holding at least ",
        field("reserved_matter_threshold", "Consent threshold for a Reserved Matter", "75%"),
        " of the Shares.",
      ]),

      ...L("DeedList-Level1-Bold", ["Funding"]),
      ...L("DeedList-Level2-Normal", [
        "A Shareholder is not obliged to provide funding to the Company beyond the amount it has already subscribed for its Shares, except as the Shareholders unanimously agree in writing.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Shareholders agree that further funding is required and a Shareholder does not contribute its proportionate share within ",
        field("funding_default_period", "Period to contribute agreed further funding", "20 Business Days"),
        ", the contributing Shareholders may either treat the shortfall as a loan to the Company from the contributing Shareholders on terms they agree, or subscribe for further Shares themselves at the price per Share last agreed by the Shareholders, diluting the non-contributing Shareholder's percentage holding accordingly.",
      ]),

      ...L("DeedList-Level1-Bold", ["Dividend policy"]),
      ...L("DeedList-Level2-Normal", [
        "Subject to the Company having sufficient profits and cash available, and subject to any Reserved Matter, the Board must recommend, and the Shareholders must resolve to declare, a dividend of ",
        field("dividend_policy", "Dividend policy", "50% of after-tax profit for each financial year, unless the Shareholders unanimously agree otherwise"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Transfer restrictions and pre-emption"]),
      ...L("DeedList-Level2-Normal", [
        "A Shareholder must not Transfer any Share except in accordance with this clause 8, clause 9 (tag-along), clause 10 (drag-along) or clause 11 (compulsory transfer).",
      ]),
      ...L("DeedList-Level2-Normal", [
        "A Shareholder wishing to Transfer Shares (the Selling Shareholder) must first offer them to the other Shareholders, in proportion to their existing holdings, at the price and on the terms of the proposed Transfer, by written notice (a Transfer Notice).",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Each other Shareholder has ",
        field("preemption_period", "Period to accept a pre-emption offer", "20 Business Days"),
        " from the Transfer Notice to accept, in whole or in part. If the offer is not accepted for all the offered Shares, the Selling Shareholder may Transfer the untaken Shares to the original proposed transferee, at no lower a price and on no more favourable terms, within ",
        field("preemption_longstop", "Period within which the outside sale must complete once pre-emption lapses", "60 Business Days"),
        " after that, failing which the Shares must be re-offered under this clause 8.",
      ]),

      ...L("DeedList-Level1-Bold", ["Tag-along"]),
      ...L("DeedList-Level2-Normal", [
        "If a Selling Shareholder proposes to Transfer Shares that, together with Shares already held by the proposed transferee and its associates, would result in the transferee holding more than ",
        field("tag_along_threshold", "Shareholding that triggers tag-along", "50%"),
        " of the Shares, each other Shareholder may require the Selling Shareholder to procure that the transferee also buys that Shareholder's Shares, on the same price and terms, in proportion to (or all of) that Shareholder's holding, by written notice within the period allowed for pre-emption under clause 8.3.",
      ]),

      ...L("DeedList-Level1-Bold", ["Drag-along"]),
      ...L("DeedList-Level2-Normal", [
        "If Shareholders holding at least ",
        field("drag_along_threshold", "Shareholding needed to trigger drag-along", "75%"),
        " of the Shares (the Dragging Shareholders) agree to Transfer all of their Shares to a bona fide third party, the Dragging Shareholders may require every other Shareholder to Transfer all of their Shares to the same transferee, on the same price and terms, by written notice to those Shareholders.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "A Shareholder required to Transfer under this clause 10 must do so, and must execute any document reasonably required to give effect to the Transfer, and if it fails to do so within a reasonable time the Company may authorise a Director to execute the transfer on that Shareholder's behalf.",
      ]),

      ...L("DeedList-Level1-Bold", ["Compulsory transfer"]),
      ...L("DeedList-Level2-Normal", ["Each of the following is a Compulsory Transfer Event in relation to a Shareholder who is an individual:"]),
      ...L("DeedList-Level3", ["death;"]),
      ...L("DeedList-Level3", ["a court or medical practitioner determining the Shareholder lacks capacity to manage their own affairs;"]),
      ...L("DeedList-Level3", ["the Shareholder becoming bankrupt or entering into any arrangement with their creditors; and"]),
      ...L("DeedList-Level3", [
        field("cessation_trigger", "Whether cessation of employment/office is also a Compulsory Transfer Event", "the Shareholder ceasing to be an employee or director of the Company (see clause 11.3 for the price if this is for cause)"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "On a Compulsory Transfer Event, the affected Shareholder (or their legal personal representative) must offer all of their Shares to the other Shareholders, in proportion to their existing holdings, at Fair Value, by written notice within ",
        field("compulsory_transfer_notice_period", "Period to give a compulsory transfer offer notice", "20 Business Days"),
        " of the event, and if no notice is given the other Shareholders may require the transfer by written notice instead.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "[Good leaver / bad leaver: if cessation of employment is a Compulsory Transfer Event under clause 11.1(d) and is for cause (a bad leaver), the price is ",
        field("bad_leaver_price", "Bad leaver price", "the lower of Fair Value and the amount the Shareholder originally paid for the Shares"),
        " rather than Fair Value.]",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Each other Shareholder has the same period as clause 8.3 to accept an offer under this clause 11, and clause 8.3's mechanism for Shares that are not accepted applies, except that the Shares must be offered again under this clause 11 rather than being available for sale to an outside party.",
      ]),

      ...L("DeedList-Level1-Bold", ["Valuation"]),
      ...L("DeedList-Level2-Normal", [
        "Fair Value means the price the Shareholders agree in writing within ",
        field("valuation_agreement_period", "Period to agree Fair Value before it goes to an expert", "20 Business Days"),
        " of it being required under this agreement or, failing agreement, the value determined by an independent expert appointed by agreement between the relevant Shareholders or, failing agreement within a further 10 Business Days, by the person then holding office as President of ",
        field("valuation_appointing_body", "Body to appoint the valuer if the parties can't agree one", "the Institute of Chartered Accountants Australia and New Zealand"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The expert must value the relevant Shares as a proportionate part of the value of the Company as a whole, on a going concern basis, between a willing but not anxious buyer and a willing but not anxious seller, without any discount for the Shares being a minority holding and without any premium for the Shares carrying control. The expert acts as an expert and not an arbitrator, and their determination is final and binding on the parties, absent manifest error. The cost of the expert is borne equally by the Shareholders whose Shares are being valued and the Shareholders acquiring them, unless the expert directs otherwise.",
      ]),

      ...L("DeedList-Level1-Bold", ["Deadlock"]),
      ...L("DeedList-Level2-Normal", [
        "A deadlock exists if the Board or the Shareholders cannot reach a decision on a matter properly put to them, after a reasonable number of attempts, because the votes for and against are equal or a required majority or unanimity cannot be reached (a Deadlock).",
      ]),
      ...L("DeedList-Level2-Normal", [
        "On a Deadlock, any Shareholder may give notice to the others, and the Shareholders' most senior representatives must meet and use reasonable endeavours to resolve it within 10 Business Days.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Deadlock is not resolved under clause 13.2, any Shareholder may refer it to mediation administered by ",
        field("mediation_body", "Mediation body", "the Resolution Institute"),
        ", and the Shareholders must attend the mediation in good faith.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Deadlock is not resolved within ",
        field("deadlock_mediation_period", "Period after mediation starts before the buy-sell mechanism is available", "20 Business Days"),
        " of the mediation starting, any Shareholder (the Offeror) may give the other (the Offeree) a notice stating a price per Share (a Shotgun Notice). The Offeree must, within ",
        field("shotgun_response_period", "Period to respond to a Shotgun Notice", "20 Business Days"),
        ", elect either to sell all of its Shares to the Offeror at that price, or to buy all of the Offeror's Shares at that price, and if the Offeree does not elect within that period it is taken to have elected to sell.",
      ]),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must keep confidential, and not disclose except to its professional advisers, financiers or as required by law, all Confidential Information, except to the extent it is or becomes public other than through a breach of this clause.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "This clause survives a Shareholder ceasing to hold Shares and continues for ",
        field("confidentiality_term", "How long confidentiality survives after a Shareholder exits", "three years after that Shareholder ceases to hold Shares"),
        ".",
      ]),

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
        "No variation of this agreement is effective unless it is in writing and signed by every party.",
      ]),
      ...L("DeedList-Level2-Bold", ["Waiver"]),
      ...L("DeedList-Level2-NoNumbering", [
        "A right under this agreement may only be waived in writing signed by the party giving the waiver. Failure to exercise a right, or delay in exercising it, is not a waiver of that right or of any other right.",
      ]),
      ...L("DeedList-Level2-Bold", ["Assignment"]),
      ...L("DeedList-Level2-NoNumbering", [
        "A party must not assign or otherwise deal with its rights under this agreement, except by a Transfer of Shares permitted under this agreement, without the prior written consent of every other party.",
      ]),
      ...L("DeedList-Level2-Bold", ["New shareholders"]),
      ...L("DeedList-Level2-NoNumbering", [
        "The Company must not register a Transfer of Shares, or issue new Shares, to any person unless that person has first agreed in writing to be bound by this agreement as if it were a Shareholder.",
      ]),
      ...L("DeedList-Level2-Bold", ["Severance"]),
      ...L("DeedList-Level2-NoNumbering", [
        "If a provision of this agreement is void, voidable or unenforceable, it is to be read down so far as necessary to make it valid, and if it cannot be read down it is severed, without affecting the validity of the rest of this agreement.",
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

      ...L(null, [""]),
      ...L(null, [DEED_PAGE_BREAK]),
      ...L("DeedHeading", ["Execution"]),
      ...L(null, [executedAsLine("agreement")]),
      ...L(null, [""]),
      ...L(null, [CHOOSE_EXECUTION_BLOCK_NOTE]),
      ...L(null, [""]),
      ...executionLines("individual", "agreement", "First Shareholder"),
      ...L(null, [""]),
      ...executionLines("individual", "agreement", "Second Shareholder"),
      ...L(null, [""]),
      ...executionLines("company_127_two_officers", "agreement", "Company"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Shareholdings"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("shareholdings", "Each Shareholder's holding: class, number and percentage", "Jane: 60 ordinary shares (60%). John: 40 ordinary shares (40%)."),
      ]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 2 -- Reserved Matters"]),
      ...L("DeedList-Level2-NoNumbering", [
        "Each of the following is a Reserved Matter:",
      ]),
      ...L("DeedList-Level3", ["altering the Constitution;"]),
      ...L("DeedList-Level3", ["issuing, redeeming or buying back any Share or other security, or granting any option over one;"]),
      ...L("DeedList-Level3", ["borrowing, or granting any security interest, above ", field("borrowing_threshold", "Borrowing threshold requiring consent", "$50,000"), " in aggregate;"]),
      ...L("DeedList-Level3", ["selling, leasing or disposing of the whole or a substantial part of the Business or the Company's assets;"]),
      ...L("DeedList-Level3", ["appointing or removing the Company's auditor, or changing its accounting policies;"]),
      ...L("DeedList-Level3", ["appointing or removing a chief executive officer or equivalent senior manager, or materially varying that person's remuneration;"]),
      ...L("DeedList-Level3", ["commencing or settling litigation above ", field("litigation_threshold", "Litigation threshold requiring consent", "$50,000"), " in value;"]),
      ...L("DeedList-Level3", ["entering into any contract outside the ordinary course of the Business above ", field("contract_threshold", "Out-of-ordinary-course contract threshold requiring consent", "$50,000"), " in value; and"]),
      ...L("DeedList-Level3", ["voluntarily winding up, or applying for the administration or liquidation of, the Company."]),
    ],
  },
];
