// lib/precedents/library/agreementsBatch5.ts
// Full commercial agreements, continuing agreementsBatch1.ts -- 4.ts: a
// unitholders agreement, a partnership agreement, and a joint venture
// agreement.
//
// The unitholders agreement is the shareholders agreement's structural
// sibling -- the same commercial concerns (control, transfer, exit,
// deadlock) arise wherever two or more people co-own an entity through
// tradeable interests -- but it isn't a search-and-replace of it. A unit
// trust has no board to appoint into; control runs through the Trustee (a
// corporate trustee's own board), and distributions aren't discretionary the
// way dividends are -- the Unit Trust Deed in deedsBatch3.ts already
// requires the Trustee to distribute Distributable Income each year, so this
// agreement's distribution clause works alongside that obligation rather
// than creating a competing one. Clause 3 (relationship with the trust deed)
// is this document's equivalent of the shareholders agreement's clause 3:
// the trust deed governs the Trustee's powers and duties, this agreement
// governs the Unitholders' relationship with each other, and the two need to
// be read together rather than in competition.
//
// The partnership agreement and the joint venture agreement are built around
// the one distinction that matters most in each: a partnership agreement
// exists to manage joint and several liability, which the agreement cannot
// remove (only the Partnership Act default terms it can and does displace);
// a joint venture agreement exists to avoid that same liability arising by
// accident, so its central move is an explicit no-partnership clause and
// participants taking their own share of output severally rather than
// jointly. This one is drafted as an unincorporated (contractual) JV -- an
// incorporated JV is a company, and this library's Shareholders Agreement is
// the right precedent for that structure; drafting it twice under two names
// would just be the same document with different labels.
import { field, type PrecedentSeed } from "./types";
import { L, executionLines, CHOOSE_EXECUTION_BLOCK_NOTE } from "./instrumentParts";
import { opening, interpretation, generalProvisions, execution, confidentialInformationExceptions } from "./agreementParts";
import { executedAsLine } from "@/lib/precedents/executionClauses";
import { DEED_PAGE_BREAK, deedCover } from "@/lib/precedents/deedDocx";

const COMMERCIAL = ["Commercial"];

