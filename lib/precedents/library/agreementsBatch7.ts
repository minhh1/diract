// lib/precedents/library/agreementsBatch7.ts
// Full commercial agreements, continuing agreementsBatch1.ts -- 6.ts: a
// distribution agreement and a franchise agreement.
//
// Both sit under legislation that overrides anything the parties agree to
// the contrary, and both are drafted with that as the load-bearing fact
// rather than a footnote. A distribution agreement that fixes the
// distributor's resale price is unlawful under the Competition and Consumer
// Act 2010 (Cth) regardless of how it is worded -- clause 11 states the
// distributor's pricing freedom as an operative term, not just a warning in
// the review note, because a supplier that later tries to informally
// pressure a distributor's pricing needs the agreement itself to be clean.
// A franchise agreement is even more tightly regulated: the Franchising
// Code of Conduct mandates a disclosure document and key facts sheet at
// least 14 days before signing, a statutory cooling-off period, and
// specific handling of the marketing fund, none of which this agreement
// itself can satisfy -- clause 14 records the parties' acknowledgment of
// those steps having been taken, but the disclosure document and key facts
// sheet are separate documents this precedent does not attempt to be.
import { field, type PrecedentSeed } from "./types";
import { L } from "./instrumentParts";
import { opening, interpretation, generalProvisions, execution, confidentialInformationExceptions } from "./agreementParts";

const COMMERCIAL = ["Commercial"];

