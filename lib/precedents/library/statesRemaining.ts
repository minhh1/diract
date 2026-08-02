// lib/precedents/library/statesRemaining.ts
// Fills the remaining interstate gaps: personal injury for SA, WA and TAS,
// minor civil forums for SA, WA and TAS, and estate-planning documents whose
// form and terminology are state-specific.
//
// PERSONAL INJURY schemes covered here:
//   SA   Compulsory Third Party scheme for motor accidents; Return to Work
//        Act 2014 for work injuries, administered by ReturnToWorkSA.
//   WA   Motor Vehicle (Third Party Insurance) Act 1943, administered by the
//        Insurance Commission of Western Australia; Workers Compensation and
//        Injury Management Act, with disputes to WorkCover WA.
//   TAS  Motor Accidents (Liabilities and Compensation) Act 1973,
//        administered by the Motor Accidents Insurance Board (MAIB) as a
//        no-fault scheme; Workers Rehabilitation and Compensation Act 1988.
//
// ENDURING DOCUMENTS differ in both name and form between states, and a
// document valid in one state is not automatically effective in another --
// which matters for clients who move, or who own property interstate:
//   NSW  Enduring Power of Attorney; Appointment of Enduring Guardian
//   VIC  Enduring Power of Attorney (financial and personal);
//        Medical Treatment Decision Maker
//   QLD  Enduring Power of Attorney (financial and personal/health);
//        Advance Health Directive
//   SA   Enduring Power of Attorney; Advance Care Directive
//   WA   Enduring Power of Attorney; Enduring Power of Guardianship
//   TAS  Enduring Power of Attorney; Enduring Guardianship
import { text, field, type PrecedentSeed } from "./types";

const PI = ["Litigation", "Other"];
const CIVIL = ["Litigation"];
const WILLS = ["Wills & Estates"];

