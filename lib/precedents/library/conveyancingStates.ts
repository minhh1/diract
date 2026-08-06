// lib/precedents/library/conveyancingStates.ts
// Conveyancing outside NSW: VIC, QLD, SA, WA and TAS.
//
// These exist as separate precedents rather than one document with a
// "[STATE]" placeholder because the underlying regimes are not variations of
// a theme -- they are different systems:
//
//  VENDOR DISCLOSURE
//   VIC  Section 32 Vendor's Statement (Sale of Land Act 1962) -- extensive,
//        and defects in it give the purchaser rescission rights.
//   SA   Form 1 Vendor's Statement (Land and Business (Sale and
//        Conveyancing) Act 1994) -- and critically, the cooling-off period
//        runs from the LATER of the contract date and service of the Form 1.
//   TAS  Property vendor disclosure statement before contract.
//   QLD  No general vendor's statement; a warning statement in the contract,
//        plus Form 1 disclosure for community-title lots.
//   WA   No general vendor's statement.
//
//  COOLING OFF (all waived on auction purchase, in every state)
//   VIC  3 business days      QLD  5 business days
//   SA   2 clear business days (running from the later of contract or Form 1)
//   WA   NONE -- no statutory cooling-off period at all
//   TAS  NONE
//
// The WA and TAS position is the one most likely to catch out a practitioner
// working across borders, and is why those two have their own express advice
// precedents below rather than being folded into a generic one.
//
// Cooling-off periods and duty rates are stated in aiInstructions as
// context for drafting, but every precedent carries a review note requiring
// verification -- these are set by statute and regulation and do change.
import { text, field, type PrecedentSeed } from "./types";

const CONVEYANCING = ["Conveyancing"];

