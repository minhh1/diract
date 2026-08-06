// lib/precedents/library/criminalStates.ts
// Criminal law outside NSW, plus bail and indictable-stream documents.
//
// The lower court is the Local Court in NSW, and the Magistrates Court in
// VIC, QLD, SA, WA and TAS. Sentencing legislation differs in every state,
// as do the available non-conviction and diversionary options, which are the
// outcomes clients care most about:
//
//   VIC  Sentencing Act 1991; diversion available in the Magistrates Court
//        on the informant's consent
//   QLD  Penalties and Sentences Act 1992
//   SA   Sentencing Act 2017
//   WA   Sentencing Act 1995
//   TAS  Sentencing Act 1997
//
// Because the available orders and their preconditions differ so much, these
// precedents prompt for the outcome contended for rather than naming one.
import { text, field, type PrecedentSeed } from "./types";

const CRIMINAL = ["Criminal"];

export const CRIMINAL_STATES_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "crimstates.magistrates_initial_advice",
    name: "Initial Advice: Magistrates Court (VIC/QLD/SA/WA/TAS)",
    description: "First advice on a summary matter in a Magistrates Court outside NSW.",
    category: "Criminal",
    subcategory: "Magistrates Court",
    documentType: "advice",
    jurisdictions: ["VIC", "QLD", "SA", "WA", "TAS"],
    matterTypes: CRIMINAL,
    aiInstructions:
      "Draft initial advice to a client charged with a summary offence in a Magistrates Court. Explain the charge and what the prosecution must prove, the plea options and the discount for an early plea, the realistic penalty range, and the diversionary or non-conviction options available in that state (naming the state's sentencing Act). Cover what will help at sentence: character references, counselling or courses completed, restitution. Stress attendance and not discussing the matter with anyone but their lawyer. Be realistic rather than reassuring about outcome.",
    segments: [
      text("YOUR COURT MATTER: INITIAL ADVICE\n\nCharge: "),
      field("charge", "Charge", "Unlawful assault"),
      text("\nCourt and date: "),
      field("court_date", "Court and date", "Melbourne Magistrates' Court, 14 October 2026"),
      text("\n\nWHAT THE PROSECUTION MUST PROVE\n\n"),
      field("elements", "Elements of the offence", "That you applied force to the complainant, that you did so intentionally or recklessly, and that it was without lawful excuse. The prosecution must prove each element beyond reasonable doubt."),
      text("\n\nTHE EVIDENCE\n\n"),
      field("evidence", "Evidence summary", "The brief comprises the complainant's statement, two witness statements, CCTV from the venue, and photographs of a minor injury. We have requested the body-worn camera footage."),
      text("\n\nYOUR OPTIONS\n\n"),
      field("options", "Plea options and assessment", "The CCTV is not clear on who made first contact, which supports the self-defence account you have given. A defended hearing is realistically available. However, a plea of guilty at the earliest opportunity would attract a meaningful sentencing discount, so the decision needs to be made on the evidence rather than deferred."),
      text("\n\nDIVERSION AND NON-CONVICTION OPTIONS\n\n"),
      field("diversion", "Diversion or non-conviction options in this state", "In Victoria, diversion is available in the Magistrates' Court but requires the informant's consent and an acknowledgment of responsibility. Given this is a first offence and the injury was minor, we consider it worth approaching the informant about diversion. If diversion is granted and completed, no conviction is recorded."),
      text("\n\nLIKELY OUTCOME IF CONVICTED\n\n"),
      field("likely_outcome", "Realistic outcome", "If convicted after a contested hearing, the realistic range is a fine with a conviction recorded, or a community corrections order. A recorded conviction would need to be disclosed for certain employment and travel purposes."),
      text("\n\nWHAT WILL HELP\n\n"),
      field("mitigation", "Steps to take now", "1. Character references from people who know of the charge.\n2. If you have engaged in any counselling or anger management, obtain confirmation.\n3. Do not contact the complainant or any witness under any circumstances."),
      text("\n\nIMPORTANT\n\nDo not discuss this matter with anyone other than us. You must attend court on the date above."),
    ],
    requiresReview: true,
    reviewNote:
      "Sentencing options, diversion eligibility and non-conviction orders differ in every state. Confirm what is available under the applicable state Sentencing Act and the local court's practice before advising on outcome.",
  },
  {
    key: "crimstates.bail_application_submissions",
    name: "Bail Application Submissions",
    description: "Outline of submissions in support of a bail application.",
    category: "Criminal",
    subcategory: "Bail",
    documentType: "court_document",
    matterTypes: CRIMINAL,
    requiresReview: true,
    reviewNote:
      "Bail legislation differs materially by state, including whether a show cause or exceptional circumstances test applies to the particular offence. Confirm the applicable test and any presumption against bail before making the application: getting the test wrong wastes the application and may prejudice a later one.",
    aiInstructions:
      "Draft an outline of submissions supporting a bail application. Address, in order: whether any show cause or exceptional circumstances requirement applies to the offence and how it is met; then the unacceptable risk considerations (failure to appear, commission of further offences, interference with witnesses, and endangering safety) and what conditions would mitigate each. Set out the applicant's ties to the community, accommodation, employment, health, and any responsibilities for dependants. Propose specific conditions rather than leaving it to the Court. Address the strength of the prosecution case and any delay to hearing, since time on remand may exceed any likely sentence.",
    segments: [
      text("BAIL APPLICATION: OUTLINE OF SUBMISSIONS\n\nApplicant: "),
      field("applicant", "Applicant", "John Citizen"),
      text("\nCharges: "),
      field("charges", "Charges", "Aggravated burglary; theft"),
      text("\nCourt: "),
      field("court", "Court", "Melbourne Magistrates' Court"),
      text("\n\n1. THE APPLICABLE TEST\n\n"),
      field("test", "Applicable test and how it is met", "The offence engages the show compelling reason test. It is submitted that a compelling reason exists: the applicant has no prior convictions, has stable accommodation and employment available to him, and the delay to hearing is estimated at 9 months, which would exceed any custodial component realistically available on these facts."),
      text("\n\n2. UNACCEPTABLE RISK\n\nFailure to appear: "),
      field("risk_appear", "Failure to appear", "The applicant has no history of failing to appear. He has lived in the same suburb for 14 years, his partner and two children reside there, and he holds no passport."),
      text("\n\nFurther offending: "),
      field("risk_offending", "Risk of further offending", "The applicant has no prior convictions of any kind. The alleged offending is said to have occurred during a period of acute financial stress following the loss of his employment, which has since been addressed by the offer of work referred to below."),
      text("\n\nInterference with witnesses: "),
      field("risk_interference", "Risk of interference", "The applicant has no connection to the complainant and no contact is alleged. A non-contact condition is offered."),
      text("\n\n3. PERSONAL CIRCUMSTANCES\n\n"),
      field("circumstances", "Personal circumstances", "The applicant is 34. He is the primary carer for two children aged 6 and 9 during the week. He has a written offer of employment from Example Logistics commencing 20 October 2026. He has a diagnosed anxiety disorder for which he is under the care of his GP, and his medication regime has been disrupted in custody."),
      text("\n\n4. PROPOSED CONDITIONS\n\n"),
      field("conditions", "Proposed bail conditions", "1. Reside at 5 Sample Road, Preston and not change address without notifying the informant.\n2. Report to Preston Police Station on Mondays and Thursdays between 8am and 8pm.\n3. Not contact the complainant or any prosecution witness directly or indirectly.\n4. Surrender any passport and not apply for a travel document.\n5. Abide by a curfew between 9pm and 6am.\n6. A surety of $5,000 offered by the applicant's mother, Ms Helen Citizen."),
      text("\n\n5. DELAY\n\n"),
      field("delay", "Delay to hearing", "The matter is not expected to be reached for hearing before July 2027. Refusing bail would result in the applicant serving what may well exceed any sentence ultimately imposed."),
    ],
  },
  {
    key: "crimstates.plea_in_mitigation",
    name: "Plea in Mitigation: Outline",
    description: "Outline of a plea in mitigation, structured for oral delivery.",
    category: "Criminal",
    subcategory: "Sentencing",
    documentType: "court_document",
    matterTypes: CRIMINAL,
    requiresReview: true,
    reviewNote:
      "Confirm the sentencing options available under the applicable state Sentencing Act, and the current discount available for the plea and its timing, before settling what is contended for.",
    aiInstructions:
      "Draft an outline of a plea in mitigation for oral delivery. Structure: the objective circumstances of the offending, assessed candidly; the plea and its timing; the offender's personal circumstances and background, including any deprivation, mental health or addiction and how it bears on moral culpability; remorse and any steps taken (restitution, counselling, courses); prior record or its absence; the impact of a conviction on employment, travel or licensing; and the specific order contended for. Warn against overstatement: a magistrate who disbelieves one submission discounts them all.",
    segments: [
      text("PLEA IN MITIGATION: OUTLINE\n\nAccused: "),
      field("accused", "Accused", "John Citizen"),
      text("\nOffence: "),
      field("offence", "Offence", "Theft"),
      text("\nPlea: Guilty, entered "),
      field("plea_timing", "Plea and timing", "at the first available opportunity on 14 October 2026"),
      text("\n\n1. OBJECTIVE CIRCUMSTANCES\n\n"),
      field("objective", "Objective circumstances, candidly assessed", "The offending involved the taking of goods valued at $340 from a retail store. It was opportunistic rather than planned, involved no violence, threat or weapon, and the goods were recovered undamaged and returned to the store the same day. It is accepted the offending was dishonest and that retail theft is prevalent."),
      text("\n\n2. THE PLEA\n\nThe plea was entered at the earliest opportunity and the accused is entitled to the full discount for its utilitarian value.\n\n3. PERSONAL CIRCUMSTANCES\n\n"),
      field("personal", "Personal circumstances and background", "The accused is 34, and until three months before the offending had been continuously employed for eleven years. He lost that employment when his employer entered administration. He is the primary carer for two children. He has no prior convictions of any kind."),
      text("\n\n4. CAUSAL FACTORS\n\n"),
      field("causal", "Factors bearing on moral culpability", "The accused was diagnosed with a major depressive episode in July 2026 following the loss of his employment. A report from his treating GP is tendered. It is submitted that his judgment at the time was materially impaired, which reduces his moral culpability without excusing the conduct."),
      text("\n\n5. REMORSE AND REHABILITATION\n\n"),
      field("remorse", "Remorse and steps taken", "The accused made full admissions in the police interview. He has written a letter of apology to the store manager, which is tendered. He has commenced treatment with a psychologist and has attended four sessions."),
      text("\n\n6. CONSEQUENCES OF A CONVICTION\n\n"),
      field("consequences", "Consequences of conviction", "The accused has an offer of employment in the transport industry conditional on a clear criminal record check. A recorded conviction would cost him that employment and, with it, the means to support his children."),
      text("\n\n7. WHAT IS CONTENDED FOR\n\n"),
      field("contended", "Order contended for", "It is submitted that the objective seriousness is at the lower end, that the accused's prospects of rehabilitation are strong, and that the Court would be justified in dealing with the matter without recording a conviction, on conditions including continued treatment."),
    ],
  },
  {
    key: "crimstates.police_interview_advice",
    name: "Advice Before Police Interview",
    description: "Advises a client on their rights before a police interview.",
    category: "Criminal",
    subcategory: "Investigation",
    documentType: "advice",
    matterTypes: CRIMINAL,
    aiInstructions:
      "Draft advice to a client who has been asked to attend a police interview. Explain the right to silence and that in most circumstances no adverse inference can be drawn from exercising it, the right to legal advice before and during questioning, that anything said is recorded and can be used in evidence, and that they are not obliged to participate in an interview at all unless required to provide identifying particulars. Explain the limited circumstances where an answer is compelled. Advise strongly against attending without a lawyer, and against 'explaining their side' informally, which is the single most common way clients damage their own position.",
    segments: [
      text("BEFORE YOU ARE INTERVIEWED: YOUR RIGHTS\n\nYou have been asked to attend an interview with police in relation to "),
      field("matter", "Matter", "an allegation of assault said to have occurred on 12 September 2026"),
      text(".\n\nTHE MOST IMPORTANT THING\n\nDo not attend an interview, or discuss the allegation with police in any way, before speaking with us. That includes informal conversation at the door, in a car, or over the phone. There is no such thing as an off-the-record conversation with an investigator.\n\nYOUR RIGHT TO SILENCE\n\nYou are not obliged to answer questions about the allegation. In most circumstances no adverse inference can be drawn against you at trial from exercising that right.\n\nYou must generally provide your name and address when lawfully required to do so, and there are limited statutory situations where an answer is compelled: we will tell you if any applies here.\n\nWHAT AN INTERVIEW ACTUALLY IS\n\nAn interview is recorded and is evidence. It is not an opportunity to clear things up. Investigators conduct interviews to gather evidence, and an account given without knowing what the evidence is can lock you into a version that later proves inconsistent with something you did not know existed.\n\nEven a truthful account, given badly or under pressure, can do real damage.\n\nOUR ADVICE\n\n"),
      field("advice", "Our advice in this matter", "We advise that you decline to participate in an interview at this stage. We do not yet know what the police case is. If, once we have seen the evidence, an account would assist you, it can be provided later in a controlled way."),
      text("\n\nIF POLICE ATTEND\n\nBe polite. Provide your name and address. Say clearly: 'I do not wish to answer any questions and I want to speak to my lawyer.' Then telephone us on "),
      field("contact", "Contact number", "(02) 0000 0000, or after hours 0400 000 000"),
      text(".\n\nDo not resist, argue or attempt to explain. Simply say nothing further about the allegation."),
    ],
  },
];
