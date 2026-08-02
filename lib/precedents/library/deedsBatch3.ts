// lib/precedents/library/deedsBatch3.ts
// Full deeds, continuing deedsBatch1.ts and deedsBatch2.ts: a unit trust
// deed, a business succession (buy-sell) deed, and a full rewrite of the
// deed of acknowledgement of debt.
//
// A unit trust deed doesn't fit the library's usual two-party shape. There's
// no counterparty to bargain with -- a Settlor (almost always someone with no
// ongoing role, precisely so the trust isn't seen as the Trustee's own
// property) pays a nominal sum to a Trustee, who declares that sum, and
// whatever the Trust Fund grows into, is held on trust under the rules this
// deed sets out. So this document gets its own bespoke opening rather than
// agreementParts.ts's or deedParts.ts's two-party one.
//
// The deed's one legally load-bearing idea is FIXED entitlement: each Unit
// carries a stated, proportionate, indefeasible share of income and capital,
// which is what makes this a unit trust rather than a discretionary one, and
// what a unit trust needs to satisfy the "fixed trust" tests that let losses,
// franking credits and small business CGT concessions flow through to
// Unitholders. That idea only survives if the amendment power can't quietly
// undo it -- clause 12 says so expressly, because a trust deed that gives the
// Trustee or Appointor a general power to vary Unitholders' entitlements is
// exactly the kind of deed that later fails a fixed-trust test regardless of
// what the distribution clause says.
//
// Deed of Acknowledgement of Debt previously shipped as a working but plain
// fill-in template (see commercialAgreements.ts's history) -- four short
// text blocks, no styled clauses. It's rewritten here on deedParts.ts's
// scaffolding to match the rest of the library, with the guarantee it
// referenced but never actually drafted now a real clause.
import { field, type PrecedentSeed } from "./types";
import { L } from "./instrumentParts";
import { opening, generalProvisions } from "./deedParts";
import { DEED_PAGE_BREAK, deedCover } from "@/lib/precedents/deedDocx";

const COMMERCIAL = ["Commercial"];

