// lib/precedents/library/courtSubmissions.ts
// Court documents that have no prescribed form.
//
// The other court precedents are filed on approved forms and are written
// against the published file. These four are not: bail and sentencing
// submissions and a family law case outline are advocacy documents, settled by
// the practitioner and handed up. There is nothing official to match, so what
// makes them useful is structure that follows the statutory test the court
// must actually apply -- a plea that recites the facts without addressing
// s 3A purposes, or a bail application that never names the unacceptable-risk
// test, gives the bench nothing to work with.
//
// Written to the NSW statutes for the criminal documents, because criminal
// procedure is state law and the tests differ. A firm practising elsewhere
// needs the equivalent for its own jurisdiction; these are marked NSW rather
// than pretending to be national.
import { text, field, type PrecedentSeed } from "./types";

const NSW = ["NSW" as const];
const CRIME = ["Criminal"];

export const COURT_SUBMISSIONS_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "court.nsw.bail_application_submissions",
    name: "Bail Application - Outline of Submissions (NSW)",
    description: "Written outline for a release application, structured to the Bail Act 2013 (NSW) tests.",
    category: "Criminal",
    subcategory: "Bail",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CRIME,
    requiresReview: true,
    reviewNote:
      "Bail Act 2013 (NSW) is amended frequently, particularly the show cause offences in s 16B and the bail concerns in s 18. Confirm the current provisions and whether the offence is a show cause offence before settling this. There is no prescribed form -- this is an outline handed up, not a filed form.",
    aiInstructions:
      "Structure to the statute, in this order. First, whether s 16A applies: if the offence is a show cause offence under s 16B, the accused must show cause why detention is not justified, and that must be addressed and disposed of before anything else -- the unacceptable risk test is only reached once cause is shown. Second, the s 19 unacceptable risk test: identify each bail concern the prosecution raises under s 18 (failure to appear, commission of a serious offence, endangering safety, interference with witnesses), and answer it with the conditions proposed rather than by assertion. Third, s 18 matters relevant to the assessment -- background, criminal associations, prior compliance with bail, strength of the prosecution case, length of time on remand and delay to hearing. Address the strength of the Crown case only where it is genuinely weak; overstating it costs credibility. Finish with the precise conditions proposed, since a court is far more likely to grant bail on a concrete package (surety amount, residence, reporting, curfew, non-association, passport) than on a general submission.",
    segments: [
      text("OUTLINE OF SUBMISSIONS ON BAIL\n\nCourt: "),
      field("court", "Court", "Local Court of New South Wales at Parramatta"),
      text("\nMatter: "),
      field("matter", "Matter name", "R v John Citizen"),
      text("\nCase number: "),
      field("case_number", "Case number", "2026/00012345"),
      text("\nDate of hearing: "),
      field("hearing_date", "Date of hearing", "14 August 2026"),
      text("\n\nTHE APPLICATION\n\n1. The applicant applies for release under the Bail Act 2013 (NSW). He is charged with "),
      field("charges", "The charges", "one count of larceny contrary to s 117 of the Crimes Act 1900 (NSW)"),
      text(" and has been in custody since "),
      field("custody_since", "Date taken into custody", "1 August 2026"),
      text(
        ".\n\nSHOW CAUSE\n\n2. [Delete this section if the offence is not a show cause offence under s 16B.] The offence is a show cause offence. Cause why the applicant's detention is not justified is shown by:\n\n   (a) "
      ),
      field("show_cause_a", "First matter showing cause", "the applicant's lack of any prior convictions"),
      text(";\n   (b) "),
      field("show_cause_b", "Second matter showing cause", "the delay before the matter can be heard, presently estimated at nine months"),
      text(
        ".\n\nUNACCEPTABLE RISK\n\n3. The question under s 19 is whether there is an unacceptable risk that the applicant will fail to appear, commit a serious offence, endanger the safety of victims, individuals or the community, or interfere with witnesses or evidence.\n\n4. The prosecution identifies the following bail concerns:\n\n   (a) "
      ),
      field("concern_1", "First bail concern raised", "risk of failure to appear"),
      text(" -- answered by "),
      field("answer_1", "How that concern is answered", "the applicant's 14 years at the same address, his employment, and a proposed surety of $10,000 from his mother"),
      text(";\n   (b) "),
      field("concern_2", "Second bail concern raised", "risk of commission of a further offence"),
      text(" -- answered by "),
      field("answer_2", "How that concern is answered", "a proposed curfew and non-association condition, and the absence of any offending in the eight years since the applicant's last court appearance"),
      text(
        ".\n\nMATTERS UNDER s 18\n\n5. Background, community ties and prior compliance: "
      ),
      field("s18_background", "Background and community ties", "The applicant has lived at 10 Smith Street, Parramatta for 14 years with his partner and two children, and has been employed by the same employer for six years."),
      text("\n\n6. Prior bail history: "),
      field("s18_bail_history", "Prior compliance with bail", "The applicant has previously been granted bail on two occasions and complied on each."),
      text("\n\n7. Strength of the prosecution case: "),
      field("s18_case_strength", "Strength of the prosecution case", "The identification evidence rests on a single witness observing the offender at night from approximately 30 metres."),
      text("\n\n8. Time on remand and delay: "),
      field("s18_delay", "Time on remand and expected delay", "The applicant has been in custody for two weeks. The matter is not expected to be ready for hearing before May 2027."),
      text("\n\nCONDITIONS PROPOSED\n\n9. The applicant proposes:\n\n   (a) "),
      field("condition_1", "First condition", "residence at 10 Smith Street, Parramatta"),
      text(";\n   (b) "),
      field("condition_2", "Second condition", "reporting to Parramatta Police Station on Mondays, Wednesdays and Fridays"),
      text(";\n   (c) "),
      field("condition_3", "Third condition", "a surety in the sum of $10,000 to be entered into by Mary Citizen"),
      text(";\n   (d) "),
      field("condition_4", "Further condition", "surrender of the applicant's passport and no application for travel documents"),
      text(".\n\n10. Bail is sought on those conditions.\n\n"),
      field("counsel", "Name of solicitor or counsel", "Jane Smith, solicitor for the applicant"),
      text("\nDate: "),
      field("date", "Date", "12 August 2026"),
    ],
  },

  {
    key: "court.nsw.plea_in_mitigation",
    name: "Plea in Mitigation - Outline (NSW)",
    description: "Outline on sentence, structured to the purposes and factors in the Crimes (Sentencing Procedure) Act 1999 (NSW).",
    category: "Criminal",
    subcategory: "Sentencing",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CRIME,
    requiresReview: true,
    reviewNote:
      "Check the current s 21A factors, the guideline judgments applying to the offence, and any standard non-parole period before settling. Discount for a guilty plea is governed by s 25D and depends on when the plea was indicated, so confirm the stage before submitting a figure.",
    aiInstructions:
      "Deal with the objective seriousness of the offence first and the offender second; a plea that opens with the offender's hardship before confronting what was done reads as avoidance. Under s 3A identify which purposes of sentencing are engaged and which carry most weight on these facts. Work through the s 21A aggravating factors and meet each one that genuinely arises rather than ignoring it, then the mitigating factors, with evidence for each -- an assertion of remorse without a reference, a letter or restitution is worth little. Address the utilitarian discount for the plea under s 25D by reference to when it was indicated. If a non-custodial or intensive correction order is realistically available, say what it would look like in practice and why it meets the purposes identified; if it is not, do not pretend otherwise.",
    segments: [
      text("OUTLINE OF SUBMISSIONS ON SENTENCE\n\nCourt: "),
      field("court", "Court", "Local Court of New South Wales at Parramatta"),
      text("\nMatter: "),
      field("matter", "Matter name", "R v John Citizen"),
      text("\nDate of sentence: "),
      field("sentence_date", "Date", "14 August 2026"),
      text("\n\nTHE OFFENCE\n\n1. The offender has pleaded guilty to "),
      field("offence", "The offence and maximum penalty", "one count of larceny contrary to s 117 of the Crimes Act 1900 (NSW), which carries a maximum penalty of 5 years imprisonment"),
      text(".\n\n2. The facts are as set out in the agreed statement of facts. In summary, "),
      field("facts_summary", "Summary of the facts", "on 1 June 2026 the offender took property to the value of $1,200 from his former employer's premises."),
      text("\n\nOBJECTIVE SERIOUSNESS\n\n3. The offence falls "),
      field("objective_seriousness", "Where the offence falls on the range and why", "below the mid-range of objective seriousness: the offending was opportunistic rather than planned, involved no violence or threat, and the property was recovered intact within 48 hours."),
      text("\n\nPURPOSES OF SENTENCING (s 3A)\n\n4. "),
      field("purposes", "Which s 3A purposes are engaged and their weight", "Denunciation and general deterrence are engaged. Specific deterrence carries little weight given the absence of any prior record, and rehabilitation is the dominant consideration on these facts."),
      text("\n\nAGGRAVATING FACTORS (s 21A(2))\n\n5. "),
      field("aggravating", "Aggravating factors and the response to each", "The Crown relies on the breach of trust involved in offending against an employer. That is accepted, and is reflected in the offender's immediate resignation and repayment."),
      text("\n\nMITIGATING FACTORS (s 21A(3))\n\n6. "),
      field("mitigating", "Mitigating factors, each with its evidence", "(a) No record of previous convictions: the offender is 34 and has never been before a court.\n(b) Remorse: the offender repaid the value of the property in full on 8 June 2026, before charge. A receipt is annexed.\n(c) Good character: three references are handed up, including from the offender's current employer, who is aware of the charge.\n(d) Prospects of rehabilitation: the offender has attended six sessions with a psychologist, whose report is handed up."),
      text("\n\nPLEA OF GUILTY (s 25D)\n\n7. The plea was indicated at "),
      field("plea_stage", "When the plea was indicated", "the first available opportunity, at the first mention on 20 June 2026"),
      text(", and a discount of "),
      field("plea_discount", "Discount contended for", "25%"),
      text(" is available.\n\nSENTENCE CONTENDED FOR\n\n8. "),
      field("sentence_sought", "The sentence contended for and why it meets the purposes identified", "A conditional release order under s 9 without conviction is sought. The offender has repaid the loss, has no record, is in stable employment that a conviction would put at risk, and the denunciatory purpose is met by the fact of the proceedings themselves."),
      text("\n\n"),
      field("counsel", "Name of solicitor or counsel", "Jane Smith, solicitor for the offender"),
      text("\nDate: "),
      field("date", "Date", "12 August 2026"),
    ],
  },

  {
    key: "court.nsw.sentencing_submissions_local",
    name: "Sentencing Submissions - Written Outline (NSW Local Court)",
    description: "Short written outline handed up on sentence in the Local Court, where a full plea is not required.",
    category: "Criminal",
    subcategory: "Sentencing",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CRIME,
    requiresReview: true,
    reviewNote:
      "A short outline for a Local Court list, not a substitute for a plea in mitigation in a contested or serious matter. Check any applicable guideline judgment and whether the offence attracts a mandatory disqualification or other automatic consequence before contending for a penalty.",
    aiInstructions:
      "Keep it to one or two pages: a Local Court sentencing list moves quickly and a long document will not be read. State the charge and plea, the facts in a sentence or two, the offender's record, the matters relied on in mitigation with the evidence handed up for each, and the penalty contended for. Where a licence disqualification or other automatic consequence follows, address it directly and state what is sought -- the minimum period, or an application for it not to apply where that is available.",
    segments: [
      text("SUBMISSIONS ON SENTENCE\n\nCourt: "),
      field("court", "Court", "Local Court of New South Wales at Parramatta"),
      text("\nMatter: "),
      field("matter", "Matter name", "Police v John Citizen"),
      text("\nDate: "),
      field("date", "Date", "14 August 2026"),
      text("\n\n1. The defendant has pleaded guilty to "),
      field("charge", "The charge", "one count of mid-range drink driving contrary to s 110(4) of the Road Transport Act 2013 (NSW)"),
      text(".\n\n2. The facts are agreed. In short, "),
      field("facts", "The facts in brief", "the defendant was stopped at a random breath test site on 1 June 2026 and returned a reading of 0.112."),
      text("\n\n3. Record: "),
      field("record", "The defendant's record", "The defendant has no prior convictions and no traffic record of relevance."),
      text("\n\n4. In mitigation:\n\n   (a) "),
      field("mitigation_a", "First matter in mitigation, with evidence", "the defendant pleaded guilty at the first opportunity"),
      text(";\n   (b) "),
      field("mitigation_b", "Second matter in mitigation, with evidence", "the defendant has completed the Traffic Offenders Intervention Program; a certificate of completion is handed up"),
      text(";\n   (c) "),
      field("mitigation_c", "Further matter in mitigation", "two character references are handed up, both from referees aware of the charge"),
      text(".\n\n5. Consequences: "),
      field("consequences", "Licence disqualification or other automatic consequence, and what is sought", "A disqualification follows automatically. The minimum period of 6 months is sought, together with an interlock order."),
      text("\n\n6. The penalty contended for is "),
      field("penalty_sought", "The penalty contended for", "a conditional release order with conviction, together with the minimum disqualification period"),
      text(".\n\n"),
      field("solicitor", "Name of solicitor", "Jane Smith, solicitor for the defendant"),
    ],
  },

  {
    key: "court.fcfcoa.case_outline",
    name: "Case Outline - Interim Hearing (FCFCOA)",
    description: "Case outline handed up at an interim hearing in family law, summarising the issues, orders sought and evidence relied on.",
    category: "Family Law",
    subcategory: "Interim applications",
    documentType: "court_document",
    matterTypes: ["Family Law"],
    requiresReview: true,
    reviewNote:
      "The Central Practice Direction and the applicable National Contravention or parenting practice direction govern what must be filed before an interim hearing and by when, including page limits. Check the current practice direction and the judge's own requirements, which are often stated in the listing notice.",
    aiInstructions:
      "This is read by a judge who has minutes per matter, so it must be navigable rather than complete. State the orders sought in the form the court could make them. Identify the issues genuinely in dispute and say what is agreed, since narrowing the dispute is the most useful thing the document can do. For each contested issue, point to the paragraph of the affidavit relied on rather than restating the evidence -- a case outline that reproduces the affidavit wastes the only advantage it has. Where there are risk allegations, deal with them first and identify what interim protective orders are proposed. Keep the chronology to events that bear on the orders sought.",
    segments: [
      text("CASE OUTLINE\n\nCourt: "),
      field("court", "Court and division", "Federal Circuit and Family Court of Australia (Division 2)"),
      text("\nFile number: "),
      field("file_number", "File number", "SYC 1234 of 2026"),
      text("\nApplicant: "),
      field("applicant", "Applicant", "Sarah Jane Nguyen"),
      text("\nRespondent: "),
      field("respondent", "Respondent", "David Minh Nguyen"),
      text("\nDate of hearing: "),
      field("hearing_date", "Date of hearing", "14 August 2026"),
      text("\nPrepared for: "),
      field("prepared_for", "Party this outline is prepared for", "the applicant"),
      text("\n\nORDERS SOUGHT\n\n1. "),
      field("order_1", "First order sought, in the form the court could make it", "That the children live with the applicant."),
      text("\n2. "),
      field("order_2", "Second order sought", "That the children spend time with the respondent each alternate weekend from Friday after school to Sunday at 5:00pm."),
      text("\n3. "),
      field("order_3", "Further order sought", "That neither party remove the children from New South Wales pending further order."),
      text("\n\nISSUES IN DISPUTE\n\n4. "),
      field("issues", "The issues genuinely in dispute", "Whether the children should relocate to Melbourne with the respondent, and the time the children spend with each parent pending final hearing."),
      text("\n\nAGREED\n\n5. "),
      field("agreed", "What is agreed", "The parties agree that the children should continue at their present school pending final hearing, and that there should be equal shared parental responsibility."),
      text("\n\nRISK\n\n6. "),
      field("risk", "Risk allegations and proposed interim protective orders, or 'none raised'", "No risk allegations are raised by either party."),
      text("\n\nEVIDENCE RELIED ON\n\n7. "),
      field("evidence_relied_on", "Affidavits relied on, by paragraph", "Affidavit of the applicant sworn 10 August 2026, paragraphs 8 to 22 and 31 to 34; affidavit of Margaret Nguyen sworn 10 August 2026, paragraphs 4 to 9."),
      text("\n\nCHRONOLOGY\n\n8. "),
      field("chronology", "Events bearing on the orders sought", "4 May 2012 - married. 3 March 2016 - first child born. 8 July 2019 - second child born. 2 February 2025 - separated. 5 August 2026 - respondent advised his intention to relocate to Melbourne."),
      text("\n\n"),
      field("solicitor", "Name of solicitor or counsel", "Jane Smith, solicitor for the applicant"),
      text("\nDate: "),
      field("date", "Date", "12 August 2026"),
    ],
  },
];