export const CONVEYANCING_STATES_PRECEDENTS: PrecedentSeed[] = [
  // ── Victoria ────────────────────────────────────────────────────
  {
    key: "convvic.contract_advice",
    name: "Contract Advice: Residential Purchase (VIC)",
    description: "Contract and Section 32 advice for a Victorian residential purchase.",
    category: "Conveyancing",
    subcategory: "Purchase: Pre-exchange",
    documentType: "advice",
    jurisdictions: ["VIC"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft contract advice for a Victorian residential purchase. Deal with the Contract of Sale and, separately and in detail, the Section 32 Vendor's Statement under the Sale of Land Act 1962 (Vic): title particulars and any restrictions or covenants; planning and zoning; rates, taxes and outgoings including any land tax; building permits issued in the last 7 years and any owner-builder insurance; services connected; any notices or orders; and owners corporation details where applicable. Explain that a defective or incomplete s 32 can give the purchaser a right to rescind before settlement, so any gap matters. Cover the 3 business day cooling-off period and that it does not apply to auction purchases or within 3 clear business days before or after a publicly advertised auction.",
    segments: [
      text("CONTRACT AND SECTION 32 ADVICE\n\nProperty: "),
      field("property", "Property", "24 Example Street, Richmond VIC 3121"),
      text("\nPurchase price: "),
      field("price", "Purchase price", "$1,180,000"),
      text("\n\nTITLE\n\n"),
      field("title", "Title, covenants, easements", "The property is Lot 5 on Plan of Subdivision 123456. The title is subject to a carriageway easement along the eastern boundary and a single-dwelling covenant."),
      text("\n\nSECTION 32 VENDOR'S STATEMENT\n\nThe Vendor's Statement is the seller's compulsory disclosure. If it is incomplete or inaccurate in a material respect, you may have a right to rescind before settlement.\n\n"),
      field("s32_review", "Section 32 review", "The Statement discloses: zoning Neighbourhood Residential; council rates of $2,140 per annum; no land tax currently assessed; a building permit issued in 2022 for a rear deck, with no owner-builder insurance disclosed; and all services connected."),
      text("\n\nMATTERS OF CONCERN\n\n"),
      field("concerns", "Concerns arising from the s 32", "The 2022 deck permit is disclosed but no certificate of final inspection or occupancy permit is attached. We have asked the vendor's practitioner to produce it. If the works were never signed off, you may inherit an enforcement risk from the council."),
      text("\n\nCOOLING OFF\n\n"),
      field("cooling_off", "Cooling-off position", "You have a cooling-off period of 3 business days from signing, during which you may end the contract, forfeiting a small penalty. Cooling off does NOT apply if you buy at auction, or within 3 clear business days before or after a publicly advertised auction."),
      text("\n\nSETTLEMENT AND DUTY\n\n"),
      field("settlement_duty", "Settlement and duty", "Settlement is 60 days from the contract date. Land transfer duty will be payable to the State Revenue Office. We will confirm the exact amount and any concession you may be eligible for."),
      text("\n\nOUR RECOMMENDATIONS\n\n"),
      field("recommendations", "Recommendations", "1. Do not sign until we have the occupancy permit for the deck.\n2. Confirm your finance is unconditional.\n3. Arrange building and pest inspections now."),
    ],
    requiresReview: true,
    reviewNote:
      "Verify the current Section 32 disclosure requirements, the cooling-off period and penalty, and land transfer duty rates and concessions against the Sale of Land Act 1962 (Vic) and current SRO Victoria guidance.",
  },
  // ── Queensland ──────────────────────────────────────────────────
  {
    key: "convqld.contract_advice",
    name: "Contract Advice: Residential Purchase (QLD)",
    description: "Contract advice for a Queensland purchase, covering the warning statement and cooling off.",
    category: "Conveyancing",
    subcategory: "Purchase: Pre-exchange",
    documentType: "advice",
    jurisdictions: ["QLD"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft contract advice for a Queensland residential purchase, typically on the REIQ standard contract. Cover: the warning statement and its placement requirements; the 5 business day cooling-off period and the 0.25% penalty on termination; that cooling off does not apply to auction purchases; the finance and building and pest condition dates and the strictness with which they operate; body corporate disclosure (Form 1 / community management statement) for a community titles lot; and the fact that in Queensland the contract date drives every other date, so it must be recorded accurately. Note that unlike NSW and VIC there is no general vendor's statement.",
    segments: [
      text("CONTRACT ADVICE\n\nProperty: "),
      field("property", "Property", "18 Example Street, Ipswich QLD 4305"),
      text("\nPurchase price: "),
      field("price", "Purchase price", "$720,000"),
      text("\nContract date: "),
      field("contract_date", "Contract date", "14 August 2026"),
      text("\n\nEVERY DATE RUNS FROM THE CONTRACT DATE\n\nIn Queensland the contract date drives the cooling-off period, the finance date, the building and pest date and settlement. It is critical that it is recorded correctly.\n\nCOOLING OFF\n\nYou have a cooling-off period of 5 business days from the contract date. If you terminate during it, the seller may retain a penalty of 0.25% of the purchase price.\n\nCooling off does NOT apply if you buy at auction.\n\nCONDITIONS\n\n"),
      field("conditions", "Finance and building and pest conditions", "Finance approval is due by 4 September 2026. Building and pest inspection is due by 28 August 2026. These dates are strict: if you are not in a position to satisfy or terminate by 5pm on the due date, you lose the benefit of the condition and are bound to complete."),
      text("\n\nTITLE AND DISCLOSURE\n\n"),
      field("title_disclosure", "Title and disclosure position", "Queensland has no general vendor's disclosure statement. Our searches disclose a registered easement for sewerage along the rear boundary and no encumbrances other than the seller's mortgage, which will be released at settlement."),
      text("\n\n"),
      field("body_corporate", "Body corporate position (if applicable)", "Not applicable: freehold standard format lot."),
      text("\n\nSETTLEMENT AND DUTY\n\n"),
      field("settlement_duty", "Settlement and duty", "Settlement is 30 days from the contract date. Transfer duty is payable to the Queensland Revenue Office. We will confirm the amount and whether the first home or home concession applies to you."),
      text("\n\nOUR RECOMMENDATIONS\n\n"),
      field("recommendations", "Recommendations", "1. Book your building and pest inspection immediately; the window is short.\n2. Press your broker for written unconditional finance approval before 4 September.\n3. Tell us the moment anything looks like slipping; extensions must be agreed in writing before the date passes."),
    ],
    requiresReview: true,
    reviewNote:
      "Verify the current cooling-off period, termination penalty and transfer duty concessions against the Property Occupations Act 2014 (Qld) and current QRO guidance.",
  },
  // ── South Australia ─────────────────────────────────────────────
  {
    key: "convsa.contract_advice",
    name: "Contract Advice: Residential Purchase (SA)",
    description: "Contract and Form 1 advice for a South Australian purchase.",
    category: "Conveyancing",
    subcategory: "Purchase: Pre-exchange",
    documentType: "advice",
    jurisdictions: ["SA"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft contract advice for a South Australian residential purchase. Deal with the Form 1 Vendor's Statement under the Land and Business (Sale and Conveyancing) Act 1994 (SA) and, critically, explain that the cooling-off period of 2 clear business days runs from the LATER of the contract date and the date the Form 1 is served -- so late service of the Form 1 extends the client's cooling-off rights. Cover title, encumbrances, council rates and any land tax, and note that cooling off does not apply to auction purchases. Note stamp duty is payable to RevenueSA.",
    segments: [
      text("CONTRACT AND FORM 1 ADVICE\n\nProperty: "),
      field("property", "Property", "9 Example Street, Norwood SA 5067"),
      text("\nPurchase price: "),
      field("price", "Purchase price", "$860,000"),
      text("\n\nTHE FORM 1 VENDOR'S STATEMENT\n\nThe Form 1 is the seller's compulsory disclosure statement. It discloses title particulars, encumbrances, rates and taxes, and prescribed particulars about the property.\n\n"),
      field("form1_review", "Form 1 review", "The Form 1 discloses the certificate of title, a mortgage to be discharged at settlement, council rates of $1,940 per annum, and an easement for drainage. No land tax is currently assessed."),
      text("\n\nCOOLING OFF: IMPORTANT TIMING POINT\n\nYou have 2 clear business days to cool off. That period runs from the LATER of:\n\n(a) the date the contract was made; and\n(b) the date the Form 1 was served on you.\n\nSo if the Form 1 is served late, your cooling-off rights are extended accordingly. This matters and is frequently misunderstood.\n\n"),
      field("cooling_off_position", "Cooling-off position in this matter", "The contract was made on 14 August 2026 and the Form 1 served on 16 August 2026. Your cooling-off period therefore runs from 16 August."),
      text("\n\nCooling off does NOT apply if you buy at auction.\n\nSETTLEMENT AND DUTY\n\n"),
      field("settlement_duty", "Settlement and duty", "Settlement is 45 days from the contract date. Stamp duty is payable to RevenueSA and we will confirm the amount."),
      text("\n\nOUR RECOMMENDATIONS\n\n"),
      field("recommendations", "Recommendations", "1. Note your cooling-off deadline carefully given the later Form 1 service.\n2. Confirm your finance position before the cooling-off period expires.\n3. Arrange a building inspection now."),
    ],
    requiresReview: true,
    reviewNote:
      "Verify the current Form 1 content requirements and cooling-off period under the Land and Business (Sale and Conveyancing) Act 1994 (SA), and current RevenueSA duty rates.",
  },
  // ── Western Australia ───────────────────────────────────────────
  {
    key: "convwa.contract_advice",
    name: "Contract Advice: Residential Purchase (WA)",
    description: "WA purchase advice, including that there is NO statutory cooling-off period.",
    category: "Conveyancing",
    subcategory: "Purchase: Pre-exchange",
    documentType: "advice",
    jurisdictions: ["WA"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft contract advice for a Western Australian residential purchase, typically on the Contract for Sale of Land or Strata Title by Offer and Acceptance with the Joint Form of General Conditions. The single most important point, which must be stated prominently: WESTERN AUSTRALIA HAS NO STATUTORY COOLING-OFF PERIOD for residential property. Once the offer is accepted the client is bound, subject only to any conditions written into the contract. Therefore all protection must be built in as conditions BEFORE the offer is accepted -- finance, building inspection, timber pest, and any due diligence. Also cover title and encumbrances, the settlement period, and transfer duty payable to RevenueWA.",
    segments: [
      text("CONTRACT ADVICE\n\nProperty: "),
      field("property", "Property", "42 Example Street, Subiaco WA 6008"),
      text("\nPurchase price: "),
      field("price", "Purchase price", "$980,000"),
      text("\n\n----------------------------------------\nTHERE IS NO COOLING-OFF PERIOD IN WESTERN AUSTRALIA\n\nUnlike every other mainland state, WA gives you NO statutory right to change your mind after your offer is accepted.\n\nOnce the seller accepts your offer, you are bound. Your only protection is whatever conditions are written into the contract before acceptance.\n\nThis is why the conditions below matter so much.\n----------------------------------------\n\nYOUR CONDITIONS\n\n"),
      field("conditions", "Conditions in the contract", "The contract is conditional upon:\n1. Finance approval by 5 September 2026.\n2. A satisfactory structural building inspection by 28 August 2026.\n3. A satisfactory timber pest inspection by 28 August 2026."),
      text("\n\nEach condition must be satisfied or exercised strictly by its date. If a date passes without action, you lose that protection and remain bound to complete.\n\nTITLE\n\n"),
      field("title", "Title and encumbrances", "The property is Lot 88 on Deposited Plan 12345. The title is subject to a sewerage easement in favour of the Water Corporation. The seller's mortgage will be discharged at settlement."),
      text("\n\nSETTLEMENT AND DUTY\n\n"),
      field("settlement_duty", "Settlement and duty", "Settlement is 42 days from acceptance. Transfer duty is payable to RevenueWA. We will confirm the amount and whether the first home owner rate applies."),
      text("\n\nOUR RECOMMENDATIONS\n\n"),
      field("recommendations", "Recommendations", "1. Because there is no cooling off, do not sign an offer until you are genuinely ready to proceed.\n2. Book both inspections immediately.\n3. Diarise every condition date and contact us well before each one."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm no cooling-off right applies to this transaction type and verify current RevenueWA duty rates and first home owner thresholds.",
  },
  // ── Tasmania ────────────────────────────────────────────────────
  {
    key: "convtas.contract_advice",
    name: "Contract Advice: Residential Purchase (TAS)",
    description: "Tasmanian purchase advice, covering vendor disclosure and the absence of cooling off.",
    category: "Conveyancing",
    subcategory: "Purchase: Pre-exchange",
    documentType: "advice",
    jurisdictions: ["TAS"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft contract advice for a Tasmanian residential purchase. Cover the vendor's disclosure statement required before contract (known defects, encumbrances and property information), title and encumbrances, the conditions in the contract, settlement and duty payable to the State Revenue Office of Tasmania. State prominently that TASMANIA HAS NO STATUTORY COOLING-OFF PERIOD, so as in WA all protection must be built in as contract conditions before signing.",
    segments: [
      text("CONTRACT ADVICE\n\nProperty: "),
      field("property", "Property", "7 Example Street, Battery Point TAS 7004"),
      text("\nPurchase price: "),
      field("price", "Purchase price", "$690,000"),
      text("\n\n----------------------------------------\nTHERE IS NO COOLING-OFF PERIOD IN TASMANIA\n\nOnce you sign and the contract is formed, you are bound, subject only to the conditions written into it.\n\nDo not sign until you are ready to proceed and the conditions below are in place.\n----------------------------------------\n\nVENDOR DISCLOSURE\n\nThe vendor must provide a disclosure statement before the contract is signed, disclosing known defects, encumbrances and prescribed property information.\n\n"),
      field("disclosure_review", "Disclosure statement review", "The disclosure statement discloses no known structural defects, a registered right of way along the western boundary, and council rates of $1,780 per annum."),
      text("\n\nYOUR CONDITIONS\n\n"),
      field("conditions", "Conditions in the contract", "The contract is conditional upon finance approval by 5 September 2026 and a satisfactory building inspection by 29 August 2026."),
      text("\n\nTITLE\n\n"),
      field("title", "Title and encumbrances", "The property is Lot 3 on Sealed Plan 12345. The vendor's mortgage will be discharged at settlement."),
      text("\n\nSETTLEMENT AND DUTY\n\n"),
      field("settlement_duty", "Settlement and duty", "Settlement is 42 days from the contract date. Duty is payable to the State Revenue Office of Tasmania and we will confirm the amount."),
      text("\n\nOUR RECOMMENDATIONS\n\n"),
      field("recommendations", "Recommendations", "1. Given there is no cooling off, satisfy yourself fully before signing.\n2. Arrange your building inspection immediately.\n3. Diarise both condition dates."),
    ],
    requiresReview: true,
    reviewNote:
      "Verify the current vendor disclosure requirements in Tasmania and duty rates with the State Revenue Office before advising.",
  },
  // ── Cross-border warning ────────────────────────────────────────
  {
    key: "conv.interstate_warning_note",
    name: "Interstate Conveyancing: Key Differences (file note)",
    description: "Internal reminder of the differences that most often catch out a practitioner acting across state lines.",
    category: "Conveyancing",
    subcategory: "Practice Notes",
    documentType: "file_note",
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft an internal file note summarising the differences between the states that most often cause errors when acting across borders: vendor disclosure regimes, cooling-off periods, and which revenue office administers duty. This is an internal aide-memoire, not client correspondence. Present it as a comparison so a practitioner can check at a glance, and state plainly that it is a prompt to verify, not a substitute for checking the current position in the relevant state.",
    segments: [
      text("INTERSTATE CONVEYANCING: CHECK BEFORE YOU ADVISE\n\nThis note is an aide-memoire only. Always confirm the current position in the relevant state.\n\nCOOLING OFF (all waived on auction purchase)\n\n  NSW   5 business days\n  VIC   3 business days\n  QLD   5 business days\n  SA    2 clear business days, running from the LATER of contract date\n        and service of the Form 1\n  WA    NONE\n  TAS   NONE\n\nVENDOR DISCLOSURE\n\n  NSW   Prescribed documents attached to the contract (s 10.7 certificate,\n        title, plan, drainage diagram)\n  VIC   Section 32 Vendor's Statement; defects can give rescission rights\n  SA    Form 1 Vendor's Statement; also drives the cooling-off start date\n  TAS   Vendor disclosure statement before contract\n  QLD   No general vendor's statement; warning statement in the contract,\n        plus disclosure for community-title lots\n  WA    No general vendor's statement\n\nDUTY ADMINISTERED BY\n\n  NSW Revenue NSW    VIC State Revenue Office    QLD Queensland Revenue Office\n  SA  RevenueSA      WA  RevenueWA               TAS State Revenue Office\n\nTHE TWO THAT CATCH PEOPLE OUT\n\n1. WA and TAS have no cooling off at all. A client who signs there is bound.\n   Every protection must be a contract condition, agreed before signing.\n\n2. In SA, late service of the Form 1 EXTENDS the cooling-off period. Check\n   the service date, not just the contract date.\n\n"),
      field("matter_note", "Note for this matter", "This matter concerns a Victorian property. Section 32 obtained and reviewed; cooling-off expiry diarised."),
    ],
    requiresReview: true,
    reviewNote:
      "This note is a prompt to verify, not authority. Cooling-off periods and disclosure requirements are set by state statute and change -- confirm the current position before relying on any line of it.",
  },
];