export const DEEDS_BATCH_3: PrecedentSeed[] = [
  // ── Unit trust deed ──────────────────────────────────────────────
  {
    key: "deed.unit_trust",
    name: "Unit Trust Deed",
    description:
      "Establishes a unit trust in full: fixed proportionate entitlement to income and capital, distributions, transfer, trustee powers and indemnity, and an amendment power that can't erode a Unitholder's fixed entitlement.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "Confirm the Settlor is a genuine third party with no other connection to the trust -- a Settlor who is also a proposed Trustee, Unitholder or Appointor undermines the basic premise that the trust property isn't the Settlor's own, and some practitioners use a professional settlement service for exactly this reason. Check the state of establishment's duty position on trust deeds before signing; some states impose nominal or no duty, others assess it. If the client needs the trust to satisfy the fixed-trust tests (for losses, franking credits, or small business CGT concessions to flow through), have that reviewed against the current ATO guidance before relying on this deed -- clause 4 (fixed entitlement) and clause 12 (amendment limits) are drafted with that in mind but a fixed-trust finding depends on the whole deed and how it's actually operated, not one clause. Consider whether a separate Unitholders Agreement is needed alongside this deed -- this deed governs the Trustee's powers and duties and the Units' entitlements; it does not restrict who a Unitholder may transfer to, which is what a Unitholders Agreement is for.",
    aiInstructions:
      "Draft a unit trust deed. Keep the fixed-entitlement mechanism doing real, specific work: each Unit confers a stated fraction of the Trust Fund's capital and of Distributable Income for each period, calculated by reference to the number of Units on issue -- not a vague reference to unitholders having 'an interest' in the trust. Require the Trustee to determine and distribute (or resolve to accumulate, if the deed allows it) Distributable Income before the end of each financial year, with a default distribution clause if it fails to, because an undistributed-income trap is one of the most common ways these trusts go wrong in practice. Give the Trustee broad investment and management powers, but balance them with indemnity limited to the Trust Fund (the Trustee should not be personally liable for properly incurred trust liabilities, and should be indemnified out of the Trust Fund for them) and a right of removal by Unitholder resolution. Critically, draft the amendment power in clause 12 so it cannot be used to vary a Unitholder's fixed entitlement, or to allow the Trust Fund to be applied for the Trustee's personal benefit, without that Unitholder's consent -- an unrestricted amendment power is a common reason a unit trust that reads as fixed on its face is found not to be fixed in substance.",
    segments: [
      ...L(null, [deedCover({
        title: "UNIT TRUST DEED",
        parties: ["[Settlor: name and address]", "[Trustee: name, ACN and registered office]"],
      })]),
      ...L(null, [DEED_PAGE_BREAK]),
      ...L(null, ["Date: ", field("deed_date", "Date of the deed", "12 August 2026")]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Parties"]),
      ...L(null, [field("settlor", "Settlor: name and address", "Peter Advisor of 5 Adviser Street, Sydney NSW 2000")]),
      ...L(null, ["(the ", field("settlor_short", "Settlor short name", "Settlor"), ")"]),
      ...L(null, [""]),
      ...L(null, [field("trustee", "Trustee: name, ACN and registered office", "ACME Trustee Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000")]),
      ...L(null, ["(the ", field("trustee_short", "Trustee short name", "Trustee"), ")"]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Background"]),
      ...L("DeedRecital", [
        "The Settlor wishes to establish a trust to be known as ",
        field("trust_name", "Name of the trust", "the Sample Unit Trust"),
        " (the Trust), and has paid the Trustee the Settlement Sum to be held on the trusts set out in this deed.",
      ]),
      ...L("DeedRecital", [
        "The Trustee has agreed to hold the Settlement Sum, and any property that is added to it, on trust for the Unitholders on the terms of this deed.",
      ]),
      ...L("DeedRecital", [
        "The Settlor has no further role once this deed is executed and is not a Unitholder, a Trustee or an Appointor.",
      ]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Operative Provisions"]),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this deed:"]),
      ...L("DeedList-Level3", ["Appointor means the person named in Schedule 1, who may remove and appoint the Trustee under clause 10."]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this deed."]),
      ...L("DeedList-Level3", ["Distributable Income means the net income of the Trust Fund for a financial year, determined by the Trustee in accordance with clause 5, calculated on a basis consistent with ordinary trust accounting principles."]),
      ...L("DeedList-Level3", ["Settlement Sum means ", field("settlement_sum", "Settlement sum", "$10"), "."]),
      ...L("DeedList-Level3", ["Trust has the meaning given in Recital A."]),
      ...L("DeedList-Level3", [
        "Trust Fund means the Settlement Sum, all property and investments from time to time representing it, all income accumulated under this deed, and all other property the Trustee holds on the trusts of this deed.",
      ]),
      ...L("DeedList-Level3", ["Unit means a unit in the Trust Fund issued under this deed, conferring the rights described in clause 4."]),
      ...L("DeedList-Level3", ["Unitholder means a person registered as the holder of a Unit."]),
      ...L("DeedList-Level3", [
        "Vesting Day means ",
        field("vesting_day", "Vesting day", "the day 80 years after the date of this deed"),
        ", or any earlier day the Trustee determines under clause 11.",
      ]),

      ...L("DeedList-Level1-Bold", ["Declaration of trust"]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee declares that it holds the Trust Fund, and will hold all property that becomes part of the Trust Fund, on trust for the Unitholders on the terms of this deed.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Trust is established, and this deed takes effect, on the date of this deed.",
      ]),

      ...L("DeedList-Level1-Bold", ["Units"]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee may issue Units to any person who applies for them and pays the issue price the Trustee determines, and must keep a register of Unitholders showing the number of Units each holds.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "On the date of this deed the Trustee issues ",
        field("initial_units", "Number of initial Units and issue price", "100 Units at $1.00 each"),
        " to ",
        field("initial_unitholder", "Initial Unitholder(s): name, ACN/ABN and address", "ACME Trading Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "All Units rank equally and confer identical rights, unless the Trustee creates a further class of Units by amendment under clause 12, with rights that do not derogate from the fixed entitlement of existing Units.",
      ]),

      ...L("DeedList-Level1-Bold", ["Unitholders' entitlements"]),
      ...L("DeedList-Level2-Normal", [
        "Each Unit confers on its holder a fixed, indefeasible and proportionate entitlement, equal to the number of Units held divided by the total number of Units on issue, to:",
      ]),
      ...L("DeedList-Level3", ["the Distributable Income of the Trust Fund for each financial year; and"]),
      ...L("DeedList-Level3", ["the capital of the Trust Fund, on a distribution of capital and on vesting of the Trust."]),
      ...L("DeedList-Level2-Normal", [
        "No Unitholder has any interest in any particular asset of the Trust Fund, only the entitlement described in clause 4.1, and no exercise of a power under this deed may reduce a Unitholder's entitlement under clause 4.1 in respect of Units already on issue without that Unitholder's written consent.",
      ]),

      ...L("DeedList-Level1-Bold", ["Distributions"]),
      ...L("DeedList-Level2-Normal", [
        "Before the end of each financial year, the Trustee must determine the Distributable Income for that year and, subject to clause 5.2, must distribute it to the Unitholders in proportion to their Units.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Trustee does not make a determination under clause 5.1 by the end of the financial year, the whole of the Distributable Income for that year is taken to be distributed to the Unitholders in proportion to their Units as at the end of that year.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee may distribute capital of the Trust Fund to Unitholders, in proportion to their Units, at any time.",
      ]),

      ...L("DeedList-Level1-Bold", ["Meetings of unitholders"]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee must convene a meeting of Unitholders within 20 Business Days of a written request from Unitholders holding at least 25% of the Units, on at least 5 Business Days' written notice to every Unitholder.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "A resolution of Unitholders is passed by a simple majority of Units voted, except where this deed requires a higher threshold, and a Unitholder may vote by proxy or in writing without a meeting if every Unitholder consents.",
      ]),

      ...L("DeedList-Level1-Bold", ["Transfer of units"]),
      ...L("DeedList-Level2-Normal", [
        "A Unitholder may transfer its Units by an instrument in a form the Trustee approves, and the Trustee must register the transfer unless it is not properly completed or the transferee has not agreed to be bound by this deed.",
      ]),
      ...L(null, ["[This deed does not itself restrict who a Unitholder may transfer to. Consider whether a Unitholders Agreement -- see this library's separate Unitholders Agreement precedent -- is needed to add pre-emptive rights, tag-along, drag-along or compulsory transfer events.]"]),

      ...L("DeedList-Level1-Bold", ["Trustee's powers"]),
      ...L("DeedList-Level2-Normal", [
        "Subject to this deed, the Trustee has, in relation to the Trust Fund, all the powers of a natural person who is the absolute owner of that property, including power to invest, borrow, grant security, carry on business, employ agents and delegate any of its powers.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee may act on the advice of, and is not liable for a loss arising from acting in good faith on the advice of, a solicitor, accountant or other professional adviser reasonably believed to be competent to give that advice.",
      ]),

      ...L("DeedList-Level1-Bold", ["Trustee's duties, liability and indemnity"]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee must act honestly and in good faith, and exercise the degree of care and diligence a prudent person of business would exercise in managing the affairs of another.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee is not personally liable for a loss to the Trust Fund except to the extent it results from the Trustee's fraud, wilful misconduct or gross negligence, and is entitled to be indemnified out of the Trust Fund for every liability properly incurred in performing its role as Trustee.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee's right of indemnity under clause 9.2 has priority over the interests of the Unitholders in the Trust Fund.",
      ]),

      ...L("DeedList-Level1-Bold", ["Appointment, retirement and removal of trustee"]),
      ...L("DeedList-Level2-Normal", [
        "The Appointor may remove the Trustee and appoint a new trustee by written notice, and the Trustee may retire on giving at least 20 Business Days' written notice to the Appointor and the Unitholders, provided a replacement trustee has agreed to act.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "On a change of Trustee, the outgoing Trustee must transfer the Trust Fund to the incoming Trustee and do everything reasonably necessary to vest the Trust Fund in it, and remains entitled to the indemnity in clause 9.2 for liabilities properly incurred while it was Trustee.",
      ]),

      ...L("DeedList-Level1-Bold", ["Vesting"]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee may, by written notice to the Unitholders, bring forward the Vesting Day to an earlier date.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "On the Vesting Day, the Trustee must realise or transfer the Trust Fund and distribute it to the Unitholders in proportion to their Units, after paying or providing for all liabilities of the Trust.",
      ]),

      ...L("DeedList-Level1-Bold", ["Amendment"]),
      ...L("DeedList-Level2-Normal", [
        "The Trustee may, with the Appointor's written consent, amend this deed by deed.",
      ]),
      ...L("DeedList-Level2-Normal", ["No amendment may, without the written consent of every affected Unitholder:"]),
      ...L("DeedList-Level3", ["reduce, or alter the basis of calculating, a Unitholder's fixed entitlement under clause 4.1 in respect of Units already on issue;"]),
      ...L("DeedList-Level3", ["permit any part of the Trust Fund to be applied otherwise than for the benefit of the Unitholders in accordance with clause 4.1, including for the benefit of the Trustee personally; or"]),
      ...L("DeedList-Level3", ["bring forward the Vesting Day in a way that would defeat a Unitholder's accrued entitlement."]),

      ...generalProvisions(),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Appointor"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("appointor", "Appointor: name and address", "Jane Citizen of 10 Smith Street, Parramatta NSW 2150"),
      ]),
    ],
  },

  // ── Buy-sell (business succession) deed ─────────────────────────
  {
    key: "deed.buy_sell_business_succession",
    name: "Buy-Sell Agreement (Business Succession)",
    description:
      "Insurance-funded business succession in full: trigger events, a compulsory obligation to sell and buy, a sale price tied to the insurance proceeds with a fallback valuation, and what happens if the proceeds fall short.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "This is drafted for two Owners; for three or more, the mechanism needs to say how continuing Owners share the acquisition (usually proportionate to their existing Interests) rather than assuming a single buyer. The policy ownership structure in clause 5 -- self-ownership, cross-ownership, or ownership through a trust or the entity itself -- drives materially different capital gains and income tax outcomes, and the client must obtain specific tax advice on that choice before the policies are taken out; do not let the structure default to whatever is administratively easiest. Confirm the Insured Amount for each Owner is actually kept in step with the current value of their Interest -- a policy sized to the value at inception and never reviewed is one of the most common reasons the insurance proceeds fall short of the Sale Price years later. If a Shareholders or Unitholders Agreement already exists, check clause 9 against it so the two documents don't create competing, inconsistent transfer mechanisms on the same Trigger Event.",
    aiInstructions:
      "Draft a buy-sell agreement for business succession between two Owners of a business (shares or units), funded principally by insurance. Cover the real Trigger Events -- death, total and permanent disablement, and trauma are the standard three; ask whether retirement is also included, since retirement usually isn't covered by insurance and needs its own funding and timing thought through. The obligation to sell and to buy must be mutual and unconditional once a Trigger Event occurs -- an option rather than an obligation defeats the purpose of a succession mechanism. Tie the Sale Price primarily to the proceeds actually received under the relevant insurance policy (simplest, and avoids a valuation dispute at exactly the time the parties are least able to negotiate one), with a fallback valuation mechanism for any Trigger Event or amount the insurance doesn't cover. Deal expressly with a shortfall between the Sale Price and the insurance proceeds actually paid -- instalments over a stated period is the common answer. Flag, as a note for the drafter rather than a clause, that the policy ownership structure (self-owned, cross-owned, or held by a trust or the entity) is a tax question that needs its own advice, because getting it wrong can turn insurance proceeds meant to fund a tax-free succession into an assessable windfall.",
    segments: [
      ...opening("BUSINESS SUCCESSION (BUY-SELL) DEED", [
        ...L("DeedRecital", [
          "The First party and the Second party (together, the Owners) each hold an interest in ",
          field("business_entity", "The business the Owners hold an interest in: name and structure", "ACME Trading Pty Ltd ACN 000 000 000 (the Company)"),
          " (the Business), being the Interest described opposite their name in Schedule 1.",
        ]),
        ...L("DeedRecital", [
          "The Owners have agreed that, on a Trigger Event affecting one of them, the affected Owner's Interest will be sold to, and bought by, the other Owner on the terms of this deed, funded principally by the insurance policies described in Schedule 1.",
        ]),
      ]),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this deed:"]),
      ...L("DeedList-Level3", ["Business has the meaning given in Recital A."]),
      ...L("DeedList-Level3", ["Completion Date has the meaning given in clause 8.1."]),
      ...L("DeedList-Level3", ["Continuing Owner means, in relation to a Trigger Event, the Owner who is not the Affected Owner."]),
      ...L("DeedList-Level3", ["Insured Amount means, in relation to an Owner, the sum insured under that Owner's Policy, as recorded in Schedule 1."]),
      ...L("DeedList-Level3", ["Interest means an Owner's shares or units in the Business, as recorded in Schedule 1."]),
      ...L("DeedList-Level3", ["Owners has the meaning given in Recital A, and Affected Owner means the Owner in relation to whom a Trigger Event occurs."]),
      ...L("DeedList-Level3", ["Policy means, in relation to an Owner, the life insurance and total and permanent disablement policy described opposite that Owner's name in Schedule 1."]),
      ...L("DeedList-Level3", [
        "Trigger Event means, in relation to an Owner:",
      ]),
      ...L("DeedList-Level4", ["the Owner's death;"]),
      ...L("DeedList-Level4", ["the Owner suffering total and permanent disablement, as defined in that Owner's Policy; or"]),
      ...L("DeedList-Level4", [field("trauma_trigger", "Whether a trauma/critical illness event is also a Trigger Event", "the Owner suffering a trauma or critical illness event covered by that Owner's Policy")]),
      ...L("DeedList-Level3", ["Sale Price has the meaning given in clause 4."]),

      ...L("DeedList-Level1-Bold", ["Obligation to sell and buy"]),
      ...L("DeedList-Level2-Normal", [
        "On a Trigger Event, the Affected Owner (or their legal personal representative) must sell, and the Continuing Owner must buy, the whole of the Affected Owner's Interest, for the Sale Price, free from any encumbrance.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The obligation in clause 2.1 is unconditional once a Trigger Event occurs and does not depend on the insurance proceeds under clause 5 being sufficient to fund it.",
      ]),

      ...L("DeedList-Level1-Bold", ["Notice"]),
      ...L("DeedList-Level2-Normal", [
        "The Continuing Owner must give the Affected Owner (or their legal personal representative) written notice of the Trigger Event and the Sale Price within ",
        field("notice_period", "Period to give notice of the Trigger Event", "20 Business Days"),
        " of becoming aware of it, but a failure to give that notice does not affect the obligation in clause 2.",
      ]),

      ...L("DeedList-Level1-Bold", ["Sale price"]),
      ...L("DeedList-Level2-Normal", [
        "The Sale Price for an Affected Owner's Interest is the Insured Amount actually received under that Owner's Policy in connection with the Trigger Event.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If no amount is received under the Affected Owner's Policy in connection with the Trigger Event, or the Trigger Event is not one covered by that Policy, the Sale Price is instead the value of the Interest determined in the same manner as Fair Value would be determined under clause 12 of this library's Shareholders Agreement precedent -- an independent expert, appointed by agreement or, failing agreement, by the President of ",
        field("valuation_appointing_body", "Body to appoint the valuer if the parties can't agree one", "the Institute of Chartered Accountants Australia and New Zealand"),
        ", valuing the Interest as a proportionate part of the Business as a going concern, without a minority discount or a control premium.",
      ]),

      ...L("DeedList-Level1-Bold", ["Insurance policies"]),
      ...L("DeedList-Level2-Normal", [
        "Each Owner must maintain their Policy, pay the premiums when due, and not do anything that would prejudice a claim under it.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Owners must review the Insured Amounts at least every ",
        field("review_period", "How often the Insured Amounts should be reviewed", "2 years"),
        ", and increase them if the value of the Interests has increased, so the Sale Price under clause 4.1 continues to reflect the actual value of each Interest.",
      ]),
      ...L(null, ["[The ownership structure of each Policy -- self-owned, cross-owned by the other Owner, or owned by a trust or the Business itself -- is a tax question requiring specific advice; it is not addressed by this deed and should be settled before the Policies are taken out.]"]),

      ...L("DeedList-Level1-Bold", ["Application of insurance proceeds"]),
      ...L("DeedList-Level2-Normal", [
        "The owner of the Affected Owner's Policy must apply the proceeds received under it towards payment of the Sale Price on Completion.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the proceeds received exceed the Sale Price, the excess belongs to the owner of the Policy. If the proceeds received are less than the Sale Price determined under clause 4.1, clause 7 (shortfall) applies.",
      ]),

      ...L("DeedList-Level1-Bold", ["Shortfall"]),
      ...L("DeedList-Level2-Normal", [
        "If the insurance proceeds received are less than the Sale Price, the Continuing Owner must pay the shortfall by ",
        field("shortfall_terms", "How a shortfall between insurance proceeds and the Sale Price is paid", "equal quarterly instalments over 3 years from the Completion Date, with interest on the outstanding balance at 6% per annum"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Completion"]),
      ...L("DeedList-Level2-Normal", [
        "Completion of the sale takes place within ",
        field("completion_period", "Period after the Sale Price is determined for completion to occur", "20 Business Days"),
        " after the Sale Price is determined under clause 4 (the Completion Date), at which the Affected Owner (or their legal personal representative) must deliver a duly executed transfer of the Interest, free from any encumbrance, against payment of the Sale Price in accordance with clauses 6 and 7.",
      ]),

      ...L("DeedList-Level1-Bold", ["Interaction with any shareholders or unitholders agreement"]),
      ...L("DeedList-Level2-Normal", [
        "If a Trigger Event also constitutes a compulsory transfer event under a shareholders agreement, unitholders agreement or the constitution governing the Business, this deed applies instead of the compulsory transfer or valuation mechanism in that other document, to the extent of any inconsistency.",
      ]),

      ...generalProvisions(),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Interests and Policies"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("interests_and_policies", "Each Owner's Interest and Policy details", "First party: 60 ordinary shares (60%); Policy with Example Life Ltd, policy number 1234567, Insured Amount $600,000. Second party: 40 ordinary shares (40%); Policy with Example Life Ltd, policy number 1234568, Insured Amount $400,000."),
      ]),
    ],
  },

  // ── Deed of acknowledgement of debt (rewrite) ───────────────────
  {
    key: "deed.acknowledgement_of_debt",
    name: "Deed of Acknowledgement of Debt",
    description:
      "Records an admitted debt in full: acknowledgment that restarts the limitation period, a repayment schedule, interest, an acceleration-on-default clause and an actual guarantee, not just a reference to one.",
    category: "Commercial",
    subcategory: "Debt Recovery",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "An acknowledgment of debt can restart the limitation period for recovering it -- confirm the current limitation position before relying on this deed for that purpose, and if acting for the Debtor, make sure the Debtor understands that signing does exactly that. Delete clause 5 (guarantee) if none was agreed; a guarantee added without the guarantor's genuine attention to what they're signing is vulnerable to being set aside. Confirm the interest rate is enforceable as liquidated interest rather than a penalty -- a rate set punitively high to deter default, rather than to compensate for late payment, risks being struck down.",
    aiInstructions:
      "Draft a deed of acknowledgement of debt. The acknowledgment itself needs to be unambiguous and unqualified -- the Debtor acknowledges the debt is due and payable now, and has no set-off, counterclaim or defence to it, because a hedged acknowledgment is weaker evidence and may not restart the limitation period at all. Set out a real repayment schedule as a field, not a vague promise to pay. Build a genuine acceleration clause: default on any instalment makes the whole balance immediately due, without further notice, so the Creditor doesn't have to wait out the full schedule before enforcing. Include a real guarantee clause (not just a field asking the drafter to describe one) if a guarantor is involved, since a guarantee is what gives the Creditor recourse if the corporate Debtor has no assets left.",
    segments: [
      ...opening("DEED OF ACKNOWLEDGEMENT OF DEBT", [
        ...L("DeedRecital", [
          "The Second party (the Debtor) owes the First party (the Creditor) the Debt described in clause 1, arising from ",
          field("debt_origin", "What the debt arose from", "goods sold and delivered by the Creditor to the Debtor between 1 March 2026 and 30 April 2026, under invoices 1041 to 1058"),
          ".",
        ]),
        ...L("DeedRecital", [
          "The parties have agreed that the Debtor will acknowledge and repay the Debt on the terms of this deed.",
        ]),
      ]),

      ...L("DeedList-Level1-Bold", ["Acknowledgment"]),
      ...L("DeedList-Level2-Normal", [
        "The Debtor acknowledges that it owes the Creditor ",
        field("debt_amount", "Amount owed (the Debt)", "$18,450.00"),
        " (the Debt), that the Debt is presently due and payable, and that it has no set-off, counterclaim or defence to any part of it.",
      ]),

      ...L("DeedList-Level1-Bold", ["Repayment"]),
      ...L("DeedList-Level2-Normal", [
        "Despite clause 1, the Creditor agrees to accept repayment of the Debt in accordance with the following schedule, provided the Debtor is not in default under clause 4: ",
        field("repayment_schedule", "Repayment schedule", "six equal monthly instalments of $3,075.00, the first payable on 1 October 2026 and each following instalment on the same day of each following month"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Debtor may repay the Debt earlier than the schedule in clause 2.1 without penalty.",
      ]),

      ...L("DeedList-Level1-Bold", ["Interest"]),
      ...L("DeedList-Level2-Normal", [
        "Interest does not accrue on the Debt while the Debtor is not in default under clause 4. On default, interest accrues on the outstanding balance from the date of this deed at ",
        field("interest_rate", "Interest rate on default", "10% per annum"),
        ", calculated daily.",
      ]),

      ...L("DeedList-Level1-Bold", ["Default"]),
      ...L("DeedList-Level2-Normal", [
        "The Debtor is in default if it fails to pay any instalment in full by its due date, or if an Insolvency Event occurs in relation to the Debtor.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "On default, the whole of the then outstanding balance of the Debt, together with interest under clause 3, becomes immediately due and payable without further notice, and the Creditor may commence proceedings or enter judgment for that amount.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Insolvency Event means the Debtor becoming insolvent, having a controller, administrator, receiver or liquidator appointed, or entering into any arrangement with its creditors.",
      ]),

      ...L(null, ["[Delete clause 5 if no guarantee was agreed.]"]),
      ...L("DeedList-Level1-Bold", ["Guarantee"]),
      ...L("DeedList-Level2-Normal", [
        field("guarantor", "Guarantor: full name and address", "John Citizen of 10 Smith Street, Parramatta NSW 2150"),
        " (the Guarantor) unconditionally and irrevocably guarantees to the Creditor the Debtor's obligations under this deed, and indemnifies the Creditor against any loss the Creditor suffers if the Debtor fails to perform them.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "This guarantee is a continuing guarantee, is not affected by any extension of time or other indulgence the Creditor gives the Debtor, and continues until the Debt is paid in full.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Guarantor acknowledges that the Creditor has recommended the Guarantor obtain independent legal advice before signing this deed, and that the Guarantor either has done so or has chosen not to.",
      ]),

      ...generalProvisions(),
    ],
  },
];