export const STATES_REMAINING_PRECEDENTS: PrecedentSeed[] = [
  // ── Personal injury: SA / WA / TAS ──────────────────────────────
  {
    key: "pisa.initial_advice",
    name: "Initial Advice - Personal Injury (SA)",
    description: "First advice on a South Australian motor accident or work injury claim.",
    category: "Personal Injury",
    subcategory: "Pre-litigation",
    documentType: "advice",
    jurisdictions: ["SA"],
    matterTypes: PI,
    aiInstructions:
      "Draft initial advice on a South Australian personal injury claim. Identify the scheme: the Compulsory Third Party scheme for motor accidents, or the Return to Work Act 2014 (SA) administered by ReturnToWorkSA for work injuries. Explain the two limbs -- statutory entitlements (income support and medical expenses) and any common law damages claim, noting South Australia's thresholds and the injury scale value assessment for non-economic loss in motor claims. Stress early notification and that limitation periods apply. Prompt for specifics rather than stating thresholds.",
    segments: [
      text("SOUTH AUSTRALIAN INJURY CLAIM - INITIAL ADVICE\n\nInjury date: "),
      field("injury_date", "Injury date", "2 June 2026"),
      text("\nScheme: "),
      field("scheme", "Applicable scheme", "Compulsory Third Party (motor accident), the injury having occurred in a collision on Portrush Road on 2 June 2026."),
      text("\n\nYOUR ENTITLEMENTS\n\n1. STATUTORY ENTITLEMENTS\n\n"),
      field("statutory", "Statutory entitlements", "Reasonable medical expenses and, if you cannot work, income support. We will lodge your claim with the CTP insurer immediately so these commence."),
      text("\n\n2. COMMON LAW DAMAGES\n\nA damages claim requires proving another party was at fault.\n\n"),
      field("damages_position", "Damages position", "Liability appears clear -- the other driver was issued an expiation notice for failing to give way. Damages may include past and future economic loss, and non-economic loss if your injuries meet the applicable threshold."),
      text("\n\nNON-ECONOMIC LOSS\n\nIn South Australian motor claims, compensation for pain and suffering is assessed by reference to an injury scale value determined on medical evidence. Whether you have an entitlement, and its extent, depends on that assessment.\n\n"),
      field("threshold_assessment", "Preliminary threshold assessment", "Your cervical spine and shoulder injuries may reach the threshold, but this will require specialist assessment once your condition has stabilised."),
      text("\n\nURGENT STEPS\n\n"),
      field("urgent_steps", "Urgent steps", "1. We will lodge your claim this week.\n2. See your GP and ensure every symptom is recorded -- gaps in the medical record are used against claimants.\n3. Keep all receipts for treatment, medication and travel.\n4. Do not give a recorded statement to any insurer before speaking to us."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the claim notification deadline, the limitation period, and the current injury scale value thresholds under the applicable South Australian scheme. Diarise every date immediately.",
  },
  {
    key: "piwa.initial_advice",
    name: "Initial Advice - Personal Injury (WA)",
    description: "First advice on a Western Australian motor accident or work injury claim.",
    category: "Personal Injury",
    subcategory: "Pre-litigation",
    documentType: "advice",
    jurisdictions: ["WA"],
    matterTypes: PI,
    aiInstructions:
      "Draft initial advice on a Western Australian personal injury claim. Identify the scheme: the Motor Vehicle (Third Party Insurance) Act 1943 (WA) administered by the Insurance Commission of Western Australia for motor accidents, or the Workers Compensation and Injury Management Act for work injuries with disputes to WorkCover WA. Explain that WA motor claims are largely fault-based (with a separate catastrophic injury support scheme), the thresholds for general damages, and the importance of early notification. Prompt for specifics rather than asserting thresholds.",
    segments: [
      text("WESTERN AUSTRALIAN INJURY CLAIM - INITIAL ADVICE\n\nInjury date: "),
      field("injury_date", "Injury date", "2 June 2026"),
      text("\nScheme: "),
      field("scheme", "Applicable scheme", "Motor Vehicle (Third Party Insurance) Act 1943 (WA), the claim being against the Insurance Commission of Western Australia."),
      text("\n\nHOW WA MOTOR CLAIMS WORK\n\nUnlike some eastern states, compensation for a motor accident injury in Western Australia generally depends on establishing that another party was at fault. There is a separate scheme providing lifetime support for catastrophic injuries regardless of fault.\n\n"),
      field("liability", "Liability assessment", "Liability appears clear: the other driver failed to give way at a roundabout and was issued an infringement."),
      text("\n\nWHAT YOU MAY RECOVER\n\n"),
      field("heads_of_damage", "Heads of damage", "Past and future medical and rehabilitation expenses, past and future loss of earnings, and general damages for pain and suffering if your injuries meet the applicable threshold."),
      text("\n\nGENERAL DAMAGES THRESHOLD\n\nGeneral damages are subject to a statutory threshold and a deductible. Whether you have an entitlement will depend on medical assessment once your condition stabilises.\n\nWORK INJURIES\n\n"),
      field("workers_comp", "Workers compensation position (if applicable)", "Not applicable -- this was not a work-related injury."),
      text("\n\nURGENT STEPS\n\n"),
      field("urgent_steps", "Urgent steps", "1. We will notify the Insurance Commission this week.\n2. Attend your GP and ensure all symptoms are documented.\n3. Keep every receipt.\n4. Do not provide a statement to any insurer without speaking to us first."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the notification deadline, limitation period and the current general damages threshold and deductible under the Motor Vehicle (Third Party Insurance) Act 1943 (WA). Diarise all dates immediately.",
  },
  {
    key: "pitas.initial_advice",
    name: "Initial Advice - Personal Injury (TAS)",
    description: "First advice on a Tasmanian motor accident or work injury claim.",
    category: "Personal Injury",
    subcategory: "Pre-litigation",
    documentType: "advice",
    jurisdictions: ["TAS"],
    matterTypes: PI,
    aiInstructions:
      "Draft initial advice on a Tasmanian personal injury claim. Identify the scheme: the Motor Accidents (Liabilities and Compensation) Act 1973 (Tas), administered by the Motor Accidents Insurance Board (MAIB) as a NO-FAULT scheme providing scheduled benefits regardless of who caused the accident, or the Workers Rehabilitation and Compensation Act 1988 (Tas) for work injuries. Explain that the MAIB no-fault benefits are available immediately and that a common law claim may also be available where another party was at fault. Stress early notification to MAIB.",
    segments: [
      text("TASMANIAN INJURY CLAIM - INITIAL ADVICE\n\nInjury date: "),
      field("injury_date", "Injury date", "2 June 2026"),
      text("\nScheme: "),
      field("scheme", "Applicable scheme", "Motor Accidents Insurance Board (MAIB), under the Motor Accidents (Liabilities and Compensation) Act 1973 (Tas)."),
      text("\n\nTHE MAIB SCHEME IS NO-FAULT\n\nThis is the important difference from most other states. MAIB provides scheduled benefits regardless of who caused the accident -- you do not need to prove fault to receive them.\n\nBenefits include medical and rehabilitation expenses, loss of earnings, and in serious cases attendant care.\n\n"),
      field("maib_position", "MAIB claim position", "We will lodge your MAIB claim this week so that treatment and income benefits commence without delay."),
      text("\n\nA COMMON LAW CLAIM MAY ALSO BE AVAILABLE\n\nWhere another party was at fault, a common law damages claim may be available in addition to the scheme benefits, subject to the statutory thresholds and to any amounts already received being taken into account.\n\n"),
      field("common_law", "Common law position", "Liability appears clear -- the other driver crossed the centre line. We will assess a common law claim once your condition has stabilised and the medical position is clearer."),
      text("\n\nWORK INJURIES\n\n"),
      field("workers_comp", "Workers compensation position (if applicable)", "Not applicable -- this was not a work-related injury."),
      text("\n\nURGENT STEPS\n\n"),
      field("urgent_steps", "Urgent steps", "1. Notify MAIB immediately -- we will attend to this.\n2. See your GP and ensure all symptoms are recorded.\n3. Keep all receipts.\n4. Do not give any recorded statement before speaking to us."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the MAIB notification deadline, the limitation period for a common law claim, and how scheme benefits are accounted for against any damages award under the Motor Accidents (Liabilities and Compensation) Act 1973 (Tas).",
  },

  // ── Minor civil: SA / WA / TAS ──────────────────────────────────
  {
    key: "civsa.sacat_application_cover",
    name: "SACAT / Minor Civil Application (SA)",
    description: "Covers lodgement of a minor civil claim in South Australia.",
    category: "Litigation",
    subcategory: "Small Claims",
    documentType: "letter",
    jurisdictions: ["SA"],
    matterTypes: CIVIL,
    aiInstructions:
      "Draft a covering letter for a South Australian minor civil claim, identifying whether it belongs in SACAT or the Magistrates Court minor civil jurisdiction. Set out the parties, the nature of the dispute, the orders sought and documents lodged. Note that costs are generally limited in minor civil matters and representation may require leave.",
    segments: [
      text("APPLICATION - "),
      field("forum", "Forum", "South Australian Civil and Administrative Tribunal"),
      text("\n\nApplicant: "),
      field("applicant", "Applicant", "Jane Citizen"),
      text("\nRespondent: "),
      field("respondent", "Respondent", "Example Trades Pty Ltd (ABN 00 000 000 000)"),
      text("\n\nNATURE OF THE DISPUTE\n\n"),
      field("dispute", "Nature of the dispute", "Defective bathroom renovation carried out under a domestic building work contract dated 3 March 2026."),
      text("\n\nORDERS SOUGHT\n\n"),
      field("orders", "Orders sought", "1. An order that the respondent rectify the defective waterproofing, or alternatively pay $11,400 being the cost of rectification.\n2. Refund of $2,800 paid for work not performed."),
      text("\n\nDOCUMENTS LODGED\n\n"),
      field("documents", "Documents lodged", "1. Application form\n2. Building work contract\n3. Invoices and proof of payment\n4. Independent building report\n5. Photographs\n6. Correspondence between the parties"),
      text("\n\nWe note costs are generally limited in this jurisdiction and that representation may require leave."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm whether the claim falls within SACAT's jurisdiction or the Magistrates Court minor civil jurisdiction, and the current monetary limit for each -- lodging in the wrong forum wastes the fee.",
  },
  {
    key: "civwa.minor_case_application",
    name: "Minor Case Claim (WA Magistrates Court)",
    description: "Covers lodgement of a minor case claim in the WA Magistrates Court.",
    category: "Litigation",
    subcategory: "Small Claims",
    documentType: "letter",
    jurisdictions: ["WA"],
    matterTypes: CIVIL,
    aiInstructions:
      "Draft a covering letter for a Western Australian minor case claim in the Magistrates Court. Set out the parties, the claim, the amount and the documents lodged. Note that in the minor cases jurisdiction each party generally bears its own costs and legal representation is restricted, which materially affects the economics of the claim.",
    segments: [
      text("MINOR CASE CLAIM - MAGISTRATES COURT OF WESTERN AUSTRALIA\n\nClaimant: "),
      field("claimant", "Claimant", "Jane Citizen"),
      text("\nRespondent: "),
      field("respondent", "Respondent", "Example Trades Pty Ltd (ABN 00 000 000 000)"),
      text("\n\nNATURE OF THE CLAIM\n\n"),
      field("claim", "Nature of the claim", "Debt owing for goods supplied and not paid for, and damages for defective workmanship."),
      text("\n\nAMOUNT CLAIMED\n\n"),
      field("amount", "Amount claimed", "$8,600 plus the filing fee"),
      text("\n\nDOCUMENTS LODGED\n\n"),
      field("documents", "Documents lodged", "1. Claim form\n2. Invoices\n3. Letter of demand and proof of service\n4. Photographs of the defective work"),
      text("\n\nCOSTS - PLEASE NOTE\n\nIn the minor cases jurisdiction each party generally bears its own costs, and legal representation is restricted. That means the cost of running this claim is unlikely to be recoverable even on a win, which we have discussed with our client."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current minor cases monetary limit and the restrictions on representation in the Magistrates Court of Western Australia before lodging.",
  },
  {
    key: "civtas.minor_civil_application",
    name: "Minor Civil Claim (TAS Magistrates Court)",
    description: "Covers lodgement of a minor civil claim in Tasmania, which has no general civil tribunal.",
    category: "Litigation",
    subcategory: "Small Claims",
    documentType: "letter",
    jurisdictions: ["TAS"],
    matterTypes: CIVIL,
    aiInstructions:
      "Draft a covering letter for a Tasmanian minor civil claim in the Magistrates Court (Civil Division). Note expressly that Tasmania has no general civil tribunal, so claims of this kind are heard in the Magistrates Court rather than a NCAT/VCAT equivalent. Set out the parties, claim, amount and documents lodged, and note the costs position.",
    segments: [
      text("MINOR CIVIL CLAIM - MAGISTRATES COURT OF TASMANIA (CIVIL DIVISION)\n\nClaimant: "),
      field("claimant", "Claimant", "Jane Citizen"),
      text("\nRespondent: "),
      field("respondent", "Respondent", "Example Trades Pty Ltd (ABN 00 000 000 000)"),
      text("\n\nNOTE ON FORUM\n\nTasmania has no general civil tribunal equivalent to NCAT, VCAT or QCAT. Minor civil claims are heard in the Magistrates Court, Civil Division.\n\nNATURE OF THE CLAIM\n\n"),
      field("claim", "Nature of the claim", "Damages for defective building work carried out under a contract dated 3 March 2026."),
      text("\n\nAMOUNT CLAIMED\n\n"),
      field("amount", "Amount claimed", "$9,200 plus the filing fee"),
      text("\n\nDOCUMENTS LODGED\n\n"),
      field("documents", "Documents lodged", "1. Claim form\n2. Contract and invoices\n3. Independent building report\n4. Photographs\n5. Correspondence between the parties"),
      text("\n\nCOSTS\n\n"),
      field("costs_note", "Costs position", "Costs in the minor civil jurisdiction are limited. We have advised our client that the cost of running the claim may exceed what is recoverable."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current minor civil claims monetary limit and costs rules in the Magistrates Court of Tasmania before lodging.",
  },

  // ── Enduring documents by state ─────────────────────────────────
  {
    key: "estplan.enduring_documents_by_state",
    name: "Enduring Documents - What Each State Calls Them (file note)",
    description: "Internal note on the different names, forms and effect of enduring documents by state.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "file_note",
    matterTypes: WILLS,
    aiInstructions:
      "Draft an internal file note comparing enduring documents across states: what each is called, whether financial and personal/health decisions are covered by one document or two, and the fact that a document valid in one state is not automatically effective in another. Flag the practical consequences for clients who move interstate or own property in another state. State plainly it is a prompt to verify.",
    segments: [
      text("ENDURING DOCUMENTS - CHECK THE STATE\n\nInternal aide-memoire. Names, forms and witnessing requirements differ -- verify against the relevant state's legislation.\n\nFINANCIAL DECISIONS\n\n  All states: an Enduring Power of Attorney, covering financial and legal\n  decisions, continuing after loss of capacity.\n\nPERSONAL / HEALTH DECISIONS - THIS IS WHERE THEY DIVERGE\n\n  NSW  Appointment of Enduring Guardian (separate document)\n  VIC  EPA covers financial AND personal matters; plus a separate\n       Medical Treatment Decision Maker appointment\n  QLD  EPA covers financial AND personal/health; plus an Advance Health\n       Directive\n  SA   Advance Care Directive (replaced earlier separate instruments)\n  WA   Enduring Power of Guardianship (separate document)\n  TAS  Enduring Guardianship (separate document)\n\nTHE CROSS-BORDER PROBLEM\n\nA document made in one state is NOT automatically effective in another.\nMost states have recognition provisions, but they are not uniform and an\ninterstate document may be recognised only so far as its powers could have\nbeen conferred under the local Act.\n\nPractical consequences:\n\n  - A client who moves interstate should generally make fresh documents in\n    the new state rather than rely on recognition.\n  - A client who owns property in another state may need a document valid\n    there, particularly if the attorney will deal with that land.\n  - Registration is required in some states before an attorney can deal\n    with land, and that requirement is local.\n\n"),
      field("matter_note", "Note for this matter", "Client resides in NSW but owns an investment property in Queensland. Recommend NSW EPA and Enduring Guardian, plus a Queensland EPA limited to the Queensland property."),
    ],
    requiresReview: true,
    reviewNote:
      "Enduring document forms, witnessing requirements and interstate recognition provisions differ in every state and are amended. Confirm the current form and execution requirements for each state involved.",
  },
  {
    key: "estplan.enduring_documents_advice_states",
    name: "Enduring Power of Attorney and Guardianship - Advice (VIC/QLD/SA/WA/TAS)",
    description: "Advises on enduring documents outside NSW, using the correct local terminology.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "advice",
    jurisdictions: ["VIC", "QLD", "SA", "WA", "TAS"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft advice on enduring documents for a client outside NSW. Use the correct local terminology for the state (Victoria: EPA covering financial and personal, plus Medical Treatment Decision Maker; Queensland: EPA plus Advance Health Directive; SA: EPA plus Advance Care Directive; WA: EPA plus Enduring Power of Guardianship; Tasmania: EPA plus Enduring Guardianship). Explain what each covers, when it commences, the attorney's obligations, and the risk of appointing the wrong person. Note registration where the attorney will deal with land.",
    segments: [
      text("ENDURING DOCUMENTS - ADVICE\n\nState: "),
      field("state", "State", "Queensland"),
      text("\n\nWHAT YOU ARE PUTTING IN PLACE\n\n"),
      field("documents", "Documents and what each covers", "1. ENDURING POWER OF ATTORNEY -- covering both financial matters (banking, property, investments) and personal/health matters (where you live, medical treatment).\n\n2. ADVANCE HEALTH DIRECTIVE -- recording your specific wishes about medical treatment, including life-sustaining measures, which operates when you cannot communicate them yourself."),
      text("\n\nWHEN THEY START\n\n"),
      field("commencement", "When each commences", "The financial power can commence immediately or on loss of capacity -- you have instructed that it commence only on loss of capacity, certified by a medical practitioner. The personal/health power operates only when you lack capacity for the particular decision."),
      text("\n\nWHO YOU ARE APPOINTING\n\n"),
      field("attorneys", "Attorneys and substitutes", "Attorney: your spouse, Mary Citizen. Substitute: your daughter, Sarah Citizen."),
      text("\n\nTHE RISK - PLEASE CONSIDER IT PROPERLY\n\nAn attorney has very broad control over your finances. Misuse of enduring powers is unfortunately common and money is often difficult to recover.\n\nYour attorney must keep your money separate from their own, keep records, avoid conflicts, and act in your interests -- but those obligations only help if the person is trustworthy and capable to begin with.\n\nAppoint someone you trust completely and who can actually manage money.\n\n"),
      field("safeguards", "Safeguards adopted", "You have chosen to require both attorneys to act jointly for any transaction over $20,000, which provides a useful check."),
      text("\n\nREGISTRATION\n\n"),
      field("registration", "Registration requirement", "If your attorney will need to sell or mortgage land, the power must be registered with Titles Queensland. We recommend registering now rather than at a time of crisis."),
      text("\n\nIF YOU MOVE OR OWN PROPERTY INTERSTATE\n\nA document made here is not automatically effective in another state. If you move, or acquire property in another state, tell us and we will advise whether fresh documents are needed."),
    ],
    requiresReview: true,
    reviewNote:
      "Use the correct instrument name and prescribed form for the state -- these differ (Medical Treatment Decision Maker in Victoria, Advance Health Directive in Queensland, Advance Care Directive in SA, Enduring Power of Guardianship in WA, Enduring Guardianship in Tasmania). Confirm current execution and witnessing requirements.",
  },
  {
    key: "estplan.will_execution_states",
    name: "Will - Execution Instructions (VIC/QLD/SA/WA/TAS)",
    description: "Signing instructions for a will executed outside NSW.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "letter",
    jurisdictions: ["VIC", "QLD", "SA", "WA", "TAS"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft will execution instructions for a client outside NSW. The core formalities are broadly consistent across states -- signature at the end, two witnesses both present at the same time, witnesses not beneficiaries or their spouses -- but the state's Wills Act governs and some states have specific rules on interested witnesses and on informal wills. Give precise signing steps, warn against altering the will after signing, and offer execution at the office. Note storage of the original.",
    segments: [
      text("We enclose your will for signing.\n\nPLEASE FOLLOW THESE STEPS EXACTLY. A will not correctly executed may be invalid, and fixing it after death is expensive and not always possible.\n\nHOW TO SIGN\n\n1. Arrange TWO witnesses to be present with you at the same time.\n2. Neither witness may be a beneficiary, nor the spouse or partner of a beneficiary. A gift to a witness or their spouse may fail.\n3. You sign first, at the end of the will, while both witnesses watch.\n4. Each witness then signs in your presence.\n5. All three initial the bottom of every other page.\n6. Use the same pen throughout and date it the day you sign.\n\nWHAT NOT TO DO\n\n- Do not unstaple or re-staple the pages. Staple marks raise questions about whether another document was attached.\n- Do not write on, highlight or amend the will after signing.\n- Do not sign a photocopy.\n\n"),
      field("state_note", "Any state-specific note", "Note: in Queensland, a gift to an interested witness is not automatically void if the Court is satisfied the testator knew and approved of it, but we do not recommend relying on that -- use independent witnesses."),
      text("\n\nWHERE TO KEEP IT\n\n"),
      field("storage", "Storage arrangements", "We recommend we hold the original in safe custody at no charge, and you keep a copy. Tell your executors where the original is held."),
      text("\n\nAlternatively, sign at our office and we will arrange witnesses. Most clients prefer this and it removes the risk of an execution error entirely.\n\nPlease contact us to arrange a time."),
    ],
    requiresReview: true,
    reviewNote:
      "Execution formalities are governed by the relevant state Wills Act. Confirm the current requirements, and the state's position on interested witnesses and on dispensing power for informal wills.",
  },
];
