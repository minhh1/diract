// lib/precedents/library/familyLawSpecialistLists.ts
// The FCFCOA specialist case management lists.
//
// LIGHTHOUSE is the Court's risk screening and triage model. Parties in
// parenting proceedings complete the Family DOORS Triage risk screen -- a
// confidential questionnaire disclosing family safety risks -- and a
// dedicated team of Judicial Registrars, Triage Counsellors and support
// staff assesses the responses and directs the matter into the appropriate
// case management pathway.
//
// The EVATT LIST is the high-risk pathway that triage feeds into. Named
// after Elizabeth Evatt AC, the first Chief Justice of the Family Court of
// Australia, it provides intensive, specialist case management for families
// identified as at high risk of family violence and other safety concerns.
//
// The CRITICAL INCIDENT LIST is for the rarest and most serious situation:
// where no parent is available to care for a child because of death
// (including homicide), critical injury, or incarceration arising from a
// family violence incident. It exists to give a surviving carer urgent
// access to the Court.
//
// The MAJOR COMPLEX FINANCIAL PROCEEDINGS LIST handles financial matters
// whose scale or complexity warrants specialist docket management.
//
// TONE. Most of these letters are written to a client in the worst period of
// their life -- often frightened, sometimes recently bereaved. They are
// drafted to be clear, calm and practical, to explain what the Court is
// doing and why, and never to alarm further or to editorialise about the
// other party. Safety information comes first, procedure second.
//
// Federal and jurisdiction-neutral.
import { text, field, type PrecedentSeed } from "./types";

const FAMILY = ["Family Law"];

