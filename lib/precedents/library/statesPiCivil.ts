// lib/precedents/library/statesPiCivil.ts
// Personal injury pre-litigation, and minor civil / small claims forums,
// outside NSW.
//
// PERSONAL INJURY is the most jurisdiction-divergent area in the library.
// These are not variations of one process -- each state runs a different
// mandatory pre-litigation regime with its own notices, its own gateways and
// its own deadlines, and non-compliance can bar the claim entirely:
//
//   QLD  Personal Injuries Proceedings Act 2002 -- Part 1 and Part 2 Notice
//        of Claim on prescribed forms, then a COMPULSORY CONFERENCE with
//        mandatory final offers before proceedings may start. Motor accident
//        claims run instead under the Motor Accident Insurance Act 1994.
//   VIC  Transport Accident Act 1986 (TAC) for transport accidents;
//        WorkSafe for work injuries; and for common law damages under the
//        Wrongs Act 1958 a serious injury gateway must be passed first.
//   SA   CTP scheme for motor; Return to Work Act 2014 for work injuries.
//   WA   Motor Vehicle (Third Party Insurance) Act 1943; Workers
//        Compensation and Injury Management Act.
//   TAS  Motor Accidents Insurance Board (MAIB) -- a no-fault scheme;
//        Workers Rehabilitation and Compensation Act 1988.
//
// The QLD Part 1 Notice deadline deserves particular attention: it is the
// EARLIER of 9 months from the injury and ONE MONTH from the date the
// claimant first instructs a lawyer. Taking instructions therefore starts a
// very short clock, which is a trap for a practitioner used to other states.
//
// MINOR CIVIL forums also differ, and Tasmania has no general civil tribunal
// at all -- minor civil claims run in the Magistrates Court (Civil Division).
import { text, field, type PrecedentSeed } from "./types";

const PI = ["Litigation", "Other"];
const CIVIL = ["Litigation"];

