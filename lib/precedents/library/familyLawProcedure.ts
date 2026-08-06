// lib/precedents/library/familyLawProcedure.ts
// FCFCOA procedural correspondence, structured around the stages a family
// law matter actually moves through rather than by document type.
//
// Modelled on how family law practitioners organise their own precedent
// banks: pre-action procedures, then filing, first return, interim hearing,
// dispute resolution, compliance/readiness, trial preparation and judgment,
// with a costs notice and a "no substantial change in circumstances"
// confirmation recurring at each stage.
//
// Two things this covers that the general family law precedents do not:
//
//  1. PRE-ACTION PROCEDURES. The Family Law Rules require a prospective
//     applicant to comply with pre-action procedures before filing --
//     including giving written notice of an intention to commence
//     proceedings and making a genuine attempt to resolve. The escalating
//     notice sequence below reflects that, because a party who files
//     without complying risks a costs order and an unimpressed judge.
//
//  2. COSTS NOTICES. Parties must give notice of costs actually incurred at
//     prescribed points. It is procedural housekeeping that is easy to miss
//     and awkward to explain when it is.
//
// Federal and jurisdiction-neutral, subject to the standing WA de facto
// financial exception noted in familyLaw.ts.
import { text, field, type PrecedentSeed } from "./types";

const FAMILY = ["Family Law"];

