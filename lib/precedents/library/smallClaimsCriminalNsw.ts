// lib/precedents/library/smallClaimsCriminalNsw.ts
// NSW small claims / minor civil work and NSW Local Court criminal.
//
// Two forums for small civil claims in NSW, and choosing the wrong one
// wastes the filing fee:
//  - NCAT (Consumer and Commercial Division) for consumer contracts,
//    residential tenancy, building work and similar.
//  - The Local Court Small Claims Division for general debt and damages.
// Both are NSW-only. Every other state differs, and Tasmania has no general
// civil tribunal at all -- minor civil claims there run in the Magistrates
// Court (Civil Division).
//
// Criminal precedents here are Local Court (summary) only. The NSW criminal
// hierarchy runs Local Court, then District Court for indictable matters,
// then Supreme Court for the most serious. Indictable-stream documents are
// not included in this pass.
//
// Monetary jurisdictional limits are deliberately NOT stated in any
// precedent below -- they are adjusted by regulation and a stale figure sent
// to a client is worse than none. They are flagged in review notes instead.
import { text, field, type PrecedentSeed } from "./types";

const CIVIL = ["Litigation"];
const CRIMINAL = ["Criminal"];

export const SMALL_CLAIMS_NSW_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "scnsw.forum_advice",
    name: "Choice of Forum Advice - Small Claim (NSW)",
    description: "Advises whether a small claim belongs in NCAT or the Local Court, and the cost consequences.",
    category: "Litigation",
    subcategory: "Small Claims",
    documentType: "advice",
    jurisdictions: ["NSW"],
    matterTypes: CIVIL,
    aiInstructions:
      "Draft advice on where a small claim should be brought in NSW. Compare NCAT (Consumer and Commercial Division) with the Local Court Small Claims Division: subject matter each covers, the general position on legal costs (NCAT ordinarily does not award costs and representation usually requires leave, whereas the Local Court can award limited costs), enforcement (NCAT orders generally need to be registered in a court to be enforced), and speed. Recommend a forum and explain the practical cost trade-off -- in small claims the recoverable costs are often less than the cost of running the case, which is the single most important thing for the client to understand.",
    segments: [
      text("WHERE TO BRING YOUR CLAIM\n\nAmount in dispute: "),
      field("amount", "Amount in dispute", "$14,200"),
      text("\nNature of claim: "),
      field("nature", "Nature of the claim", "Defective bathroom renovation work performed by a licensed builder."),
      text("\n\nYOUR TWO OPTIONS\n\n1. NCAT - CONSUMER AND COMMERCIAL DIVISION\n\nNCAT handles consumer contracts, building work, residential tenancy and similar disputes.\n\n- Costs: NCAT ordinarily does NOT award legal costs. Each side usually bears its own.\n- Representation: you generally need the Tribunal's leave to be legally represented.\n- Enforcement: an NCAT order usually must be registered in a court before it can be enforced.\n- Speed: generally faster and less formal.\n\n2. LOCAL COURT - SMALL CLAIMS DIVISION\n\nThe Small Claims Division handles general debt and damages claims.\n\n- Costs: limited costs can be awarded to a successful party.\n- Procedure: more formal, with rules of evidence relaxed.\n- Enforcement: judgment is directly enforceable.\n\nOUR RECOMMENDATION\n\n"),
      field("recommendation", "Recommended forum and why", "Because your claim concerns residential building work by a licensed builder, NCAT's Consumer and Commercial Division is the appropriate forum and has specific power to order rectification work, not just money."),
      text("\n\nTHE COST REALITY - PLEASE READ\n\n"),
      field("cost_reality", "Cost trade-off", "Our fees to run this matter to hearing would likely be $6,000 to $9,000. In NCAT you would not recover those costs even if you win. On a $14,200 claim that materially changes what a win is actually worth to you."),
      text("\n\nFor that reason we recommend "),
      field("strategy", "Recommended strategy", "a carefully drafted letter of demand first, and treating NCAT as the fallback if it is not met"),
      text("."),
    ],
    requiresReview: true,
    reviewNote:
      "NCAT and Local Court Small Claims monetary limits are set by regulation and change. Confirm the current limits and NCAT's costs rules before advising on forum.",
  },
  {
    key: "scnsw.ncat_application_cover",
    name: "NCAT Application (covering letter)",
    description: "Covers lodgement of an application in NCAT's Consumer and Commercial Division.",
    category: "Litigation",
    subcategory: "Small Claims",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: CIVIL,
    aiInstructions:
      "Draft a covering letter for an NCAT application. Identify the division, the parties, the nature of the dispute, the orders sought, and list the documents lodged. Keep it brief and administrative.",
    segments: [
      text("APPLICATION - NSW CIVIL AND ADMINISTRATIVE TRIBUNAL\n\nDivision: "),
      field("division", "Division", "Consumer and Commercial Division"),
      text("\nApplicant: "),
      field("applicant", "Applicant", "Jane Citizen"),
      text("\nRespondent: "),
      field("respondent", "Respondent", "Example Building Services Pty Ltd (ABN 00 000 000 000)"),
      text("\n\nNATURE OF THE DISPUTE\n\n"),
      field("dispute", "Nature of the dispute", "Defective and incomplete bathroom renovation work carried out under a residential building contract dated 3 March 2026."),
      text("\n\nORDERS SOUGHT\n\n"),
      field("orders_sought", "Orders sought", "1. An order that the respondent rectify the defective waterproofing and tiling, or alternatively pay the applicant $14,200 being the cost of rectification.\n2. An order for the refund of $2,800 paid for work not performed."),
      text("\n\nDOCUMENTS LODGED\n\n"),
      field("documents", "Documents lodged", "1. Application form\n2. Building contract dated 3 March 2026\n3. Invoices and proof of payment\n4. Independent building report dated 12 August 2026\n5. Photographs of the defective work\n6. Correspondence between the parties"),
    ],
  },
  {
    key: "scnsw.statement_of_claim_cover",
    name: "Statement of Claim (covering letter, NSW Local Court)",
    description: "Covers filing and service of a Local Court statement of claim.",
    category: "Litigation",
    subcategory: "Small Claims",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: CIVIL,
    aiInstructions:
      "Draft a covering letter serving a filed Local Court statement of claim on the defendant. State that proceedings have been commenced, the amount claimed, that the defendant has a limited period to file a defence, and that if no defence is filed default judgment may be entered without further notice. Note that the claim can still be resolved by payment or agreement. Do not state the defence period as a fixed number of days without flagging verification.",
    segments: [
      text("PROCEEDINGS COMMENCED\n\nWe act for "),
      field("plaintiff", "Our client", "ABC Supplies Pty Ltd"),
      text(" and enclose by way of service a Statement of Claim filed in the Local Court of New South Wales, "),
      field("registry", "Registry", "Parramatta"),
      text(" Registry.\n\nProceedings number: "),
      field("proceedings_number", "Proceedings number", "2026/00123456"),
      text("\nAmount claimed: "),
      field("amount", "Amount claimed", "$18,450.00 plus interest and costs"),
      text("\n\nWHAT YOU MUST DO\n\nIf you dispute the claim, you must file a Defence within the period stated in the Statement of Claim. If you do not, our client may enter default judgment against you without further notice to you.\n\nA judgment may affect your credit rating and can be enforced against your property, wages or bank accounts.\n\nIF YOU WISH TO RESOLVE THIS\n\nThe matter can still be resolved. If you pay the amount claimed, or wish to discuss a payment arrangement, contact us promptly."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current period for filing a defence and the correct service requirements under the Uniform Civil Procedure Rules before serving.",
  },
  {
    key: "scnsw.default_judgment_request",
    name: "Default Judgment Request (NSW Local Court)",
    description: "Applies for default judgment where no defence has been filed.",
    category: "Litigation",
    subcategory: "Enforcement",
    documentType: "court_document",
    jurisdictions: ["NSW"],
    matterTypes: CIVIL,
    requiresReview: true,
    reviewNote:
      "Default judgment requires proof of proper service and that the time for defence has expired. Verify the current form, the service evidence required, and that no defence has in fact been filed before applying.",
    aiInstructions:
      "Draft a request for default judgment. Identify the proceedings, confirm the statement of claim was served and how, confirm the time for filing a defence has expired and none has been filed, and set out the calculation of the judgment sought (liquidated claim, interest and costs). Precision matters -- a default judgment entered on defective service will be set aside and the costs thrown away.",
    segments: [
      text("REQUEST FOR DEFAULT JUDGMENT\n\nCourt: Local Court of New South Wales, "),
      field("registry", "Registry", "Parramatta"),
      text(" Registry\nProceedings No: "),
      field("proceedings_number", "Proceedings number", "2026/00123456"),
      text("\n\nPlaintiff: "),
      field("plaintiff", "Plaintiff", "ABC Supplies Pty Ltd"),
      text("\nDefendant: "),
      field("defendant", "Defendant", "XYZ Builders Pty Ltd"),
      text("\n\nSERVICE\n\nThe Statement of Claim was served on the defendant on "),
      field("service_date", "Date served", "20 August 2026"),
      text(" by "),
      field("service_method", "Method of service", "post to the defendant's registered office, in accordance with s 109X of the Corporations Act 2001 (Cth)"),
      text(".\n\nThe time for filing a defence has expired and no defence has been filed.\n\nJUDGMENT SOUGHT\n\n"),
      field("calculation", "Judgment calculation", "Liquidated claim                $18,450.00\nInterest to date of judgment      $612.40\nFiling and service costs          $325.00\nProfessional costs                $792.00\n                              -------------\nTOTAL                          $20,179.40"),
    ],
  },
  {
    key: "scnsw.enforcement_options_advice",
    name: "Enforcement Options After Judgment (NSW)",
    description: "Advises a judgment creditor on how to actually recover the money.",
    category: "Litigation",
    subcategory: "Enforcement",
    documentType: "advice",
    jurisdictions: ["NSW"],
    matterTypes: CIVIL,
    aiInstructions:
      "Draft advice to a judgment creditor on enforcement options in NSW: examination of the judgment debtor to find out what they have; writ for the levy of property; garnishee of wages or bank accounts; charging order over land; and, for companies, a statutory demand and winding up. For each, note the cost and when it is worth doing. Be blunt that a judgment against a debtor with no assets is worth nothing, and that enforcement costs are thrown away if the debtor is insolvent -- investigate before spending.",
    segments: [
      text("ENFORCING YOUR JUDGMENT\n\nYou now have judgment for "),
      field("judgment_amount", "Judgment amount", "$20,179.40"),
      text(". A judgment is not payment -- the following options exist to recover it.\n\nFIRST: FIND OUT WHAT THEY HAVE\n\nAn examination requires the debtor to attend court and answer questions about their assets, income and liabilities. This is usually the sensible first step, because every other option costs money and is wasted if there is nothing to recover from.\n\nYOUR OPTIONS\n\n1. WRIT FOR THE LEVY OF PROPERTY - the Sheriff seizes and sells the debtor's goods. Effective against a debtor with valuable equipment or vehicles; useless against one with nothing.\n\n2. GARNISHEE ORDER - directs a third party holding money for the debtor (an employer, or their bank) to pay you instead. Often the most effective option where the debtor is employed or has a known bank account.\n\n3. WRIT AGAINST LAND / CHARGING ORDER - registers your judgment against the debtor's real property. Slow, but secure, and often paid out when they refinance or sell.\n\n4. FOR COMPANIES - a statutory demand, followed by a winding up application if unmet. A powerful lever, but a blunt one: if the company is wound up you become an unsecured creditor and may recover little.\n\nOUR RECOMMENDATION\n\n"),
      field("recommendation", "Recommendation", "The debtor company appears to still be trading and holds a business account with a bank we can identify. We recommend a garnishee order against that account, which is comparatively cheap and can be effective immediately."),
      text("\n\nA WORD OF CAUTION\n\n"),
      field("caution", "Cost caution", "Each enforcement step carries its own filing and service costs, which are added to the judgment but only recovered if you actually recover. If the debtor is insolvent, further expenditure will simply increase your loss."),
    ],
  },
];

export const CRIMINAL_NSW_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "crimnsw.initial_advice_local_court",
    name: "Initial Advice - Local Court Matter (NSW)",
    description: "First advice to a client charged with a summary offence in the Local Court.",
    category: "Criminal",
    subcategory: "Local Court",
    documentType: "advice",
    jurisdictions: ["NSW"],
    matterTypes: CRIMINAL,
    aiInstructions:
      "Draft initial advice to a client charged with an offence dealt with in the NSW Local Court. Explain the charge in plain terms, the elements the prosecution must prove beyond reasonable doubt, the realistic range of penalties, the plea options and the discount available for an early plea of guilty, the value of character references and any rehabilitation steps, and the possible non-conviction outcomes. Emphasise the client should not discuss the matter with anyone but their lawyer, and must attend court. Be realistic rather than reassuring -- a client who expects a non-conviction and receives a conviction will feel misled.",
    segments: [
      text("YOUR COURT MATTER - INITIAL ADVICE\n\nCharge: "),
      field("charge", "Charge", "Drive with mid range prescribed concentration of alcohol, contrary to s 110(4) Road Transport Act 2013 (NSW)"),
      text("\nCourt and date: "),
      field("court_date", "Court and date", "Parramatta Local Court, 12 October 2026"),
      text("\n\nWHAT THE PROSECUTION MUST PROVE\n\n"),
      field("elements", "Elements of the offence", "That you drove a motor vehicle on a road, and that at the time your blood alcohol concentration was at or above 0.08 but below 0.15. The reading is proved by the breath analysis certificate."),
      text("\n\nTHE EVIDENCE\n\n"),
      field("evidence", "Evidence summary", "The police facts allege a random breath test at 11:40pm resulting in a reading of 0.112. The breath analysis certificate appears regular on its face."),
      text("\n\nYOUR OPTIONS\n\n"),
      field("options", "Plea options", "Given the reading and the apparent regularity of the certificate, a defended hearing has poor prospects. A plea of guilty at the earliest opportunity attracts the maximum sentencing discount."),
      text("\n\nLIKELY OUTCOME\n\n"),
      field("likely_outcome", "Realistic likely outcome", "For a first offence of this kind, the realistic range is a conviction with a fine and a period of licence disqualification, together with an interlock order. A non-conviction order is possible but should not be assumed, and would require strong subjective material."),
      text("\n\nWHAT WILL HELP\n\n"),
      field("mitigation_steps", "Steps to take before court", "1. Complete the Traffic Offenders Intervention Program before your court date -- this carries real weight.\n2. Obtain two or three character references from people who know of the charge (we will send you guidance on what these must say).\n3. Write a short letter of apology to the Court in your own words."),
      text("\n\nIMPORTANT\n\nDo not discuss this matter with anyone other than us. You must attend court on the date above; failure to appear can result in a warrant."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current maximum penalties, disqualification periods and interlock requirements for the specific offence before advising on likely outcome -- these are amended regularly.",
  },
  {
    key: "crimnsw.brief_request_to_prosecution",
    name: "Request for Brief of Evidence (NSW)",
    description: "Requests service of the brief of evidence from police prosecutors.",
    category: "Criminal",
    subcategory: "Local Court",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: CRIMINAL,
    aiInstructions:
      "Draft a letter to police prosecutors requesting service of the brief of evidence. Identify the client, the charges, the court and the next return date, note that a plea of not guilty has been entered or is contemplated, and request the brief together with any relevant material including custody records, CCTV, body-worn video and any material that may assist the defence. Ask for it before the next mention.",
    segments: [
      text("REQUEST FOR BRIEF OF EVIDENCE\n\nAccused: "),
      field("accused", "Accused", "John Citizen, date of birth 12 May 1994"),
      text("\nCharges: "),
      field("charges", "Charges", "Assault occasioning actual bodily harm"),
      text("\nCourt: "),
      field("court", "Court and next date", "Parramatta Local Court, next listed 12 October 2026"),
      text("\nCAN/Court reference: "),
      field("reference", "CAN or court reference", "H12345678"),
      text("\n\nWe act for the accused. "),
      field("plea_position", "Plea position", "A plea of not guilty has been entered and the matter has been adjourned for service of the brief."),
      text("\n\nPlease serve the brief of evidence, including:\n\n1. all statements of witnesses the prosecution intends to call;\n2. the accused's criminal history;\n3. any recorded interview with the accused and a transcript;\n4. custody records;\n5. any CCTV, body-worn video or other electronic material;\n6. any photographs, medical records or expert reports relied upon;\n7. any material in the prosecution's possession that may assist the defence.\n\nPlease serve the brief in accordance with the Court's directions and in any event before the next mention."),
    ],
  },
  {
    key: "crimnsw.character_reference_guidance",
    name: "Character Reference Guidance (NSW)",
    description: "Tells a referee how to write a character reference that will actually assist.",
    category: "Criminal",
    subcategory: "Local Court",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: CRIMINAL,
    aiInstructions:
      "Draft guidance for someone writing a character reference for a defendant. It must state: address it to the presiding Magistrate; say how long and in what capacity the referee has known the defendant; state expressly that the referee is AWARE OF THE CHARGES (a reference that does not say this carries almost no weight); give specific examples of good character rather than adjectives; mention any contribution to the community, employment or family responsibilities; note any remorse the referee has observed; and be signed and dated. Warn against asking the Court for a particular outcome or minimising the offence, both of which harm the defendant.",
    segments: [
      text("WRITING A CHARACTER REFERENCE\n\nThank you for agreeing to provide a reference for "),
      field("defendant", "Defendant", "John Citizen"),
      text(". Please follow this guidance -- a reference that misses these points carries little weight.\n\nADDRESS IT TO\n\n'To the Presiding Magistrate' and, if known, the court: "),
      field("court", "Court", "Parramatta Local Court"),
      text("\n\nWHAT TO INCLUDE\n\n1. HOW YOU KNOW THEM. How long, and in what capacity (employer, friend, colleague, coach).\n\n2. THAT YOU KNOW ABOUT THE CHARGES. This is essential. State expressly that you are aware they are before the Court charged with "),
      field("charges", "Charges", "assault occasioning actual bodily harm"),
      text(", and that your view of their character is unchanged. A reference that does not say this is often given no weight at all.\n\n3. SPECIFIC EXAMPLES. Not 'he is a good person', but what he actually does -- reliability at work, care for a family member, volunteering, how he responded in a difficult situation.\n\n4. THEIR CIRCUMSTANCES. Employment, family responsibilities, community involvement.\n\n5. REMORSE. If you have seen genuine remorse or steps taken to address what happened, say so and describe it.\n\nWHAT NOT TO DO\n\n- Do not suggest what penalty the Court should impose. That is the Magistrate's decision and it reads poorly.\n- Do not minimise the offence, blame the victim, or suggest it was out of character in a way that excuses it.\n- Do not say anything you do not actually believe.\n\nFINALLY\n\nSign and date it, and put it on letterhead if you have it. Please provide it to us by "),
      field("deadline", "Provide by", "5 October 2026"),
      text("."),
    ],
  },
  {
    key: "crimnsw.sentencing_submissions",
    name: "Sentencing Submissions Outline (NSW Local Court)",
    description: "Structured outline of submissions on sentence following a plea of guilty.",
    category: "Criminal",
    subcategory: "Local Court",
    documentType: "court_document",
    jurisdictions: ["NSW"],
    matterTypes: CRIMINAL,
    requiresReview: true,
    reviewNote:
      "Sentencing options and their statutory preconditions under the Crimes (Sentencing Procedure) Act 1999 (NSW) have been substantially amended. Confirm the current options and the discount available for the plea before submitting.",
    aiInstructions:
      "Draft an outline of sentencing submissions for the NSW Local Court following a plea of guilty. Structure: the objective seriousness of the offence (candidly assessed -- overstating mitigation destroys credibility); the subjective case (background, employment, family, health, prior record or lack of it); the utilitarian discount for the plea and its timing; remorse and steps taken toward rehabilitation; the sentencing options realistically available and why the one contended for is appropriate; and any specific consequence the Court should weigh, such as licence or employment impact. Do not overstate -- a Magistrate who distrusts one submission distrusts them all.",
    segments: [
      text("SUBMISSIONS ON SENTENCE\n\nAccused: "),
      field("accused", "Accused", "John Citizen"),
      text("\nOffence: "),
      field("offence", "Offence", "Drive with mid range prescribed concentration of alcohol"),
      text("\nPlea: Guilty, entered "),
      field("plea_date", "Plea date and stage", "at the first mention on 12 October 2026"),
      text("\n\n1. OBJECTIVE SERIOUSNESS\n\n"),
      field("objective", "Objective seriousness (candid)", "The reading of 0.112 sits in the lower half of the mid range. The driving was over a short distance on a suburban road with light traffic, at low speed, and there was no accident, no aggravating manner of driving and no passengers. It is accepted the offence is nonetheless a serious one given the risk drink driving poses."),
      text("\n\n2. SUBJECTIVE CASE\n\n"),
      field("subjective", "Subjective case", "The accused is 32, in full time employment as an electrician, and supports a partner and two young children. He has no prior convictions and no traffic record of substance. References from his employer and his football club are tendered."),
      text("\n\n3. THE PLEA\n\nThe plea was entered at the earliest opportunity and the accused is entitled to the full utilitarian discount.\n\n4. REMORSE AND REHABILITATION\n\n"),
      field("remorse", "Remorse and rehabilitation", "The accused has completed the Traffic Offenders Intervention Program (certificate tendered), has ceased drinking entirely, and has written a letter of apology to the Court. His remorse is genuine."),
      text("\n\n5. CONSEQUENCES OF CONVICTION\n\n"),
      field("consequences", "Specific consequences", "The accused's employment requires him to drive between job sites. A lengthy disqualification would likely cost him his employment, with consequences for his dependants."),
      text("\n\n6. SUBMISSION\n\n"),
      field("submission", "What is contended for", "It is submitted that the objective seriousness, the early plea, the absence of any prior record and the completion of the intervention program together justify the minimum disqualification period available, and that the Court would be justified in dealing with the matter without recording a conviction."),
    ],
  },
];
