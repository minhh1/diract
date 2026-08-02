// lib/precedents/library/conveyancingExtra.ts
// Conveyancing situations that arise once a matter stops running to plan, and
// the transaction types beyond a straightforward purchase or sale.
//
// NSW-specific where the document turns on NSW statute (s 66W, s 88B, Real
// Property Act notices); otherwise jurisdiction-neutral where the concept
// travels (rescission, deposit disputes, related-party transfers, caveats).
import { text, field, type PrecedentSeed } from "./types";

const CONVEYANCING = ["Conveyancing"];

export const CONVEYANCING_EXTRA_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "convx.rescission_notice",
    name: "Notice of Rescission",
    description: "Rescinds the contract on a ground available under it or at law.",
    category: "Conveyancing",
    subcategory: "Disputes",
    documentType: "letter",
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a notice of rescission. Identify the contract and property, state the ground relied on and the facts establishing it, state that the client rescinds, and set out the consequences sought -- return of the deposit with interest, release of any caveat, and reservation of rights as to damages. Rescission is a serious step and a wrongful purported rescission is itself repudiatory, so the ground must be clearly established before it is served.",
    segments: [
      text("NOTICE OF RESCISSION\n\nContract: "),
      field("property", "Property", "12 Example Street, Sydney NSW 2000"),
      text("\nDated: "),
      field("contract_date", "Contract date", "12 August 2026"),
      text("\n\nWe act for the "),
      field("party", "Our client's role", "purchaser"),
      text(".\n\nGROUND OF RESCISSION\n\n"),
      field("ground", "Ground relied on and the facts", "The contract is rescinded pursuant to special condition 30, which entitles our client to rescind if the vendor fails to produce a valid swimming pool compliance certificate before completion. Despite our requests of 2, 9 and 16 September 2026, no certificate has been produced, and your client has confirmed the pool does not comply with the fencing requirements."),
      text("\n\nOur client accordingly RESCINDS the contract with effect from the date of this notice.\n\nCONSEQUENCES\n\nPlease arrange for:\n\n1. the immediate return of the deposit of "),
      field("deposit", "Deposit", "$125,000"),
      text(" together with any interest earned;\n2. "),
      field("other_consequences", "Other consequences sought", "the withdrawal of the vendor's caveat lodged on 14 August 2026"),
      text(".\n\nOur client reserves all rights, including as to damages and costs."),
    ],
    requiresReview: true,
    reviewNote:
      "Verify the ground of rescission is clearly established and available under the contract or at law before serving. A purported rescission without a valid ground is itself repudiatory and exposes the client to the other side's loss.",
  },
  {
    key: "convx.deposit_release_dispute",
    name: "Deposit Dispute - Letter to Stakeholder",
    description: "Instructs the stakeholder not to release a disputed deposit.",
    category: "Conveyancing",
    subcategory: "Disputes",
    documentType: "letter",
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a letter to the agent or solicitor holding a deposit as stakeholder, where entitlement to it is disputed. Notify the dispute, instruct that the deposit not be released to either party pending resolution or a court order, note the stakeholder's obligation to hold it and the personal exposure if it is released wrongly, and propose how the dispute will be resolved. Firm but not aggressive -- the stakeholder is usually not a party to the dispute.",
    segments: [
      text("DEPOSIT HELD AS STAKEHOLDER - DISPUTE\n\nProperty: "),
      field("property", "Property", "12 Example Street, Sydney NSW 2000"),
      text("\nDeposit: "),
      field("deposit", "Deposit amount", "$125,000"),
      text("\n\nWe act for the "),
      field("party", "Our client's role", "purchaser"),
      text(" and write regarding the deposit held by you as stakeholder.\n\nTHE DISPUTE\n\n"),
      field("dispute", "Nature of the dispute", "Our client rescinded the contract on 20 September 2026 on the ground that the vendor failed to produce a valid pool compliance certificate. The vendor disputes that the rescission was valid and asserts an entitlement to forfeit the deposit."),
      text("\n\nDO NOT RELEASE THE DEPOSIT\n\nEntitlement to the deposit is genuinely in dispute. You are instructed not to release it, or any part of it, to either party pending resolution of the dispute by agreement or by order of a court.\n\nWe put you on notice that releasing the deposit while you are aware of this dispute may expose you personally.\n\nRESOLUTION\n\n"),
      field("resolution_proposal", "Proposed resolution", "We have proposed to the vendor's solicitor that the deposit be paid into a controlled money account pending resolution, or alternatively into court. We invite the vendor to agree to one of those courses."),
      text("\n\nWe will keep you informed. Please confirm you will hold the deposit as instructed."),
    ],
  },
  {
    key: "convx.caveat_lodgement_advice",
    name: "Caveat - Advice on Lodgement",
    description: "Advises on whether a caveat is available and the risk of lodging without a caveatable interest.",
    category: "Conveyancing",
    subcategory: "Disputes",
    documentType: "advice",
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft advice on lodging a caveat. Explain what a caveat does (prevents dealings, it does not create an interest), what constitutes a caveatable interest, and warn clearly that lodging without a caveatable interest exposes the client to compensation for loss caused. Explain the lapsing notice procedure by which a registered proprietor can force the caveator to commence proceedings to sustain the caveat, and the short timeframe that follows. Recommend a caveat only where the interest is genuinely arguable.",
    segments: [
      text("CAVEATS - ADVICE\n\nWHAT A CAVEAT DOES\n\nA caveat is a statutory injunction recorded on the title. It prevents most dealings being registered while it remains.\n\nIt does NOT create an interest in land. It protects an interest you already have. That distinction is the whole of the risk below.\n\nWHAT IS A CAVEATABLE INTEREST\n\nA legal or equitable interest in the land itself. Common examples: a purchaser under an unregistered contract, an unregistered mortgagee, a beneficiary under a trust of the land, an equitable charge expressly given over the land.\n\nWhat is NOT a caveatable interest: being owed money generally, having a personal claim against the owner, or a contractual right that does not touch the land.\n\nTHE RISK OF GETTING THIS WRONG\n\nLodging a caveat without a caveatable interest exposes you to compensating any person who suffers loss because of it. If a sale falls through because of an unjustified caveat, that loss can be very substantial.\n\nThis is not a theoretical risk. Do not lodge a caveat to apply pressure.\n\nYOUR POSITION\n\n"),
      field("interest_analysis", "Analysis of the client's interest", "Your loan agreement of 4 March 2026 includes an express charging clause by which the borrower charged its interest in 12 Example Street in your favour as security. In our view that gives you an equitable charge over the land and therefore a caveatable interest."),
      text("\n\nWHAT HAPPENS AFTER LODGEMENT\n\nThe registered proprietor can serve a lapsing notice. Once served, the caveat lapses unless you obtain an order from the Court extending it within a short statutory period.\n\nThat means lodging a caveat may commit you to litigation on a compressed timetable. Be ready for that before lodging.\n\nOUR RECOMMENDATION\n\n"),
      field("recommendation", "Recommendation", "We recommend lodging the caveat, and simultaneously writing to the borrower seeking repayment or the grant of a registered mortgage, so that the dispute can be resolved before any lapsing notice forces proceedings."),
    ],
    requiresReview: true,
    reviewNote:
      "Caveat procedure, lapsing notice periods and the compensation provisions differ between states. Confirm the applicable Act and the period for applying to extend before lodging.",
  },
  {
    key: "convx.related_party_transfer_advice",
    name: "Related Party Transfer - Advice",
    description: "Advises on a transfer between related parties, including duty and CGT exposure.",
    category: "Conveyancing",
    subcategory: "Transfers",
    documentType: "advice",
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft advice on a transfer of property between related parties (spouse, family member, or into a company or trust). Explain that duty is generally assessed on market value rather than the stated consideration, so a nominal price does not avoid duty; that a valuation will usually be required; that any available exemption or concession (such as a transfer between spouses of a principal place of residence, or a breakdown-of-relationship exemption) must be specifically established; that capital gains tax may be triggered on a market value basis even where no money changes hands; and that where a mortgage exists the lender's consent is required. Recommend the client obtain accounting advice on the CGT position.",
    segments: [
      text("RELATED PARTY TRANSFER - ADVICE\n\nProperty: "),
      field("property", "Property", "12 Example Street, Sydney NSW 2000"),
      text("\nTransfer from: "),
      field("transferor", "Transferor", "John Citizen"),
      text("\nTransfer to: "),
      field("transferee", "Transferee", "John Citizen and Mary Citizen as joint tenants"),
      text("\n\nDUTY IS ASSESSED ON VALUE, NOT PRICE\n\nThe most important point: for a transfer between related parties, duty is generally assessed on the MARKET VALUE of the property, not on whatever consideration is stated in the transfer.\n\nTransferring for $1, or for the balance of the mortgage, does not reduce the duty. Revenue authorities require a valuation and assess accordingly.\n\n"),
      field("duty_position", "Duty position in this matter", "A market valuation will be required. On an estimated value of $1,250,000, duty on a half interest would be assessed on $625,000 unless an exemption applies."),
      text("\n\nEXEMPTIONS AND CONCESSIONS\n\n"),
      field("exemptions", "Available exemptions or concessions", "A transfer between spouses of a principal place of residence into joint names may be exempt, provided the property is the couple's principal place of residence and the transfer results in the parties holding as joint tenants or tenants in common in equal shares. On the facts you have given, we consider this exemption is available, but it must be established with evidence."),
      text("\n\nCAPITAL GAINS TAX\n\nEven where no money changes hands, CGT may be triggered, calculated on market value. Whether an exemption applies depends on the use of the property and the parties' circumstances.\n\n"),
      field("cgt_position", "CGT position", "As the property has been your principal place of residence throughout, the main residence exemption should apply, but you should confirm this with your accountant before proceeding."),
      text("\n\nTHE MORTGAGE\n\n"),
      field("mortgage", "Mortgage position", "The property is mortgaged to Example Bank. The lender's consent to the transfer is required, and the bank will need to assess Mary Citizen and add her to the loan. Start this now -- lender consent is commonly the slowest part of these transfers."),
      text("\n\nPLEASE ALSO OBTAIN\n\nThis advice addresses duty and conveyancing only. Please obtain accounting advice on the capital gains and any land tax consequences before we proceed."),
    ],
    requiresReview: true,
    reviewNote:
      "Duty exemptions for related party transfers differ substantially by state and are amended. Confirm the current exemption criteria and evidentiary requirements with the relevant revenue office before advising that an exemption applies.",
  },
  {
    key: "convx.settlement_delay_letter",
    name: "Settlement Delay - Letter to Other Side",
    description: "Notifies the other side of a delay, reserves rights and proposes a revised date.",
    category: "Conveyancing",
    subcategory: "Settlement",
    documentType: "letter",
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft a letter dealing with a settlement delay. Where the client is causing the delay, explain the reason candidly, propose a revised settlement date, acknowledge any penalty interest payable, and ask the other side to confirm they will not terminate. Where the other side is causing it, record the default, reserve rights, note interest is accruing, and require a firm date. The precedent should work either way, with the direction prompted.",
    segments: [
      text("SETTLEMENT - "),
      field("subject", "Subject line", "PROPOSED EXTENSION"),
      text("\n\nProperty: "),
      field("property", "Property", "12 Example Street, Sydney NSW 2000"),
      text("\nScheduled settlement: "),
      field("scheduled_date", "Scheduled settlement date", "23 September 2026"),
      text("\n\n"),
      field("position", "The position", "Our client's lender has advised this morning that its funds will not be available until 25 September 2026 due to an internal processing delay. Our client is otherwise ready to complete."),
      text("\n\nWHAT WE PROPOSE\n\n"),
      field("proposal", "Proposal", "We propose settlement be rescheduled to 2:00pm on 25 September 2026. Our client accepts that penalty interest is payable under clause 14 for the period of delay and will include it in the settlement figures."),
      text("\n\n"),
      field("reservation", "Reservation of rights or request for confirmation", "We ask that your client confirm it will not issue a notice to complete or take any step to terminate in the meantime. Our client's position is that a two day delay of this kind, promptly notified and with interest paid, does not warrant that course."),
      text("\n\nPlease confirm as a matter of urgency so that the PEXA workspace can be rescheduled."),
    ],
  },
  {
    key: "convx.first_home_buyer_advice",
    name: "First Home Buyer - Concessions and Eligibility",
    description: "Advises a first home buyer on duty concessions and grant eligibility.",
    category: "Conveyancing",
    subcategory: "Purchase - Pre-exchange",
    documentType: "advice",
    matterTypes: CONVEYANCING,
    aiInstructions:
      "Draft advice to a first home buyer on the concessions and grants available. Cover the typical eligibility criteria -- never having owned residential property in Australia, being a natural person, meeting residence requirements, property value thresholds, and whether the property is new or established. Explain that thresholds and the concessions themselves differ by state and change frequently, so figures must be confirmed. Warn that eligibility is assessed per person, so a partner who has previously owned property can disqualify the couple, and that a residence requirement usually applies after settlement with a claw-back if not met.",
    segments: [
      text("FIRST HOME BUYER - CONCESSIONS AND GRANTS\n\nProperty: "),
      field("property", "Property", "12 Example Street, Sydney NSW 2000"),
      text("\nPurchase price: "),
      field("price", "Purchase price", "$780,000"),
      text("\n\nWHAT MAY BE AVAILABLE\n\n"),
      field("available", "Concessions and grants potentially available", "A full or partial exemption from transfer duty for first home buyers, and potentially a first home owner grant if the property is newly built."),
      text("\n\nELIGIBILITY - THE USUAL CRITERIA\n\n1. You must be a natural person, not a company or trust.\n2. Neither you NOR your partner may have previously owned residential property in Australia. Eligibility is assessed per person -- if your partner has owned before, it can disqualify you both even if you have not.\n3. At least one purchaser must be an Australian citizen or permanent resident.\n4. The property value must be at or below the applicable threshold.\n5. You must move in within a set period after settlement and live there for a minimum continuous period.\n\n"),
      field("eligibility_assessment", "Assessment of this client's eligibility", "On the information you have given us, you both satisfy the ownership criterion and the price is within the current threshold. We will lodge the application with the transfer duty assessment."),
      text("\n\nTHE RESIDENCE REQUIREMENT - DO NOT OVERLOOK THIS\n\nThe concession is conditional on you actually living in the property for the required period. If you do not -- for example if you rent it out instead -- the concession can be clawed back with interest and penalties.\n\nIf your circumstances change after settlement, tell us before you act.\n\nIMPORTANT ON FIGURES\n\nThresholds, rates and the concessions themselves change frequently and differ by state. We will confirm the current position and the exact amount before exchange rather than relying on published summaries."),
    ],
    requiresReview: true,
    reviewNote:
      "First home buyer thresholds, concession rates and grant amounts differ by state and change frequently, often at short notice in a budget. Confirm the current position with the relevant revenue office before advising on any figure or on eligibility.",
  },
];
