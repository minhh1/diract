// lib/precedents/library/agreementsBatch3.ts
// Full commercial agreements, continuing agreementsBatch1.ts and
// agreementsBatch2.ts: a share sale agreement and an asset sale agreement.
//
// These are the two ways a business changes hands, and the drafting choice
// between them is the single most consequential decision in the document --
// a share sale carries the target company's history (its debts, its
// contracts, its litigation, everything it has ever done) across to the
// buyer inside the corporate shell; an asset sale lets the buyer choose what
// it takes and leave the rest, including historical liability, with the
// seller. That is why sellers usually prefer to sell shares and buyers
// usually prefer to buy assets, and why each document below is built around
// that difference rather than sharing one skeleton with a few clauses
// swapped: the share sale agreement is built around warranties, disclosure
// and a warranty claims regime, because the buyer's only real protection is
// contractual; the asset sale agreement is built around identifying exactly
// what is sold and what is excluded, and around the mechanics of moving
// employees and contracts across, because the buyer's protection is mostly
// structural (it simply doesn't take on what it excludes).
//
// Both are necessarily a starting point rather than a finished instrument.
// A real transaction's warranties, disclosure letter and completion
// schedule are driven by due diligence findings that don't exist yet when a
// precedent is issued -- the reviewNote says so, and the aiInstructions
// steer the draft towards a straightforward SME sale rather than pretending
// to be a listed-company scheme of arrangement.
import { field, type PrecedentSeed } from "./types";
import { L } from "./instrumentParts";
import { opening, interpretation, generalProvisions, execution } from "./agreementParts";

const COMMERCIAL = ["Commercial"];