export const AGREEMENTS_BATCH_7: PrecedentSeed[] = [
  // ── Distribution agreement ───────────────────────────────────────
  {
    key: "agr.distribution_agreement",
    name: "Distribution Agreement",
    description:
      "Appoints a distributor in full: exclusivity and territory, minimum purchase obligations, a trade mark licence for distribution purposes, product liability and recall allocation, and an explicit distributor pricing-freedom clause so the agreement can't be read as resale price maintenance.",
    category: "Commercial",
    subcategory: "Distribution",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "Resale price maintenance (specifying, requiring or attempting to induce a minimum resale price) is prohibited outright under the Competition and Consumer Act 2010 (Cth), regardless of how the agreement is worded or how commercially reasonable it seems; clause 11.1 exists so the agreement itself can never be read as doing this, but check that no side letter, price list or verbal understanding contradicts it. Exclusive dealing and territorial restrictions (clauses 3 and 4) do not carry the same outright prohibition but can still raise competition concerns depending on the parties' market power: have the competition law position reviewed before the agreement is executed, particularly if either party has a significant share of the relevant market. Confirm the minimum purchase obligations in Schedule 1 are realistic; a Distributor that cannot plausibly meet them is a termination dispute waiting to happen.",
    aiInstructions:
      "Draft a distribution agreement appointing a distributor to resell a supplier's products. State the appointment's exclusivity level plainly (exclusive, sole or non-exclusive) and the Territory it applies to. Build real minimum purchase or performance obligations into a schedule, with a stated consequence (loss of exclusivity, or termination) for failing to meet them, not just an aspirational target. Cover ordering, pricing and payment mechanics, when title and risk pass, and a limited trade mark licence so the Distributor may use the Supplier's marks for marketing and sale of the Products but nothing wider. Allocate product liability and recall responsibility between the parties: the Supplier is usually responsible for a defect in manufacture, the Distributor for its own handling, storage and representations. The competition law clause is not optional: state expressly that the Distributor is free to determine its own resale prices and that nothing in this agreement requires, or is intended to require, a minimum resale price, because a distribution agreement that does this is unlawful outright under the Competition and Consumer Act regardless of the parties' intentions. Cover term, termination, and what happens to the Distributor's remaining stock and customer relationships afterwards.",
    segments: [
      ...opening(
        "DISTRIBUTION AGREEMENT",
        {
          key: "supplier",
          label: "Supplier",
          example: "ACME Manufacturing Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email sales@acmemanufacturing.com.au",
          shortExample: "the Supplier",
        },
        {
          key: "distributor",
          label: "Distributor",
          example: "Brightside Distribution Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email orders@brightsidedistribution.com.au",
          shortExample: "the Distributor",
        },
        [
          ...L("DeedRecital", [
            "The Supplier manufactures or supplies the products described in Schedule 1 (the Products), and has agreed to appoint the Distributor to sell the Products within the Territory, on the terms of this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", ["Marks means the trade marks of the Supplier described in Schedule 1."]),
      ...L("DeedList-Level3", ["Products has the meaning given in Recital A."]),
      ...L("DeedList-Level3", ["Territory means ", field("territory", "Territory", "Australia and New Zealand"), "."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Appointment"]),
      ...L("DeedList-Level2-Normal", [
        "The Supplier appoints the Distributor as its ",
        field("exclusivity", "Exclusive, sole or non-exclusive", "exclusive"),
        " distributor of the Products within the Territory, and the Distributor accepts the appointment, on the terms of this agreement.",
      ]),

      ...L("DeedList-Level1-Bold", ["Territory and field"]),
      ...L("DeedList-Level2-Normal", [
        "The Distributor must not, without the Supplier's prior written consent, actively market or sell the Products outside the Territory, but nothing in this clause restricts the Distributor from responding to an unsolicited order from outside the Territory.",
      ]),

      ...L("DeedList-Level1-Bold", ["Minimum purchase obligations"]),
      ...L("DeedList-Level2-Normal", [
        "The Distributor must purchase at least the minimum quantities or value of Products set out in Schedule 1 for each period specified there. If the Distributor fails to meet a minimum purchase obligation, the Supplier may, by written notice, convert the appointment under clause 3 to non-exclusive, or terminate this agreement under clause 12.",
      ]),

      ...L("DeedList-Level1-Bold", ["Orders, pricing and payment"]),
      ...L("DeedList-Level2-Normal", [
        "The Distributor orders Products by purchase order, which the Supplier may accept or decline. The price for Products is the Supplier's price list current at the date of the order, subject to any discount recorded in Schedule 1.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Distributor must pay for Products within ",
        field("payment_terms", "Payment terms", "30 days of the date of the Supplier's invoice"),
        ". Amounts payable under this agreement are exclusive of GST, which the Distributor must pay in addition on receipt of a valid tax invoice.",
      ]),

      ...L("DeedList-Level1-Bold", ["Title and risk"]),
      ...L("DeedList-Level2-Normal", [
        "Risk in Products passes to the Distributor on delivery. Title does not pass until the Distributor has paid for the relevant Products in full.",
      ]),

      ...L("DeedList-Level1-Bold", ["Trade mark licence"]),
      ...L("DeedList-Level2-Normal", [
        "The Supplier grants the Distributor a non-exclusive, non-transferable licence to use the Marks within the Territory, solely to market and sell the Products in accordance with this agreement and any branding guidelines the Supplier provides, and the licence ends immediately on termination or expiry of this agreement.",
      ]),

      ...L("DeedList-Level1-Bold", ["Marketing"]),
      ...L("DeedList-Level2-Normal", [
        field("marketing_obligations", "Marketing obligations and any contribution", "The Distributor must use reasonable endeavours to actively promote and sell the Products within the Territory, in accordance with an annual marketing plan the parties agree, to which the Supplier contributes 2% of the Distributor's Net Sales of Products for the preceding year"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Warranties and product liability"]),
      ...L("DeedList-Level2-Normal", [
        "The Supplier warrants that the Products will, at the time of delivery, be free from material defects in manufacture and comply with all applicable Australian product safety and labelling laws.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "As between the parties, the Supplier is responsible for a defect in the manufacture of a Product, and the Distributor is responsible for any defect or loss arising from its storage, handling, transport or representations about a Product inconsistent with the Supplier's own materials.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If a Product is recalled, whether voluntarily or under a mandatory recall, the Distributor must give the Supplier all reasonable assistance to give effect to the recall, and the cost of the recall is borne by the party responsible for the defect that caused it under clause 10.2.",
      ]),

      ...L("DeedList-Level1-Bold", ["Competition law: pricing"]),
      ...L("DeedList-Level2-Normal", [
        "The Distributor is free to determine, in its absolute discretion, the price at which it resells Products, and nothing in this agreement, and no price list, recommendation or communication from the Supplier, is intended to require, or should be understood as requiring, a minimum resale price.",
      ]),

      ...L("DeedList-Level1-Bold", ["Term, renewal and termination"]),
      ...L("DeedList-Level2-Normal", [
        "This agreement commences on ",
        field("commencement_date", "Commencement date", "1 September 2026"),
        " and continues for ",
        field("initial_term", "Initial term", "2 years"),
        ", and then automatically renews for successive periods of ",
        field("renewal_term", "Renewal term", "1 year"),
        " unless either party gives the other at least ",
        field("non_renewal_notice", "Notice period to prevent renewal", "3 months'"),
        " written notice before the end of the then current term that it will not renew.",
      ]),
      ...L("DeedList-Level2-Normal", ["Either party may terminate this agreement immediately by written notice if the other party:"]),
      ...L("DeedList-Level3", ["commits a material breach of this agreement that is not remedied within 20 Business Days of written notice requiring it to be remedied; or"]),
      ...L("DeedList-Level3", ["becomes insolvent, has a controller or administrator appointed, or enters into any arrangement with its creditors."]),

      ...L("DeedList-Level1-Bold", ["Post-termination"]),
      ...L("DeedList-Level2-Normal", [
        "On termination or expiry, the Distributor must immediately stop using the Marks, and, at the Supplier's election, either sell its remaining stock of Products in the ordinary course for a further period of ",
        field("sell_through_period", "Sell-through period for remaining stock after termination", "60 days"),
        " on the terms of this agreement, or sell that stock back to the Supplier at the price the Distributor paid for it.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "On the Supplier's written request, the Distributor must give the Supplier a list of customers it has sold Products to in the 12 months before termination, to assist an orderly transition, and must not use that customer information to compete with the Supplier's Products after termination.",
      ]),

      ...generalProvisions(),
      ...execution("Supplier", "Distributor"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1: Products, Marks, Pricing and Minimum Purchase"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("products_marks_schedule", "Products, Marks, discount and minimum purchase obligations", "Products: the ACME range of outdoor furniture, as listed in the Supplier's current catalogue. Marks: Australian Trade Mark Registration No. 1234567, \"ACME\". Discount: 30% off current list price. Minimum purchase: $150,000 (ex GST) of Products in each 12 month period from commencement."),
      ]),
    ],
  },

  // ── Franchise agreement ──────────────────────────────────────────
  {
    key: "agr.franchise_agreement",
    name: "Franchise Agreement",
    description:
      "Full franchise grant subject to the Franchising Code of Conduct: territory and exclusivity, fees with a marketing fund accounting obligation, system and manual compliance, transfer, and termination with restraint and de-identification: with the Code's disclosure, key facts sheet and cooling-off steps recorded rather than assumed.",
    category: "Commercial",
    subcategory: "Franchise",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "This agreement is only one part of what the Franchising Code of Conduct requires: it does not itself satisfy the Code's disclosure document, key facts sheet, or cooling-off obligations, and clause 14 records an acknowledgment that those steps were taken rather than performing them. Confirm the current Code requirements before this agreement is used: the disclosure document and key facts sheet must be given at least 14 days before the agreement is signed or any non-refundable payment is made, and the Franchisee has a 7 day cooling-off period after signing or paying (whichever is first) during which it may terminate and receive a refund less the Franchisor's reasonable expenses. The Code has been amended more than once and civil penalties apply to non-compliance, so verify the current version rather than relying on this summary. Check the marketing fund clause against the Code's own requirements for a separate account and an annual financial statement to contributors: this is one of the most heavily scrutinised parts of a franchise relationship in practice.",
    aiInstructions:
      "Draft a franchise agreement. Cover the grant, the Territory and whether it is exclusive; term and any renewal right; the initial fee, ongoing royalty and marketing fund contribution, with an express obligation on the Franchisor to hold marketing fund money in a separate account and account for it to Franchisees at least annually; compliance with the System and the current Operations Manual, which the Franchisor may update from time to time; training and ongoing support; a licence to use the Franchisor's intellectual property limited to operating the franchised business; supply arrangements if the Franchisee must buy from the Franchisor or an approved supplier; premises arrangements; performance standards; transfer, with the Franchisor's consent not to be unreasonably withheld but subject to conditions (training, a fee, and the transferee meeting the Franchisor's standard criteria); and termination, with post-termination obligations including de-identification (removing the Franchisor's branding and signage) and restraint. Include an explicit acknowledgment clause recording that the Franchisor gave the disclosure document, key facts sheet and a copy of the Franchising Code of Conduct at least 14 days before signing, and that the Franchisee understands its cooling-off rights: this is a record of compliance, not a substitute for actually complying. Include the dispute resolution procedure the Code requires before either party commences proceedings.",
    segments: [
      ...opening(
        "FRANCHISE AGREEMENT",
        {
          key: "franchisor",
          label: "Franchisor",
          example: "ACME Franchising Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email franchising@acmefranchising.com.au",
          shortExample: "the Franchisor",
        },
        {
          key: "franchisee",
          label: "Franchisee",
          example: "Brightside Operations Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email admin@brightsideoperations.com.au",
          shortExample: "the Franchisee",
        },
        [
          ...L("DeedRecital", [
            "The Franchisor has developed a system for operating ",
            field("business_description", "Description of the franchised business", "a quick-service coffee outlet"),
            " under the name and system described in Schedule 1 (the System), and has agreed to grant the Franchisee a franchise to operate a business under the System, on the terms of this agreement.",
          ]),
          ...L("DeedRecital", [
            "The Franchisor has given the Franchisee a disclosure document, a key facts sheet and a copy of the Franchising Code of Conduct in accordance with the Code, and the Franchisee has had the opportunity to obtain independent legal, accounting and business advice before signing this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", ["Code means the Competition and Consumer (Industry Codes: Franchising) Regulation 2014 (Cth), as in force from time to time."]),
      ...L("DeedList-Level3", ["Manual means the Franchisor's operations manual for the System, as amended by the Franchisor from time to time."]),
      ...L("DeedList-Level3", ["Marketing Fund means the fund established under clause 5.3."]),
      ...L("DeedList-Level3", ["System has the meaning given in Recital A."]),
      ...L("DeedList-Level3", ["Territory means ", field("territory", "Territory", "a 5 kilometre radius of 100 Sample Road, Newtown NSW"), "."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Grant"]),
      ...L("DeedList-Level2-Normal", [
        "The Franchisor grants the Franchisee a licence to operate a business under the System, using the Franchisor's Marks, at ",
        field("premises", "Franchised premises", "100 Sample Road, Newtown NSW 2042"),
        " and within the Territory.",
      ]),
      ...L("DeedList-Level2-Normal", [
        field("exclusivity", "Whether the Territory is exclusive to the Franchisee", "The Franchisor will not itself operate, or grant another franchise to operate, a business under the System within the Territory during the term"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Term and renewal"]),
      ...L("DeedList-Level2-Normal", [
        "This agreement commences on ",
        field("commencement_date", "Commencement date", "1 September 2026"),
        " and continues for ",
        field("initial_term", "Initial term", "5 years"),
        ", with an option for the Franchisee to renew for a further ",
        field("renewal_term", "Renewal term", "5 years"),
        " on the terms then offered by the Franchisor to new franchisees, provided the Franchisee has substantially complied with this agreement and gives notice of renewal at least ",
        field("renewal_notice", "Notice period to exercise renewal option", "6 months"),
        " before expiry.",
      ]),

      ...L("DeedList-Level1-Bold", ["Fees"]),
      ...L("DeedList-Level2-Normal", [
        "The Franchisee must pay the Franchisor an initial franchise fee of ",
        field("initial_fee", "Initial franchise fee", "$45,000 (excluding GST)"),
        " on signing this agreement.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Franchisee must pay the Franchisor an ongoing royalty of ",
        field("royalty_rate", "Ongoing royalty", "6% of Gross Sales"),
        ", payable ",
        field("royalty_frequency", "Royalty payment frequency", "monthly in arrears"),
        ", together with a marketing fund contribution of ",
        field("marketing_fund_rate", "Marketing fund contribution", "2% of Gross Sales"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Franchisor must hold marketing fund contributions in a separate bank account, apply them only for genuine marketing and promotional purposes for the System, and give contributing franchisees a statement detailing the Marketing Fund's income and expenditure at least once every 12 months, in accordance with the Code.",
      ]),

      ...L("DeedList-Level1-Bold", ["System and manual"]),
      ...L("DeedList-Level2-Normal", [
        "The Franchisee must operate the franchised business strictly in accordance with the System and the Manual, as amended by the Franchisor from time to time on reasonable notice, and must not deviate from it without the Franchisor's prior written consent.",
      ]),

      ...L("DeedList-Level1-Bold", ["Training and support"]),
      ...L("DeedList-Level2-Normal", [
        field("training_support", "Training and ongoing support provided", "The Franchisor will provide initial training of 2 weeks before opening, and ongoing operational support including a minimum of 4 business coaching visits per year"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Intellectual property licence"]),
      ...L("DeedList-Level2-Normal", [
        "The Franchisor grants the Franchisee a non-exclusive, non-transferable licence to use the Franchisor's trade marks, trade names, signage and other intellectual property comprised in the System, solely to operate the franchised business in accordance with this agreement, and the licence ends immediately on termination or expiry of this agreement.",
      ]),

      ...L(null, ["[Delete clause 9 if the Franchisee is not required to purchase from the Franchisor or an approved supplier.]"]),
      ...L("DeedList-Level1-Bold", ["Supply"]),
      ...L("DeedList-Level2-Normal", [
        field("supply_arrangements", "Supply arrangements", "The Franchisee must purchase stock exclusively from the Franchisor or a supplier the Franchisor approves in writing, on the Franchisor's then-current price list"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Performance standards"]),
      ...L("DeedList-Level2-Normal", [
        "The Franchisee must maintain the standards of operation, presentation, hygiene and customer service the Manual specifies, and must permit the Franchisor to inspect the franchised business, on reasonable notice, to verify compliance.",
      ]),

      ...L("DeedList-Level1-Bold", ["Transfer"]),
      ...L("DeedList-Level2-Normal", [
        "The Franchisee must not transfer this agreement or the franchised business without the Franchisor's prior written consent, which must not be unreasonably withheld if the proposed transferee meets the Franchisor's then-current criteria for new franchisees, completes the Franchisor's training, and the Franchisee is not then in breach of this agreement.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Franchisor may charge a reasonable transfer fee, not exceeding its reasonable costs of considering and processing the transfer.",
      ]),

      ...L("DeedList-Level1-Bold", ["Termination"]),
      ...L("DeedList-Level2-Normal", ["The Franchisor may terminate this agreement by written notice in accordance with, and only on a ground and after any process, the Code permits, including:"]),
      ...L("DeedList-Level3", ["a material breach of this agreement not remedied within the period required by the Code after written notice; and"]),
      ...L("DeedList-Level3", ["an Insolvency Event occurring in relation to the Franchisee, to the extent the Code permits termination on that ground."]),
      ...L("DeedList-Level2-Normal", [
        "Insolvency Event means the Franchisee becoming insolvent, having a controller, administrator, receiver or liquidator appointed, or entering into any arrangement with its creditors.",
      ]),

      ...L("DeedList-Level1-Bold", ["Post-termination obligations"]),
      ...L("DeedList-Level2-Normal", [
        "On termination or expiry, the Franchisee must immediately stop operating under the System, remove all signage and other material identifying the franchised business with the Franchisor (de-identification), and stop using the Franchisor's intellectual property.",
      ]),
      ...L(null, ["[Delete clause 13.2 if a post-termination restraint was not agreed.]"]),
      ...L("DeedList-Level2-Normal", [
        "For ",
        field("restraint_period", "Post-termination restraint period", "12 months from termination or expiry"),
        ", within ",
        field("restraint_area", "Post-termination restraint area", "the Territory"),
        ", the Franchisee must not operate, or be engaged, concerned or interested in, a business competing with the System.",
      ]),

      ...L("DeedList-Level1-Bold", ["Franchising code acknowledgment"]),
      ...L("DeedList-Level2-Normal", [
        "The Franchisee acknowledges that it received the disclosure document, key facts sheet and a copy of the Code at least 14 days before signing this agreement or making any non-refundable payment, and that it understands it may terminate this agreement within 7 days of signing it or making a payment under it (whichever is earlier), by written notice to the Franchisor, and receive a refund of amounts paid less the Franchisor's reasonable expenses.",
      ]),

      ...L("DeedList-Level1-Bold", ["Dispute resolution"]),
      ...L("DeedList-Level2-Normal", [
        "Before commencing proceedings (other than to seek urgent interlocutory relief), a party must give the other written notice of the dispute and comply with the complaint handling and dispute resolution procedure the Code requires, including mediation if either party requests it.",
      ]),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must keep confidential, and not disclose except to its professional advisers or as required by law, the Manual and any Confidential Information of the other party, being information disclosed in connection with this agreement that is not public other than through a breach of this clause, but does not include information that:",
      ]),
      ...confidentialInformationExceptions(),

      ...generalProvisions(),
      ...execution("Franchisor", "Franchisee"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1: The System"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("system_schedule", "Description of the System", "The ACME quick-service coffee franchise system, comprising the ACME trade marks, store design, recipes, supplier relationships and operating procedures set out in the Manual."),
      ]),
    ],
  },
];
