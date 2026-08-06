// lib/precedents/library/debtRecovery.ts
// Debt recovery and settlement-offer correspondence.
//
// Almost all jurisdiction-neutral: a letter of demand is a creature of
// contract and practice rather than statute, and a Calderbank offer rests on
// the common law principle from Calderbank v Calderbank [1975] 3 All ER 333
// (adopted across Australia), not on any one court's rules.
//
// The two exceptions are flagged for review:
//  - Formal offers of compromise are made UNDER court rules (UCPR NSW r
//    20.26 and the state equivalents) and their costs consequences depend on
//    getting the rule's form and timing right. A Calderbank offer is the
//    informal alternative precisely because it doesn't.
//  - A creditor's statutory demand is federal (Corporations Act 2001 (Cth)
//    s 459E, Form 509H) but the minimum threshold has been changed by
//    regulation before, so it is never hard-coded here.
import { text, field, type PrecedentSeed } from "./types";

export const DEBT_RECOVERY_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "debt.letter_of_demand",
    name: "Letter of Demand",
    description: "Formal demand for payment of a debt, with a deadline and notice that proceedings may follow.",
    category: "Debt Recovery",
    subcategory: "Demand",
    documentType: "letter",
    aiInstructions:
      "Draft a letter of demand. It must clearly identify: who the debt is owed to, the amount, what it is for (with reference to the contract, invoice or agreement), that payment is now overdue, a specific deadline for payment, how to pay, and the consequences of non-payment (proceedings, interest, and that the firm will seek its costs). Firm and unambiguous, but never threatening or abusive: an intemperate demand can itself become evidence. Do not threaten anything the client is not actually prepared to do.",
    segments: [
      text("LETTER OF DEMAND\n\nWe act for "),
      field("creditor_name", "Our client (creditor)", "ABC Supplies Pty Ltd"),
      text(".\n\nOur client has instructed us that you owe it the sum of "),
      field("amount", "Amount owed", "$18,450.00"),
      text(" (Debt).\n\nTHE DEBT\n\nThe Debt arises from "),
      field("debt_basis", "How the debt arose", "goods supplied by our client to you between 1 March 2026 and 30 April 2026 under invoices 1043, 1051 and 1066, copies of which are enclosed"),
      text(".\n\nThe Debt fell due for payment on "),
      field("due_date", "Date payment fell due", "31 May 2026"),
      text(" and remains unpaid.\n\nDEMAND\n\nWe are instructed to demand, and we hereby demand, payment of the sum of "),
      field("amount_repeat", "Amount (repeat)", "$18,450.00"),
      text(" by "),
      field("deadline", "Payment deadline", "5:00pm on 23 August 2026"),
      text(".\n\nPayment may be made to:\n\n"),
      field("payment_details", "Payment details", "Account name: ABC Supplies Pty Ltd\nBSB: 000-000\nAccount number: 00000000\nReference: INV1043"),
      text("\n\nIF YOU DO NOT PAY\n\nIf payment is not received by that time, our client has instructed us to commence proceedings against you without further notice. In those proceedings our client will seek:\n\n1. the Debt;\n2. interest; and\n3. its legal costs.\n\nThis letter is written notice of our client's intention to do so.\n\nIf you dispute that the Debt is owed, or if you wish to discuss payment arrangements, contact us before the deadline above."),
    ],
  },
  {
    key: "debt.final_notice_before_proceedings",
    name: "Final Notice Before Proceedings",
    description: "Last warning after an unanswered letter of demand, immediately before filing.",
    category: "Debt Recovery",
    subcategory: "Demand",
    documentType: "letter",
    aiInstructions:
      "Draft a short, final notice following an earlier unanswered letter of demand. Refer to the earlier demand and its date, note that no payment or response has been received, give a short final deadline (typically 7 days), and state plainly that proceedings will be commenced without further notice if payment is not made. Shorter and firmer than the first demand. Set out how the amount has moved (interest, part payments) since the first demand, not just the original figure: silently repeating the same number invites an argument later about what is actually owed.",
    segments: [
      text("FINAL NOTICE\n\nWe refer to our letter of demand dated "),
      field("earlier_demand_date", "Date of earlier demand", "9 August 2026"),
      text(", a copy of which is enclosed.\n\nAs at the date of this letter we have received "),
      field("response_status", "What has been received", "no payment and no response"),
      text(".\n\nThe outstanding amount is now "),
      field("amount", "Amount outstanding", "$18,450.00"),
      text(", "),
      field("amount_movement", "How the amount has changed since the first demand (or 'unchanged since our first letter')", "which includes interest of $210.00 accrued since our first letter and reflects no payments received"),
      text(".\n\nThis is your final opportunity to resolve this matter without proceedings.\n\nUnless payment is received in full by "),
      field("final_deadline", "Final deadline", "5:00pm on 30 August 2026"),
      text(", we are instructed to commence proceedings immediately and without further notice to you.\n\nOur client will seek the debt, interest and costs. Proceedings may also affect your credit rating and, if you are a company, may lead to winding up.\n\nIf there are circumstances we should be aware of, or you wish to propose a payment arrangement, contact us before the deadline above; once proceedings are filed our client is under no obligation to withdraw them, even if payment is later offered."),
    ],
  },
  {
    key: "debt.calderbank_offer",
    name: "Calderbank Offer",
    description: "Without prejudice save as to costs settlement offer, designed to attract costs consequences if refused unreasonably.",
    category: "Debt Recovery",
    subcategory: "Settlement Offers",
    documentType: "letter",
    aiInstructions:
      "Draft a Calderbank offer. It MUST: (1) be expressed to be 'WITHOUT PREJUDICE SAVE AS TO COSTS'; (2) explicitly state it is made in accordance with the principle in Calderbank v Calderbank; (3) set out the offer clearly and completely, including what happens to costs; (4) be open for a specified and genuinely reasonable time; and (5) state expressly that if the offer is not accepted and the recipient fails to do better at hearing, the letter will be produced to the Court on the question of costs and indemnity costs will be sought. Explain briefly WHY the offer is reasonable: an offer with no reasoning is far weaker when the Court later assesses whether refusal was unreasonable. Never mark it merely 'without prejudice': that would make it inadmissible on costs and defeat the entire purpose.",
    segments: [
      text("WITHOUT PREJUDICE SAVE AS TO COSTS\n\nCALDERBANK OFFER\n\nThis offer is made in accordance with the principle in Calderbank v Calderbank [1975] 3 All ER 333.\n\nTHE OFFER\n\nOur client offers to settle this matter on the following terms:\n\n"),
      field("offer_terms", "Offer terms", "1. Your client pays our client the sum of $12,000 within 14 days of acceptance.\n2. The parties file consent orders dismissing the proceedings.\n3. Each party bears its own costs."),
      text("\n\nThis offer is made on the basis that it resolves the whole of the dispute between the parties.\n\nWHY THIS OFFER IS REASONABLE\n\n"),
      field("reasonableness", "Why the offer is reasonable", "Our client's claim is for $18,450 supported by signed delivery dockets and unpaid invoices. This offer represents a substantial discount to reflect the costs and risks both parties would otherwise incur, and is well below what our client expects to recover at hearing."),
      text("\n\nHOW LONG IT IS OPEN\n\nThis offer is open for acceptance until "),
      field("open_until", "Open until", "5:00pm on 30 August 2026"),
      text(", after which it lapses without further notice.\n\nCOSTS CONSEQUENCES\n\nIf this offer is not accepted and your client does not achieve a result more favourable than this offer, our client will produce this letter to the Court on the question of costs and will seek an order that your client pay our client's costs on an indemnity basis from the date this offer expires.\n\nWe invite your client to give this offer serious consideration and to obtain advice about the costs consequences of refusing it."),
    ],
    requiresReview: true,
    reviewNote:
      "Check the offer is open for a genuinely reasonable time and that the reasoning is specific to this case: both are what the Court weighs when deciding whether refusal was unreasonable.",
  },
  {
    key: "debt.offer_of_compromise_cover",
    name: "Offer of Compromise (covering letter)",
    description: "Covering letter for a formal offer of compromise made under the court rules.",
    category: "Debt Recovery",
    subcategory: "Settlement Offers",
    documentType: "letter",
    aiInstructions:
      "Draft a covering letter enclosing a formal offer of compromise made under the applicable court rules. Note that it is made under the rules (not as a Calderbank offer), that the costs consequences prescribed by the rules will be relied upon, and the period for acceptance. Keep it short, since the offer document itself does the work, but still explain plainly what accepting looks like and what happens if the deadline passes unanswered, since the recipient (often a litigant, not just their solicitor) needs to understand the offer without cross-referring to the rules. Do NOT cite a specific rule number unless the court and state are known, because the numbering differs between jurisdictions.",
    segments: [
      text("We enclose our client's Offer of Compromise in this matter.\n\nThe offer is made under the rules of court applicable to these proceedings and not as a Calderbank offer.\n\nTHE OFFER\n\n"),
      field("offer_summary", "Offer summary", "Our client offers to compromise the proceedings on the basis that your client pay our client $14,000 inclusive of interest, with each party otherwise bearing its own costs to the date of this offer."),
      text("\n\nHOW TO ACCEPT\n\n"),
      field("acceptance_mechanism", "How to accept", "Acceptance must be by written notice to us, filed and served in accordance with the rules, before the offer lapses."),
      text("\n\nThe offer is open for acceptance for the period prescribed by those rules, expiring on "),
      field("expiry", "Expiry", "30 August 2026"),
      text(".\n\nIF THE OFFER IS NOT ACCEPTED\n\nIf the offer is not accepted and your client does not obtain a more favourable result at trial, our client will rely on the costs consequences provided for by the rules, which may include an order that your client pay costs on an indemnity basis from the date of this offer.\n\nWe recommend your client obtain advice about this offer, including its costs consequences, before the expiry date."),
    ],
    requiresReview: true,
    reviewNote:
      "Offers of compromise are rules-based: form, timing and costs consequences differ by court and state. Verify against the current rules for the court seised of the proceedings.",
  },
  {
    key: "debt.without_prejudice_settlement_proposal",
    name: "Without Prejudice Settlement Proposal",
    description: "Open-ended negotiation letter where no costs consequences are intended.",
    category: "Debt Recovery",
    subcategory: "Settlement Offers",
    documentType: "letter",
    aiInstructions:
      "Draft a genuine without prejudice settlement proposal intended purely to open negotiations, with no costs consequences sought. Mark it 'WITHOUT PREJUDICE' only. Explain the commercial rationale for resolving, put the proposal, address how it would be documented and paid, and invite a counter-proposal or a conversation (phone or mediation). Do not include Calderbank-style costs warnings: if the client wants costs consequences, the Calderbank precedent should be used instead.",
    segments: [
      text("WITHOUT PREJUDICE\n\nWe write to see whether this matter can be resolved commercially.\n\nOur client's position remains as previously stated. However, our client recognises that continued litigation will involve cost and delay for both parties disproportionate to the amount in issue.\n\nPROPOSAL\n\n"),
      field("proposal", "Proposal", "Our client is prepared to accept $12,000 in full and final satisfaction of its claim, payable within 21 days, with each party bearing its own costs."),
      text("\n\nHOW THIS WOULD BE DOCUMENTED\n\n"),
      field("documentation", "How the resolution would be documented", "On acceptance, we would prepare a short deed of release and, if proceedings are on foot, consent orders or a notice of discontinuance."),
      text("\n\nThis proposal is made on a without prejudice basis and is not an admission.\n\nWe are conscious that a negotiated outcome now avoids the cost and uncertainty of a contested hearing for both sides. If your client would like to put a counter-proposal, or if a without prejudice conversation between us would help move things along, we would be pleased to take instructions on it."),
    ],
  },
  {
    key: "debt.statutory_demand_cover",
    name: "Creditor's Statutory Demand (covering letter)",
    description: "Covering letter serving a statutory demand on a company under the Corporations Act.",
    category: "Debt Recovery",
    subcategory: "Insolvency",
    documentType: "letter",
    aiInstructions:
      "Draft a covering letter serving a creditor's statutory demand under s 459E of the Corporations Act 2001 (Cth). Explain in plain terms what the demand is, the consequence of failing to comply within the statutory period (the company is presumed insolvent and a winding up application may follow), that the company may apply to set the demand aside within the same period (and the very short window that application must be made in), and that partial payment or a payment plan does not itself stop the clock: only compliance, securing/compounding the debt, or a court application does. Recommend the recipient obtain urgent legal advice. Do NOT state the minimum debt threshold as a fixed figure: it is set by regulation and has been changed.",
    segments: [
      text("We act for "),
      field("creditor_name", "Our client (creditor)", "ABC Supplies Pty Ltd"),
      text(".\n\nWe enclose by way of service a Creditor's Statutory Demand for Payment of Debt made under section 459E of the Corporations Act 2001 (Cth), together with the supporting affidavit.\n\nTHE DEBT\n\nThe demand relates to the debt of "),
      field("debt_amount", "Debt amount", "$28,750.00"),
      text(" described in the demand, being "),
      field("debt_basis", "How the debt arose", "the unpaid balance of invoices 2201 to 2214 for goods supplied between January and March 2026"),
      text(".\n\nWHAT THIS MEANS\n\nIf your company does not, within the statutory period after service:\n\n1. pay the debt; or\n2. secure or compound for the debt to our client's reasonable satisfaction; or\n3. apply to the Court to set the demand aside,\n\nthen your company will be presumed to be insolvent, and our client may apply to the Court to have your company wound up.\n\nAn application to set the demand aside must itself be made to the Court, and served on our client, within the statutory period; it is not enough to simply write to us disputing the debt. The period for compliance is strict and the Court has very limited power to extend it.\n\nA proposal to pay by instalments, or a part payment, does not by itself stop time running under the demand unless our client agrees in writing that it satisfies the demand in full.\n\nWE STRONGLY RECOMMEND YOU OBTAIN LEGAL ADVICE IMMEDIATELY.\n\nIf you wish to discuss payment of the debt, contact us without delay."),
    ],
    requiresReview: true,
    reviewNote:
      "Verify the current minimum statutory demand threshold and compliance period under the Corporations Act and Regulations before serving: both have been amended. The demand itself must be in the prescribed form.",
  },
  {
    key: "debt.response_disputing_demand",
    name: "Response Disputing a Letter of Demand",
    description: "Acting for the debtor: disputes the claimed debt and puts the creditor to proof.",
    category: "Debt Recovery",
    subcategory: "Acting for Debtor",
    documentType: "letter",
    aiInstructions:
      "Draft a response to a letter of demand on behalf of the alleged debtor. Deny liability (or admit only what is genuinely admitted), set out the basis of the dispute clearly with supporting facts and dates (not just a bare denial), put the creditor to proof, flag any cross-claim or set-off, note the evidence that supports the client's position and where it is held, and note that if proceedings are commenced the client will defend them and seek costs. Consider whether any limitation period issue favours the client and note it if so. Do not concede anything not expressly instructed.",
    segments: [
      text("We act for "),
      field("client_name", "Our client", "XYZ Builders Pty Ltd"),
      text(" and refer to your letter of demand dated "),
      field("demand_date", "Date of demand", "9 August 2026"),
      text(".\n\nOur client disputes the alleged debt.\n\nBASIS OF DISPUTE\n\n"),
      field("dispute_basis", "Basis of the dispute", "The goods delivered on 14 April 2026 were defective and were rejected by our client at the time of delivery. Our client's rejection was confirmed in writing to your client on 15 April 2026."),
      text("\n\nSUPPORTING EVIDENCE\n\n"),
      field("supporting_evidence", "Evidence supporting the client's position", "Our client holds the delivery docket noted 'rejected, defective' and signed by your client's driver, together with the email of 15 April 2026 to your client's sales manager confirming the rejection. Copies are available on request."),
      text("\n\nYour client is put to proof of "),
      field("put_to_proof", "Matters the creditor must prove", "the supply, delivery and acceptance of conforming goods, and the terms said to give rise to the alleged debt"),
      text(".\n\n"),
      field("cross_claim", "Cross-claim or set-off (or 'Nil')", "Our client also reserves its rights in respect of the losses it incurred in sourcing replacement materials at short notice."),
      text("\n\nIf your client commences proceedings, our client will defend them and will seek its costs, including on an indemnity basis if it considers the claim was pursued unreasonably in the face of this response.\n\nOur client remains willing to discuss a commercial resolution, without admission. Please direct any further correspondence to us, not directly to our client."),
    ],
  },
  {
    key: "debt.payment_arrangement_confirmation",
    name: "Payment Arrangement Confirmation",
    description: "Records an agreed instalment arrangement and the consequences of default.",
    category: "Debt Recovery",
    subcategory: "Settlement Offers",
    documentType: "letter",
    aiInstructions:
      "Draft a letter confirming an agreed payment arrangement. Set out the total debt, the instalment amounts and dates, how payments are to be made, whether existing proceedings (if any) are stayed or discontinued while the arrangement is on foot, and what happens on default (typically the full balance becomes immediately payable and proceedings may issue without further notice). Make clear whether interest continues to accrue, whether the arrangement is conditional on strict compliance, and what confirms early or final payment (a release or discontinuance).",
    segments: [
      text("We confirm the payment arrangement agreed between our respective clients.\n\nTOTAL AMOUNT: "),
      field("total", "Total debt", "$18,450.00"),
      text("\n\nINSTALMENTS\n\n"),
      field("instalments", "Instalment schedule", "$3,075.00 on the 1st day of each month, commencing 1 September 2026, for six consecutive months."),
      text("\n\nPayments are to be made to:\n\n"),
      field("payment_details", "Payment details", "Account name: ABC Supplies Pty Ltd\nBSB: 000-000\nAccount number: 00000000\nReference: INV1043"),
      text("\n\nINTEREST\n\n"),
      field("interest_position", "Interest position", "Our client agrees to suspend interest for so long as the arrangement is strictly complied with."),
      text("\n\n"),
      field("proceedings_position", "Position on any existing proceedings (or 'Not applicable: no proceedings on foot')", "Proceedings have not yet been filed and our client agrees not to file them while this arrangement is complied with."),
      text("\n\nIF AN INSTALMENT IS MISSED\n\nThis arrangement is conditional on strict compliance. If any instalment is not paid in full by its due date, the entire outstanding balance becomes immediately due and payable, and our client may commence proceedings for the full balance without further notice.\n\nON COMPLETION\n\nOnce all instalments have been paid in full, we will confirm in writing that the debt has been satisfied. Please confirm your client's agreement to these terms in writing."),
    ],
  },
];
