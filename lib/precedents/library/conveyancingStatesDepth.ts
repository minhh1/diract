// lib/precedents/library/conveyancingStatesDepth.ts
// Working conveyancing documents for VIC, QLD, SA, WA and TAS -- the
// post-contract, settlement and sale-side correspondence that follows the
// contract advice in conveyancingStates.ts.
//
// Only documents whose SUBSTANCE differs by state are duplicated here.
// Where a document is genuinely the same everywhere (final inspection
// instructions, trust receipts, requests for funds) it lives once as a
// jurisdiction-neutral precedent rather than five near-identical copies.
//
// What actually differs, and why each state needs its own:
//   - Cooling off: VIC 3 business days, QLD 5 business days with a 0.25%
//     penalty, SA 2 clear business days running from the later of contract
//     and Form 1 service. WA and TAS have none, so no rescission-during-
//     cooling-off precedent exists for them at all.
//   - Vendor disclosure preparation: VIC Section 32, SA Form 1, TAS
//     disclosure statement, QLD warning statement. WA has none.
//   - Duty: a different revenue office and a different assessment pathway in
//     every state.
//   - Land registry: Land Use Victoria, Titles Queensland, Land Services SA,
//     Landgate (WA), Land Titles Office (TAS).
import { text, field, type PrecedentSeed } from "./types";

const CONVEYANCING = ["Conveyancing"];