export const FAMILY_LAW_PROCEDURE_PRECEDENTS: PrecedentSeed[] = [
  // ── Pre-action ──────────────────────────────────────────────────
  {
    key: "famp.preaction_advice_to_client",
    name: "Pre-Action Procedures: Advice to Client",
    description: "Explains the pre-action procedures that must be complied with before filing.",
    category: "Family Law",
    subcategory: "Pre-action",
    documentType: "advice",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft advice to a client on the pre-action procedures required by the Family Law Rules before filing. Cover: the requirement to make a genuine attempt to resolve the dispute; exchanging a notice of intention to commence proceedings and correspondence setting out the issues; the duty of disclosure which begins before filing, not on filing; participation in dispute resolution; and the exceptions (urgency, family violence, risk to a child, fraud, or where a party would be unduly prejudiced). Explain plainly that failing to comply can result in a costs order against the client and starts the case badly. Do not cite specific rule numbers: refer to the Rules generally and confirm before filing.",
    segments: [
      text("BEFORE WE CAN FILE: PRE-ACTION PROCEDURES\n\nThe Family Law Rules require both parties to take certain steps BEFORE proceedings are started. These are not optional formalities.\n\nWHAT IS REQUIRED\n\n1. A GENUINE ATTEMPT TO RESOLVE. You must genuinely try to resolve the dispute, usually through dispute resolution, before asking a court to decide it.\n\n2. WRITTEN NOTICE. We must write to the other party setting out the issues, the orders we would seek, and a genuine offer to resolve, and give them a reasonable opportunity to respond.\n\n3. DISCLOSURE. The duty of disclosure starts NOW, not when proceedings are filed. Both parties must exchange relevant financial documents.\n\n4. DISPUTE RESOLUTION. For parenting matters this generally means family dispute resolution and a s 60I certificate.\n\nWHAT HAPPENS IF WE DON'T COMPLY\n\nA party who files without complying can be ordered to pay the other side's costs, even if they ultimately succeed on the substance. It also sets a poor tone with the judge from the first return.\n\nWHEN THESE STEPS ARE NOT REQUIRED\n\nThere are exceptions: urgency, family violence or risk to a child, fraud, or where compliance would unduly prejudice a party.\n\n"),
      field("exception_position", "Whether an exception applies", "In our view no exception applies here, so we should comply fully before filing."),
      text("\n\nWHAT WE PROPOSE\n\n"),
      field("proposed_steps", "Proposed steps and timetable", "1. Write to the other party this week setting out the issues and proposing mediation.\n2. Exchange financial disclosure over the following 4 weeks.\n3. Attend mediation in November.\n4. If unresolved, serve a notice of intention to commence and file thereafter."),
      text("\n\nThis takes time, but it is time well spent: most matters resolve at or before mediation, and those that do not are better prepared for having gone through it."),
    ],
    requiresReview: true,
    reviewNote:
      "Pre-action procedure requirements and the recognised exceptions are set by the Family Law Rules and have been amended. Confirm the current requirements, and whether an exception applies, before advising the client that filing can proceed.",
  },
  {
    key: "famp.notice_of_intention_first",
    name: "Notice of Intention to Commence Proceedings (first)",
    description: "First written notice under the pre-action procedures, setting out the issues and an offer.",
    category: "Family Law",
    subcategory: "Pre-action",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a first notice of intention to commence proceedings under the pre-action procedures. It must: identify the issues in dispute; set out the orders that would be sought; make a genuine offer to resolve; invite the other party to participate in dispute resolution; nominate a reasonable time for a response; and note that if no response is received, proceedings may be commenced and this correspondence produced to the Court on costs. Keep the tone constructive: this letter will be read by a judge and an aggressive one damages the sender.",
    segments: [
      text("NOTICE OF INTENTION TO COMMENCE PROCEEDINGS\n\nWe act for "),
      field("client", "Our client", "Jane Citizen"),
      text(".\n\nThis notice is given in accordance with the pre-action procedures under the Family Law Rules.\n\nTHE ISSUES IN DISPUTE\n\n"),
      field("issues", "Issues in dispute", "1. The arrangements for the children, Sam (10) and Ava (7), and in particular the proposal that they relocate to Newcastle.\n2. The division of property, including the former matrimonial home and superannuation."),
      text("\n\nORDERS OUR CLIENT WOULD SEEK\n\n"),
      field("orders", "Orders that would be sought", "1. That the children live with our client and spend time with your client on alternate weekends and half of all school holidays.\n2. That the former matrimonial home be sold and the net proceeds divided 58% to our client and 42% to your client.\n3. That each party retain their own superannuation."),
      text("\n\nOUR CLIENT'S OFFER\n\n"),
      field("offer", "Genuine offer to resolve", "Our client is willing to resolve on the terms above, and is open to discussing the weekend changeover time and additional holiday time if that assists."),
      text("\n\nDISPUTE RESOLUTION\n\nOur client invites your client to participate in "),
      field("dr_proposal", "Dispute resolution proposed", "family dispute resolution with an accredited practitioner, and is willing to share the cost equally"),
      text(".\n\nDISCLOSURE\n\nWe enclose our client's financial disclosure and request your client's in exchange.\n\nRESPONSE\n\nPlease respond by "),
      field("response_date", "Response required by", "14 October 2026"),
      text(".\n\nIf no response is received, our client may commence proceedings. In that event this correspondence will be produced to the Court on the question of compliance with the pre-action procedures and on costs.\n\nOur client would much prefer to resolve this without litigation, for the children's sake as much as anyone's."),
    ],
  },
  {
    key: "famp.notice_of_intention_final",
    name: "Notice of Intention to Commence Proceedings (final)",
    description: "Final notice after negotiations are exhausted or unanswered, immediately before filing.",
    category: "Family Law",
    subcategory: "Pre-action",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a final notice of intention to commence proceedings, sent either where earlier notices went unanswered or where negotiations have been exhausted. Refer to the earlier correspondence and its dates, summarise what has and has not been resolved, state that proceedings will now be commenced, and record that the client has complied with the pre-action procedures. Keep it factual and restrained: this letter is likely to be annexed to an affidavit.",
    segments: [
      text("FINAL NOTICE OF INTENTION TO COMMENCE PROCEEDINGS\n\nWe refer to our correspondence of "),
      field("earlier_correspondence", "Earlier correspondence dates", "16 September 2026 and 14 October 2026"),
      text(".\n\nWHERE MATTERS STAND\n\n"),
      field("status", "What has and has not been resolved", "Your client responded on 21 October 2026 and the parties attended mediation on 4 November 2026. Agreement was reached that the children will remain enrolled at their current school. No agreement was reached on the time the children spend with your client, or on the division of property."),
      text("\n\nOUR CLIENT'S POSITION\n\n"),
      field("position", "Current position and any remaining offer", "Our client's offer of a 58/42 division in her favour remains open, as does her proposal for alternate weekends plus one mid-week overnight. That offer is open for acceptance until the date below."),
      text("\n\nPROCEEDINGS\n\nUnless the matter resolves by "),
      field("deadline", "Deadline before filing", "21 November 2026"),
      text(", our client will file an Initiating Application.\n\nCOMPLIANCE WITH PRE-ACTION PROCEDURES\n\nOur client has complied with the pre-action procedures: she has given written notice of the issues and the orders sought, made a genuine offer, provided full financial disclosure, and participated in dispute resolution.\n\nThis correspondence will be produced to the Court in support of that position and on any question of costs."),
    ],
  },

  // ── Costs notices, recurring at each stage ──────────────────────
  {
    key: "famp.costs_notice_to_client",
    name: "Costs Notice: Letter to Client",
    description: "Advises the client of costs incurred and estimated to the next stage.",
    category: "Family Law",
    subcategory: "Costs",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter to a client providing a costs notice. State the costs incurred to date, the costs estimated to the next court event and to final hearing, and explain the party/party versus solicitor/client distinction so the client understands that even a successful party rarely recovers all costs. Note that in family law the usual position is that each party bears their own costs, subject to exceptions. Encourage the client to weigh the cost against what is actually in dispute.",
    segments: [
      text("COSTS NOTICE\n\nWe are required to keep you informed of the costs of your matter, and to notify the Court and the other party at certain stages.\n\nCOSTS TO DATE\n\n"),
      field("costs_to_date", "Costs incurred to date", "Professional costs        $14,200.00\nDisbursements              $2,860.00\nCounsel's fees             $4,400.00\n                        --------------\nTOTAL TO DATE             $21,460.00"),
      text("\n\nESTIMATED COSTS AHEAD\n\n"),
      field("estimated_costs", "Estimated costs to next stage and to hearing", "To the interim hearing:   a further $8,000 to $12,000\nTo final hearing:         a further $45,000 to $70,000"),
      text("\n\nWHAT YOU WOULD RECOVER IF SUCCESSFUL\n\nThe usual position in family law is that EACH PARTY BEARS THEIR OWN COSTS. Costs orders are the exception, not the rule, and are generally made only where a party has behaved unreasonably or failed to comply with orders or the pre-action procedures.\n\nEven where a costs order is made, it is usually on a party/party basis, which typically recovers only a portion of what you have actually paid us.\n\nPLEASE WEIGH THIS UP\n\n"),
      field("proportionality", "Proportionality assessment", "The remaining issues in dispute are worth approximately $90,000 in property terms. The estimated cost of running the matter to final hearing is a substantial proportion of that. This is worth weighing carefully against the offer currently on the table."),
      text("\n\nWe are not suggesting you should accept an outcome you consider unfair. We are making sure you make that decision with the costs clearly in front of you.\n\nPlease telephone us if you would like to discuss."),
    ],
  },
  {
    key: "famp.costs_notice_to_court",
    name: "Costs Notice: Letter to Court and Other Party",
    description: "Serves the costs notice on the Court and the other party.",
    category: "Family Law",
    subcategory: "Costs",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a short covering letter serving a costs notice on the Court and the other party at a court event. Identify the proceedings, the event and its date, and confirm the notice states costs incurred to date and estimated to the next stage. Set out the actual figures (costs incurred to date, and the estimate to the conclusion of the next event) rather than describing them only in the abstract, since that summary is what the other party and the Court actually use. Keep it otherwise administrative.",
    segments: [
      text("COSTS NOTICE\n\nFEDERAL CIRCUIT AND FAMILY COURT OF AUSTRALIA\nRegistry: "),
      field("registry", "Registry", "Sydney"),
      text("\nFile number: "),
      field("file_number", "File number", "SYC 1234 of 2026"),
      text("\n\nApplicant: "),
      field("applicant", "Applicant", "Jane Citizen"),
      text("\nRespondent: "),
      field("respondent", "Respondent", "Alex Partner"),
      text("\n\nWe act for the "),
      field("party", "Party we act for", "Applicant"),
      text(" and file and serve the enclosed Costs Notice in advance of the "),
      field("event", "Court event and date", "interim hearing listed on 12 November 2026"),
      text(".\n\nCOSTS SUMMARY\n\n"),
      field("costs_summary", "Costs incurred to date and estimate to next stage", "Costs incurred to date: $14,850 (inclusive of GST and disbursements).\nEstimated costs to the conclusion of the interim hearing: a further $6,200.\nEstimated total costs to a final hearing, if the matter proceeds that far: $65,000 to $85,000."),
      text("\n\nThe Notice states the costs incurred by our client to date and the costs estimated to be incurred to the conclusion of that event, in accordance with the Family Law Rules.\n\nA copy has been served on the "),
      field("served_on", "Served on", "Respondent's solicitors"),
      text(" today."),
    ],
    requiresReview: true,
    reviewNote:
      "Costs notice content and the points at which one must be filed are prescribed by the Family Law Rules. Confirm the current form and the applicable filing points.",
  },

  // ── Stage documents ─────────────────────────────────────────────
  {
    key: "famp.no_change_confirmation",
    name: "Confirmation of No Substantial Change in Circumstances",
    description: "Confirms with the client before a court event that instructions and circumstances are unchanged.",
    category: "Family Law",
    subcategory: "Court Preparation",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a short letter to a client before a court event confirming that nothing material has changed since the last event. Ask them to confirm: their circumstances (income, employment, housing, health, new relationship), the children's circumstances and arrangements, whether any new incident or risk issue has arisen, and whether their instructions are unchanged. Explain that the Court and the other side will be told the case is ready on the basis of what they confirm, so anything that has changed must be raised now rather than at the door of the court.",
    segments: [
      text("BEFORE YOUR COURT DATE: PLEASE CONFIRM\n\nYour matter is listed for "),
      field("event", "Court event and date", "an interim hearing on 12 November 2026"),
      text(".\n\nBefore then we need you to confirm that nothing material has changed since we last updated the Court.\n\nPLEASE CONFIRM WHETHER ANY OF THE FOLLOWING HAS CHANGED\n\n1. Your income, employment or financial position.\n2. Your housing: where you are living and with whom.\n3. Your health, including any new diagnosis or treatment.\n4. Whether you have entered a new relationship, or are cohabiting.\n5. The children's schooling, health, or routine.\n6. The actual arrangements for the children: what is happening in practice, not what the orders say.\n7. Any new incident, safety concern, or contact from police or child protection.\n8. Any new asset, liability, gift, inheritance or windfall.\n\n"),
      field("specific_queries", "Anything specific to confirm in this matter", "In particular, please confirm whether the other party has yet enrolled the children at the Newcastle school, and whether the mid-week overnight has been occurring."),
      text("\n\nWHY THIS MATTERS\n\nWe will tell the Court and the other side that the matter is ready to proceed on the basis of what you confirm. If something has changed and we do not know, it can emerge at the hearing in the worst possible way.\n\nIf ANYTHING has changed, tell us now. Nothing is too small to mention.\n\nPlease reply by "),
      field("reply_by", "Reply by", "5 November 2026"),
      text("."),
    ],
  },
  {
    key: "famp.case_outline",
    name: "Case Outline / Summary Document",
    description: "Concise outline of the case for the Court at a listed event.",
    category: "Family Law",
    subcategory: "Court Documents",
    documentType: "court_document",
    matterTypes: FAMILY,
    requiresReview: true,
    reviewNote:
      "The FCFCOA prescribes the form and page limits for case outlines and summaries, and they differ by event type and division. Confirm the current form and limit before filing.",
    aiInstructions:
      "Draft a case outline for a listed court event. Structure: the orders sought at this event; the issues the Court must determine; a concise chronology of relevant facts; the evidence relied upon with document references; the applicable legal principles stated briefly; and the other party's position as understood. Discipline is everything: an outline is a navigation aid for the judge, not a submission. Keep it tight and neutral in tone.",
    segments: [
      text("CASE OUTLINE\n\nFEDERAL CIRCUIT AND FAMILY COURT OF AUSTRALIA\nFile number: "),
      field("file_number", "File number", "SYC 1234 of 2026"),
      text("\nEvent: "),
      field("event", "Event and date", "Interim hearing, 12 November 2026"),
      text("\nFiled on behalf of: "),
      field("party", "Party", "the Applicant"),
      text("\n\n1. ORDERS SOUGHT AT THIS HEARING\n\n"),
      field("orders_sought", "Orders sought", "1. That pending final orders the children live with the Applicant.\n2. That the children continue to attend Parramatta Public School.\n3. That the children spend each alternate weekend with the Respondent from after school Friday to Sunday 5:00pm."),
      text("\n\n2. ISSUES FOR DETERMINATION\n\n"),
      field("issues", "Issues", "(a) Whether the children should remain at their current school pending final hearing.\n(b) The time the children should spend with the Respondent in the interim."),
      text("\n\n3. CHRONOLOGY\n\n"),
      field("chronology", "Chronology", "Jan 2010   Parties commenced cohabitation\n14.02.2012 Married\n12.05.2016 Sam born\n03.08.2019 Ava born\n04.03.2025 Separation\n14.08.2026 Respondent advised intention to relocate children to Newcastle\n20.09.2026 Application filed"),
      text("\n\n4. EVIDENCE RELIED UPON\n\n"),
      field("evidence", "Evidence relied upon", "Affidavit of the Applicant sworn 20 September 2026\nAffidavit of Ms P Nair (school principal) sworn 2 October 2026"),
      text("\n\n5. APPLICABLE PRINCIPLES\n\n"),
      field("principles", "Applicable principles, briefly", "The children's best interests are the paramount consideration. In an interim context the Court proceeds on limited untested evidence and is generally cautious about disrupting established arrangements."),
      text("\n\n6. RESPONDENT'S POSITION (AS UNDERSTOOD)\n\n"),
      field("other_position", "Other party's position", "The Respondent seeks orders that the children relocate to Newcastle and enrol there from the commencement of Term 1, 2027."),
    ],
  },
  {
    key: "famp.offer_of_settlement",
    name: "Offer of Settlement (family law)",
    description: "Formal offer to settle property and/or parenting, with costs consequences flagged.",
    category: "Family Law",
    subcategory: "Settlement Offers",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a formal offer of settlement in family law proceedings. Set out the proposed orders in full and in a form capable of being made by consent, state how long the offer is open, and state that if it is not accepted and the other party does not achieve a better outcome, the offer will be relied upon on the question of costs. Mark it 'WITHOUT PREJUDICE SAVE AS TO COSTS'. Note that in family law the usual order is that each party bears their own costs, so an offer is one of the few ways to shift that.",
    segments: [
      text("WITHOUT PREJUDICE SAVE AS TO COSTS\n\nOFFER OF SETTLEMENT\n\nOur client offers to resolve these proceedings on the following terms, which are capable of being made as orders by consent:\n\n"),
      field("proposed_orders", "Proposed orders", "PROPERTY\n1. The former matrimonial home at 5 Sample Road, Parramatta be sold and the net proceeds divided 56% to the Applicant and 44% to the Respondent.\n2. Each party retain their own superannuation, motor vehicle and bank accounts.\n3. Each party retain their own personal effects.\n\nPARENTING\n4. The children live with the Applicant.\n5. The children spend time with the Respondent each alternate weekend from after school Friday to Sunday 5:00pm, half of all school holidays, and by agreement on special occasions.\n\nCOSTS\n6. Each party bear their own costs."),
      text("\n\nHOW LONG IT IS OPEN\n\nThis offer is open until "),
      field("open_until", "Open until", "5:00pm on 5 December 2026"),
      text(", after which it lapses without further notice.\n\nWHY WE SAY IT IS REASONABLE\n\n"),
      field("reasonableness", "Why the offer is reasonable", "The offer moves from our client's pleaded position of 58% to 56%, reflects the agreement already reached on schooling, and provides your client with materially more time than the current interim arrangement. It is a genuine compromise rather than a restatement of our client's case."),
      text("\n\nCOSTS CONSEQUENCES\n\nThe usual order in family law is that each party bears their own costs. However, if this offer is not accepted and your client does not achieve an outcome more favourable than it, our client will produce this letter to the Court and seek an order that your client pay her costs from the date this offer expires.\n\nWe invite your client to obtain advice on the costs consequences of refusing this offer."),
    ],
  },
  {
    key: "famp.superannuation_procedural_fairness",
    name: "Letter to Superannuation Fund: Procedural Fairness",
    description: "Gives the trustee procedural fairness before a splitting order is sought.",
    category: "Family Law",
    subcategory: "Property",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter to a superannuation fund trustee giving procedural fairness before a splitting order is sought. Identify the member, the fund and account, enclose the proposed orders, and invite the trustee to indicate whether it objects to the orders or requires them to be expressed differently to be administrable. Explain that the Court will not make a splitting order without the trustee having been accorded procedural fairness. Request confirmation and any standard wording the fund requires.",
    segments: [
      text("SUPERANNUATION SPLITTING ORDER: PROCEDURAL FAIRNESS\n\nMember: "),
      field("member", "Member name and details", "Alex Partner, date of birth 8 July 1984"),
      text("\nFund: "),
      field("fund", "Fund", "Example Superannuation Fund"),
      text("\nMember number: "),
      field("member_number", "Member number", "1234567"),
      text("\n\nWe act for "),
      field("client", "Our client", "Jane Citizen"),
      text(" in family law proceedings in which orders are sought splitting the member's interest in your fund.\n\nPROPOSED ORDERS\n\nWe enclose the proposed orders. In summary:\n\n"),
      field("proposed_split", "Proposed split", "That the Applicant receive a base amount of $85,000 from the member's interest, to be transferred to her nominated fund."),
      text("\n\nPROCEDURAL FAIRNESS\n\nThe Court will not make a splitting order unless the trustee has been accorded procedural fairness. This letter is given for that purpose.\n\nPlease advise within "),
      field("response_period", "Response period", "28 days"),
      text(" whether:\n\n1. the trustee objects to the proposed orders;\n2. the orders as drafted are administrable by the fund, or require different wording;\n3. the fund has standard wording it requires for orders of this kind; and\n4. any fee is payable on implementation, and by whom.\n\nWe also request a current member statement and, if the interest is not accumulation phase, the information needed to value it.\n\nPlease confirm receipt of this letter."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the procedural fairness requirements and the information the fund must be given under the Family Law Act superannuation provisions and the fund's own governing rules. Self-managed and defined benefit interests require different treatment and valuation.",
  },
  {
    key: "famp.joint_letter_to_valuer",
    name: "Joint Letter of Instruction to Valuer",
    description: "Jointly instructs a single expert valuer, agreed between the parties.",
    category: "Family Law",
    subcategory: "Property",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a joint letter of instruction to a valuer engaged as a single expert by both parties. Identify the asset to be valued, the valuation date, the basis of valuation, the material provided, and the questions to be answered. State that the valuer is engaged as a single expert, owes their duty to the Court, and must not communicate with one party without the other. Set out how fees are shared and how any questions to the expert will be handled.",
    segments: [
      text("JOINT LETTER OF INSTRUCTION: SINGLE EXPERT VALUER\n\nWe write jointly with "),
      field("other_solicitors", "Other party's solicitors", "Example Family Lawyers, solicitors for the Respondent"),
      text(", instructing you as a single expert.\n\nASSET TO BE VALUED\n\n"),
      field("asset", "Asset to be valued", "The residential property at 5 Sample Road, Parramatta NSW 2150."),
      text("\n\nBASIS AND DATE OF VALUATION\n\n"),
      field("basis", "Basis and date", "Market value on a willing but not anxious buyer/seller basis, as at the date of your inspection."),
      text("\n\nYOUR ROLE\n\nYou are engaged as a SINGLE EXPERT by both parties. Your duty is to the Court, not to either party. Please do not communicate with one party or their solicitor about the substance of your opinion without the other being copied in.\n\nQUESTIONS\n\n"),
      field("questions", "Questions for the valuer", "1. The market value of the property as at the date of inspection.\n2. Whether any factor materially affects value, including the condition of the property or any encumbrance disclosed on the title.\n3. If requested, an estimate of the likely selling costs."),
      text("\n\nMATERIAL PROVIDED\n\n"),
      field("materials", "Material provided", "1. Copy title search and plan\n2. Contract of sale from the parties' 2018 purchase\n3. Rates notice"),
      text("\n\nACCESS\n\n"),
      field("access", "Access arrangements", "Access can be arranged with the Applicant on 0400 000 000. She resides at the property with the children."),
      text("\n\nFEES\n\nYour fee is to be shared equally between the parties. Please render two invoices, one to each firm, for half each.\n\nQUESTIONS AFTER YOUR REPORT\n\nEither party may put written questions to you after your report. Any such questions will be copied to the other party at the same time.\n\nPlease confirm your fee and the timeframe for your report."),
    ],
  },
];