export const FAMILY_LAW_SPECIALIST_LIST_PRECEDENTS: PrecedentSeed[] = [
  // ── Lighthouse ──────────────────────────────────────────────────
  {
    key: "famsl.lighthouse_explanation",
    name: "Lighthouse and the Risk Screen: Letter to Client",
    description: "Explains the Lighthouse triage process and the confidential risk screening questionnaire.",
    category: "Family Law",
    subcategory: "Specialist Lists",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter explaining the Lighthouse model to a client in parenting proceedings. Cover: that they will be invited to complete the Family DOORS Triage risk screen, that it is confidential and completed independently of the other party, that it asks direct questions about family violence, mental health, substance misuse and safety concerns, and that answering honestly is important because it determines the support and case management the matter receives. Reassure them that the screen is not shared with the other party, and that a specialist team of Judicial Registrars, Triage Counsellors and support staff reviews it. Explain that depending on the assessment the matter may be placed on a specialist list. Encourage full disclosure without pressuring: some clients minimise what has happened to them, and some fear that disclosing will be used against them.",
    segments: [
      text("THE COURT'S RISK SCREENING PROCESS (LIGHTHOUSE)\n\nNow that your parenting application has been filed, you will be invited to complete a questionnaire called the Family DOORS Triage risk screen.\n\nWHAT IT IS\n\nThe Court uses this to identify safety risks early, so that matters involving risk are managed appropriately and the people involved receive the right support.\n\nWHAT IT ASKS\n\nThe questions are direct. They ask about family violence, your safety and the children's safety, mental health, alcohol and drug use, and your concerns about the other party.\n\nIT IS CONFIDENTIAL\n\nThis is important, so please read it carefully:\n\n1. You complete it independently. The other party completes their own.\n2. Your answers are NOT provided to the other party.\n3. It is reviewed by a specialist team at the Court: Judicial Registrars, Triage Counsellors and support staff trained in family violence and safety risk.\n\nPLEASE ANSWER HONESTLY\n\nMany people understate what has happened to them, either because they have become used to it, because they feel ashamed, or because they worry it will be held against them.\n\nIt will not be. The purpose is to make sure the Court understands the situation and manages your matter safely. Understating risk means the Court cannot respond to it.\n\nEqually, do not overstate. Simply answer accurately.\n\nWHAT HAPPENS AFTER\n\nDepending on the assessment, your matter may be:\n\n1. managed in the usual way; or\n2. placed on a specialist list with more intensive case management and support.\n\n"),
      field("matter_specific", "Anything specific to raise with this client", "Given what you have told us about the incidents in June and August 2026, we expect the screen will identify significant risk. That is appropriate and will mean your matter receives closer attention."),
      text("\n\nIf you would like to discuss the questionnaire before completing it, telephone us. We cannot complete it for you, but we can explain anything that is unclear.\n\nIf you are ever in immediate danger, call 000. 1800RESPECT (1800 737 732) operates 24 hours."),
    ],
  },

  // ── Evatt List ──────────────────────────────────────────────────
  {
    key: "famsl.evatt_possible_matter",
    name: "Possible Evatt List Matter: Letter to Client",
    description: "Advises a client that their matter may be referred to the high-risk Evatt List.",
    category: "Family Law",
    subcategory: "Specialist Lists",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter advising a client that their matter may be identified for the Evatt List. Explain what the Evatt List is (a specialist list for families identified as at high risk of family violence and other safety concerns, providing intensive and specialist case management), that being placed on it is not a finding against anyone and not a criticism of the client, and what it means practically: earlier listing, a dedicated team, closer judicial oversight, and safety measures at court. Address the anxiety this letter may create: clients sometimes read 'high risk' as an accusation. Explain the safety measures available at court and how to request them.",
    segments: [
      text("YOUR MATTER MAY BE REFERRED TO THE EVATT LIST\n\nWHAT THE EVATT LIST IS\n\nThe Evatt List is a specialist list of the Court for families identified as being at high risk of family violence or other safety concerns. It is named after Elizabeth Evatt AC, the first Chief Justice of the Family Court of Australia.\n\nMatters on the Evatt List receive intensive and specialist case management: a dedicated team, closer judicial oversight, earlier listings, and additional support.\n\nWHY YOUR MATTER MAY BE REFERRED\n\n"),
      field("reason", "Why the matter may be referred", "The risk screen and the material filed disclose a history of family violence, including the incidents in June and August 2026 and the current apprehended violence order."),
      text("\n\nPLEASE UNDERSTAND WHAT THIS IS NOT\n\nBeing placed on the Evatt List is not a finding against you or against the other party. No one has been found to have done anything at this stage.\n\nIt is a case management decision. The Court is saying that the material raises safety concerns serious enough that the matter should be managed with more care and more resources than the ordinary pathway.\n\nWHAT IT MEANS PRACTICALLY\n\n1. Your matter will generally be listed sooner.\n2. It will be managed by a dedicated team familiar with matters of this kind.\n3. Risk will be assessed on an ongoing basis rather than once.\n4. Support services can be engaged more readily.\n\nSAFETY AT COURT\n\nYou do not have to be in the same room, or arrive and leave at the same time, as the other party. The Court can arrange:\n\n1. separate waiting areas;\n2. safe entry and exit, including staggered arrival and departure;\n3. attendance by video link rather than in person;\n4. a screen in the courtroom; and\n5. a support person with you.\n\n"),
      field("safety_arrangements", "Safety arrangements to be requested", "We will request separate waiting facilities and staggered departure for every listing. Tell us if you would prefer to attend by video and we will apply for that."),
      text("\n\nIf you are ever in immediate danger, call 000. 1800RESPECT (1800 737 732) operates 24 hours.\n\nPlease telephone us if you have any concerns about attending court."),
    ],
  },
  {
    key: "famsl.evatt_allocation",
    name: "Allocation to the Evatt List: Letter to Client",
    description: "Confirms allocation to the Evatt List and explains the case management that follows.",
    category: "Family Law",
    subcategory: "Specialist Lists",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter confirming a matter has been allocated to the Evatt List. Confirm the allocation and the first listing date, explain the case management pathway that follows (specialist mentions, ongoing risk assessment, possible referral to support services, and that the matter is managed by a dedicated team), set out what the client must do, and restate the safety arrangements in place. Keep it practical and steady in tone: the client already knows the matter is serious.",
    segments: [
      text("YOUR MATTER HAS BEEN ALLOCATED TO THE EVATT LIST\n\nWe confirm the Court has allocated your matter to the Evatt List.\n\nFIRST LISTING\n\n"),
      field("first_listing", "First listing details", "Your matter is listed before a Judicial Registrar on 14 October 2026 at 9:30am, by video link."),
      text("\n\nWHAT HAPPENS NOW\n\n1. A dedicated team will manage your matter throughout.\n2. Risk will be assessed on an ongoing basis, not just once at the start.\n3. The matter will be listed more frequently than in the ordinary pathway, so that arrangements can be adjusted as circumstances change.\n4. The Court may refer either party to support services, and may make interim orders addressing safety early.\n\n"),
      field("expected_pathway", "Expected pathway for this matter", "We expect the first listing to deal with interim arrangements for the children and to set a timetable for a family report. Given the current apprehended violence order, we will ask the Court to make interim orders consistent with it so there is no conflict between the two."),
      text("\n\nWHAT YOU NEED TO DO\n\n"),
      field("client_actions", "What the client must do", "1. Provide us with a copy of the apprehended violence order and any variation.\n2. Tell us immediately about any new incident, contact or breach; do not wait until the next listing.\n3. Keep a dated note of any incident, including what was said or done and whether police attended.\n4. Continue to comply strictly with any existing orders."),
      text("\n\nSAFETY ARRANGEMENTS\n\n"),
      field("safety", "Safety arrangements in place", "We have requested that you attend by video link, that your address not be disclosed on any document, and that any changeover occur at a supervised contact centre. The Court has been notified of the apprehended violence order."),
      text("\n\nIf you are ever in immediate danger, call 000. 1800RESPECT (1800 737 732) operates 24 hours."),
    ],
  },
  {
    key: "famsl.evatt_risk_checklist",
    name: "Evatt List Risk Checklist (internal file note)",
    description: "Internal checklist ensuring risk and safety matters are addressed at each stage.",
    category: "Family Law",
    subcategory: "Specialist Lists",
    documentType: "file_note",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft an internal file note checklist for a matter on the Evatt List. Cover: whether a protection order exists and whether the parenting orders sought are consistent with it; whether police or child protection records should be subpoenaed; whether the client's address is suppressed on all documents; whether safety arrangements at court have been requested; whether a supervised contact arrangement is needed; whether risk has changed since the last listing; whether the client has support services engaged; and whether the family report writer has been given the risk material. This is an internal working document: terse and practical.",
    segments: [
      text("EVATT LIST: RISK CHECKLIST\n\nMatter: "),
      field("matter_number", "Matter number", "260601", "matter_number"),
      text("\nStage: "),
      field("stage", "Stage", "Pre first listing"),
      text("\nReviewed by: "),
      field("reviewed_by", "Reviewed by", "Jane Smith"),
      text("\nDate: "),
      field("date", "Date", "8 October 2026"),
      text("\n\nPROTECTION ORDERS\n[ ] Protection order in place? Copy on file?\n[ ] Are the parenting orders sought CONSISTENT with it? (An inconsistent order puts the client in an impossible position)\n[ ] Any variation pending or needed?\n\nEVIDENCE\n[ ] Police records subpoenaed?\n[ ] Child protection records subpoenaed?\n[ ] Medical records relevant to injury or mental health?\n[ ] Client's contemporaneous diary in place?\n\nCLIENT SAFETY\n[ ] Address suppressed on ALL filed documents?\n[ ] Separate waiting facilities requested?\n[ ] Staggered arrival and departure requested?\n[ ] Video attendance requested?\n[ ] Screen in courtroom requested?\n[ ] Client has a safety plan and knows to call 000?\n\nCHILDREN\n[ ] Supervised contact required? Centre identified and available?\n[ ] Changeover arrangement safe? (Neutral venue, or supervised)\n[ ] Family report writer given the risk material?\n\nSUPPORT\n[ ] Client referred to support services?\n[ ] Client aware of 1800RESPECT?\n\nRISK REVIEW\n[ ] Has risk CHANGED since the last listing?\n\n"),
      field("changes", "Changes since last review", "No new incidents reported since 22 August 2026. Client reports the other party has complied with the AVO."),
      text("\n\nACTIONS ARISING\n\n"),
      field("actions", "Actions arising", "1. Subpoena police records: to issue by 10 October.\n2. Confirm supervised contact centre availability before the listing."),
    ],
  },
  {
    key: "famsl.evatt_event_outcome",
    name: "Evatt List Event Outcome: Letter to Client",
    description: "Reports the outcome of an Evatt List mention, interim hearing or dispute resolution conference.",
    category: "Family Law",
    subcategory: "Specialist Lists",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter reporting the outcome of an Evatt List event: a specialist mention, interim hearing, or Evatt dispute resolution conference. State what was ordered or agreed, explain what it means practically for the client and the children with particular attention to safety and changeover arrangements, set out the next listing and what must happen before it, and restate the safety arrangements. Where an outcome is adverse or less protective than sought, address it honestly and explain what can be done. The event type is prompted so one precedent serves all the Evatt stages.",
    segments: [
      text("YOUR COURT DATE: OUTCOME\n\nEvent: "),
      field("event", "Event type and date", "Evatt List specialist mention, 14 October 2026"),
      text("\n\nWHAT WAS ORDERED\n\n"),
      field("orders", "Orders made or agreed", "1. Pending further order, the children live with you.\n2. The children spend time with the other party each Saturday from 10:00am to 4:00pm, supervised at the Parramatta Children's Contact Service.\n3. Neither party is to attend the other's residence.\n4. The Court has ordered the release of police records relating to the events of 12 June and 22 August 2026.\n5. A family report is to be prepared, with the report writer to be provided with the police material."),
      text("\n\nWHAT THIS MEANS\n\n"),
      field("practical_effect", "Practical effect, especially on safety", "The supervised arrangement means you will not have any direct contact with the other party at changeover: the contact service manages handover entirely. The order restraining attendance at your residence operates alongside your apprehended violence order and does not replace it."),
      text("\n\nNEXT LISTING\n\n"),
      field("next_listing", "Next listing and what must happen before it", "The matter is listed again on 9 December 2026. Before then: the contact service must be engaged (we will attend to the referral this week), and the family report interview will be scheduled. You will be contacted directly."),
      text("\n\nWHAT YOU NEED TO DO\n\n"),
      field("client_actions", "What the client must do", "1. Attend the contact service intake appointment when scheduled.\n2. Continue to record any contact, message or incident with the date and time.\n3. Report any breach of the apprehended violence order to police immediately, then tell us."),
      text("\n\nSAFETY\n\n"),
      field("safety", "Safety arrangements continuing", "Your video attendance arrangement continues for all future listings, and your address remains suppressed."),
      text("\n\nIf you are ever in immediate danger, call 000. 1800RESPECT (1800 737 732) operates 24 hours."),
    ],
  },

  // ── Critical Incident List ──────────────────────────────────────
  {
    key: "famsl.critical_incident_submission",
    name: "Critical Incident List: Submission to Court",
    description: "Applies for a matter to be allocated to the Critical Incident List for urgent listing.",
    category: "Family Law",
    subcategory: "Specialist Lists",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a submission to the Court seeking allocation to the Critical Incident List. This list exists where no parent is available to care for a child because of death (including homicide), critical injury, or incarceration arising from or relating to a family violence incident. Set out the incident factually and without emotive language, identify the children and their current care arrangements, identify the applicant and their relationship to the children, state the orders sought and why urgent listing is needed, and note any concurrent criminal or child protection proceedings. Be spare and factual: the facts carry the weight, and restraint is more effective than emphasis.",
    segments: [
      text("APPLICATION FOR ALLOCATION TO THE CRITICAL INCIDENT LIST\n\nFEDERAL CIRCUIT AND FAMILY COURT OF AUSTRALIA\nRegistry: "),
      field("registry", "Registry", "Sydney"),
      text("\n\nWe act for "),
      field("applicant", "Applicant and relationship to children", "Ms Helen Brown, the maternal grandmother of the children"),
      text(" and apply for this matter to be allocated to the Critical Incident List.\n\nTHE CHILDREN\n\n"),
      field("children", "The children", "Sam Citizen, born 12 May 2016 (aged 10)\nAva Citizen, born 3 August 2019 (aged 7)"),
      text("\n\nTHE INCIDENT\n\n"),
      field("incident", "The incident, factually stated", "On 14 September 2026 the children's mother died. The children's father has been charged in connection with her death and has been remanded in custody. Neither parent is available to care for the children."),
      text("\n\nCURRENT CARE ARRANGEMENTS\n\n"),
      field("current_care", "Current care arrangements", "Since 14 September 2026 the children have been in the care of the applicant, their maternal grandmother, at her home. The arrangement was made informally with the assistance of the NSW Police and has not been the subject of any order."),
      text("\n\nWHY URGENT ALLOCATION IS SOUGHT\n\n"),
      field("urgency", "Why urgency is required", "The applicant has no parental responsibility for the children and is unable to enrol them in school, consent to medical treatment, or access their Medicare or other records. The children are due to commence Term 4 on 6 October 2026."),
      text("\n\nORDERS SOUGHT\n\n"),
      field("orders_sought", "Orders sought", "1. That the applicant have parental responsibility for the children.\n2. That the children live with the applicant.\n3. That the applicant be authorised to enrol the children in school and to consent to medical treatment."),
      text("\n\nCONCURRENT PROCEEDINGS\n\n"),
      field("concurrent", "Concurrent criminal or child protection proceedings", "Criminal proceedings against the father are before the Local Court. The NSW Department of Communities and Justice is aware of the children's circumstances and has advised it does not presently propose to intervene."),
      text("\n\nWe are available to assist the Court with any further information required."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current eligibility criteria and application pathway for the Critical Incident List with the registry. Check whether the state child protection authority is involved or intends to intervene, as that may affect the appropriate forum.",
  },
  {
    key: "famsl.critical_incident_client_letter",
    name: "Critical Incident List: Letter to Client",
    description: "Explains the Critical Incident List to a bereaved or emergency carer.",
    category: "Family Law",
    subcategory: "Specialist Lists",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter to a client, usually a grandparent or other relative who has suddenly taken on the care of children after a death, critical injury or incarceration. The tone is everything: they are grieving and overwhelmed, and are receiving legal correspondence in the worst week of their life. Lead with acknowledgment, keep sentences short, explain what the Critical Incident List is and why it means faster access to the Court, set out plainly what orders are being sought and what those orders will practically allow them to do (enrol in school, consent to medical treatment), tell them what we need from them in a short and manageable list, and point them to support. Avoid legal jargon entirely where possible. Do not be effusive or presume to describe their feelings.",
    segments: [
      text("YOUR APPLICATION TO THE COURT\n\n"),
      field("opening", "Opening acknowledgment", "We are very sorry about the death of your daughter. We know this is an extremely difficult time, and we will keep what we ask of you to a minimum."),
      text("\n\nWHY WE ARE GOING TO COURT\n\nAt the moment you are caring for "),
      field("children", "The children", "Sam and Ava"),
      text(" but you have no legal authority to make decisions for them. That is why you cannot enrol them in school or consent to medical treatment.\n\nWe are applying to the Court to fix that.\n\nTHE CRITICAL INCIDENT LIST\n\nThe Court has a special list for exactly this situation: where a child has no parent available to care for them because of a death, a serious injury, or a parent being in custody.\n\nIt exists so that families in your position get before a judge quickly rather than waiting months.\n\n"),
      field("listing_expectation", "Expected timing", "We expect your matter to be listed within the next two to three weeks."),
      text("\n\nWHAT WE ARE ASKING THE COURT FOR\n\n"),
      field("orders_plain", "Orders sought, in plain terms", "1. That you have parental responsibility for the children: meaning you can make the decisions a parent would make.\n2. That the children live with you.\n3. That you can enrol them in school and consent to medical treatment."),
      text("\n\nWHAT WE NEED FROM YOU\n\nOnly these things for now:\n\n"),
      field("client_actions", "Short list of what is needed", "1. The children's birth certificates, if you can find them.\n2. The name and address of their school.\n3. Their Medicare numbers if you have them; if not, we can work around it."),
      text("\n\nIf you cannot find something, tell us and we will deal with it. Do not worry about it.\n\nSUPPORT\n\n"),
      field("support", "Support services", "Griefline (1300 845 745) and Lifeline (13 11 14) are both available if you would like to talk to someone. If the children need support, we can help you find a counsellor experienced with bereaved children."),
      text("\n\nWe will contact you as soon as we have a court date. If you have any question at all, however small, telephone us; you will not be bothering us."),
    ],
  },

  // ── Major Complex Financial Proceedings List ────────────────────
  {
    key: "famsl.mcfp_explanation",
    name: "Major Complex Financial Proceedings List: Letter to Client",
    description: "Explains the MCFP List and why the matter may be suitable for it.",
    category: "Family Law",
    subcategory: "Specialist Lists",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter explaining the Major Complex Financial Proceedings List to a client. Cover what the list is (specialist docket management for financial matters whose scale or complexity warrants it), the kinds of feature that make a matter suitable (large or structurally complex asset pools, corporate and trust structures, third party or intervener interests, international assets, valuation disputes, or novel legal issues), what allocation means practically (a docket judge managing the matter throughout, tighter and more tailored directions, and earlier identification of the real issues), and the costs reality: complex financial matters are expensive and the list is designed to manage that rather than eliminate it. Do not state eligibility thresholds as fixed figures.",
    segments: [
      text("THE MAJOR COMPLEX FINANCIAL PROCEEDINGS LIST\n\nWHAT IT IS\n\nThe Court operates a specialist list for financial matters whose scale or complexity means they benefit from dedicated management by a single judge throughout, rather than moving between registrars and judges at each stage.\n\nWHY YOUR MATTER MAY BE SUITABLE\n\n"),
      field("suitability", "Features making the matter suitable", "Your matter involves:\n1. A net pool with an estimated value in excess of $14 million.\n2. Interests held through three companies and two discretionary trusts, with the control of one trust in dispute.\n3. A commercial property portfolio requiring specialist valuation.\n4. An interest in a Singapore-registered entity, raising questions about the reach of any order.\n5. A likely application by your business partner to intervene."),
      text("\n\nWHAT ALLOCATION MEANS\n\n1. A docket judge manages the matter from allocation to hearing, so nothing has to be re-explained at each listing.\n2. Directions are tailored to the matter rather than standard.\n3. The real issues are identified earlier, which usually narrows what actually has to be tried.\n4. Expert evidence is managed actively, including the appointment of single experts where possible.\n\nWHAT IT DOES NOT MEAN\n\nAllocation does not mean the matter will be quick, and it does not mean it will be cheap.\n\n"),
      field("costs_reality", "Costs reality", "Matters of this complexity commonly cost well into six figures to run to hearing, and the expert evidence alone (business valuations, forensic accounting, and the trust control question) is likely to exceed $80,000. The list is designed to manage that cost by keeping the matter focused, not to remove it."),
      text("\n\nOUR RECOMMENDATION\n\n"),
      field("recommendation", "Recommendation", "We recommend we apply for allocation. The trust control issue in particular will benefit from consistent judicial management, and the alternative (explaining the structures afresh at each listing before a different registrar) is both slower and more expensive."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current criteria and application pathway for the Major Complex Financial Proceedings List with the registry, including whether allocation is sought by application or by request to the list team.",
  },
  {
    key: "famsl.mcfp_request_to_list_team",
    name: "Major Complex Financial Proceedings List: Request for Allocation",
    description: "Applies to the MCFP list team for the matter to be allocated to the list.",
    category: "Family Law",
    subcategory: "Specialist Lists",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a request to the Major Complex Financial Proceedings List team seeking allocation. Identify the proceedings and parties, set out the features relied on as making the matter suitable (pool size, structural complexity, third party interests, international elements, valuation and expert requirements, novel issues), state the anticipated hearing length and expert evidence, note whether the other party consents or opposes, and identify the directions sought if allocated. Be precise and evidence-based rather than assertive: a request that simply asserts complexity without particulars is unlikely to succeed.",
    segments: [
      text("REQUEST FOR ALLOCATION: MAJOR COMPLEX FINANCIAL PROCEEDINGS LIST\n\nFEDERAL CIRCUIT AND FAMILY COURT OF AUSTRALIA\nRegistry: "),
      field("registry", "Registry", "Sydney"),
      text("\nFile number: "),
      field("file_number", "File number", "SYC 1234 of 2026"),
      text("\nParties: "),
      field("parties", "Parties", "Jane Citizen (Applicant) and Alex Partner (Respondent)"),
      text("\n\nWe act for the "),
      field("party", "Party we act for", "Applicant"),
      text(" and request that this matter be allocated to the Major Complex Financial Proceedings List.\n\nFEATURES RELIED ON\n\n"),
      field("features", "Features making the matter suitable", "1. POOL. The net pool is estimated at $14.2 million, subject to valuation.\n\n2. STRUCTURES. Assets are held through Example Holdings Pty Ltd, Sample Investments Pty Ltd, Citizen Developments Pty Ltd, the Citizen Family Trust and the Partner Investment Trust. Control of the Citizen Family Trust is in dispute, the appointor having purported to change during the relationship.\n\n3. THIRD PARTY INTERESTS. Mr T Business, the Respondent's business partner, holds 40% of Example Holdings and has foreshadowed an application to intervene.\n\n4. INTERNATIONAL. The Respondent holds a 30% interest in a Singapore-registered entity. Questions arise as to the Court's practical reach over that interest.\n\n5. VALUATION. Three business valuations and a forensic accounting report addressing add-backs are required."),
      text("\n\nEXPERT EVIDENCE\n\n"),
      field("experts", "Expert evidence anticipated", "Single expert business valuer (three entities), single expert forensic accountant, and a commercial property valuer for the four investment properties."),
      text("\n\nESTIMATED HEARING LENGTH\n\n"),
      field("hearing_length", "Estimated hearing length", "5 to 7 days."),
      text("\n\nPOSITION OF THE OTHER PARTY\n\n"),
      field("other_party_position", "Other party's position", "The Respondent's solicitors have confirmed their client consents to the allocation."),
      text("\n\nDIRECTIONS SOUGHT IF ALLOCATED\n\n"),
      field("directions", "Directions sought", "1. That the parties confer and agree the identity of the single experts within 21 days.\n2. That the question of control of the Citizen Family Trust be determined as a separate question in advance of the substantive hearing.\n3. That Mr T Business be given notice and an opportunity to seek leave to intervene."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current allocation criteria and the correct pathway for requesting allocation with the registry before sending.",
  },
  {
    key: "famsl.mcfp_allocation_to_other_party",
    name: "MCFP Allocation: Letter to Other Party",
    description: "Notifies the other party of allocation and proposes how the matter should progress.",
    category: "Family Law",
    subcategory: "Specialist Lists",
    documentType: "letter",
    matterTypes: FAMILY,
    aiInstructions:
      "Draft a letter to the other party following allocation to the Major Complex Financial Proceedings List. Confirm the allocation and first listing, propose the practical steps to progress the matter efficiently: agreed single experts, an agreed chronology and statement of agreed facts, a proposed timetable, and identification of any separate question suitable for early determination, and invite agreement before the listing so directions can be made by consent. A cooperative approach genuinely saves both clients money in matters of this size, and the letter should say so.",
    segments: [
      text("ALLOCATION TO THE MAJOR COMPLEX FINANCIAL PROCEEDINGS LIST\n\nWe confirm the Court has allocated this matter to the Major Complex Financial Proceedings List, and that it is listed for a first directions hearing before "),
      field("judge_and_date", "Docket judge and first listing", "Justice Example on 3 December 2026"),
      text(".\n\nGiven the scale of this matter, we suggest the parties agree as much as possible in advance so that directions can be made by consent rather than argued. That will save both clients a considerable amount.\n\nWE PROPOSE\n\n1. SINGLE EXPERTS\n\n"),
      field("experts_proposal", "Single expert proposal", "That the parties jointly instruct single experts for the business valuations and the forensic accounting, rather than each retaining their own. We suggest the parties each nominate two candidates for each discipline by 12 November and agree from those lists."),
      text("\n\n2. AGREED FACTS AND CHRONOLOGY\n\n"),
      field("agreed_facts", "Agreed facts proposal", "That the parties prepare an agreed chronology and a statement of agreed facts covering the dates of cohabitation and separation, the incorporation and structure of each entity, and the acquisition dates and cost bases of the properties. Much of this is not in dispute and should not consume hearing time."),
      text("\n\n3. SEPARATE QUESTION\n\n"),
      field("separate_question", "Separate question proposal", "That the question of control of the Citizen Family Trust be determined as a separate question in advance. That issue substantially affects the size of the pool, and resolving it first may make the balance of the matter capable of negotiated resolution."),
      text("\n\n4. TIMETABLE\n\n"),
      field("timetable", "Proposed timetable", "Experts agreed by 21 November; joint letters of instruction by 5 December; expert reports by 27 February 2027; separate question heard in April 2027."),
      text("\n\n5. THIRD PARTY\n\n"),
      field("third_party", "Third party position", "We propose that Mr T Business be given notice of the proceedings and an opportunity to seek leave to intervene, so that the question of his interest is dealt with early rather than emerging at hearing."),
      text("\n\nPlease let us know your client's position by "),
      field("response_by", "Response by", "26 November 2026"),
      text(" so that agreed directions can be provided to the Court before the listing."),
    ],
  },
];