export const CONVEYANCING_STATES_DEPTH_PRECEDENTS: PrecedentSeed[] = [
  // ── Cooling off / early termination (only where the right exists) ──
  {
    key: "convvic.cooling_off_notice",
    name: "Cooling-Off Notice (VIC)",
    description: "Ends the contract during the Victorian cooling-off period.",
    category: "Conveyancing",
    subcategory: "Purchase: Post-exchange",
    documentType: "letter",
    jurisdictions: ["VIC"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a cooling-off notice for a Victorian purchase. State the contract and property, that the purchaser gives notice of termination within the cooling-off period, and require refund of the deposit less the penalty the vendor is entitled to retain. Note that cooling off is unavailable where the property was bought at auction or within 3 clear business days before or after a publicly advertised auction. Timing is everything: the notice must be given within the period and in the manner the Act requires.",
    segments: [
      text("COOLING-OFF NOTICE\n\nProperty: "),
      field("property", "Property", "24 Example Street, Richmond VIC 3121"),
      text("\nContract dated: "),
      field("contract_date", "Contract date", "14 August 2026"),
      text("\n\nWe act for the purchaser, "),
      field("purchaser", "Purchaser", "Sam Taylor"),
      text(".\n\nOur client GIVES NOTICE that the contract is ended, pursuant to the cooling-off provisions of the Sale of Land Act 1962 (Vic).\n\nThis notice is given within the cooling-off period, which commenced on "),
      field("period_start", "Cooling-off period commenced", "14 August 2026"),
      text(" and expires on "),
      field("period_end", "Cooling-off period expires", "19 August 2026"),
      text(".\n\nDEPOSIT\n\nPlease arrange refund of the deposit of "),
      field("deposit", "Deposit paid", "$59,000"),
      text(", less the amount your client is entitled to retain under the Act, within the period required.\n\nPlease confirm the refund arrangements by return. If the refund is not made within the period the Act requires, our client will refer the matter to Consumer Affairs Victoria and reserves the right to recover the amount together with interest."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the cooling-off period has not expired, that the sale was not by auction or within 3 clear business days of a publicly advertised auction, and that the notice is given in the manner the Sale of Land Act 1962 (Vic) requires. Also confirm the current penalty the vendor may retain.",
  },
  {
    key: "convqld.cooling_off_notice",
    name: "Cooling-Off Termination Notice (QLD)",
    description: "Terminates during the Queensland cooling-off period.",
    category: "Conveyancing",
    subcategory: "Purchase: Post-exchange",
    documentType: "letter",
    jurisdictions: ["QLD"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a cooling-off termination notice for a Queensland contract. State the contract, that the buyer terminates within the 5 business day cooling-off period, and acknowledge the seller's entitlement to retain a termination penalty of 0.25% of the purchase price. Note cooling off does not apply to auction purchases. The notice must be signed by the buyer or their agent and given in the manner the contract requires.",
    segments: [
      text("NOTICE OF TERMINATION: COOLING-OFF PERIOD\n\nProperty: "),
      field("property", "Property", "18 Example Street, Ipswich QLD 4305"),
      text("\nContract date: "),
      field("contract_date", "Contract date", "14 August 2026"),
      text("\n\nWe act for the buyer, "),
      field("buyer", "Buyer", "Sam Taylor"),
      text(".\n\nOur client TERMINATES the contract under the cooling-off provisions of the Property Occupations Act 2014 (Qld).\n\nThis notice is given within the 5 business day cooling-off period, which expires on "),
      field("period_end", "Cooling-off period expires", "21 August 2026"),
      text(".\n\nTERMINATION PENALTY\n\nOur client acknowledges the seller's entitlement to retain a termination penalty of 0.25% of the purchase price, being "),
      field("penalty", "Penalty amount", "$1,800.00"),
      text(".\n\nPlease arrange refund of the balance of the deposit, being "),
      field("refund", "Balance to be refunded", "$34,200.00"),
      text(", to our trust account within the period required.\n\nPlease confirm by return. If the balance is not refunded promptly, our client reserves the right to pursue recovery, including through the Queensland Civil and Administrative Tribunal if necessary."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the cooling-off period is still running (it runs from the contract date, or from receipt of the contract if later), that the sale was not by auction, and the current penalty percentage.",
  },
  {
    key: "convsa.cooling_off_notice",
    name: "Cooling-Off Notice (SA)",
    description: "Ends the contract during the South Australian cooling-off period.",
    category: "Conveyancing",
    subcategory: "Purchase: Post-exchange",
    documentType: "letter",
    jurisdictions: ["SA"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a cooling-off notice for a South Australian purchase. State the contract, that the purchaser gives notice within the cooling-off period, and calculate the period from the LATER of the contract date and service of the Form 1; state both dates expressly so the calculation is transparent. Require refund of the deposit. Note cooling off is unavailable on an auction purchase.",
    segments: [
      text("COOLING-OFF NOTICE\n\nProperty: "),
      field("property", "Property", "9 Example Street, Norwood SA 5067"),
      text("\nContract dated: "),
      field("contract_date", "Contract date", "14 August 2026"),
      text("\nForm 1 served: "),
      field("form1_date", "Form 1 service date", "16 August 2026"),
      text("\n\nWe act for the purchaser, "),
      field("purchaser", "Purchaser", "Sam Taylor"),
      text(".\n\nOur client GIVES NOTICE of cooling off under the Land and Business (Sale and Conveyancing) Act 1994 (SA), and the contract is at an end.\n\nTIMING\n\nThe cooling-off period runs from the later of the contract date and the date the Form 1 was served. The Form 1 having been served on "),
      field("form1_repeat", "Form 1 date (repeat)", "16 August 2026"),
      text(", the period runs from that date and expires on "),
      field("period_end", "Period expires", "18 August 2026"),
      text(". This notice is given within that period.\n\nDEPOSIT\n\nPlease arrange refund of the deposit of "),
      field("deposit", "Deposit", "$43,000"),
      text(" to our trust account, in full and without deduction. Unlike some other states, South Australia does not entitle the vendor to retain any part of the deposit where the purchaser cools off validly within time.\n\nPlease confirm by return."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the Form 1 service date and recalculate the period from the later of it and the contract date. Late Form 1 service extends the period: getting this wrong either forfeits the client's right or purports to exercise a right that has expired.",
  },

  // ── Post-contract letters to client ─────────────────────────────
  {
    key: "convvic.post_contract_letter",
    name: "Post-Contract Letter to Client (VIC)",
    description: "Confirms the contract and all key Victorian dates.",
    category: "Conveyancing",
    subcategory: "Purchase: Post-exchange",
    documentType: "letter",
    jurisdictions: ["VIC"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a post-contract letter for a Victorian purchase. Confirm the contract date, list the cooling-off expiry, finance date, and settlement date, and set out what the client must do, particularly arranging insurance and finalising finance. Explain that duty is payable to the State Revenue Office and will be paid through the electronic settlement. Note the transfer will be registered with Land Use Victoria.",
    segments: [
      text("We confirm the contract for your purchase of "),
      field("property", "Property", "24 Example Street, Richmond VIC 3121"),
      text(" dated "),
      field("contract_date", "Contract date", "14 August 2026"),
      text(".\n\nKEY DATES: PLEASE DIARISE\n\n"),
      field("key_dates", "Key dates", "Cooling-off expires:   5:00pm, 19 August 2026\nFinance approval due:  4 September 2026\nSettlement:            13 October 2026"),
      text("\n\nWHAT YOU NEED TO DO\n\n"),
      field("client_actions", "Client actions", "1. Arrange building insurance now. Although the vendor generally remains at risk until settlement in Victoria, your lender will require cover in place before it advances funds.\n2. Provide the contract and Section 32 to your lender and press for unconditional approval before 4 September.\n3. Do not book removalists for settlement morning: settlements can be delayed."),
      text("\n\nDUTY AND REGISTRATION\n\nLand transfer duty is payable to the State Revenue Office and will be paid through the electronic settlement. We will confirm the exact amount and any concession with your settlement figures. The transfer will be registered with Land Use Victoria.\n\nWHAT WE WILL DO\n\n"),
      field("our_actions", "Our next steps", "We will order final searches, prepare the duty assessment and create the settlement workspace, and will send your settlement figures approximately a week before settlement."),
    ],
  },
  {
    key: "convqld.post_contract_letter",
    name: "Post-Contract Letter to Client (QLD)",
    description: "Confirms the contract and the strict Queensland condition dates.",
    category: "Conveyancing",
    subcategory: "Purchase: Post-exchange",
    documentType: "letter",
    jurisdictions: ["QLD"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a post-contract letter for a Queensland purchase. Confirm the contract date and emphasise that every other date runs from it. List cooling-off expiry, building and pest date, finance date and settlement. Stress that Queensland condition dates operate strictly: if the buyer is not in a position to satisfy or terminate by 5pm on the date, the benefit of the condition is lost. Explain duty is payable to the Queensland Revenue Office and the transfer registered with Titles Queensland.",
    segments: [
      text("We confirm the contract for your purchase of "),
      field("property", "Property", "18 Example Street, Ipswich QLD 4305"),
      text(" dated "),
      field("contract_date", "Contract date", "14 August 2026"),
      text(".\n\nEVERY DATE RUNS FROM THE CONTRACT DATE\n\n"),
      field("key_dates", "Key dates", "Cooling-off expires:      5:00pm, 21 August 2026\nBuilding and pest due:    5:00pm, 28 August 2026\nFinance approval due:     5:00pm, 4 September 2026\nSettlement:               14 September 2026"),
      text("\n\nTHESE DATES ARE STRICT\n\nIn Queensland these dates are applied strictly. If you are not in a position to either satisfy or terminate under a condition by 5:00pm on its date, you lose the benefit of that condition and are bound to complete.\n\nAn extension must be agreed IN WRITING BEFORE the date passes. It cannot be fixed afterwards.\n\nTell us immediately if anything looks like slipping, not on the day it is due.\n\nWHAT YOU NEED TO DO\n\n"),
      field("client_actions", "Client actions", "1. Book your building and pest inspection today. The window is 14 days.\n2. Give your broker the contract now and press for written unconditional approval.\n3. Arrange insurance: in Queensland the property is generally at the buyer's risk from the business day after the contract date."),
      text("\n\nDUTY AND REGISTRATION\n\nTransfer duty is payable to the Queensland Revenue Office. We will confirm the amount and whether a concession applies. The transfer will be registered with Titles Queensland."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm when risk passes under the current standard contract, and whether the buyer qualifies for the home or first home transfer duty concession before advising on figures.",
  },
  {
    key: "convwa.post_contract_letter",
    name: "Post-Offer Letter to Client (WA)",
    description: "Confirms acceptance and the condition dates, with no cooling-off safety net.",
    category: "Conveyancing",
    subcategory: "Purchase: Post-exchange",
    documentType: "letter",
    jurisdictions: ["WA"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a post-acceptance letter for a Western Australian purchase. Confirm the date of acceptance and list every condition date and settlement. Restate prominently that there is no cooling-off period, so the conditions are the client's only protection and each date is critical. Explain duty is payable to RevenueWA and the transfer registered with Landgate.",
    segments: [
      text("We confirm that your offer to purchase "),
      field("property", "Property", "42 Example Street, Subiaco WA 6008"),
      text(" was accepted on "),
      field("acceptance_date", "Acceptance date", "14 August 2026"),
      text(".\n\nYOU ARE NOW BOUND\n\nAs we advised before you signed, Western Australia has no cooling-off period. You are committed to this purchase, subject only to the conditions below.\n\nEach of these dates matters. If a condition is not satisfied or exercised by its date, you lose that protection and must complete.\n\nKEY DATES\n\n"),
      field("key_dates", "Key dates", "Building inspection due:  28 August 2026\nTimber pest due:          28 August 2026\nFinance approval due:     5 September 2026\nSettlement:               25 September 2026"),
      text("\n\nWHAT YOU NEED TO DO\n\n"),
      field("client_actions", "Client actions", "1. Book both inspections today.\n2. Provide the contract to your broker immediately and press for written approval well before 5 September.\n3. Arrange insurance from settlement.\n4. Contact us the moment any date looks at risk: an extension must be agreed in writing before the date passes."),
      text("\n\nDUTY AND REGISTRATION\n\nTransfer duty is payable to RevenueWA. We will confirm the amount and whether the first home owner rate applies with your settlement figures. The transfer will be registered with Landgate."),
    ],
  },
  {
    key: "convtas.post_contract_letter",
    name: "Post-Contract Letter to Client (TAS)",
    description: "Confirms the contract and condition dates, with no cooling-off safety net.",
    category: "Conveyancing",
    subcategory: "Purchase: Post-exchange",
    documentType: "letter",
    jurisdictions: ["TAS"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a post-contract letter for a Tasmanian purchase. Confirm the contract date, list condition dates and settlement, restate that there is no cooling-off period so the conditions are the only protection, explain that an extension of any condition date must be agreed in writing before it passes, and explain duty is payable to the State Revenue Office of Tasmania with registration through the Land Titles Office.",
    segments: [
      text("We confirm the contract for your purchase of "),
      field("property", "Property", "7 Example Street, Battery Point TAS 7004"),
      text(" dated "),
      field("contract_date", "Contract date", "14 August 2026"),
      text(".\n\nYOU ARE NOW BOUND\n\nTasmania has no cooling-off period. You are committed, subject only to the conditions below. Each date is critical.\n\nKEY DATES\n\n"),
      field("key_dates", "Key dates", "Building inspection due:  29 August 2026\nFinance approval due:     5 September 2026\nSettlement:               25 September 2026"),
      text("\n\nWHAT YOU NEED TO DO\n\n"),
      field("client_actions", "Client actions", "1. Arrange your building inspection immediately.\n2. Press your lender for unconditional approval before 5 September.\n3. Arrange insurance from settlement.\n4. Tell us at once if any date is at risk."),
      text("\n\nEXTENSIONS MUST BE IN WRITING BEFORE THE DATE PASSES\n\nIf you need more time on any condition, tell us before the date, not after. An extension agreed after a condition date has passed does not revive it: by then you may already have lost the benefit of the condition.\n\nDUTY AND REGISTRATION\n\nDuty is payable to the State Revenue Office of Tasmania. We will confirm the amount with your settlement figures, and whether any first home buyer duty concession applies. The transfer will be registered with the Land Titles Office."),
    ],
  },

  // ── Sale-side: vendor disclosure preparation ────────────────────
  {
    key: "convvic.s32_preparation_request",
    name: "Section 32 Preparation: Request to Vendor (VIC)",
    description: "Requests the information and certificates needed to prepare a Section 32 statement.",
    category: "Conveyancing",
    subcategory: "Sale",
    documentType: "letter",
    jurisdictions: ["VIC"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a letter to a Victorian vendor requesting what is needed to prepare the Section 32 Vendor's Statement. List the certificates to be ordered and the information only the vendor can supply: building permits in the last 7 years and any owner-builder insurance, notices or orders received, services connected, owners corporation details, and any known defect. Explain that an incomplete or inaccurate statement can give the purchaser a right to rescind before settlement, so full disclosure protects the vendor.",
    segments: [
      text("PREPARING YOUR SECTION 32 VENDOR'S STATEMENT\n\nProperty: "),
      field("property", "Property", "24 Example Street, Richmond VIC 3121"),
      text("\n\nBefore your property can be marketed we must prepare a Section 32 Vendor's Statement. This is your compulsory disclosure to the purchaser.\n\nWHY IT MATTERS TO YOU\n\nIf the statement is incomplete or inaccurate in a material respect, the purchaser may have a right to rescind the contract before settlement, even after a long marketing campaign and even if they simply changed their mind and found the defect later.\n\nFull disclosure protects you. Under-disclosure does not.\n\nWHAT WE WILL ORDER\n\nTitle search and plan, council and water rates certificates, land tax certificate, planning certificate, and building approvals search.\n\nWHAT WE NEED FROM YOU\n\n1. Details of ANY building works in the last 7 years, whether or not a permit was obtained. If you did work as an owner-builder, we need the insurance details and a defects report.\n2. Copies of any notice, order or letter from the council, water authority or any other authority.\n3. Confirmation of which services are connected (electricity, gas, water, sewerage, telephone).\n4. Owners corporation details, if applicable.\n5. Anything you know about the property that a buyer would want to know, including any defect, dispute with a neighbour, or non-compliant structure.\n\n"),
      field("specific_queries", "Specific queries for this vendor", "In particular, please confirm whether a permit was obtained for the rear deck, and whether you hold an occupancy permit or certificate of final inspection for it."),
      text("\n\nPlease provide these by "),
      field("deadline", "Deadline", "28 August 2026"),
      text(" so marketing is not delayed."),
    ],
    requiresReview: true,
    reviewNote:
      "Section 32 content requirements are prescribed by the Sale of Land Act 1962 (Vic) and have been amended. Confirm the current required disclosures before settling the statement.",
  },
  {
    key: "convsa.form1_preparation_request",
    name: "Form 1 Preparation: Request to Vendor (SA)",
    description: "Requests the information needed to prepare the SA Form 1 vendor statement.",
    category: "Conveyancing",
    subcategory: "Sale",
    documentType: "letter",
    jurisdictions: ["SA"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a letter to a South Australian vendor requesting what is needed for the Form 1 Vendor's Statement. List the searches to be ordered and the information the vendor must supply. Explain that the Form 1 must be served on the purchaser and that the timing of service affects the purchaser's cooling-off period: late service extends it, which is a reason to have the Form 1 ready before the contract is signed.",
    segments: [
      text("PREPARING YOUR FORM 1 VENDOR'S STATEMENT\n\nProperty: "),
      field("property", "Property", "9 Example Street, Norwood SA 5067"),
      text("\n\nThe Form 1 is your compulsory disclosure statement under the Land and Business (Sale and Conveyancing) Act 1994 (SA).\n\nWHY THE TIMING MATTERS\n\nThe purchaser's cooling-off period runs from the LATER of the contract date and the date the Form 1 is served on them.\n\nThat means if the Form 1 is served late, the purchaser's right to cool off is extended accordingly, and your sale stays uncertain for longer. Having it ready before the contract is signed is in your interest.\n\nWHAT WE WILL ORDER\n\nTitle search, plan, council rates and water searches, land tax certificate, and the prescribed searches for the Form 1.\n\nWHAT WE NEED FROM YOU\n\n1. Details of any encumbrance, easement or agreement affecting the property that may not appear on title.\n2. Copies of any notice or order from any authority.\n3. Details of any building work carried out and any approvals.\n4. Confirmation of services connected.\n5. Anything you are aware of that a purchaser would want to know.\n\n"),
      field("specific_queries", "Specific queries for this vendor", "Please also confirm whether the rear shed was erected with council approval."),
      text("\n\nPlease provide these by "),
      field("deadline", "Deadline", "28 August 2026"),
      text("."),
    ],
    requiresReview: true,
    reviewNote:
      "Form 1 prescribed content is set by regulation and amended. Confirm the current required particulars and searches before settling the statement.",
  },
  {
    key: "convtas.disclosure_preparation_request",
    name: "Vendor Disclosure Preparation: Request to Vendor (TAS)",
    description: "Requests the information needed for the Tasmanian vendor disclosure statement.",
    category: "Conveyancing",
    subcategory: "Sale",
    documentType: "letter",
    jurisdictions: ["TAS"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a letter to a Tasmanian vendor requesting the information needed for the vendor disclosure statement required before contract. List the searches to be ordered and the information the vendor must supply, particularly known defects and any unapproved works. Explain that the statement must be provided before the contract is signed.",
    segments: [
      text("PREPARING YOUR VENDOR DISCLOSURE STATEMENT\n\nProperty: "),
      field("property", "Property", "7 Example Street, Battery Point TAS 7004"),
      text("\n\nA vendor disclosure statement must be provided to the purchaser BEFORE the contract is signed. We need the following to prepare it.\n\nWHAT WE WILL ORDER\n\nTitle search and plan, council rates and planning certificate, water search, and land tax certificate.\n\nWHAT WE NEED FROM YOU\n\n1. Details of any KNOWN DEFECT in the property, whether structural or otherwise.\n2. Details of any building work carried out and whether approvals were obtained.\n3. Copies of any notice or order from the council or any authority.\n4. Details of any encumbrance or agreement affecting the property.\n5. Confirmation of services connected.\n\n"),
      field("specific_queries", "Specific queries for this vendor", "Please confirm whether the retaining wall on the southern boundary was constructed with approval, and whether you are aware of any dispute with the neighbour about it."),
      text("\n\nA WORD ON KNOWN DEFECTS\n\nDisclose anything you know about. A defect disclosed is a defect the purchaser has accepted. A defect concealed can unravel the sale later and expose you to a claim.\n\nPlease provide these by "),
      field("deadline", "Deadline", "28 August 2026"),
      text("."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current prescribed content of the Tasmanian vendor disclosure statement and the timing requirement before the contract is signed.",
  },

  // ── Settlement figures by state ─────────────────────────────────
  {
    key: "convstates.settlement_figures",
    name: "Settlement Figures to Client (VIC/QLD/SA/WA/TAS)",
    description: "Itemised settlement statement with the correct revenue office and registry named.",
    category: "Conveyancing",
    subcategory: "Settlement",
    documentType: "letter",
    jurisdictions: ["VIC", "QLD", "SA", "WA", "TAS"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a settlement figures letter for a purchase outside NSW. Itemise: purchase price, less deposit, plus or minus adjustments for rates, water and land tax, plus duty (naming the correct revenue office for the state), plus registration and electronic settlement fees, plus professional fees and disbursements, less loan funds. State the net amount required, the deadline, how to pay, and include the payment-fraud warning. Name the correct land registry for the state.",
    segments: [
      text("SETTLEMENT FIGURES\n\nProperty: "),
      field("property", "Property", "24 Example Street, Richmond VIC 3121"),
      text("\nSettlement date: "),
      field("settlement_date", "Settlement date", "13 October 2026"),
      text("\n\n"),
      field("statement", "Itemised settlement statement", "Purchase price                              $1,180,000.00\nLess deposit paid                             -$118,000.00\nPlus adjustment: council rates                     $386.20\nPlus adjustment: water                             $104.80\nPlus land transfer duty (SRO Victoria)          $64,510.00\nPlus registration and settlement fees              $198.60\nPlus our professional fees and disbursements     $2,640.00\nLess loan funds advanced                      -$900,000.00\n                                            ---------------\nBALANCE REQUIRED FROM YOU                      $229,839.60"),
      text("\n\nWHEN WE NEED IT\n\nCleared funds must reach our trust account by "),
      field("funds_deadline", "Funds required by", "9:00am on 10 October 2026"),
      text(". Transfers take longer than people expect. Please do not leave this to the last day.\n\nHOW TO PAY\n\n"),
      field("payment_details", "Payment details", "Account name: Example Lawyers Trust Account\nBSB: 000-000\nAccount number: 00000000\nReference: 260601"),
      text("\n\n----------------------------------------\nBEFORE YOU TRANSFER: FRAUD WARNING\n\nWe will NEVER email you to say our bank details have changed.\n\nTelephone us on a number you have independently verified, not a number in an email, and confirm these details verbally before transferring.\n----------------------------------------\n\nAFTER SETTLEMENT\n\n"),
      field("registration_note", "Registration note", "The transfer will be lodged for registration with Land Use Victoria and we will confirm once registered."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the duty amount with the relevant revenue office and check any concession before issuing figures. Name the correct revenue office and land registry for the state.",
  },
  {
    key: "convstates.default_notice",
    name: "Default Notice / Notice to Complete (VIC/QLD/SA/WA/TAS)",
    description: "Puts the defaulting party on notice and makes time essential.",
    category: "Conveyancing",
    subcategory: "Settlement",
    documentType: "letter",
    jurisdictions: ["VIC", "QLD", "SA", "WA", "TAS"],
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a default notice / notice to complete for a purchase outside NSW. Identify the contract, state the default, require completion by a specified date and time, state that time is of the essence, set out interest and costs payable, and state the consequences of continued failure. Confirm the client's readiness to complete is genuine (funds available, transfer executed, settlement platform ready), since a notice given by a party not itself ready to complete is invalid, and note any prior correspondence chasing completion. The notice period and the form of notice are set by the contract in each state, so the drafting must follow the contract's own default provisions rather than a NSW template.",
    segments: [
      text("DEFAULT NOTICE\n\nContract: "),
      field("property", "Property", "24 Example Street, Richmond VIC 3121"),
      text("\nDated: "),
      field("contract_date", "Contract date", "14 August 2026"),
      text("\n\nCompletion was due on "),
      field("due_date", "Completion due", "13 October 2026"),
      text(". Your client failed to complete and remains in default.\n\n"),
      field("prior_correspondence", "Prior correspondence chasing completion (or 'This is the first correspondence on the default')", "We wrote to you on 14 and 20 October 2026 seeking a completion date, without a satisfactory response."),
      text("\n\nOur client is ready, willing and able to complete, having executed the transfer and readied the necessary funds and settlement arrangements.\n\nNOTICE\n\nOur client requires completion by "),
      field("notice_date", "Complete by", "2:00pm on 27 October 2026"),
      text(", and TIME IS OF THE ESSENCE in respect of that date.\n\nThis notice is given under "),
      field("contract_clause", "Contract clause relied on", "General Condition 27 of the contract"),
      text(".\n\nAMOUNTS PAYABLE\n\nIn addition to the balance of the price, your client must pay "),
      field("additional_amounts", "Interest and costs", "default interest at the contract rate from 13 October 2026 to the date of completion, and our client's costs of this notice of $550"),
      text(".\n\nIF YOUR CLIENT FAILS TO COMPLETE\n\n"),
      field("consequences", "Consequences", "Our client will terminate the contract, forfeit the deposit, and claim damages including any shortfall on resale together with the costs of resale."),
      text("\n\nThis notice is given without prejudice to our client's existing rights."),
    ],
    requiresReview: true,
    reviewNote:
      "The notice period, the form of notice and the consequences of default are set by the contract, and the standard contracts differ between states. Follow the contract's own default provisions and confirm the client is ready, willing and able before serving: an invalid notice is worse than none.",
  },
];