export const AGREEMENTS_BATCH_5: PrecedentSeed[] = [
  // ── Unitholders agreement ────────────────────────────────────────
  {
    key: "agr.unitholders_agreement",
    name: "Unitholders Agreement",
    description:
      "Full unitholders agreement for two or more unitholders and the trustee: control of the trustee, reserved matters, transfer restrictions with pre-emption and tag/drag-along, compulsory transfer, valuation, deadlock, and how it sits alongside the trust deed.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "This is drafted for exactly two Unitholders plus the Trustee -- for a third or further Unitholder, duplicate the party block in the opening and add them to every unitholding percentage, reserved-matter threshold and execution block. Check this agreement against the actual Unit Trust Deed it accompanies -- clause 3 assumes the deed already requires the Trustee to distribute Distributable Income annually (this library's own Unit Trust Deed precedent does); if the deed the Unitholders are actually using doesn't, clause 7 needs to do that work instead. As with a shareholders agreement, the valuation mechanism (clause 11) and the compulsory transfer triggers (clause 10) are the clauses most often left as drafted without being tested against what these specific Unitholders actually want.",
    aiInstructions:
      "Draft a unitholders agreement between two Unitholders and the Trustee of a unit trust. Keep the relationship with the trust deed explicit and correctly divided: the trust deed governs the Trustee's powers, duties and the Units' fixed entitlements; this agreement governs the Unitholders' relationship with each other -- who controls the Trustee, who may transfer to whom, what happens on exit. Control of the Trustee runs through appointing directors to the Trustee company (or, if the Trustee is an individual, through a separate deed of covenant), not through a board of the trust itself, since a trust has no board. Build the transfer mechanism the same way a shareholders agreement does -- pre-emption, then tag-along, then drag-along as three distinct sequential mechanisms -- and the same concrete valuation mechanism (an independent expert appointed by a named professional body, valuing without a minority discount). Do not duplicate the trust deed's distribution mechanism; refer to it instead, and only add a distribution-policy clause here if the deed itself leaves the Trustee some discretion the Unitholders want to fetter.",
    segments: [
      ...L(null, [deedCover({
        title: "UNITHOLDERS AGREEMENT",
        parties: [
          "[First Unitholder: name, ACN/ABN, address and email]",
          "[Second Unitholder: name, ACN/ABN, address and email]",
          "[Trustee: name, ACN and registered office]",
        ],
      })]),
      ...L(null, [DEED_PAGE_BREAK]),
      ...L(null, [
        "[This precedent is drafted for two Unitholders. For a third or further Unitholder, duplicate the party block below, and add them to every unitholding percentage, reserved-matter threshold and execution block throughout.]",
      ]),
      ...L(null, [""]),
      ...L(null, ["Date: ", field("agreement_date", "Date of the agreement", "12 August 2026")]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Parties"]),
      ...L(null, [field("unitholder_a", "First Unitholder: name, ACN/ABN, address and email", "Jane Citizen of 10 Smith Street, Parramatta NSW 2150, email jane@example.com.au")]),
      ...L(null, ["(", field("unitholder_a_short", "First Unitholder short name", "Jane"), ")"]),
      ...L(null, [""]),
      ...L(null, [field("unitholder_b", "Second Unitholder: name, ACN/ABN, address and email", "John Citizen of 15 Smith Street, Parramatta NSW 2150, email john@example.com.au")]),
      ...L(null, ["(", field("unitholder_b_short", "Second Unitholder short name", "John"), ")"]),
      ...L(null, [""]),
      ...L(null, [field("trustee", "Trustee: name, ACN and registered office", "ACME Trustee Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000")]),
      ...L(null, ["(the ", field("trustee_short", "Trustee short name", "Trustee"), ")"]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Background"]),
      ...L("DeedRecital", [
        "The Trustee is the trustee of ",
        field("trust_name", "The trust: name and date of the trust deed", "the Sample Unit Trust, established by deed dated 12 August 2026"),
        " (the Trust), and the Unitholders are the registered holders of the whole of the issued Units, in the proportions set out in Schedule 1.",
      ]),
      ...L("DeedRecital", [
        "The Unitholders and the Trustee have agreed to regulate their relationship as Unitholders, and the affairs of the Trust, on the terms of this agreement, alongside the trust deed establishing the Trust (the Trust Deed).",
      ]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Operative Provisions"]),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", ["Compulsory Transfer Event has the meaning given in clause 10.1."]),
      ...L("DeedList-Level3", [
        "Confidential Information means all information of or relating to a party or the Trust that is disclosed to, or obtained by, another party in connection with this agreement or the Trust, but does not include information that:",
      ]),
      ...confidentialInformationExceptions(),
      ...L("DeedList-Level3", ["Fair Value has the meaning given in clause 11."]),
      ...L("DeedList-Level3", ["Reserved Matter means a matter listed in Schedule 2."]),
      ...L("DeedList-Level3", ["Trust and Trust Deed have the meanings given in Recital A."]),
      ...L("DeedList-Level3", ["Trustee Directors means the directors of the Trustee for the time being."]),
      ...L("DeedList-Level3", ["Units and Unitholders have the meanings given in the Trust Deed, and Unitholder means any one of the Unitholders."]),
      ...L("DeedList-Level3", ["Transfer means a sale, transfer, assignment, grant of an option or security interest, or other disposal of a Unit or any interest in it."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Relationship with the trust deed"]),
      ...L("DeedList-Level2-Normal", [
        "The Trust Deed governs the Trustee's powers, duties and the Units' entitlements, and nothing in this agreement limits or varies the Trust Deed. This agreement governs the relationship between the Unitholders, and between the Unitholders and the Trustee, in addition to the Trust Deed.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If there is any inconsistency between this agreement and the Trust Deed as to a matter this agreement governs under clause 3.1, this agreement prevails as between the Unitholders and the Trustee, to the extent permitted by law and by the Trust Deed's own amendment power.",
      ]),

      ...L("DeedList-Level1-Bold", ["Control of the trustee"]),
      ...L("DeedList-Level2-Normal", [
        "Each Unitholder holding at least ",
        field("trustee_appointment_threshold", "Minimum unitholding to appoint a Trustee Director", "20%"),
        " of the Units may appoint and remove ",
        field("trustee_directors_per_unitholder", "Trustee Directors each qualifying Unitholder may appoint", "one Trustee Director"),
        " by written notice to the Trustee and the other Unitholders, and the Unitholders must exercise their rights (including any power to appoint or remove the Trustee itself) to give effect to this clause.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee Directors must meet at least ",
        field("board_meeting_frequency", "Minimum meeting frequency", "quarterly"),
        ", on reasonable notice to every Trustee Director, and a quorum is ",
        field("board_quorum", "Quorum", "at least one Trustee Director appointed by each Unitholder entitled to appoint one"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Reserved matters"]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee must not, and the Unitholders must ensure the Trustee does not, do anything listed in Schedule 2 (a Reserved Matter) without the prior written consent of Unitholders holding at least ",
        field("reserved_matter_threshold", "Consent threshold for a Reserved Matter", "75%"),
        " of the Units.",
      ]),

      ...L("DeedList-Level1-Bold", ["Funding"]),
      ...L("DeedList-Level2-Normal", [
        "A Unitholder is not obliged to provide funding to the Trust beyond the amount it has already subscribed for its Units, except as the Unitholders unanimously agree in writing.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Unitholders agree that further funding is required and a Unitholder does not contribute its proportionate share within ",
        field("funding_default_period", "Period to contribute agreed further funding", "20 Business Days"),
        ", the contributing Unitholders may either treat the shortfall as a loan to the Trustee from the contributing Unitholders on terms they agree, or subscribe for further Units themselves at the price per Unit last agreed by the Unitholders, diluting the non-contributing Unitholder's percentage holding accordingly.",
      ]),

      ...L("DeedList-Level1-Bold", ["Distributions"]),
      ...L("DeedList-Level2-Normal", [
        "The Unitholders acknowledge that the Trust Deed requires the Trustee to distribute Distributable Income to the Unitholders each financial year, and nothing in this agreement authorises the Trustee to accumulate income or withhold a distribution the Trust Deed requires.",
      ]),
      ...L(null, ["[Add a distribution-policy clause here only if the Trust Deed leaves the Trustee a genuine discretion over distributions that the Unitholders want to fetter. The Trust Deed this agreement assumes does not.]"]),

      ...L("DeedList-Level1-Bold", ["Transfer restrictions and pre-emption"]),
      ...L("DeedList-Level2-Normal", [
        "A Unitholder must not Transfer any Unit except in accordance with this clause 8, clause 9 (tag-along and drag-along) or clause 10 (compulsory transfer).",
      ]),
      ...L("DeedList-Level2-Normal", [
        "A Unitholder wishing to Transfer Units (the Selling Unitholder) must first offer them to the other Unitholders, in proportion to their existing holdings, at the price and on the terms of the proposed Transfer, by written notice (a Transfer Notice).",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Each other Unitholder has ",
        field("preemption_period", "Period to accept a pre-emption offer", "20 Business Days"),
        " from the Transfer Notice to accept, in whole or in part. If the offer is not accepted for all the offered Units, the Selling Unitholder may Transfer the untaken Units to the original proposed transferee, at no lower a price and on no more favourable terms, within ",
        field("preemption_longstop", "Period within which the outside sale must complete once pre-emption lapses", "60 Business Days"),
        " after that, failing which the Units must be re-offered under this clause 8.",
      ]),

      ...L("DeedList-Level1-Bold", ["Tag-along and drag-along"]),
      ...L("DeedList-Level2-Normal", [
        "If a Selling Unitholder proposes to Transfer Units that, together with Units already held by the proposed transferee and its associates, would result in the transferee holding more than ",
        field("tag_along_threshold", "Unitholding that triggers tag-along", "50%"),
        " of the Units, each other Unitholder may require the Selling Unitholder to procure that the transferee also buys that Unitholder's Units, on the same price and terms, by written notice within the period allowed for pre-emption under clause 8.3.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If Unitholders holding at least ",
        field("drag_along_threshold", "Unitholding needed to trigger drag-along", "75%"),
        " of the Units (the Dragging Unitholders) agree to Transfer all of their Units to a bona fide third party, the Dragging Unitholders may require every other Unitholder to Transfer all of their Units to the same transferee, on the same price and terms, by written notice.",
      ]),

      ...L("DeedList-Level1-Bold", ["Compulsory transfer"]),
      ...L("DeedList-Level2-Normal", ["Each of the following is a Compulsory Transfer Event in relation to a Unitholder who is an individual:"]),
      ...L("DeedList-Level3", ["death;"]),
      ...L("DeedList-Level3", ["a court or medical practitioner determining the Unitholder lacks capacity to manage their own affairs; and"]),
      ...L("DeedList-Level3", ["the Unitholder becoming bankrupt or entering into any arrangement with their creditors."]),
      ...L("DeedList-Level2-Normal", [
        "On a Compulsory Transfer Event, the affected Unitholder (or their legal personal representative) must offer all of their Units to the other Unitholders, in proportion to their existing holdings, at Fair Value, by written notice within ",
        field("compulsory_transfer_notice_period", "Period to give a compulsory transfer offer notice", "20 Business Days"),
        " of the event, and if no notice is given the other Unitholders may require the transfer by written notice instead. Clause 8.3's mechanism for Units that are not accepted applies, except that the Units must be offered again under this clause 10 rather than being available for sale to an outside party.",
      ]),

      ...L("DeedList-Level1-Bold", ["Valuation"]),
      ...L("DeedList-Level2-Normal", [
        "Fair Value means the price the Unitholders agree in writing within ",
        field("valuation_agreement_period", "Period to agree Fair Value before it goes to an expert", "20 Business Days"),
        " of it being required under this agreement or, failing agreement, the value determined by an independent expert appointed by agreement between the relevant Unitholders or, failing agreement within a further 10 Business Days, by the person then holding office as President of ",
        field("valuation_appointing_body", "Body to appoint the valuer if the parties can't agree one", "the Institute of Chartered Accountants Australia and New Zealand"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The expert must value the relevant Units as a proportionate part of the value of the Trust Fund as a whole, on a going concern basis, without any discount for the Units being a minority holding and without any premium for the Units carrying control. The expert acts as an expert and not an arbitrator, and their determination is final and binding on the parties, absent manifest error.",
      ]),

      ...L("DeedList-Level1-Bold", ["Deadlock"]),
      ...L("DeedList-Level2-Normal", [
        "A deadlock exists if the Trustee Directors or the Unitholders cannot reach a decision on a matter properly put to them, after a reasonable number of attempts, because the votes for and against are equal or a required majority or unanimity cannot be reached (a Deadlock).",
      ]),
      ...L("DeedList-Level2-Normal", [
        "On a Deadlock, any Unitholder may give notice to the others, and the Unitholders' most senior representatives must meet and use reasonable endeavours to resolve it within 10 Business Days, failing which any Unitholder may refer it to mediation administered by ",
        field("mediation_body", "Mediation body", "the Resolution Institute"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Deadlock is not resolved within ",
        field("deadlock_mediation_period", "Period after mediation starts before the buy-sell mechanism is available", "20 Business Days"),
        " of the mediation starting, any Unitholder (the Offeror) may give the other (the Offeree) a notice stating a price per Unit (a Shotgun Notice). The Offeree must, within ",
        field("shotgun_response_period", "Period to respond to a Shotgun Notice", "20 Business Days"),
        ", elect either to sell all of its Units to the Offeror at that price, or to buy all of the Offeror's Units at that price, and if the Offeree does not elect within that period it is taken to have elected to sell.",
      ]),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must keep confidential, and not disclose except to its professional advisers, financiers or as required by law, all Confidential Information, except to the extent it is or becomes public other than through a breach of this clause.",
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
      ...L("DeedList-Level2-Bold", ["New unitholders"]),
      ...L("DeedList-Level2-NoNumbering", [
        "The Trustee must not register a Transfer of Units, or issue new Units, to any person unless that person has first agreed in writing to be bound by this agreement as if it were a Unitholder.",
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
      ...executionLines("individual", "agreement", "First Unitholder"),
      ...L(null, [""]),
      ...executionLines("individual", "agreement", "Second Unitholder"),
      ...L(null, [""]),
      ...executionLines("company_127_two_officers", "agreement", "Trustee"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1: Unitholdings"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("unitholdings", "Each Unitholder's holding: number and percentage", "Jane: 60 Units (60%). John: 40 Units (40%)."),
      ]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 2: Reserved Matters"]),
      ...L("DeedList-Level2-NoNumbering", ["Each of the following is a Reserved Matter:"]),
      ...L("DeedList-Level3", ["amending the Trust Deed;"]),
      ...L("DeedList-Level3", ["issuing further Units, or redeeming any Unit;"]),
      ...L("DeedList-Level3", ["borrowing, or granting any security interest over the Trust Fund, above ", field("borrowing_threshold", "Borrowing threshold requiring consent", "$50,000"), " in aggregate;"]),
      ...L("DeedList-Level3", ["selling, leasing or disposing of the whole or a substantial part of the Trust Fund;"]),
      ...L("DeedList-Level3", ["a change of Trustee otherwise than under clause 4; and"]),
      ...L("DeedList-Level3", ["bringing forward the Vesting Day under the Trust Deed."]),
    ],
  },

  // ── Partnership agreement ────────────────────────────────────────
  {
    key: "agr.partnership_agreement",
    name: "Partnership Agreement",
    description:
      "Full partnership agreement displacing the default statutory position: capital and profit shares, management and unanimity requirements, admission and cessation of a partner, valuation of an outgoing interest, and dissolution.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "Nothing in this agreement removes joint and several liability for partnership debts -- that is a consequence of partnership status under the applicable Partnership Act, not something a private agreement between the partners can exclude as against third parties. Make sure every client entering a partnership actually understands that each partner is exposed to the whole of the partnership's liabilities, not just their own share, and consider whether an incorporated structure (a company, with a shareholders agreement) suits them better before proceeding. Confirm which state's Partnership Act applies and that this agreement displaces every default term the partners don't want -- the Act fills any gap this agreement leaves silent, and its defaults (equal profit shares regardless of capital contributed, for one) are not always what parties assume.",
    aiInstructions:
      "Draft a partnership agreement between two partners. State plainly, as an acknowledgment rather than an operative promise, that partners are jointly and severally liable for partnership debts -- the agreement cannot change that as against third parties, but the partners should see it in writing. Cover capital contributions and how profit and loss are shared, which do not have to track each other and do not have to track capital contributed. Set out which decisions a managing partner (or any partner) can make alone and which need every partner's consent -- borrowing above a threshold, admitting a new partner, and changing the nature of the business are the ones that most commonly need unanimity. Build cessation of a partner (retirement, expulsion for cause, and death) as a single mechanism with the same valuation and payout structure so the partners aren't negotiating three different processes; give the continuing partners the right to buy the outgoing partner's interest at a value determined the same way this library's other structuring precedents do. Include a restraint on an outgoing partner competing with the partnership, and a genuine dissolution and winding-up clause covering the order in which partnership assets are applied.",
    segments: [
      ...opening(
        "PARTNERSHIP AGREEMENT",
        {
          key: "partner_a",
          label: "First Partner",
          example: "Jane Citizen of 10 Smith Street, Parramatta NSW 2150, email jane@example.com.au",
          shortExample: "the First Partner",
        },
        {
          key: "partner_b",
          label: "Second Partner",
          example: "John Citizen of 15 Smith Street, Parramatta NSW 2150, email john@example.com.au",
          shortExample: "the Second Partner",
        },
        [
          ...L("DeedRecital", [
            "The parties have agreed to carry on business in partnership together, under the name ",
            field("partnership_name", "Partnership name", "Sample & Citizen"),
            " (the Partnership), on the terms of this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Business means the business of the Partnership, being ", field("business_description", "Description of the Partnership's business", "the provision of architectural design services"), "."]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", ["Partner means a party to this agreement for the time being, and Partners means all of them."]),
      ...L("DeedList-Level3", ["Partnership has the meaning given in Recital A."]),
      ...L("DeedList-Level3", ["Partnership Property means all property, assets and rights the Partners bring into the Partnership or that the Partnership acquires in the course of the Business."]),
      ...L("DeedList-Level3", ["Partnership Year means each 12 month period ending on ", field("partnership_year_end", "Partnership financial year end", "30 June"), "."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["The partnership"]),
      ...L("DeedList-Level2-Normal", [
        "The Partnership commences on ",
        field("commencement_date", "Commencement date", "1 September 2026"),
        " and continues until dissolved under clause 14, and carries on the Business from ",
        field("business_premises", "Where the Business is carried on", "Suite 4, 20 Market Street, Sydney NSW 2000"),
        ", or any other place the Partners agree.",
      ]),

      ...L("DeedList-Level1-Bold", ["Joint and several liability"]),
      ...L("DeedList-Level2-Normal", [
        "Each Partner acknowledges that, under the Partnership Act, each Partner is jointly and severally liable for the debts and obligations of the Partnership incurred while they are a Partner, and that this agreement does not, and cannot, limit that liability as against a third party.",
      ]),

      ...L("DeedList-Level1-Bold", ["Capital"]),
      ...L("DeedList-Level2-Normal", [
        "Each Partner must contribute capital to the Partnership in the amount set out opposite their name in Schedule 1, and a Partner's capital account is credited with that amount and adjusted for further contributions, drawings and their share of profit and loss under clause 6.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Interest does not accrue on a Partner's capital contribution unless the Partners agree otherwise in writing.",
      ]),

      ...L("DeedList-Level1-Bold", ["Profit and loss"]),
      ...L("DeedList-Level2-Normal", [
        "The Partners share the profit and loss of the Partnership for each Partnership Year in the proportions set out in Schedule 1.",
      ]),

      ...L("DeedList-Level1-Bold", ["Management and decision-making"]),
      ...L("DeedList-Level2-Normal", [
        "Each Partner may take part in the management of the Business and bind the Partnership in the ordinary course of the Business, except to the extent this agreement or the Partners otherwise agree.",
      ]),
      ...L("DeedList-Level2-Normal", ["The Partners must unanimously agree before the Partnership:"]),
      ...L("DeedList-Level3", ["borrows, or grants any security interest, above ", field("borrowing_threshold", "Borrowing threshold requiring unanimity", "$20,000"), " in aggregate;"]),
      ...L("DeedList-Level3", ["admits a new Partner;"]),
      ...L("DeedList-Level3", ["changes the name or nature of the Business; or"]),
      ...L("DeedList-Level3", ["enters into a contract outside the ordinary course of the Business above ", field("contract_threshold", "Out-of-ordinary-course contract threshold requiring unanimity", "$20,000"), " in value."]),

      ...L("DeedList-Level1-Bold", ["Drawings"]),
      ...L("DeedList-Level2-Normal", [
        "A Partner may draw ",
        field("drawings_policy", "Drawings policy", "up to $4,000 per month against their anticipated share of profit for the Partnership Year"),
        ", and drawings are debited against that Partner's share of profit for the Partnership Year in which they are made.",
      ]),

      ...L("DeedList-Level1-Bold", ["Accounts and records"]),
      ...L("DeedList-Level2-Normal", [
        "The Partnership must maintain proper accounting records, prepare accounts for each Partnership Year within ",
        field("accounts_period", "Period to prepare annual accounts after year end", "3 months"),
        " of its end, and give every Partner access to the Partnership's accounting records at any reasonable time.",
      ]),

      ...L("DeedList-Level1-Bold", ["Admission of a new partner"]),
      ...L("DeedList-Level2-Normal", [
        "A new partner may only be admitted with the unanimous consent of the existing Partners, and must first agree in writing to be bound by this agreement.",
      ]),

      ...L("DeedList-Level1-Bold", ["Cessation of a partner"]),
      ...L("DeedList-Level2-Normal", ["A Partner ceases to be a Partner (an Outgoing Partner) on:"]),
      ...L("DeedList-Level3", [
        "retirement, on giving the other Partners at least ",
        field("retirement_notice_period", "Notice period for a Partner to retire", "3 months'"),
        " written notice;",
      ]),
      ...L("DeedList-Level3", [
        "expulsion by unanimous resolution of the other Partners, for ",
        field("expulsion_grounds", "Grounds for expulsion", "serious or persistent breach of this agreement, conduct bringing the Partnership into disrepute, or conduct that would entitle the other Partners to dissolve the Partnership under the Partnership Act"),
        "; or",
      ]),
      ...L("DeedList-Level3", ["death or permanent incapacity, in which case their legal personal representative stands in their place for the purposes of this clause 11."]),
      ...L("DeedList-Level2-Normal", [
        "On an Outgoing Partner ceasing to be a Partner, the continuing Partners must buy, and the Outgoing Partner (or their legal personal representative) must sell, the Outgoing Partner's interest in the Partnership at the value determined under clause 12, and the continuing Partners continue the Business under this agreement.",
      ]),

      ...L("DeedList-Level1-Bold", ["Valuation of an outgoing interest"]),
      ...L("DeedList-Level2-Normal", [
        "The value of an Outgoing Partner's interest is the amount the Partners agree in writing within ",
        field("valuation_agreement_period", "Period to agree the value before it goes to an expert", "20 Business Days"),
        " of the Outgoing Partner ceasing to be a Partner or, failing agreement, the value determined by an independent expert appointed by agreement between the relevant parties or, failing agreement within a further 10 Business Days, by the person then holding office as President of ",
        field("valuation_appointing_body", "Body to appoint the valuer if the parties can't agree one", "the Institute of Chartered Accountants Australia and New Zealand"),
        ", valuing the Outgoing Partner's share of the net assets of the Partnership, including goodwill, as a going concern.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The amount determined under clause 12.1 is paid to the Outgoing Partner (or their legal personal representative) by ",
        field("outgoing_payment_terms", "How the outgoing interest is paid out", "equal quarterly instalments over 2 years from the date the value is determined, with interest on the outstanding balance at 6% per annum"),
        ".",
      ]),

      ...L(null, ["[Delete clause 13 if a restraint was not agreed.]"]),
      ...L("DeedList-Level1-Bold", ["Restraint"]),
      ...L("DeedList-Level2-Normal", [
        "For ",
        field("restraint_period", "Restraint period", "2 years from ceasing to be a Partner"),
        ", within ",
        field("restraint_area", "Restraint area", "a 10 kilometre radius of the Partnership's principal place of business"),
        ", an Outgoing Partner must not carry on or be engaged, concerned or interested in any business competing with the Business, or solicit any client, customer, supplier or employee of the Partnership.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Each restriction in this clause 13 is a separate and severable restriction, so that if any part is held unreasonable or unenforceable it may be severed without affecting the enforceability of the rest.",
      ]),

      ...L("DeedList-Level1-Bold", ["Dissolution and winding up"]),
      ...L("DeedList-Level2-Normal", [
        "The Partnership is dissolved if the Partners unanimously agree in writing, or on the occurrence of an event that dissolves it under the Partnership Act which the Partners have not agreed to continue past under clause 11.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "On dissolution, the Partnership Property must be realised and applied, in order: in paying the debts and liabilities of the Partnership to third parties; in repaying each Partner's capital contribution; and the balance divided between the Partners in the proportions in which they shared profit under clause 6.",
      ]),

      ...L("DeedList-Level1-Bold", ["Dispute resolution"]),
      ...L("DeedList-Level2-Normal", [
        "If a dispute arises between the Partners under this agreement, a Partner must not commence proceedings (other than to seek urgent interlocutory relief) unless it has first given the other Partners written notice of the dispute and the parties have attempted to resolve it through their senior representatives, or by mediation if they agree, for at least ",
        field("dispute_resolution_period", "Minimum period to attempt resolution before proceedings", "15 Business Days"),
        " after that notice.",
      ]),

      ...generalProvisions(),
      ...execution("First Partner", "Second Partner"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1: Capital and Profit Share"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("capital_and_profit_share", "Each Partner's capital contribution and profit/loss share", "First Partner: capital $50,000, profit/loss share 60%. Second Partner: capital $50,000, profit/loss share 40%."),
      ]),
    ],
  },

  // ── Joint venture agreement ──────────────────────────────────────
  {
    key: "agr.joint_venture_agreement",
    name: "Joint Venture Agreement (Unincorporated)",
    description:
      "Full unincorporated joint venture agreement: contributions, a management committee, funding default, output taken severally rather than jointly, and an explicit no-partnership clause. For an incorporated JV, use this library's Shareholders Agreement for the joint venture company instead.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "This is drafted as an unincorporated (contractual) joint venture. If the participants actually want an incorporated JV -- a company they jointly own, with limited liability and a cleaner exit mechanism -- use this library's Shareholders Agreement precedent for the JV company instead of adapting this one; the two structures are different enough that stretching this document to cover both would weaken the no-partnership clause that is this one's whole point. Check clause 8 (no partnership) is actually reflected in how the Participants operate in practice, not just in the document -- a joint bank account, joint marketing under one name, or sharing net profit rather than taking output severally are all things a court can point to in finding a partnership exists in substance regardless of what clause 8 says, which brings joint and several liability with it. Confirm the JV Business in clause 3 is drawn narrowly enough that each Participant's other activities are clearly outside it.",
    aiInstructions:
      "Draft an unincorporated joint venture agreement between two participants. Define the JV Business narrowly and specifically -- a joint venture that drifts into being 'whatever the participants do together' is much harder to keep out of partnership territory. Build a management committee (not a board, since there's no company) with equal or agreed representation, deciding by the majority or unanimity the participants agreed. On funding, give a real default consequence -- a defaulting participant's interest is diluted, or the other participant may fund the shortfall and be repaid with a premium, not just a bare obligation to contribute. The single most important clause is an explicit statement that the arrangement is not a partnership and that each participant takes and is responsible for marketing its own share of the JV Business's output, severally and not jointly with the other -- that is what keeps joint and several liability from attaching by the way the parties actually deal with each other, not just by what the document says. Cover IP ownership (jointly or by field, as agreed), insurance, a defaulting participant's assets being available to satisfy JV liabilities before non-defaulting participants', deadlock, confidentiality, and orderly termination and decommissioning.",
    segments: [
      ...opening(
        "JOINT VENTURE AGREEMENT",
        {
          key: "participant_a",
          label: "First Participant",
          example: "ACME Developments Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email projects@acmedevelopments.com.au",
          shortExample: "the First Participant",
        },
        {
          key: "participant_b",
          label: "Second Participant",
          example: "Brightside Capital Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email invest@brightsidecapital.com.au",
          shortExample: "the Second Participant",
        },
        [
          ...L("DeedRecital", [
            "The parties (the Participants) have agreed to jointly carry on the JV Business described in clause 3, on an unincorporated basis and on the terms of this agreement, each contributing and taking its own share of the output as described in this agreement rather than through a jointly owned company or a partnership.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", ["Joint Venture means the unincorporated arrangement between the Participants established by this agreement."]),
      ...L("DeedList-Level3", ["JV Assets means the property, plant, equipment and other assets acquired for the purposes of the JV Business, as recorded in the Joint Venture's accounts."]),
      ...L("DeedList-Level3", ["JV Business has the meaning given in clause 3.1."]),
      ...L("DeedList-Level3", ["Management Committee means the committee established under clause 6."]),
      ...L("DeedList-Level3", ["Participating Interest means, in relation to a Participant, the percentage share set out opposite its name in Schedule 1."]),
      ...L("DeedList-Level3", ["Programme and Budget means the work programme and budget for the JV Business the Management Committee approves for each period under clause 7.1."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Purpose and scope"]),
      ...L("DeedList-Level2-Normal", [
        "The sole purpose of the Joint Venture is ",
        field("jv_business_description", "Description of the JV Business", "the joint development and construction of a residential building at 100 Sample Road, Newtown NSW, and the sale or leasing of the completed dwellings"),
        " (the JV Business), and no Participant is obliged to bring any other business or opportunity into the Joint Venture.",
      ]),

      ...L("DeedList-Level1-Bold", ["Term"]),
      ...L("DeedList-Level2-Normal", [
        "This agreement commences on ",
        field("commencement_date", "Commencement date", "1 September 2026"),
        " and continues until the JV Business is completed and wound up under clause 15, or the Joint Venture is otherwise terminated under this agreement.",
      ]),

      ...L("DeedList-Level1-Bold", ["Contributions"]),
      ...L("DeedList-Level2-Normal", [
        "Each Participant must contribute to the Joint Venture the cash, assets or services described opposite its name in Schedule 1, at the times set out there.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Property a Participant contributes to the Joint Venture, and JV Assets acquired for the JV Business, are held by the Participants as tenants in common in their respective Participating Interests, unless the Management Committee resolves to hold a particular asset in one Participant's name for convenience, on trust for the Participants in their Participating Interests.",
      ]),

      ...L("DeedList-Level1-Bold", ["Management committee"]),
      ...L("DeedList-Level2-Normal", [
        "The Joint Venture is managed by a Management Committee, to which each Participant may appoint ",
        field("committee_reps_per_participant", "Management Committee representatives per Participant", "one representative"),
        ", and a quorum is at least one representative of each Participant.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Management Committee decides matters by ",
        field("committee_voting", "How the Management Committee decides matters", "unanimous resolution of the representatives present"),
        ", and must meet at least ",
        field("committee_meeting_frequency", "Minimum Management Committee meeting frequency", "monthly"),
        " while the JV Business is being carried out.",
      ]),

      ...L("DeedList-Level1-Bold", ["Programme, budget and funding"]),
      ...L("DeedList-Level2-Normal", [
        "The Management Committee must approve a Programme and Budget for the JV Business, and each Participant must fund its Participating Interest share of approved expenditure under it, by the date the Management Committee specifies.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If a Participant does not fund its share within ",
        field("funding_default_period", "Period to fund an approved cash call before default", "10 Business Days"),
        " of it being due, the other Participant may fund the shortfall, and the defaulting Participant must repay the amount funded on its behalf plus ",
        field("funding_default_premium", "Premium payable on a funded shortfall", "a 15% premium"),
        ", failing which the funding Participant may elect to have the defaulting Participant's Participating Interest reduced to reflect its actual contributions to the Joint Venture.",
      ]),

      ...L("DeedList-Level1-Bold", ["No partnership"]),
      ...L("DeedList-Level2-Normal", [
        "Nothing in this agreement, and nothing the Participants do in carrying out the JV Business, is intended to create a partnership, and no Participant is the agent of, or has authority to bind, the other except to the extent this agreement or the Management Committee expressly authorises.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Each Participant takes its Participating Interest share of the output of the JV Business in kind, and is severally (not jointly) responsible for marketing, selling and accounting for its own share, and for its own taxation obligations in respect of it.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Except as this agreement expressly provides (including clause 7.2), a Participant is not liable for the debts or defaults of the other Participant, and the Participants must ensure any contract entered for the JV Business makes clear that each Participant's liability under it is several, limited to its Participating Interest share, and not joint.",
      ]),

      ...L("DeedList-Level1-Bold", ["Intellectual property"]),
      ...L("DeedList-Level2-Normal", [
        field("ip_ownership", "How IP created for the JV Business is owned", "Intellectual property created specifically for the JV Business is owned by the Participants as tenants in common in their Participating Interests, and each Participant grants the other a non-exclusive, royalty-free licence to use it for the purposes of the JV Business"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Insurance"]),
      ...L("DeedList-Level2-Normal", [
        "The Management Committee must arrange, and the Participants must fund in their Participating Interests, insurance for the JV Business of the types and amounts a prudent participant in a business of that kind would carry, including public liability insurance of at least ",
        field("public_liability_amount", "Public liability insurance amount", "$20,000,000"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Default"]),
      ...L("DeedList-Level2-Normal", [
        "If a Participant commits a material breach of this agreement that is not remedied within 20 Business Days of written notice requiring it to be remedied, or an Insolvency Event occurs in relation to a Participant, the other Participant may terminate that Participant's further participation in the Joint Venture and continue the JV Business alone, or wind up the Joint Venture under clause 15, without affecting any right or remedy already accrued.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Insolvency Event means a Participant becoming insolvent, having a controller, administrator, receiver or liquidator appointed, or entering into any arrangement with its creditors.",
      ]),

      ...L("DeedList-Level1-Bold", ["Deadlock"]),
      ...L("DeedList-Level2-Normal", [
        "If the Management Committee cannot reach a decision on a matter properly put to it, after a reasonable number of attempts, any Participant may refer it to mediation administered by ",
        field("mediation_body", "Mediation body", "the Resolution Institute"),
        ", and if it is not resolved within ",
        field("deadlock_mediation_period", "Period after mediation starts before either Participant may terminate", "20 Business Days"),
        " of the mediation starting, either Participant may terminate this agreement by written notice and clause 15 applies.",
      ]),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each Participant must keep confidential, and not disclose except to its professional advisers, financiers or as required by law, the terms of this agreement and any information about the other Participant obtained in connection with it, except information that is or becomes public other than through a breach of this clause.",
      ]),

      ...L(null, ["[Delete clause 14 if a restraint was not agreed.]"]),
      ...L("DeedList-Level1-Bold", ["Restraint"]),
      ...L("DeedList-Level2-Normal", [
        "For ",
        field("restraint_period", "Restraint period", "2 years from termination of this agreement"),
        ", a Participant whose participation is terminated under clause 11 or 12 must not, within ",
        field("restraint_area", "Restraint area", "New South Wales"),
        ", carry on or be engaged, concerned or interested in any business competing with the JV Business.",
      ]),

      ...L("DeedList-Level1-Bold", ["Termination and winding up"]),
      ...L("DeedList-Level2-Normal", [
        "On completion of the JV Business, or termination of this agreement under clause 11 or 12, the Management Committee (or, if it cannot agree, either Participant) must realise or distribute the JV Assets in specie, in each case in the Participants' Participating Interests, after paying or providing for the liabilities of the Joint Venture.",
      ]),

      ...generalProvisions(),
      ...execution("First Participant", "Second Participant"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1: Participating Interests and Contributions"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("participating_interests", "Each Participant's Participating Interest and contribution", "First Participant: 50% Participating Interest; contributes the land at 100 Sample Road, Newtown NSW. Second Participant: 50% Participating Interest; contributes $800,000 in cash towards construction costs, drawn down against the Programme and Budget."),
      ]),
    ],
  },
];