export const STATE_PI_CIVIL_PRECEDENTS: PrecedentSeed[] = [
  // ── Personal injury: Queensland ─────────────────────────────────
  {
    key: "piqld.pipa_initial_advice",
    name: "Initial Advice: PIPA Claim (QLD)",
    description: "First advice on a Queensland personal injury claim and the PIPA pre-litigation process.",
    category: "Personal Injury",
    subcategory: "Pre-litigation",
    documentType: "advice",
    jurisdictions: ["QLD"],
    matterTypes: PI,
    aiInstructions:
      "Draft initial advice on a Queensland personal injury claim under the Personal Injuries Proceedings Act 2002 (Qld). Explain the mandatory pre-litigation steps: the Part 1 Notice of Claim on the prescribed form, the respondent's response, the Part 2 Notice, disclosure obligations, and the compulsory conference at which the parties must exchange mandatory final offers before proceedings may be started. Explain that proceedings must then be commenced within a short period after the conference. CRITICALLY: explain the Part 1 Notice deadline is the EARLIER of 9 months from the injury and one month from the date the claimant first instructs a lawyer -- so instructing a lawyer starts a one month clock. Emphasise urgency.",
    segments: [
      text("QUEENSLAND PERSONAL INJURY CLAIM: INITIAL ADVICE\n\nInjury date: "),
      field("injury_date", "Injury date", "2 June 2026"),
      text("\n\n----------------------------------------\nURGENT: THE NOTICE DEADLINE\n\nYour Part 1 Notice of Claim must be given by the EARLIER of:\n\n  (a) 9 months after the injury; and\n  (b) ONE MONTH after the date you first instructed a lawyer.\n\nBecause you have now instructed us, the one month period is running. We must serve the Part 1 Notice by "),
      field("part1_deadline", "Part 1 Notice deadline", "20 September 2026"),
      text(".\n\nIf it is served late we must provide a reasonable excuse, and the respondent may take the point.\n----------------------------------------\n\nHOW A PIPA CLAIM WORKS\n\nQueensland requires a mandatory pre-litigation process before you can start court proceedings:\n\n1. PART 1 NOTICE OF CLAIM, on the prescribed form, served on the respondent.\n2. RESPONDENT'S RESPONSE, stating whether liability is admitted or denied.\n3. PART 2 NOTICE, and exchange of documents. Both sides have wide disclosure obligations.\n4. COMPULSORY CONFERENCE. The parties must meet and attempt settlement. If it does not settle, both sides exchange MANDATORY FINAL OFFERS in sealed envelopes.\n5. PROCEEDINGS, which must be commenced within a short period after the conference.\n\nThe mandatory final offers matter: if you later do worse at trial than the offer you rejected, there are costs consequences.\n\nYOUR CLAIM\n\n"),
      field("claim_summary", "Claim summary", "You were injured when you slipped on an unmarked wet floor at a shopping centre. Liability appears reasonably strong: there is CCTV, and no warning cone was in place despite cleaning having just occurred."),
      text("\n\nWHAT WE NEED FROM YOU NOW\n\n"),
      field("client_actions", "Immediate actions", "1. Full details of the incident, including any witnesses.\n2. All medical records and receipts.\n3. Details of time off work and lost income.\n4. Any photographs taken at the time."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the Part 1 Notice deadline, the compulsory conference requirements and the period for commencing proceedings under the current Personal Injuries Proceedings Act 2002 (Qld). Diarise the notice deadline immediately -- the one month from instruction trap is a common source of negligence claims.",
  },
  {
    key: "piqld.part1_notice_cover",
    name: "PIPA Part 1 Notice of Claim (covering letter, QLD)",
    description: "Serves the Part 1 Notice of Claim on the respondent.",
    category: "Personal Injury",
    subcategory: "Pre-litigation",
    documentType: "letter",
    jurisdictions: ["QLD"],
    matterTypes: PI,
    aiInstructions:
      "Draft a covering letter serving a PIPA Part 1 Notice of Claim. Identify the claimant, the incident date and place, the respondent, and enclose the completed prescribed form with supporting material. Request the respondent's response within the statutory period, stating whether liability is admitted and whether the respondent is a proper respondent. Keep it precise -- this document starts the statutory process.",
    segments: [
      text("PART 1 NOTICE OF CLAIM: PERSONAL INJURIES PROCEEDINGS ACT 2002 (QLD)\n\nClaimant: "),
      field("claimant", "Claimant", "Jane Citizen, date of birth 4 April 1988"),
      text("\nIncident date: "),
      field("incident_date", "Incident date", "2 June 2026"),
      text("\nIncident location: "),
      field("location", "Location", "Example Shopping Centre, 100 Sample Road, Ipswich QLD 4305"),
      text("\n\nWe act for the claimant and serve the enclosed Part 1 Notice of Claim in the approved form, together with supporting material.\n\nCIRCUMSTANCES\n\n"),
      field("circumstances", "Circumstances of the incident", "The claimant slipped on a wet floor in the centre's food court at approximately 12:15pm. The floor had recently been mopped. No warning sign or cone was in place."),
      text("\n\nINJURIES\n\n"),
      field("injuries", "Injuries", "Fractured left wrist requiring surgical fixation, and a soft tissue injury to the lower back."),
      text("\n\nENCLOSED\n\n"),
      field("enclosures", "Enclosures", "1. Part 1 Notice of Claim (approved form)\n2. Medical certificate\n3. Incident report obtained from centre management\n4. Photographs of the location"),
      text("\n\nPlease provide your response within the period required by the Act, confirming:\n\n1. whether you are a proper respondent to this claim;\n2. whether liability is admitted or denied; and\n3. if denied, the basis of the denial.\n\nWe also request that any CCTV footage of the incident be preserved."),
    ],
    requiresReview: true,
    reviewNote:
      "The Part 1 Notice must be in the current approved form -- these are updated. Verify the current form and the respondent's response period before serving.",
  },
  // ── Personal injury: Victoria ───────────────────────────────────
  {
    key: "pivic.initial_advice",
    name: "Initial Advice: Personal Injury (VIC)",
    description: "First advice on a Victorian injury claim: TAC, WorkSafe and the serious injury gateway.",
    category: "Personal Injury",
    subcategory: "Pre-litigation",
    documentType: "advice",
    jurisdictions: ["VIC"],
    matterTypes: PI,
    aiInstructions:
      "Draft initial advice on a Victorian personal injury claim. Identify which scheme applies: the Transport Accident Commission under the Transport Accident Act 1986 for transport accidents, WorkSafe for work injuries, or a common law claim for other injuries. Explain the two limbs -- statutory no-fault benefits (medical and like expenses, income support), and common law damages which for most claims require passing a serious injury gateway, either by impairment level or by a serious injury certificate. Explain that the serious injury threshold is the principal obstacle in Victorian claims and that many claims resolve on statutory benefits alone.",
    segments: [
      text("VICTORIAN INJURY CLAIM: INITIAL ADVICE\n\nInjury date: "),
      field("injury_date", "Injury date", "2 June 2026"),
      text("\nScheme: "),
      field("scheme", "Applicable scheme", "Transport Accident Commission (TAC), the injury having occurred in a motor vehicle accident."),
      text("\n\nTHERE ARE TWO SEPARATE ENTITLEMENTS\n\n1. STATUTORY BENEFITS (no-fault)\n\nAvailable regardless of who caused the accident. They cover reasonable medical and like expenses and, if you cannot work, income support.\n\n"),
      field("statutory_position", "Statutory benefits position", "We will lodge your TAC claim immediately so that treatment and income support commence."),
      text("\n\n2. COMMON LAW DAMAGES (fault-based)\n\nA damages claim requires proving someone else was negligent AND passing the serious injury gateway.\n\nTHE SERIOUS INJURY GATEWAY\n\nThis is the principal obstacle in Victorian claims. You must either reach the prescribed level of permanent impairment, or obtain a serious injury certificate on the basis that the consequences of the injury are serious.\n\n"),
      field("serious_injury_assessment", "Serious injury assessment", "Your wrist fracture required surgical fixation and you have ongoing loss of grip strength affecting your work as a carpenter. In our preliminary view there is a reasonable prospect of satisfying the gateway, but this will require specialist medical assessment."),
      text("\n\nWHAT THIS MEANS PRACTICALLY\n\nMany Victorian claims resolve on statutory benefits alone, because the serious injury threshold is not met. We will advise you further once the medical evidence is complete.\n\nWHAT WE NEED FROM YOU\n\n"),
      field("client_actions", "Immediate actions", "1. Attend your GP and ensure every symptom is documented.\n2. Keep all receipts.\n3. Provide details of your pre-accident earnings."),
    ],
    requiresReview: true,
    reviewNote:
      "Verify the current serious injury gateway requirements under the Wrongs Act 1958 (Vic) and the applicable impairment threshold, and confirm which scheme (TAC / WorkSafe / common law) governs before advising.",
  },
  // ── Personal injury: other states ───────────────────────────────
  {
    key: "pistates.scheme_identification_note",
    name: "Personal Injury: Which Scheme Applies (file note)",
    description: "Internal aide-memoire identifying the governing scheme and pre-litigation regime by state.",
    category: "Personal Injury",
    subcategory: "Practice Notes",
    documentType: "file_note",
    matterTypes: PI,
    aiInstructions:
      "Draft an internal file note summarising which personal injury scheme and pre-litigation regime applies in each state, so a practitioner can identify the right pathway before advising. Note that non-compliance with a mandatory pre-litigation step can bar a claim entirely, and that limitation periods differ. Present it as a scannable comparison. State plainly it is a prompt to verify, not authority.",
    segments: [
      text("PERSONAL INJURY: IDENTIFY THE SCHEME FIRST\n\nInternal aide-memoire. Verify the current position before advising; non-compliance with a mandatory pre-litigation step can bar a claim entirely.\n\nMOTOR ACCIDENTS\n\n  NSW  Motor Accidents Injuries Act 2017 (accidents from 1 Dec 2017), or\n       Motor Accidents Compensation Act 1999 for earlier accidents.\n       Disputes: Personal Injury Commission.\n  VIC  Transport Accident Act 1986 (TAC). Common law damages require\n       passing the serious injury gateway.\n  QLD  Motor Accident Insurance Act 1994 (MAIA); own notice regime,\n       separate from PIPA.\n  SA   Compulsory Third Party scheme.\n  WA   Motor Vehicle (Third Party Insurance) Act 1943.\n  TAS  Motor Accidents Insurance Board (MAIB); no-fault scheme.\n\nWORK INJURIES\n\n  NSW  Workers compensation; disputes to the Personal Injury Commission.\n  VIC  WorkSafe.\n  QLD  WorkCover Queensland.\n  SA   Return to Work Act 2014.\n  WA   Workers Compensation and Injury Management Act.\n  TAS  Workers Rehabilitation and Compensation Act 1988.\n\nPUBLIC LIABILITY / OTHER\n\n  QLD  Personal Injuries Proceedings Act 2002 (PIPA): Part 1 and Part 2\n       Notices, then a COMPULSORY CONFERENCE with mandatory final offers\n       before proceedings.\n  Others: general civil claim, subject to that state's civil liability\n       legislation.\n\nTHE ONE THAT CATCHES PEOPLE OUT\n\n  QLD PIPA Part 1 Notice is due on the EARLIER of 9 months from injury and\n  ONE MONTH from the date the claimant first instructs a lawyer. Taking\n  instructions starts a one month clock. Diarise it the day you open the\n  file.\n\n"),
      field("matter_note", "Note for this matter", "This matter is a Queensland public liability claim. PIPA applies. Part 1 Notice deadline diarised."),
    ],
    requiresReview: true,
    reviewNote:
      "This note is a prompt to verify, not authority. Schemes, gateways and limitation periods are amended regularly -- confirm the current position for the specific state and injury type.",
  },
  // ── Minor civil forums by state ─────────────────────────────────
  {
    key: "civvic.vcat_application_cover",
    name: "VCAT Application (covering letter, VIC)",
    description: "Covers lodgement of a civil claim in VCAT.",
    category: "Litigation",
    subcategory: "Small Claims",
    documentType: "letter",
    jurisdictions: ["VIC"],
    matterTypes: CIVIL,
    aiInstructions:
      "Draft a covering letter for a VCAT application in the Civil Claims List. Identify the list, parties, nature of the dispute, orders sought and documents lodged. Note whether the dispute is one where a compulsory conciliation conference is likely to be listed before a final hearing, and what the client should expect from that process. Note that VCAT ordinarily does not award costs and that legal representation may require leave, and briefly explain why leave might or might not be granted (complexity, value, or one side already being represented).",
    segments: [
      text("APPLICATION: VICTORIAN CIVIL AND ADMINISTRATIVE TRIBUNAL\n\nList: "),
      field("list", "List", "Civil Claims List"),
      text("\nApplicant: "),
      field("applicant", "Applicant", "Jane Citizen"),
      text("\nRespondent: "),
      field("respondent", "Respondent", "Example Trades Pty Ltd (ABN 00 000 000 000)"),
      text("\n\nNATURE OF THE DISPUTE\n\n"),
      field("dispute", "Nature of the dispute", "Defective kitchen installation carried out under a contract dated 3 March 2026."),
      text("\n\nORDERS SOUGHT\n\n"),
      field("orders", "Orders sought", "An order that the respondent pay the applicant $11,400 being the cost of rectifying the defective work."),
      text("\n\nDOCUMENTS LODGED\n\n"),
      field("documents", "Documents lodged", "1. Application form\n2. Contract and invoices\n3. Independent trade report\n4. Photographs\n5. Correspondence between the parties"),
      text("\n\nWHAT TO EXPECT NEXT\n\n"),
      field("next_steps", "What happens next", "We expect the Tribunal will first list this matter for a compulsory conciliation conference, at which a Member will assist the parties to reach an agreed outcome. If that is unsuccessful, the matter will be listed for a final hearing."),
      text("\n\nREPRESENTATION\n\nWe note VCAT ordinarily does not award costs and that legal representation may require leave of the Tribunal. "),
      field("leave_position", "Basis on which leave for representation is sought (if applicable)", "Given the technical building evidence involved, we intend to seek leave to represent our client at any hearing."),
    ],
  },
  {
    key: "civqld.qcat_application_cover",
    name: "QCAT Minor Civil Dispute Application (QLD)",
    description: "Covers lodgement of a minor civil dispute in QCAT.",
    category: "Litigation",
    subcategory: "Small Claims",
    documentType: "letter",
    jurisdictions: ["QLD"],
    matterTypes: CIVIL,
    aiInstructions:
      "Draft a covering letter for a QCAT minor civil dispute application. Identify the parties, the nature of the dispute, the orders sought and the documents lodged, and confirm the amount claimed is within the current monetary limit for a minor civil dispute (a claim above it must instead go to the Magistrates Court, so this should be checked and stated, not assumed). Note that QCAT will generally first try to resolve the dispute informally at a hearing before a Magistrate or an adjudicator, and that parties are generally not legally represented without leave -- state briefly why leave is or is not being sought.",
    segments: [
      text("APPLICATION: QUEENSLAND CIVIL AND ADMINISTRATIVE TRIBUNAL\n\nMinor civil dispute\n\nApplicant: "),
      field("applicant", "Applicant", "Jane Citizen"),
      text("\nRespondent: "),
      field("respondent", "Respondent", "Example Trades Pty Ltd (ABN 00 000 000 000)"),
      text("\n\nNATURE OF THE DISPUTE\n\n"),
      field("dispute", "Nature of the dispute", "Debt owing for goods supplied and not paid for."),
      text("\n\nAMOUNT CLAIMED\n\n"),
      field("amount", "Amount claimed", "$9,800 plus filing fee"),
      text("\n\n"),
      field("monetary_limit_confirmation", "Confirmation the claim is within the monetary limit", "This amount is within the current monetary limit for a minor civil dispute claim for a debt or liquidated demand."),
      text("\n\nDOCUMENTS LODGED\n\n"),
      field("documents", "Documents lodged", "1. Application form\n2. Invoices\n3. Delivery dockets\n4. Letter of demand and proof of service"),
      text("\n\nWHAT TO EXPECT\n\nMinor civil disputes are generally resolved at a single hearing before a Magistrate or adjudicator, conducted informally and without strict rules of evidence.\n\nREPRESENTATION\n\nWe note parties in a minor civil dispute are generally not legally represented without the Tribunal's leave. "),
      field("leave_position", "Basis on which leave for representation is sought (if applicable, or 'Our client does not intend to seek leave to be represented at the hearing')", "Our client does not intend to seek leave to be represented at the hearing and will attend in person."),
    ],
    requiresReview: true,
    reviewNote:
      "QCAT's minor civil dispute monetary limit is set by regulation and changes. Confirm the current limit before lodging -- a claim above it must go to the Magistrates Court.",
  },
  {
    key: "civstates.minor_civil_forum_note",
    name: "Minor Civil Claims: Forum by State (file note)",
    description: "Internal note on which forum hears small civil claims in each state.",
    category: "Litigation",
    subcategory: "Practice Notes",
    documentType: "file_note",
    matterTypes: CIVIL,
    aiInstructions:
      "Draft an internal file note on which forum hears minor civil claims in each state, noting that Tasmania has no general civil tribunal and that monetary limits are set by regulation and must be confirmed. Present as a scannable list. Note the practical costs point: tribunals generally do not award costs, which changes the economics of a small claim.",
    segments: [
      text("MINOR CIVIL CLAIMS: WHICH FORUM\n\nInternal aide-memoire. Monetary limits are set by regulation and change. Confirm the current limit before lodging.\n\n  NSW  NCAT (Consumer and Commercial Division), or the Local Court\n       Small Claims Division for general debt and damages.\n  VIC  VCAT, Civil Claims List.\n  QLD  QCAT minor civil disputes; above the limit, the Magistrates Court.\n  SA   SACAT, or the Magistrates Court Minor Civil jurisdiction.\n  WA   Magistrates Court Minor Cases; SAT for administrative and certain\n       other matters.\n  TAS  NO general civil tribunal. Minor civil claims are heard in the\n       Magistrates Court (Civil Division).\n\nINTERMEDIATE COURT (for larger claims)\n\n  NSW District Court    VIC County Court    QLD District Court\n  SA  District Court    WA  District Court\n  TAS NONE; Magistrates Court straight to Supreme Court.\n\nTHE COSTS POINT\n\nTribunals generally do not award costs, and representation often requires\nleave. On a small claim that frequently means the cost of running the matter\nexceeds what can be recovered even on a win. Advise the client on that\nbefore lodging, not after.\n\n"),
      field("matter_note", "Note for this matter", "This matter concerns a Victorian consumer claim of $11,400. VCAT Civil Claims List is the appropriate forum."),
    ],
    requiresReview: true,
    reviewNote:
      "Monetary limits for every forum listed are set by regulation and change. Confirm the current limit and the costs rules for the chosen forum before advising or lodging.",
  },
];
