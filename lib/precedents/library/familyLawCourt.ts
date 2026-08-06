// lib/precedents/library/familyLawCourt.ts
// Family law court documents and the harder correspondence: interim
// applications, financial statements, child support, family violence, and
// enforcement.
//
// Federal and jurisdiction-neutral (Family Law Act 1975 (Cth), FCFCOA), with
// the same two caveats as familyLaw.ts:
//   - de facto FINANCIAL matters in Western Australia run under WA
//     legislation in the Family Court of WA, not the Family Law Act;
//   - family violence orders are STATE legislation with different names in
//     each state (ADVO in NSW, FVIO in Victoria, DVO in Queensland and so
//     on), so the family violence precedent prompts for the applicable order
//     rather than naming one.
import { text, field, type PrecedentSeed } from "./types";

const FAMILY = ["Family Law"];

export const FAMILY_LAW_COURT_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "famc.initiating_application_cover",
    name: "Initiating Application (covering letter to client)",
    description: "Explains the application being filed, what happens next and the likely timetable.",
    category: "Family Law",
    subcategory: "Court Documents",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a covering letter to a client enclosing an Initiating Application for filing. Explain what orders are sought (final and, if applicable, interim), what supporting documents accompany it (affidavit, financial statement, genuine steps certificate or s 60I certificate), what happens after filing, the likely timetable, and what the client must do. Set realistic expectations about duration and cost -- family law proceedings routinely take longer than clients anticipate and that is better said now than later.",
    segments: [
      text("YOUR APPLICATION TO THE COURT\n\nWe enclose the Initiating Application for your signature.\n\nWHAT WE ARE ASKING THE COURT FOR\n\nFinal orders:\n\n"),
      field("final_orders", "Final orders sought", "1. That the children live with you and spend time with the respondent on alternate weekends and half of all school holidays.\n2. That the former matrimonial home be sold and the net proceeds divided 58% to you and 42% to the respondent."),
      text("\n\n"),
      field("interim_orders", "Interim orders sought (or 'No interim orders sought')", "Interim orders:\n\n1. That pending final orders the children live with you and spend time with the respondent each alternate weekend.\n2. That the respondent be restrained from listing the former matrimonial home for sale."),
      text("\n\nWHAT IS FILED WITH IT\n\n"),
      field("supporting_documents", "Supporting documents", "1. Your affidavit.\n2. Your Financial Statement.\n3. The s 60I certificate issued by the family dispute resolution practitioner.\n4. Notice of Risk."),
      text("\n\nWHAT HAPPENS NEXT\n\nOnce filed, the application is served on the respondent, who has a period to respond. The matter will then be listed for a first court event, at which the Court makes procedural directions rather than deciding the case.\n\n"),
      field("timetable", "Likely timetable", "Realistically, expect the first court event within 8 to 12 weeks of filing. If the matter does not resolve, a final hearing is unlikely to occur within 18 months."),
      text("\n\nPLEASE BE REALISTIC ABOUT TIME AND COST\n\nFamily law proceedings take longer and cost more than most people expect. The great majority resolve by agreement before final hearing, and usually the sooner that happens the better the outcome for everyone, particularly the children.\n\nWe will keep looking for opportunities to settle as the matter progresses.\n\nWHAT WE NEED FROM YOU\n\n"),
      field("client_actions", "What the client must do", "1. Read the affidavit carefully and confirm every paragraph is accurate before signing.\n2. Complete the disclosure schedule we sent you.\n3. Tell us immediately if anything changes with the children's arrangements."),
    ],
  },
  {
    key: "famc.financial_statement_cover",
    name: "Financial Statement: Instructions to Client",
    description: "Explains how to complete the Financial Statement and why accuracy matters.",
    category: "Family Law",
    subcategory: "Property",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft instructions to a client for completing their Financial Statement. Explain that it is sworn evidence, that it must disclose everything including assets held through companies, trusts and superannuation, and that the duty of disclosure is ongoing and full and frank. Warn plainly that non-disclosure discovered later can result in orders being set aside, adverse costs, and a serious loss of credibility on every other issue. Encourage them to estimate honestly where exact figures are unavailable and to say so rather than guess silently.",
    segments: [
      text("COMPLETING YOUR FINANCIAL STATEMENT\n\nWe enclose the Financial Statement for completion.\n\nTHIS IS SWORN EVIDENCE\n\nThe Financial Statement is not a form: it is evidence given on oath. It must be complete and accurate.\n\nWHAT MUST BE DISCLOSED\n\nEverything, including:\n\n1. All income from every source, including cash, second jobs, distributions and government benefits.\n2. All bank accounts, in your sole name or jointly, including accounts holding small balances.\n3. All superannuation, in every fund.\n4. Real property, vehicles, shares, cryptocurrency and other investments.\n5. Interests in any company, trust or partnership, including where you are only a beneficiary.\n6. All liabilities, including personal loans and money owed to family.\n7. Your weekly expenses.\n\n"),
      field("specific_items", "Items requiring particular attention in this matter", "Please pay particular attention to your interest in the Citizen Family Trust and to the shareholding in Example Holdings Pty Ltd. Both must be disclosed even though you do not control them."),
      text("\n\nWHY THIS MATTERS MORE THAN IT LOOKS\n\nBoth parties have an ongoing duty of full and frank disclosure. If it later emerges that something was not disclosed:\n\n- any agreement or order may be set aside;\n- you may be ordered to pay the other side's costs; and\n- the Court's view of your credibility on every other issue is affected.\n\nThat last point is the one people underestimate. A judge who finds you concealed an account is far less likely to accept your evidence about anything else.\n\nIF YOU DO NOT KNOW A FIGURE\n\nEstimate, and say that it is an estimate. Do not leave it blank and do not guess silently. If you need a statement or valuation to answer properly, tell us and we will obtain it.\n\nPlease complete it and return it to us by "),
      field("deadline", "Deadline", "3 October 2026"),
      text(", and we will arrange for it to be sworn."),
    ],
  },
  {
    key: "famc.interim_application_affidavit",
    name: "Affidavit in Support of Interim Application",
    description: "Affidavit focused on the interim relief sought, not the whole history.",
    category: "Family Law",
    subcategory: "Court Documents",
    documentType: "court_document",
    matterTypes: FAMILY,
    requiresReview: true,
    reviewNote:
      "The FCFCOA imposes page limits and annexure restrictions on affidavits filed in support of interim applications, and they differ by division and application type. Confirm the current limits before filing -- an over-length affidavit may be refused.",
    aiInstructions:
      "Draft an affidavit in support of an interim application. The discipline here is focus: an interim affidavit should address what the Court must decide NOW, not the entire relationship history. Set out the current arrangements, what has changed or gone wrong, why the interim order is needed before final hearing, and the practical arrangements proposed. In parenting matters address the children's routine, schooling and any risk issue specifically. Avoid character attacks -- they consume the page limit and rarely assist.",
    segments: [
      text("AFFIDAVIT IN SUPPORT OF INTERIM APPLICATION\n\nFEDERAL CIRCUIT AND FAMILY COURT OF AUSTRALIA\nRegistry: "),
      field("registry", "Registry", "Sydney"),
      text("\nFile number: "),
      field("file_number", "File number", "SYC 1234 of 2026"),
      text("\n\nDeponent: "),
      field("deponent", "Deponent", "Jane Citizen"),
      text("\nDate: "),
      field("date", "Date", "20 September 2026"),
      text("\n\nI say on oath/affirmation:\n\n1. I am the Applicant. I make this affidavit in support of my application for interim orders.\n\nCURRENT ARRANGEMENTS\n\n"),
      field("current_arrangements", "Current arrangements", "2. The children, Sam (aged 10) and Ava (aged 7), have lived with me at 5 Sample Road, Parramatta since separation on 4 March 2025. They attend Parramatta Public School, 900 metres from our home.\n\n3. Until July 2026 the children spent alternate weekends with the Respondent from Friday after school to Sunday evening."),
      text("\n\nWHAT HAS CHANGED\n\n"),
      field("what_changed", "What has changed or gone wrong", "4. On 14 August 2026 the Respondent told me he intends to enrol the children at a school in Newcastle and to have them live with him there from the start of Term 4.\n\n5. Newcastle is approximately 160 kilometres from the children's current home, school, friends and treating practitioners."),
      text("\n\nWHY INTERIM ORDERS ARE NEEDED NOW\n\n"),
      field("urgency", "Why interim relief is needed", "6. Term 4 commences on 6 October 2026. Unless orders are made before then, the children may be removed from their school and community before this application can be heard finally. Reversing that later would mean a second disruption."),
      text("\n\nWHAT I PROPOSE\n\n"),
      field("proposed", "Proposed interim arrangements", "7. I propose that pending final orders the children continue to live with me and attend their current school, and spend each alternate weekend with the Respondent, with the changeover at the school on Friday and my collecting them on Sunday evening.\n\n8. I am willing to meet the Respondent halfway for changeovers if he relocates, and to be flexible about additional time during school holidays."),
      text("\n\nSWORN/AFFIRMED at "),
      field("place", "Place", "Sydney"),
      text("\n\nDeponent: ____________________________\n\nBefore me: ____________________________"),
    ],
  },
  {
    key: "famc.family_violence_advice",
    name: "Family Violence: Initial Advice and Safety",
    description: "Advises a client on protection orders and how family violence affects family law proceedings.",
    category: "Family Law",
    subcategory: "Family Violence",
    documentType: "advice",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft advice to a client experiencing family violence. Deal with immediate safety first, including emergency contacts and that police can apply for a protection order on their behalf. Explain that protection orders are STATE legislation with a different name in each state, and prompt for the applicable one rather than naming a single order. Explain the interaction with family law: that family violence is directly relevant to parenting orders, that a protection order does not itself determine parenting arrangements, and that any inconsistency between a state order and a federal parenting order needs to be addressed. Explain that family dispute resolution may not be required where there has been family violence. Be practical and non-judgmental; do not pressure the client toward any particular course.",
    segments: [
      text("FAMILY VIOLENCE: YOUR OPTIONS\n\nYOUR SAFETY COMES FIRST\n\nIf you are in immediate danger, call 000.\n\nOther support: 1800RESPECT (1800 737 732) operates 24 hours for counselling and referral.\n\nPROTECTION ORDERS\n\n"),
      field("order_type", "Applicable protection order in this state", "In New South Wales the relevant order is an Apprehended Domestic Violence Order (ADVO), made by the Local Court."),
      text("\n\nAn order of this kind can prohibit the other person from approaching you, contacting you, attending your home or workplace, or being near your children's school. Conditions can be tailored to your circumstances.\n\nPolice can and often will apply for an order on your behalf, particularly where they have attended an incident. You can also apply yourself, and we can assist with that.\n\nBreach of an order is a criminal offence.\n\nHOW THIS AFFECTS YOUR FAMILY LAW MATTER\n\n1. Family violence is directly relevant to parenting orders. The child's safety is the paramount consideration, and the Court is required to give weight to the need to protect children from harm.\n\n2. A protection order does NOT by itself decide parenting arrangements. The two run in parallel, in different courts.\n\n3. If a protection order and a parenting order are inconsistent, that must be addressed: we will make sure any parenting order sought is consistent with the protection order and does not put you in a position where complying with one breaches the other.\n\n4. Family dispute resolution is generally required before a parenting application, but there are exceptions where there has been family violence. You may not need to attend, and you should not feel obliged to negotiate directly with someone you are afraid of.\n\nYOUR SITUATION\n\n"),
      field("situation", "Client's situation and immediate steps", "You have told us police attended on 12 September 2026 and issued a provisional order. That order is listed for confirmation on 3 October 2026. We will appear with you on that date."),
      text("\n\nPRACTICAL STEPS\n\n"),
      field("practical_steps", "Practical safety steps", "1. Keep a copy of the order with you and give a copy to the children's school.\n2. Keep a dated record of any contact or breach, and report breaches to police.\n3. Consider changing passwords and reviewing location sharing on your devices and vehicle."),
      text("\n\nThere is no pressure from us to take any particular course. Tell us what you want to achieve and we will advise on how to get there safely."),
    ],
    requiresReview: true,
    reviewNote:
      "Protection orders are state legislation with different names, courts and procedures in each state (ADVO in NSW, FVIO in Victoria, DVO in Queensland, Intervention Order in SA, VRO/FVRO in WA, PFVO in Tasmania). Confirm the applicable order and process.",
  },
  {
    key: "famc.child_support_advice",
    name: "Child Support: Initial Advice",
    description: "Explains the child support assessment, departure applications and private agreements.",
    category: "Family Law",
    subcategory: "Child Support",
    documentType: "advice",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft advice on child support. Explain the administrative assessment by Services Australia based on both parents' incomes, the care percentage and the costs of children; that it is an administrative process, not a court one; the options where the assessment does not reflect reality (change of assessment on specified grounds, or a departure application to the Court in limited circumstances); binding and limited child support agreements and the requirement for independent legal advice on a binding agreement; and that child support and time spent with children are separate issues -- withholding one because of the other is neither lawful nor effective.",
    segments: [
      text("CHILD SUPPORT: HOW IT WORKS\n\nTHE ASSESSMENT\n\nChild support is assessed administratively by Services Australia, not by a court. The formula takes into account:\n\n1. each parent's adjusted taxable income;\n2. a self-support amount for each parent;\n3. the percentage of care each parent provides; and\n4. the costs of children based on their ages and the parents' combined income.\n\n"),
      field("current_assessment", "Current assessment position", "The current assessment requires the other parent to pay you $840 per month, based on care of 65% to you and 35% to him."),
      text("\n\nIF THE ASSESSMENT DOES NOT REFLECT REALITY\n\nThe formula uses taxable income. Where a parent's taxable income does not reflect their actual financial capacity, because income is retained in a company or trust or because they have reduced their income, you can apply for a CHANGE OF ASSESSMENT on specified grounds.\n\n"),
      field("change_grounds", "Whether a change of assessment is warranted", "The other parent's taxable income is declared at $52,000, but he is the sole director of a company that retained profits of approximately $180,000 last financial year. That is a recognised ground for a change of assessment and we consider an application is warranted."),
      text("\n\nAGREEMENTS\n\nYou can agree child support privately, in either a limited or a binding child support agreement. A binding agreement requires each party to obtain independent legal advice and can be very difficult to change afterwards, which is its point, but also its risk.\n\n"),
      field("agreement_position", "Position on an agreement", "Given the uncertainty about the other parent's true income, we do not recommend entering a binding agreement at this stage."),
      text("\n\nONE THING TO BE CLEAR ABOUT\n\nChild support and time with the children are SEPARATE. Withholding the children because support is unpaid, or stopping support because time is being withheld, is not lawful and will count against whoever does it. If either is happening, tell us and we will deal with it properly."),
    ],
    requiresReview: true,
    reviewNote:
      "Change of assessment grounds and the requirements for binding child support agreements are set by the Child Support (Assessment) Act 1989 (Cth) and are amended. Confirm the current grounds and requirements before applying.",
  },
  {
    key: "famc.contravention_application_advice",
    name: "Contravention of Parenting Orders: Advice",
    description: "Advises on options where parenting orders are not being complied with.",
    category: "Family Law",
    subcategory: "Enforcement",
    documentType: "advice",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft advice on contravention of parenting orders. Explain what constitutes a contravention, the concept of reasonable excuse, the range of outcomes the Court can order (from making up time, to varying the orders, to costs, bonds and in serious cases imprisonment), and that the Court's first concern remains the child's best interests rather than punishing a parent. Be candid that contravention applications are often unsatisfying: courts are reluctant to punish, and a pattern of minor breaches is better addressed by varying the orders to remove the friction. Advise keeping a contemporaneous record.",
    segments: [
      text("WHEN PARENTING ORDERS ARE NOT COMPLIED WITH\n\nWHAT COUNTS AS A CONTRAVENTION\n\nA contravention occurs where a person bound by an order intentionally fails to comply with it, or makes no reasonable attempt to comply.\n\nREASONABLE EXCUSE\n\nA person will not be found to have contravened if they had a reasonable excuse: for example, a genuine belief on reasonable grounds that the conduct was necessary to protect a child's health or safety.\n\nWHAT THE COURT CAN DO\n\nDepending on the seriousness and whether there is a pattern:\n\n1. order make-up time;\n2. vary the existing orders;\n3. order attendance at a post-separation parenting program;\n4. order costs;\n5. require a bond; and\n6. in serious or repeated cases, impose a fine or imprisonment.\n\nThe Court's focus remains the child's best interests. It is not primarily interested in punishing a parent.\n\nYOUR SITUATION\n\n"),
      field("situation", "The alleged contraventions", "You say the children have not been returned at the ordered time on six occasions since June 2026, with delays of between 1 and 4 hours, and that on 14 August the other parent did not make the children available at all."),
      text("\n\nOUR CANDID ASSESSMENT\n\n"),
      field("assessment", "Candid assessment", "The single failure to make the children available on 14 August is the strongest of these. The late returns, while frustrating, are the kind of conduct a court often treats as insufficiently serious to warrant a sanction, particularly on a first application.\n\nContravention applications are frequently unsatisfying. Courts are reluctant to punish parents, and a pattern of minor breaches is often better fixed by varying the orders to remove whatever is causing the friction: here, the Sunday evening changeover time, which appears to be the recurring problem."),
      text("\n\nWHAT WE RECOMMEND\n\n"),
      field("recommendation", "Recommendation", "1. Write to the other parent putting the breaches on record and proposing a changeover time that works for both households.\n2. Keep a contemporaneous diary of every changeover, noting the time and any issue.\n3. If the conduct continues, or if the children are again withheld entirely, we file a contravention application with a proper evidentiary record behind it."),
      text("\n\nKEEP A RECORD\n\nWhatever course you take, keep a dated contemporaneous note of each occasion. A diary made at the time carries far more weight than a reconstruction months later."),
    ],
  },
];
