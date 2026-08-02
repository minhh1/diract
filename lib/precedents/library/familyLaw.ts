// lib/precedents/library/familyLaw.ts
// Family law under the Family Law Act 1975 (Cth), heard in the Federal
// Circuit and Family Court of Australia (FCFCOA, from September 2021).
//
// Family law is FEDERAL, so unlike conveyancing these precedents are
// jurisdiction-neutral and carry no `jurisdictions` -- one set works in
// every state.
//
// The one real exception: Western Australia did not refer its powers over
// de facto financial matters to the Commonwealth. De facto property and
// maintenance disputes in WA run under WA legislation in the Family Court
// of Western Australia, not the Family Law Act. Precedents below that touch
// de facto FINANCIAL matters say so in their review note rather than
// silently assuming the federal regime applies.
import { text, field, type PrecedentSeed } from "./types";

const FAMILY = ["Family Law"];

export const FAMILY_LAW_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "fam.initial_advice_property",
    name: "Initial Advice - Property Settlement",
    description: "First advice on how property settlement works, the four-step process and likely range.",
    category: "Family Law",
    subcategory: "Property",
    documentType: "advice",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft initial advice on property settlement. Explain the four-step approach the Court takes: identify and value the asset pool (including superannuation and liabilities); assess each party's financial and non-financial contributions including as homemaker and parent; consider the future needs factors (age, health, care of children, earning capacity); and stand back to consider whether the overall result is just and equitable. Explain that there is no presumption of a 50/50 split. Give a realistic range if instructed, and explain time limits for applying. Be candid that outcomes vary and settlement is usually better than litigation.",
    segments: [
      text("PROPERTY SETTLEMENT - INITIAL ADVICE\n\nHOW THE COURT APPROACHES PROPERTY\n\nThere is no automatic 50/50 split. The Court works through four steps:\n\n1. IDENTIFY THE POOL. Everything either of you owns, owes or holds, whenever acquired and in whosever name -- including superannuation.\n\n2. CONTRIBUTIONS. What each of you contributed financially and non-financially, including as homemaker and parent. Contributions at the start of the relationship, during it, and since separation all count.\n\n3. FUTURE NEEDS. Age, health, income and earning capacity, and who has the care of any children. This can adjust the division in favour of one party.\n\n4. JUST AND EQUITABLE. The Court stands back and asks whether the overall result is fair.\n\nYOUR SITUATION\n\nAsset pool as we currently understand it:\n\n"),
      field("asset_pool", "Asset pool", "Family home (estimated $1,150,000, mortgage $420,000)\nSuperannuation - you $180,000, other party $95,000\nSavings $34,000\nVehicles $28,000"),
      text("\n\nCONTRIBUTIONS\n\n"),
      field("contributions", "Contributions assessment", "Contributions appear broadly equal. You brought $80,000 into the relationship 14 years ago, which carries some weight but is diminished by the length of the relationship."),
      text("\n\nFUTURE NEEDS\n\n"),
      field("future_needs", "Future needs factors", "You have primary care of the two children and a lower earning capacity, which would likely support an adjustment in your favour."),
      text("\n\nLIKELY RANGE\n\n"),
      field("range", "Likely range", "In our view a range of 55% to 62% in your favour is realistic, though outcomes in this area vary considerably."),
      text("\n\nTIME LIMITS\n\n"),
      field("time_limits", "Time limits", "Time limits apply to property applications and differ for married and de facto couples. We will confirm the deadline that applies to you."),
      text("\n\nOUR RECOMMENDATION\n\n"),
      field("recommendation", "Recommendation", "We recommend attempting negotiation and, if needed, mediation before commencing proceedings. Litigation is expensive and the outcome uncertain."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the correct time limit (it differs for married vs de facto). For DE FACTO financial matters in Western Australia, the Family Law Act does not apply -- WA legislation and the Family Court of WA govern.",
  },
  {
    key: "fam.initial_advice_parenting",
    name: "Initial Advice - Parenting",
    description: "First advice on parenting arrangements and how the Court decides children's matters.",
    category: "Family Law",
    subcategory: "Parenting",
    documentType: "advice",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft initial advice on parenting arrangements. Explain that the child's best interests are the paramount consideration, that the Court focuses on safety and the benefit of a relationship with both parents, and that arrangements should be practical and child-focused rather than expressed as parental 'rights'. Explain the requirement to attempt family dispute resolution and obtain a s 60I certificate before applying, and the exceptions to it (including family violence and urgency). Encourage agreement where safe. Be careful not to state the legislative factors as a fixed list -- the parenting provisions have been amended.",
    segments: [
      text("PARENTING ARRANGEMENTS - INITIAL ADVICE\n\nTHE GUIDING PRINCIPLE\n\nIn any decision about children, the child's best interests are the paramount consideration. The Court is concerned with what arrangement serves the child, not with the parents' respective entitlements.\n\nSafety comes first. Where there is a risk of harm from abuse, neglect or family violence, that outweighs other considerations.\n\nWHAT THE COURT LOOKS AT\n\n"),
      field("relevant_factors", "Relevant factors in this matter", "The children's ages (7 and 10), their existing routine and schooling, each parent's capacity to meet their needs, the practicalities of the distance between households, and the children's own views given their ages."),
      text("\n\nBEFORE YOU CAN APPLY TO COURT\n\nYou generally must attempt family dispute resolution and obtain a s 60I certificate before filing a parenting application. There are exceptions, including urgency and where there has been family violence or child abuse.\n\n"),
      field("fdr_position", "FDR position in this matter", "We recommend you attend family dispute resolution. We can refer you to an accredited practitioner."),
      text("\n\nWHAT WE SUGGEST\n\n"),
      field("proposed_arrangements", "Proposed arrangements", "A week-about arrangement is unlikely to suit children of this age given the 40 minute distance between households and their school location. We suggest proposing alternate weekends from after school Friday to Monday morning, one mid-week overnight, and half of all school holidays."),
      text("\n\nAgreement, where it is safe to reach one, is almost always better for children than a contested hearing. It is also far less expensive and much faster."),
    ],
    requiresReview: true,
    reviewNote:
      "The parenting provisions of the Family Law Act have been amended, including the removal of the presumption of equal shared parental responsibility. Confirm the current statutory factors before advising.",
  },
  {
    key: "fam.disclosure_request",
    name: "Request for Financial Disclosure",
    description: "Requests full and frank financial disclosure from the other party.",
    category: "Family Law",
    subcategory: "Property",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter requesting financial disclosure from the other party's solicitor. List the documents required (bank statements, tax returns, payslips, superannuation statements, property valuations, company and trust financials, credit card statements). Remind them that the duty of disclosure is ongoing and full and frank, and that non-disclosure can result in orders being set aside and adverse costs. Give a deadline and offer reciprocal disclosure.",
    segments: [
      text("We act for "),
      field("client_name", "Our client", "Jane Citizen"),
      text(" and write regarding financial disclosure.\n\nBoth parties have an ongoing duty to make full and frank disclosure of their financial circumstances. Please provide the following for your client:\n\n1. Bank statements for all accounts (sole and joint) for the last 12 months.\n2. Income tax returns and notices of assessment for the last 3 financial years.\n3. Payslips for the last 6 months.\n4. Superannuation member statements for all funds.\n5. Any valuation or appraisal of real property.\n6. Financial statements and tax returns for any company, trust or partnership in which your client has an interest.\n7. Credit card and loan statements for the last 12 months.\n\n"),
      field("additional_documents", "Additional documents sought", "8. Documents relating to the sale of the Toyota Hilux in March 2026."),
      text("\n\nWe enclose our client's disclosure by way of reciprocal exchange.\n\nPlease provide your client's documents by "),
      field("deadline", "Deadline", "12 September 2026"),
      text(".\n\nWe remind you that the duty is ongoing, and that non-disclosure may result in any agreement or order being set aside and in adverse costs orders."),
    ],
  },
  {
    key: "fam.settlement_proposal",
    name: "Property Settlement Proposal",
    description: "Puts a without prejudice property settlement proposal to the other party.",
    category: "Family Law",
    subcategory: "Property",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a without prejudice property settlement proposal. Set out the asset pool as understood, the percentage division proposed and the reasoning (contributions and future needs), and then how the division is to be implemented in practical terms -- who keeps what, what is sold, any payment and by when, and how superannuation is to be split. Invite a counter-proposal. Mark it WITHOUT PREJUDICE.",
    segments: [
      text("WITHOUT PREJUDICE\n\nWe act for "),
      field("client_name", "Our client", "Jane Citizen"),
      text(" and put the following proposal for settlement of property matters.\n\nTHE POOL\n\n"),
      field("pool", "Asset pool", "Family home $1,150,000 less mortgage $420,000 = $730,000\nSuperannuation (combined) $275,000\nSavings $34,000\nVehicles $28,000\nTOTAL NET POOL: $1,067,000"),
      text("\n\nPROPOSED DIVISION\n\nOur client proposes a division of "),
      field("division", "Proposed division", "58% to our client and 42% to your client"),
      text(", on the basis that "),
      field("division_reasoning", "Reasoning", "contributions were broadly equal, with an adjustment in our client's favour for future needs given she has primary care of the two children and a materially lower earning capacity"),
      text(".\n\nHOW IT WOULD WORK\n\n"),
      field("implementation", "Practical implementation", "1. Our client retains the family home and refinances the mortgage into her sole name within 90 days, releasing your client from the loan.\n2. Our client pays your client $128,000 on completion of the refinance.\n3. Each party retains their own superannuation, vehicle and bank accounts.\n4. Each party retains their own personal effects."),
      text("\n\nIf agreed, we would prepare consent orders to give effect to this.\n\nIf your client does not accept, we invite a counter-proposal so that the matter can be narrowed."),
    ],
  },
  {
    key: "fam.consent_orders_cover",
    name: "Application for Consent Orders (covering letter)",
    description: "Sends draft consent orders and the application to the other party for signing.",
    category: "Family Law",
    subcategory: "Court Documents",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a covering letter enclosing an Application for Consent Orders and draft orders. Confirm the orders reflect the agreement reached, explain that the Court must be satisfied the orders are just and equitable (property) or in the children's best interests (parenting) before making them, note the filing fee and who will pay it, ask for signing and return by a date, and note who will file. Recommend the other party obtain independent legal advice if unrepresented, and note that the orders are not effective until actually made by the Court, so nothing should be implemented (transfers, refinancing) before that occurs unless expressly agreed.",
    segments: [
      text("We enclose an Application for Consent Orders and draft Orders reflecting the agreement reached between the parties.\n\nSUMMARY OF THE ORDERS\n\n"),
      field("orders_summary", "Summary of the orders", "1. Our client retains the former matrimonial home and pays your client $128,000 within 90 days.\n2. Each party retains their own superannuation.\n3. The children live with our client and spend time with your client on alternate weekends and half of all school holidays."),
      text("\n\nFILING FEE\n\n"),
      field("filing_fee", "Filing fee and who pays it", "The Court filing fee is payable on lodgement. Our client will pay it and it has been factored into the agreed division."),
      text("\n\nPlease arrange for your client to sign the Application and the Orders where indicated and return them to us by "),
      field("return_by", "Return by", "20 September 2026"),
      text(".\n\nWe will then file the documents with the Court. The Court must be satisfied that property orders are just and equitable, and that parenting orders are in the children's best interests, before making them.\n\nPlease note the orders are not binding until the Court actually makes them. Nothing should be implemented -- transfers signed, refinancing arranged, or superannuation split -- before that occurs, unless the parties expressly agree otherwise in writing.\n\n"),
      field("ilp_note", "Note if the other party is unrepresented", "If your client is not legally represented, we strongly recommend they obtain independent legal advice before signing."),
    ],
  },
  {
    key: "fam.bfa_advice_certificate",
    name: "Binding Financial Agreement - Independent Advice",
    description: "Records the independent legal advice required for a financial agreement to be binding.",
    category: "Family Law",
    subcategory: "Agreements",
    documentType: "advice",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft the independent legal advice letter accompanying a binding financial agreement. It must record that the client received advice, before signing, about the effect of the agreement on their rights and the advantages and disadvantages of making it. Set out what the agreement does, what rights the client is giving up (including the right to apply to the Court for property or maintenance orders), and be explicit about the disadvantages. This letter is what makes the agreement binding, and financial agreements are frequently challenged -- the advice must be genuinely given and genuinely recorded, not a formality.",
    segments: [
      text("INDEPENDENT LEGAL ADVICE - FINANCIAL AGREEMENT\n\nYou have asked us to advise you on the financial agreement between you and "),
      field("other_party", "Other party", "Alex Partner"),
      text(".\n\nWHAT THE AGREEMENT DOES\n\n"),
      field("effect", "Effect of the agreement", "The agreement provides that, in the event of separation, each party retains the assets held in their own name, and that the property at 12 Example Street remains yours absolutely."),
      text("\n\nWHAT YOU ARE GIVING UP\n\nBy signing this agreement you give up your right to apply to a Court for orders altering property interests or for spousal maintenance, other than in the limited circumstances in which a Court may set an agreement aside.\n\nThis is a significant step. A Court will not adjust the agreement merely because it later turns out to be unfair to you.\n\nADVANTAGES\n\n"),
      field("advantages", "Advantages", "The agreement gives certainty, protects the property you brought into the relationship, and avoids the cost and stress of a contested property dispute later."),
      text("\n\nDISADVANTAGES\n\n"),
      field("disadvantages", "Disadvantages (be candid)", "If your circumstances change -- for example if you have children, cease working, or your health declines -- you will have no ability to seek an adjustment, even if the outcome becomes markedly unfair to you. You are also giving up any claim on your partner's superannuation, which is currently substantially larger than yours."),
      text("\n\nOUR ADVICE\n\n"),
      field("our_advice", "Our advice", "The agreement is heavily weighted in your favour as to the Example Street property, but leaves you exposed if you reduce your working hours to care for children. We recommend seeking an amendment providing for a review if a child is born."),
      text("\n\nWe confirm this advice was given to you before you signed the agreement, and that you were not under any pressure from us to sign."),
    ],
    requiresReview: true,
    reviewNote:
      "The statutory requirements for a binding financial agreement are strict and agreements are frequently set aside. Verify the current requirements and ensure the signed advice certificate matches this letter.",
  },
  {
    key: "fam.divorce_application_cover",
    name: "Application for Divorce (covering letter to client)",
    description: "Explains the divorce application, separation requirement and what happens at the hearing.",
    category: "Family Law",
    subcategory: "Divorce",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter to the client about their divorce application. Explain the separation requirement, that separation under one roof requires additional evidence, what happens if there are children under 18, whether they need to attend the hearing, when the divorce takes effect, and importantly that divorce does NOT resolve property or parenting matters and that time limits for property applications run from the date the divorce becomes final. That last point is the one clients most often miss.",
    segments: [
      text("We enclose your Application for Divorce for signing.\n\nSEPARATION\n\nA divorce requires that you have been separated for at least 12 months and that there is no reasonable likelihood of resuming the relationship.\n\n"),
      field("separation_details", "Separation details", "You separated on 4 March 2025 and have lived at separate addresses since that date."),
      text("\n\nCHILDREN\n\n"),
      field("children", "Children position", "As there are children under 18, the Court must be satisfied that proper arrangements have been made for them. The Application sets out the current arrangements."),
      text("\n\nTHE HEARING\n\n"),
      field("hearing", "Attendance at hearing", "As this is a sole application and there are children under 18, you will need to attend the hearing. We will appear with you."),
      text("\n\nWHEN IT TAKES EFFECT\n\nThe divorce order does not take effect immediately. It becomes final one month and one day after it is made, and only then are you free to remarry.\n\nIMPORTANT - DIVORCE DOES NOT SORT OUT PROPERTY\n\nA divorce ends the marriage. It does not divide property, deal with superannuation, or settle arrangements for children.\n\nTime limits for property and maintenance applications run from the date the divorce becomes final. If your property matters are not resolved by then, you may need the Court's permission to bring a claim.\n\n"),
      field("property_status", "Property status in this matter", "Your property matters remain unresolved. We recommend finalising them, by consent orders if possible, before the divorce becomes final."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current post-divorce time limit for property and maintenance applications before advising the client on their deadline.",
  },
  {
    key: "fam.affidavit_family_law",
    name: "Affidavit (family law)",
    description: "Affidavit scaffold for family law proceedings, structured for parenting or financial evidence.",
    category: "Family Law",
    subcategory: "Court Documents",
    documentType: "court_document",
    matterTypes: FAMILY,
    requiresReview: true,
    reviewNote:
      "The FCFCOA prescribes its own affidavit form and imposes page and annexure limits that differ by application type and division. Verify the current form and any limits before filing.",
    aiInstructions:
      "Draft a family law affidavit. Rules: number every paragraph; give facts, not argument or opinion about the other party's character; be specific with dates, times and places; where deposing to what someone said, give the words as closely as possible rather than a characterisation; identify annexures precisely. In parenting matters focus on the practical care arrangements and the child's actual experience, not on grievances about the other parent. Avoid inflammatory language -- it damages credibility and the Court sees a great deal of it.",
    segments: [
      text("AFFIDAVIT\n\nFEDERAL CIRCUIT AND FAMILY COURT OF AUSTRALIA\nRegistry: "),
      field("registry", "Registry", "Sydney"),
      text("\nFile number: "),
      field("file_number", "File number", "SYC 1234 of 2026"),
      text("\n\nApplicant: "),
      field("applicant", "Applicant", "Jane Citizen"),
      text("\nRespondent: "),
      field("respondent", "Respondent", "Alex Partner"),
      text("\n\nAffidavit of: "),
      field("deponent", "Deponent", "Jane Citizen"),
      text("\nDate: "),
      field("date", "Date", "20 September 2026"),
      text("\n\nI say on oath/affirmation:\n\n1. I am the "),
      field("capacity", "Capacity", "Applicant in these proceedings"),
      text(".\n\n2. I make this affidavit from my own knowledge except where I state otherwise, in which case I identify the source and believe it to be true.\n\n"),
      field("body", "Numbered body paragraphs", "3. The Respondent and I began living together in January 2010 and married on 14 February 2012. We separated on 4 March 2025.\n\n4. There are two children of the marriage: Sam, born 12 May 2016, and Ava, born 3 August 2019.\n\n5. Since separation the children have lived with me at 5 Sample Road, Parramatta. They attend Parramatta Public School, which is 900 metres from our home.\n\n6. Between March 2025 and June 2026 the children spent alternate weekends with the Respondent. Since July 2026 the Respondent has collected them only intermittently. Annexed and marked 'A' is a copy of my diary record of the occasions on which the children spent time with him."),
      text("\n\nSWORN/AFFIRMED at "),
      field("place", "Place", "Sydney"),
      text("\n\nDeponent: ____________________________\n\nBefore me: ____________________________"),
    ],
  },
  {
    key: "fam.s60i_referral",
    name: "Family Dispute Resolution Referral",
    description: "Refers the client to family dispute resolution and explains the s 60I certificate.",
    category: "Family Law",
    subcategory: "Parenting",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter referring the client to family dispute resolution. Explain what FDR is, that a s 60I certificate is generally required before filing a parenting application, the kinds of certificate that can issue and what each means, and the exceptions where FDR is not required (urgency, family violence, child abuse, incapacity). Note that FDR is confidential and that what is said there generally cannot be used in Court.",
    segments: [
      text("FAMILY DISPUTE RESOLUTION\n\nBefore you can file a parenting application, you generally need a certificate under s 60I of the Family Law Act from an accredited family dispute resolution practitioner.\n\nWHAT FDR IS\n\nFDR is a facilitated negotiation with an accredited practitioner, aimed at helping parents reach agreement about children without going to Court. It is confidential -- what is said in FDR generally cannot be used as evidence.\n\nTHE CERTIFICATE\n\nA practitioner can issue a certificate saying, among other things, that you attended and made a genuine effort, that the other party did not attend, or that the matter was not suitable for FDR. Which certificate issues can matter to how the Court approaches the case and to costs.\n\nWHEN FDR IS NOT REQUIRED\n\nExceptions include urgency, family violence, child abuse or risk of it, and where a party is unable to participate effectively.\n\n"),
      field("exception_position", "Whether an exception applies here", "In our view no exception applies in your case, so a certificate will be required."),
      text("\n\nWHAT WE SUGGEST\n\n"),
      field("referral", "Referral details", "We recommend you contact Relationships Australia or a local accredited practitioner. We can provide names if that would help."),
      text("\n\nPlease let us know once FDR has been arranged so we can diarise it."),
    ],
  },
];