export const AGREEMENTS_BATCH_3: PrecedentSeed[] = [
  // ── Share sale ───────────────────────────────────────────────────
  {
    key: "agr.share_sale_agreement",
    name: "Share Sale Agreement",
    description:
      "Sale of shares in a company in full: completion accounts price adjustment, conditions precedent, seller warranties, disclosure, a warranty claims regime and a tax indemnity.",
    category: "Commercial",
    subcategory: "Business Sale",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "This is drafted for a straightforward trade sale of a proprietary company and needs real work before it goes out. Duty on a transfer of shares differs by state, and if the Company is land-rich the transfer can attract landholder duty at rates well above ordinary transfer duty -- check the duty position, including the Company's landholdings, before settling the Price. Tailor the Warranties in clause 8 and the definition of Disclosure Materials to what due diligence actually found; a warranties list this general is a starting point, not a substitute for warranties addressed to the specific risks in this target. Confirm the price adjustment mechanism suits the deal -- clause 4 uses completion accounts, which fits most SME sales, but a locked box mechanism (price fixed as at a locked box date, with no adjustment and instead an indemnity for leakage between that date and Completion) may suit a clean-accounts target better and needs a different clause 4 if chosen. Check whether any warranty should be given by the Company itself as well as the Seller, and whether a guarantee from the Seller's ultimate owner is needed if the Seller is a special purpose vehicle with no assets to meet a claim.",
    aiInstructions:
      "Draft a share sale agreement for a trade sale of a proprietary company. Definitions need to carry real weight here -- Sale Shares, Completion, Warranties, Disclosure Materials and Tax all get used precisely and often, so define them once and use them consistently rather than redescribing what is being sold each time. Build the price mechanism around completion accounts: a Price payable at Completion based on an estimate, then adjusted after Completion against actual net assets or working capital at the Completion Date, with a dispute mechanism if the parties disagree on the completion accounts. Keep disclosure doing its real job -- a warranty is only actionable to the extent NOT disclosed, so the Disclosure Letter and Disclosure Materials need to be defined precisely and the Warranties made subject to them, or every warranty becomes a moving target. Build a genuine limitations regime: a time bar for bringing a claim, a per-claim and aggregate threshold before anything is claimable, an overall cap tied to the Price, and the usual carve-outs (fraud, the title and capacity warranties, and tax) that a cap should never protect. Keep the tax indemnity separate from the general warranties and uncapped or capped separately, because a buyer's real tax exposure on a share sale is inherited history, not a warranty claim. Emphasise in the review note, not the document, that a share sale carries the target's liabilities across -- that is a fact for the solicitor to weigh, not something a clause can change.",
    segments: [
      ...L(null, ["SHARE SALE AGREEMENT"]),
      ...L(null, [""]),
      ...opening(
        {
          key: "seller",
          label: "Seller",
          example: "John Citizen of 10 Smith Street, Parramatta NSW 2150, email john@example.com.au",
          shortExample: "the Seller",
        },
        {
          key: "buyer",
          label: "Buyer",
          example: "Brightside Holdings Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email legal@brightsideholdings.com.au",
          shortExample: "the Buyer",
        },
        [
          ...L("DeedRecital", [
            "The Seller is the registered holder and beneficial owner of the Sale Shares, being the whole of the issued share capital of ",
            field("company_name", "The target company: name, ACN and registered office", "ACME Trading Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000"),
            " (the Company).",
          ]),
          ...L("DeedRecital", [
            "The Seller has agreed to sell, and the Buyer has agreed to buy, the Sale Shares on the terms of this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Accounts means the audited or management financial statements of the Company for the period ending on the Accounts Date."]),
      ...L("DeedList-Level3", [
        "Accounts Date means ",
        field("accounts_date", "Accounts date", "30 June 2026"),
        ".",
      ]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", ["Claim means any claim, demand, action or proceeding arising out of or in connection with this agreement, including under the Warranties or the Tax Indemnity."]),
      ...L("DeedList-Level3", ["Company has the meaning given in Recital A."]),
      ...L("DeedList-Level3", ["Completion means completion of the sale and purchase of the Sale Shares in accordance with clause 7."]),
      ...L("DeedList-Level3", [
        "Completion Date means ",
        field("completion_date", "Completion date", "30 September 2026"),
        ", or any later date the parties agree in writing.",
      ]),
      ...L("DeedList-Level3", ["Completion Accounts means the accounts of the Company as at the Completion Date, prepared in accordance with clause 4."]),
      ...L("DeedList-Level3", ["Conditions means the conditions precedent set out in clause 5."]),
      ...L("DeedList-Level3", [
        "Disclosure Letter means the letter of that date from the Seller to the Buyer disclosing matters against the Warranties, together with the Disclosure Materials annexed to it.",
      ]),
      ...L("DeedList-Level3", ["Disclosure Materials means the documents annexed to, or specifically referenced in, the Disclosure Letter."]),
      ...L("DeedList-Level3", ["Encumbrance means a mortgage, charge, lien, pledge or other security interest, or any other interest or claim of a third party of any kind."]),
      ...L("DeedList-Level3", ["Government Agency means any government or governmental, semi-governmental, administrative, regulatory or judicial entity or authority."]),
      ...L("DeedList-Level3", ["GST has the meaning given in the A New Tax System (Goods and Services Tax) Act 1999 (Cth)."]),
      ...L("DeedList-Level3", [
        "Price means ",
        field("price", "Purchase price", "$1,200,000"),
        ", as adjusted under clause 4."],
      ),
      ...L("DeedList-Level3", ["Sale Shares means all of the issued shares in the capital of the Company, as described in Schedule 1."]),
      ...L("DeedList-Level3", ["Tax means any tax, levy, duty, impost, deduction, charge or withholding of any kind imposed by a Government Agency, together with any related interest, penalty or fine."]),
      ...L("DeedList-Level3", ["Tax Indemnity means the indemnity given by the Seller under clause 11."]),
      ...L("DeedList-Level3", ["Warranties means the representations and warranties given by the Seller under clause 8."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Sale and purchase"]),
      ...L("DeedList-Level2-Normal", [
        "The Seller must sell, and the Buyer must buy, the Sale Shares free from any Encumbrance and together with all rights attaching to them as at the Completion Date, for the Price.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Buyer need not complete the purchase of any of the Sale Shares unless the purchase of all of them is completed simultaneously.",
      ]),

      ...L("DeedList-Level1-Bold", ["Price and adjustment"]),
      ...L("DeedList-Level2-Normal", [
        "At Completion the Buyer must pay the Seller an amount equal to the Price calculated on a good faith estimate of the Company's net assets as at the Completion Date (the Estimated Price).",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Within ",
        field("completion_accounts_period", "Period to prepare Completion Accounts after Completion", "45 days"),
        " after Completion, the Buyer must prepare and give the Seller draft Completion Accounts, prepared on the same basis and using the same accounting policies as the Accounts.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Seller does not dispute the draft Completion Accounts within ",
        field("completion_accounts_dispute_period", "Period to dispute the Completion Accounts", "20 Business Days"),
        " of receiving them, they are final. If the Seller disputes them within that period, the parties must attempt to agree the disputed items, failing which either party may refer the dispute to an independent accountant agreed by the parties or, failing agreement, nominated by the President of the Institute of Chartered Accountants Australia and New Zealand, whose determination is final and binding and whose costs are borne as that accountant directs, having regard to the parties' relative success.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Once the Completion Accounts are final, the Price is recalculated by reference to them, and:",
      ]),
      ...L("DeedList-Level3", ["if the Price as recalculated exceeds the Estimated Price, the Buyer must pay the difference to the Seller; or"]),
      ...L("DeedList-Level3", ["if the Price as recalculated is less than the Estimated Price, the Seller must repay the difference to the Buyer,"]),
      ...L("DeedList-Level2-NoNumbering", ["in either case within 10 Business Days of the Completion Accounts becoming final, together with interest from the Completion Date at the rate prescribed for pre-judgment interest in the place whose law governs this agreement."]),

      ...L("DeedList-Level1-Bold", ["Conditions precedent"]),
      ...L("DeedList-Level2-Normal", [
        "Completion is conditional on satisfaction, or waiver by the party for whose benefit a Condition exists, of the following by the Completion Date:",
      ]),
      ...L("DeedList-Level3", [
        field("conditions_precedent", "Conditions precedent", "any regulatory approval required for the Buyer to acquire the Sale Shares; all consents required under the Company's Material Contracts to a change of control of the Company; and the Buyer completing due diligence to its satisfaction."),
      ]),
      ...L("DeedList-Level2-Normal", [
        "Each party must use reasonable endeavours to satisfy the Conditions. If a Condition is not satisfied or waived by the Completion Date, either party may terminate this agreement by written notice, without liability to the other except for a breach of this clause 5 or any antecedent breach.",
      ]),

      ...L("DeedList-Level1-Bold", ["Conduct before Completion"]),
      ...L("DeedList-Level2-Normal", [
        "Between the date of this agreement and Completion, the Seller must ensure the Company carries on its business in the ordinary course consistent with past practice, and must not, without the Buyer's prior written consent, cause or permit the Company to:",
      ]),
      ...L("DeedList-Level3", ["incur liabilities, or dispose of assets, outside the ordinary course of business;"]),
      ...L("DeedList-Level3", ["declare or pay a dividend or other distribution, or return capital;"]),
      ...L("DeedList-Level3", ["issue or agree to issue any share, option or other security;"]),
      ...L("DeedList-Level3", ["amend its constitution; or"]),
      ...L("DeedList-Level3", ["enter into, terminate or materially vary any Material Contract."]),
      ...L("DeedList-Level2-Normal", [
        "The Seller must give the Buyer and its advisers reasonable access to the Company's books, records and management for the purpose of the Buyer's due diligence and Completion planning.",
      ]),

      ...L("DeedList-Level1-Bold", ["Completion"]),
      ...L("DeedList-Level2-Normal", ["Completion takes place on the Completion Date at a place and time the parties agree, at which:"]),
      ...L("DeedList-Level3", ["the Seller must deliver to the Buyer: share transfer forms and share certificates (or a suitable indemnity) for the Sale Shares; the certificate of registration, common seal, minute books, statutory registers and accounting records of the Company; letters of resignation from each officer of the Company the Buyer has nominated to resign; and releases of any Encumbrance over the Sale Shares or the Company's assets;"]),
      ...L("DeedList-Level3", ["the Buyer must pay the Estimated Price in accordance with clause 4.1; and"]),
      ...L("DeedList-Level3", ["the parties must do everything else reasonably necessary to give the Buyer control of the Company, including procuring the appointment of the Buyer's nominees as directors and the resignation of outgoing officers."]),
      ...L("DeedList-Level2-Normal", [
        "Each step at Completion is interdependent, and Completion is taken to have occurred only when every step has occurred.",
      ]),

      ...L("DeedList-Level1-Bold", ["Warranties"]),
      ...L("DeedList-Level2-Normal", [
        "The Seller represents and warrants to the Buyer that each of the following is true as at the date of this agreement and as at Completion, except to the extent fairly disclosed in the Disclosure Letter:",
      ]),
      ...L("DeedList-Level3", ["the Seller is the sole legal and beneficial owner of the Sale Shares, free from any Encumbrance, and has full power to sell them on the terms of this agreement;"]),
      ...L("DeedList-Level3", ["the Sale Shares constitute the whole of the issued share capital of the Company and are fully paid;"]),
      ...L("DeedList-Level3", ["the Company is validly incorporated and is not, and has not agreed to become, subject to any form of insolvency administration;"]),
      ...L("DeedList-Level3", ["the Accounts give a true and fair view of the assets, liabilities and financial position of the Company as at the Accounts Date, and have been prepared in accordance with applicable accounting standards consistently applied;"]),
      ...L("DeedList-Level3", ["since the Accounts Date, the Company has carried on its business in the ordinary course and there has been no material adverse change in its financial position;"]),
      ...L("DeedList-Level3", ["the Company has paid all Tax it is liable to pay and has complied with its obligations to lodge returns and maintain records, and there is no dispute with any revenue authority;"]),
      ...L("DeedList-Level3", ["the Company is not a party to any litigation, arbitration or regulatory proceeding, and none is threatened or, so far as the Seller is aware, anticipated;"]),
      ...L("DeedList-Level3", ["each Material Contract is in full force and effect, the Company is not in material breach of it, and, so far as the Seller is aware, no other party to it is in material breach;"]),
      ...L("DeedList-Level3", ["the Company owns or has a valid licence to use all intellectual property material to its business, and its use of it does not infringe the rights of any third party;"]),
      ...L("DeedList-Level3", ["the Company is not in material breach of any law or licence applicable to its business;"]),
      ...L("DeedList-Level3", ["the Company holds current insurance consistent with normal practice for its business, and no claim under it is outstanding; and"]),
      ...L("DeedList-Level3", ["the Company has complied in all material respects with its obligations to its employees, including under any applicable modern award or enterprise agreement, and all employee entitlements are properly accrued in the Accounts or the Completion Accounts."]),
      ...L("DeedList-Level2-Normal", [
        "Each Warranty is to be construed independently and is not limited by reference to any other Warranty or any other provision of this agreement.",
      ]),
      ...L("DeedList-Level2-Normal", ["The Buyer warrants to the Seller that it has full power to enter into and perform this agreement and to pay the Price."]),

      ...L("DeedList-Level1-Bold", ["Disclosure"]),
      ...L("DeedList-Level2-Normal", [
        "The Warranties are given subject to, and the Seller is not liable for a Claim to the extent it arises from, any matter fairly disclosed in the Disclosure Letter in enough detail for the Buyer to assess its significance.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "General disclosure of a matter in the Accounts or Company registers is not, by itself, fair disclosure for the purposes of this clause unless the specific matter is also disclosed in the Disclosure Letter.",
      ]),

      ...L("DeedList-Level1-Bold", ["Limitations on claims"]),
      ...L("DeedList-Level2-Normal", ["The Seller is not liable for a Claim under the Warranties unless:"]),
      ...L("DeedList-Level3", [
        "the Buyer gives the Seller written notice of the Claim, with reasonable detail of its nature and (so far as reasonably practicable) the amount claimed, within ",
        field("warranty_claim_period", "Period to bring a Warranty claim", "24 months of Completion, or 7 years of Completion for the tax and title Warranties"),
        "; and",
      ]),
      ...L("DeedList-Level3", [
        "the amount of the Claim, together with all other Claims arising from the same or related facts, exceeds ",
        field("de_minimis", "Minimum amount for a single Claim to count", "$10,000"),
        ", and the aggregate of all Claims that individually exceed that amount exceeds ",
        field("aggregate_threshold", "Aggregate threshold before any Claim is recoverable", "$50,000"),
        ", in which case the Seller is liable for the whole amount and not merely the excess.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Seller's aggregate liability for all Claims under the Warranties must not exceed ",
        field("warranty_cap", "Cap on Warranty liability", "the Price"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Clauses 10.1 and 10.2 do not apply to a Claim arising from fraud, or to a Claim under the Warranties as to title to the Sale Shares and the Seller's capacity to sell them, or to the Tax Indemnity.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Buyer must not bring a Claim to the extent it relates to a matter for which the Company has actually recovered under a policy of insurance, or that is specifically and fully provisioned for in the Completion Accounts.",
      ]),

      ...L("DeedList-Level1-Bold", ["Tax indemnity"]),
      ...L("DeedList-Level2-Normal", [
        "The Seller indemnifies the Buyer against any Tax liability of the Company arising from any event, act, omission or period occurring or ending before Completion, and not specifically provisioned for in the Completion Accounts, together with any reasonable costs the Buyer or the Company incurs in connection with that liability.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Buyer must notify the Seller promptly of any Tax audit, assessment or dispute that may give rise to a claim under the Tax Indemnity, and must not settle or compromise it without the Seller's consent, not to be unreasonably withheld, having regard to the Seller's right to control the conduct of a matter it is liable to indemnify.",
      ]),

      ...L(null, ["[Delete clause 12 if a restraint was not agreed -- a restraint on a seller of a business is enforced far more readily than one on an employee, but it must still be no wider than reasonably necessary to protect the goodwill sold.]"]),
      ...L("DeedList-Level1-Bold", ["Restraint of trade"]),
      ...L("DeedList-Level2-Normal", [
        "For ",
        field("restraint_period", "Restraint period", "2 years from Completion"),
        ", within ",
        field("restraint_area", "Restraint area", "New South Wales"),
        ", the Seller must not, directly or indirectly, carry on or be engaged, concerned or interested in any business competing with the business carried on by the Company at Completion, or solicit any client, customer, supplier or employee of the Company.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Each restriction in this clause 12 is a separate and severable restriction, so that if any part is held unreasonable or unenforceable it may be severed without affecting the enforceability of the rest.",
      ]),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must keep confidential, and not disclose except to its professional advisers, financiers or as required by law, the terms of this agreement and any information about the other party or the Company obtained in connection with it, except information that is or becomes public other than through a breach of this clause.",
      ]),

      ...generalProvisions(),
      ...execution("Seller", "Buyer"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Sale Shares"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("sale_shares_particulars", "Sale Shares: class and number", "1,000 ordinary shares, being 100% of the issued share capital of the Company"),
      ]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 2 -- Completion Deliverables"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("completion_deliverables", "Any completion deliverables in addition to clause 7.1", "Deed of release from the Company's bank in respect of the Seller's personal guarantee of the Company's banking facilities, releasing the Seller on and from Completion."),
      ]),
    ],
  },

  // ── Asset sale ───────────────────────────────────────────────────
  {
    key: "agr.asset_sale_agreement",
    name: "Asset Sale Agreement",
    description:
      "Sale of business assets rather than shares in full: excluded assets and liabilities, GST going concern treatment, employee and contract transfer, PPSR releases and completion mechanics.",
    category: "Commercial",
    subcategory: "Business Sale",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "Schedule 1 is where this document actually does its work -- an asset sale only protects the Buyer from historical liability to the extent the Excluded Liabilities are drawn wide enough and the Assets are drawn precisely enough, so do not leave it as a placeholder. Confirm the GST going concern conditions in clause 5 are actually satisfied before relying on them: the sale must include everything necessary for the continued operation of the enterprise, the Seller must carry on the enterprise until the day of supply, and the parties must agree in writing that the supply is of a going concern -- get any one of these wrong and the exemption is lost, with GST payable on the whole Price. Check every Material Contract and lease for an assignment or change of ownership clause before signing; an unassignable contract needs novation, which requires the counterparty's consent and cannot simply be assigned. If any Asset is subject to a registered PPSR security interest, obtain a release or discharge before or at Completion -- the Buyer otherwise takes the Asset subject to it regardless of what this agreement says between the parties. Confirm the employee transfer mechanism actually preserves service-based entitlements as intended, or the Buyer may face unexpected leave liabilities it did not price in.",
    aiInstructions:
      "Draft an asset sale agreement for the sale of a business as a going concern. The single most important thing this document does is say precisely what is sold and what is not -- draw Assets and Excluded Assets, and correspondingly Assumed Liabilities and Excluded Liabilities, so there is no gap and no overlap, because unlike a share sale where everything comes with the company, here anything not identified as transferring simply doesn't. Apportion the Price across goodwill, plant and equipment, and stock, because the apportionment affects each party's tax treatment and duty exposure. Record the GST going concern conditions expressly rather than assuming them: supply for consideration, the Buyer registered for GST, the Seller carrying on the enterprise until completion, and the supply including everything necessary for the Buyer to continue operating it. On employees, give the Buyer a genuine choice of who it offers employment to, and deal explicitly with how accrued leave is apportioned between Seller and Buyer -- silence on this is one of the most common sources of dispute after completion of a business sale. On contracts, distinguish between what can be assigned and what needs the counterparty's consent to novate. Keep warranties proportionate to an asset sale -- the buyer's main protection here is structural (it only takes what is scheduled), so the warranties exist to backstop condition and title, not to replicate the full company-history warranties a share sale needs.",
    segments: [
      ...L(null, ["ASSET SALE AGREEMENT"]),
      ...L(null, [""]),
      ...opening(
        {
          key: "seller",
          label: "Seller",
          example: "ACME Trading Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email accounts@acmetrading.com.au",
          shortExample: "the Seller",
        },
        {
          key: "buyer",
          label: "Buyer",
          example: "Brightside Holdings Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email legal@brightsideholdings.com.au",
          shortExample: "the Buyer",
        },
        [
          ...L("DeedRecital", [
            "The Seller carries on the business of ",
            field("business_description", "Description of the business sold", "a cafe trading as 'Example Cafe' at 100 Sample Road, Newtown NSW"),
            " (the Business).",
          ]),
          ...L("DeedRecital", [
            "The Seller has agreed to sell, and the Buyer has agreed to buy, the Assets as a going concern on the terms of this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Assets means the assets of the Business described in Schedule 1, but excludes the Excluded Assets."]),
      ...L("DeedList-Level3", ["Assumed Liabilities means the liabilities of the Business the Buyer assumes under clause 3.3, as described in Schedule 1."]),
      ...L("DeedList-Level3", ["Business has the meaning given in Recital A."]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", ["Claim means any claim, demand, action or proceeding arising out of or in connection with this agreement, including under the Warranties."]),
      ...L("DeedList-Level3", ["Completion means completion of the sale and purchase of the Assets in accordance with clause 9."]),
      ...L("DeedList-Level3", [
        "Completion Date means ",
        field("completion_date", "Completion date", "30 September 2026"),
        ", or any later date the parties agree in writing.",
      ]),
      ...L("DeedList-Level3", ["Employees means the persons employed in the Business immediately before Completion, as listed in Schedule 2."]),
      ...L("DeedList-Level3", ["Encumbrance means a mortgage, charge, lien, pledge or other security interest, or any other interest or claim of a third party of any kind."]),
      ...L("DeedList-Level3", ["Excluded Assets means the assets described as such in Schedule 1, including cash at bank, debts owing to the Seller as at Completion, and the Seller's business name and corporate records."]),
      ...L("DeedList-Level3", ["Excluded Liabilities means every liability of the Seller or relating to the Business other than the Assumed Liabilities, whether arising before or after Completion, including all Tax liabilities of the Seller."]),
      ...L("DeedList-Level3", ["GST has the meaning given in the GST Act."]),
      ...L("DeedList-Level3", ["GST Act means the A New Tax System (Goods and Services Tax) Act 1999 (Cth)."]),
      ...L("DeedList-Level3", ["Material Contract means each contract of the Business listed in Schedule 3."]),
      ...L("DeedList-Level3", [
        "Price means ",
        field("price", "Purchase price", "$420,000"),
        ", apportioned as set out in Schedule 1.",
      ]),
      ...L("DeedList-Level3", ["Tax means any tax, levy, duty, impost, deduction, charge or withholding of any kind imposed by a government agency, together with any related interest, penalty or fine."]),
      ...L("DeedList-Level3", ["Transferring Employees means the Employees to whom the Buyer offers, and who accept, employment under clause 7."]),
      ...L("DeedList-Level3", ["Warranties means the representations and warranties given by the Seller under clause 10."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Sale and purchase"]),
      ...L("DeedList-Level2-Normal", [
        "The Seller must sell, and the Buyer must buy, the Assets free from any Encumbrance, as a going concern, for the Price.",
      ]),
      ...L("DeedList-Level2-Normal", ["The Excluded Assets are not sold under this agreement and remain the Seller's property."]),
      ...L("DeedList-Level2-Normal", [
        "The Buyer assumes the Assumed Liabilities as and from Completion. The Seller retains, and indemnifies the Buyer against, the Excluded Liabilities, whenever they arise.",
      ]),

      ...L("DeedList-Level1-Bold", ["Price and apportionment"]),
      ...L("DeedList-Level2-Normal", ["The Price is apportioned between goodwill, plant and equipment, and stock as set out in Schedule 1, and the parties must apply that apportionment for stamp duty and taxation purposes."]),
      ...L("DeedList-Level2-Normal", [
        "The component of the Price attributed to stock is an estimate and is adjusted at Completion by reference to a stocktake conducted by the parties, or their representatives, immediately before Completion, valued on the basis set out in Schedule 1.",
      ]),

      ...L("DeedList-Level1-Bold", ["GST"]),
      ...L("DeedList-Level2-Normal", [
        "The parties agree that the sale of the Assets under this agreement is the supply of a going concern for the purposes of section 38-325 of the GST Act, and that no GST is payable on the Price on that basis.",
      ]),
      ...L("DeedList-Level2-Normal", ["To rely on clause 5.1, the parties agree that:"]),
      ...L("DeedList-Level3", ["the Buyer is, or will be by Completion, registered for GST;"]),
      ...L("DeedList-Level3", ["the Seller will carry on the Business until the day of Completion; and"]),
      ...L("DeedList-Level3", ["the Assets sold under this agreement comprise everything necessary for the Buyer to continue operating the Business."]),
      ...L("DeedList-Level2-Normal", [
        "If the supply is later determined not to be GST-free, the Buyer must pay the Seller an additional amount equal to the GST payable, on receipt of a valid tax invoice, and the Price is otherwise exclusive of GST.",
      ]),

      ...L("DeedList-Level1-Bold", ["Conditions precedent"]),
      ...L("DeedList-Level2-Normal", [
        "Completion is conditional on satisfaction, or waiver by the party for whose benefit a Condition exists, of the following by the Completion Date:",
      ]),
      ...L("DeedList-Level3", [
        field("conditions_precedent", "Conditions precedent", "the landlord's consent to assignment of the lease of the Business premises; transfer or grant of any licence needed to operate the Business (including a liquor licence, if applicable); and any third party consent needed to assign a Material Contract."),
      ]),
      ...L("DeedList-Level2-Normal", [
        "Each party must use reasonable endeavours to satisfy the Conditions. If a Condition is not satisfied or waived by the Completion Date, either party may terminate this agreement by written notice, without liability to the other except for a breach of this clause 6 or any antecedent breach.",
      ]),

      ...L("DeedList-Level1-Bold", ["Employees"]),
      ...L("DeedList-Level2-Normal", [
        "At least ",
        field("employee_offer_period", "Period before Completion the Buyer must make offers to Employees", "10 Business Days"),
        " before Completion, the Buyer must offer employment, commencing on Completion, to those Employees the Buyer chooses in its discretion, on terms overall no less favourable than the Employee's current terms.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Seller must terminate the employment of each Transferring Employee effective immediately before Completion, and is responsible for all amounts owing to that Employee on termination, including accrued but untaken annual leave and, if applicable, long service leave, up to Completion, except to the extent clause 7.3 applies.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Buyer must recognise each Transferring Employee's period of service with the Seller as service with the Buyer for the purpose of any entitlement that depends on length of service, and the Price is adjusted at Completion by the value of accrued annual leave and long service leave the Buyer assumes responsibility for as a result.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Seller remains solely responsible for any Employee who is not offered employment, or who is offered employment and does not accept it, including for any redundancy or other termination entitlement.",
      ]),

      ...L("DeedList-Level1-Bold", ["Contracts"]),
      ...L("DeedList-Level2-Normal", [
        "For each Material Contract, the Seller must use reasonable endeavours to obtain, before Completion, any consent required for its assignment or novation to the Buyer.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If a required consent is not obtained by Completion, the Seller must hold the benefit of the relevant Material Contract on trust for the Buyer and perform its obligations under it at the Buyer's cost and direction, until the consent is obtained or the parties otherwise agree, and the Buyer indemnifies the Seller for doing so.",
      ]),

      ...L("DeedList-Level1-Bold", ["Completion"]),
      ...L("DeedList-Level2-Normal", ["Completion takes place on the Completion Date at a place and time the parties agree, at which:"]),
      ...L("DeedList-Level3", ["the Seller must deliver vacant possession of the Assets, and all keys, manuals, warranties, records and other documents relating to them;"]),
      ...L("DeedList-Level3", ["the Seller must deliver executed instruments of transfer or assignment for any Asset that requires one, and evidence of release of any Encumbrance over the Assets, including any registered PPSR security interest;"]),
      ...L("DeedList-Level3", ["the Buyer must pay the Price, adjusted under clauses 4.2 and 6.3, in cleared funds; and"]),
      ...L("DeedList-Level3", ["the parties must do everything else reasonably necessary to give the Buyer effective ownership and control of the Assets and the Business."]),
      ...L("DeedList-Level2-Normal", [
        "Risk in the Assets passes to the Buyer, and the Seller ceases to conduct the Business, on Completion.",
      ]),

      ...L("DeedList-Level1-Bold", ["Warranties"]),
      ...L("DeedList-Level2-Normal", [
        "The Seller represents and warrants to the Buyer that each of the following is true as at the date of this agreement and as at Completion:",
      ]),
      ...L("DeedList-Level3", ["the Seller is the sole legal and beneficial owner of the Assets, free from any Encumbrance, and has full power to sell them on the terms of this agreement;"]),
      ...L("DeedList-Level3", ["Schedule 1 is a complete and accurate list of the Assets, and Schedule 2 is a complete and accurate list of the Employees and their entitlements as at the date of this agreement;"]),
      ...L("DeedList-Level3", ["each item of plant and equipment included in the Assets is in good working order, fair wear and tear excepted;"]),
      ...L("DeedList-Level3", ["each Material Contract is in full force and effect, the Seller is not in material breach of it, and, so far as the Seller is aware, no other party to it is in material breach;"]),
      ...L("DeedList-Level3", ["the Seller is not aware of any fact or circumstance likely to result in the loss, non-renewal or material variation of any licence needed to operate the Business;"]),
      ...L("DeedList-Level3", ["the Seller is not a party to any litigation, arbitration or regulatory proceeding relating to the Business, and none is threatened or, so far as the Seller is aware, anticipated;"]),
      ...L("DeedList-Level3", ["the Business has been conducted in material compliance with all applicable laws; and"]),
      ...L("DeedList-Level3", ["the Seller has complied in all material respects with its obligations to the Employees, including under any applicable modern award or enterprise agreement."]),
      ...L("DeedList-Level2-Normal", ["The Buyer warrants to the Seller that it has full power to enter into and perform this agreement and to pay the Price."]),

      ...L("DeedList-Level1-Bold", ["Limitations on claims"]),
      ...L("DeedList-Level2-Normal", ["The Seller is not liable for a Claim under the Warranties unless:"]),
      ...L("DeedList-Level3", [
        "the Buyer gives the Seller written notice of the Claim, with reasonable detail of its nature and (so far as reasonably practicable) the amount claimed, within ",
        field("warranty_claim_period", "Period to bring a Warranty claim", "18 months of Completion, or 7 years of Completion for the title Warranty"),
        "; and",
      ]),
      ...L("DeedList-Level3", [
        "the amount of the Claim, together with all other Claims arising from the same or related facts, exceeds ",
        field("de_minimis", "Minimum amount for a single Claim to count", "$5,000"),
        ", and the aggregate of all Claims that individually exceed that amount exceeds ",
        field("aggregate_threshold", "Aggregate threshold before any Claim is recoverable", "$25,000"),
        ", in which case the Seller is liable for the whole amount and not merely the excess.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Seller's aggregate liability for all Claims under the Warranties must not exceed ",
        field("warranty_cap", "Cap on Warranty liability", "the Price"),
        ", except for a Claim arising from fraud or for the Warranty as to title to the Assets, to which no limitation in this clause 11 applies.",
      ]),

      ...L(null, ["[Delete clause 12 if a restraint was not agreed -- a restraint on a seller of a business is enforced far more readily than one on an employee, but it must still be no wider than reasonably necessary to protect the goodwill sold.]"]),
      ...L("DeedList-Level1-Bold", ["Restraint of trade"]),
      ...L("DeedList-Level2-Normal", [
        "For ",
        field("restraint_period", "Restraint period", "2 years from Completion"),
        ", within ",
        field("restraint_area", "Restraint area", "a 5 kilometre radius of the Business premises"),
        ", the Seller must not, directly or indirectly, carry on or be engaged, concerned or interested in any business competing with the Business, or solicit any client, customer, supplier or Transferring Employee of the Business.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Each restriction in this clause 12 is a separate and severable restriction, so that if any part is held unreasonable or unenforceable it may be severed without affecting the enforceability of the rest.",
      ]),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must keep confidential, and not disclose except to its professional advisers, financiers or as required by law, the terms of this agreement and any information about the other party obtained in connection with it, except information that is or becomes public other than through a breach of this clause.",
      ]),

      ...generalProvisions(),
      ...execution("Seller", "Buyer"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Assets, Excluded Assets and Price Apportionment"]),
      ...L("DeedList-Level2-Bold", ["Assets"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("assets_description", "Description of the Assets sold", "The goodwill of the Business; the plant, equipment and fittings listed in the attached inventory; the stock on hand at Completion; the Business's telephone numbers, domain name and social media accounts; and the benefit of the Material Contracts listed in Schedule 3."),
      ]),
      ...L("DeedList-Level2-Bold", ["Excluded Assets"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("excluded_assets_description", "Any Excluded Assets in addition to cash, debts and corporate records", "None."),
      ]),
      ...L("DeedList-Level2-Bold", ["Assumed Liabilities"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("assumed_liabilities_description", "Assumed Liabilities (if any -- state 'None' if the Buyer assumes no liabilities)", "None -- the Buyer assumes no liability of the Seller other than its obligations under the Material Contracts arising after Completion."),
      ]),
      ...L("DeedList-Level2-Bold", ["Price apportionment"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("price_apportionment", "How the Price is apportioned", "Goodwill $310,000; plant and equipment $85,000; stock at valuation on Completion, estimated at $25,000."),
      ]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 2 -- Employees"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("employees_list", "Employees and their entitlements", "[Attach a list of each Employee's name, role, start date, and accrued annual and long service leave as at the date of this agreement.]"),
      ]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 3 -- Material Contracts"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("material_contracts_list", "Material Contracts", "Lease of the Business premises dated [ ]; supply agreement with [ ] dated [ ]."),
      ]),
    ],
  },
];
