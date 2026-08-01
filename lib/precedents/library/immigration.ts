// lib/precedents/library/immigration.ts
// Immigration and citizenship under the Migration Act 1958 (Cth) and
// Migration Regulations 1994 (Cth).
//
// Federal, so jurisdiction-neutral -- no `jurisdictions` on any precedent
// here. Merits review of most visa decisions sits with the Administrative
// Review Tribunal (ART), which replaced the Administrative Appeals Tribunal
// in October 2024.
//
// This is the fastest-moving area in the library: visa subclasses,
// occupation lists, points tests, thresholds and review pathways change
// frequently, and a precedent that names a specific subclass requirement is
// wrong within a year. Everything below therefore prompts for the specific
// criteria as fill-in fields rather than stating them, and review notes
// direct verification against current Department policy.
import { text, field, type PrecedentSeed } from "./types";

const MIGRATION = ["Migration"];

export const IMMIGRATION_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "mig.initial_advice_visa",
    name: "Initial Visa Advice",
    description: "First advice on visa options, eligibility and the realistic prospects.",
    category: "Immigration",
    subcategory: "Visa Applications",
    documentType: "advice",
    matterTypes: MIGRATION,
    aiInstructions:
      "Draft initial visa advice. Identify the client's current status and any visa expiry, the visa options realistically open to them, the key criteria for the recommended option, the evidence required, likely processing times, and the risks (including refusal consequences, any exclusion period, and the effect on status of applying while onshore or offshore). Be candid about prospects. Do not state specific points-test scores, occupation list contents or processing times as settled facts -- these change constantly and must be confirmed.",
    segments: [
      text("VISA ADVICE\n\nCLIENT'S CURRENT POSITION\n\n"),
      field("current_status", "Current visa status", "You currently hold a subclass 500 Student visa expiring 15 March 2027. You have completed a Master of Information Technology and are working 20 hours per week."),
      text("\n\nOPTIONS AVAILABLE\n\n"),
      field("options", "Visa options", "1. Subclass 485 Temporary Graduate visa - available on the strength of your recent qualification, providing full work rights for a limited period.\n2. Employer-sponsored options, if your current employer is willing and able to sponsor.\n3. Skilled independent or state-nominated pathways, subject to the points test and your occupation's status."),
      text("\n\nOUR RECOMMENDATION\n\n"),
      field("recommendation", "Recommended pathway", "We recommend applying for the subclass 485 first. It secures your work rights and buys time to pursue a permanent pathway without the pressure of an expiring student visa."),
      text("\n\nKEY CRITERIA YOU MUST MEET\n\n"),
      field("criteria", "Key criteria", "1. Hold an eligible qualification obtained in Australia.\n2. Meet the English language requirement.\n3. Hold adequate health insurance.\n4. Meet health and character requirements.\n5. Apply within the required period after completing your course."),
      text("\n\nEVIDENCE REQUIRED\n\n"),
      field("evidence", "Evidence required", "Completion letter and academic transcript, English test results, health insurance policy, passport, and police certificates for any country where you have lived 12 months or more in the last 10 years."),
      text("\n\nRISKS YOU SHOULD UNDERSTAND\n\n"),
      field("risks", "Risks", "If an application is refused while you are onshore, you may face restrictions on making a further application onshore, and in some circumstances an exclusion period. It is important the application is complete and correct at lodgement rather than corrected later."),
      text("\n\nPROCESSING\n\nProcessing times vary considerably and are published by the Department. We will confirm the current indicative time when we lodge.\n\nPlease note that immigration law and policy change frequently. This advice reflects the position as at the date of this letter."),
    ],
    requiresReview: true,
    reviewNote:
      "Visa criteria, occupation lists, points thresholds and post-study work periods change frequently. Verify every criterion against current Department of Home Affairs policy before lodging.",
  },
  {
    key: "mig.document_checklist",
    name: "Visa Application Document Checklist",
    description: "Requests the documents needed to lodge a visa application.",
    category: "Immigration",
    subcategory: "Visa Applications",
    documentType: "letter",
    matterTypes: MIGRATION,
    aiInstructions:
      "Draft a document request for a visa application. List documents by category: identity, relationship (where relevant), qualifications and skills, English language, health and character, and financial capacity. Explain the certification and translation requirements (translations by an accredited translator). Give a deadline and explain that incomplete applications risk refusal rather than a request for more information.",
    segments: [
      text("DOCUMENTS REQUIRED FOR YOUR VISA APPLICATION\n\nVisa: "),
      field("visa", "Visa applied for", "Subclass 485 Temporary Graduate visa"),
      text("\n\nPlease provide the following.\n\nIDENTITY\n\n1. Certified copy of your passport (all pages with entries).\n2. Birth certificate.\n3. Any change of name documents.\n\nQUALIFICATIONS\n\n"),
      field("qualifications", "Qualification documents", "4. Completion letter from your university.\n5. Full academic transcript.\n6. Testamur (degree certificate)."),
      text("\n\nENGLISH\n\n"),
      field("english", "English evidence", "7. IELTS, PTE or equivalent test results, taken within the validity period."),
      text("\n\nHEALTH AND CHARACTER\n\n8. Police certificates for every country in which you have lived for 12 months or more in the last 10 years.\n9. We will arrange your health examination and provide the referral.\n\n"),
      field("additional", "Additional documents", "10. Evidence of adequate health insurance covering the full visa period."),
      text("\n\nCERTIFICATION AND TRANSLATION\n\nCopies must be certified. Any document not in English must be accompanied by a translation prepared by an accredited translator -- a translation by a friend or relative will not be accepted.\n\nPLEASE PROVIDE BY: "),
      field("deadline", "Deadline", "20 October 2026"),
      text("\n\nA word of caution: an incomplete application may simply be refused rather than held while further documents are sought. It is far better to lodge complete."),
    ],
  },
  {
    key: "mig.art_review_application_cover",
    name: "ART Review Application (covering letter)",
    description: "Covers an application to the Administrative Review Tribunal against a visa decision.",
    category: "Immigration",
    subcategory: "Review",
    documentType: "letter",
    matterTypes: MIGRATION,
    aiInstructions:
      "Draft a covering letter for an application to the Administrative Review Tribunal for review of a visa decision. Identify the decision, its date, the applicant, the visa in question, and the grounds on which review is sought. Note that the application is made within the prescribed period. List documents lodged. Warn that ART time limits are strict and generally cannot be extended.",
    segments: [
      text("APPLICATION FOR REVIEW - ADMINISTRATIVE REVIEW TRIBUNAL\n\nApplicant: "),
      field("applicant", "Applicant", "Priya Sharma"),
      text("\nVisa: "),
      field("visa", "Visa", "Subclass 485 Temporary Graduate visa"),
      text("\nDecision under review: "),
      field("decision", "Decision and date", "Decision of a delegate of the Minister dated 2 October 2026 refusing the application"),
      text("\nDepartment file reference: "),
      field("file_reference", "File reference", "TRN 1234567890"),
      text("\n\nGROUNDS FOR REVIEW\n\n"),
      field("grounds", "Grounds for review", "The delegate found the applicant did not meet the English language requirement, having overlooked the PTE Academic result lodged with the application on 14 July 2026. That result satisfies the requirement. The decision proceeded on a factual error apparent on the face of the Department's own file."),
      text("\n\nThis application is lodged within the prescribed period for review.\n\nDOCUMENTS LODGED\n\n"),
      field("documents", "Documents lodged", "1. Application for review\n2. Copy of the decision record\n3. PTE Academic result dated 14 July 2026 with confirmation of lodgement\n4. Copy of the original visa application"),
      text("\n\nWe request that the Tribunal set aside the decision and substitute a decision granting the visa."),
    ],
    requiresReview: true,
    reviewNote:
      "ART review periods are strict, differ by decision type, and generally cannot be extended. Confirm the applicable deadline and that the decision is reviewable before lodging.",
  },
  {
    key: "mig.s56_request_response",
    name: "Response to Request for Further Information",
    description: "Responds to a departmental request for further information or comment.",
    category: "Immigration",
    subcategory: "Visa Applications",
    documentType: "letter",
    matterTypes: MIGRATION,
    aiInstructions:
      "Draft a response to a departmental request for further information. Address each matter raised specifically and in order, provide the documents sought, and where an adverse inference has been foreshadowed, respond to it directly with evidence rather than assertion. Confirm the response is within the period allowed. These requests are often the last opportunity to save an application -- the response must be complete.",
    segments: [
      text("RESPONSE TO REQUEST FOR INFORMATION\n\nApplicant: "),
      field("applicant", "Applicant", "Priya Sharma"),
      text("\nTRN: "),
      field("trn", "TRN", "1234567890"),
      text("\nYour request dated: "),
      field("request_date", "Request date", "12 September 2026"),
      text("\n\nWe respond to each matter raised.\n\n"),
      field("responses", "Response to each matter", "1. ENGLISH LANGUAGE EVIDENCE\n\nThe applicant's PTE Academic result, achieved on 14 July 2026, is enclosed. It shows an overall score of 65 with no band below 65, satisfying the requirement.\n\n2. HEALTH INSURANCE\n\nEnclosed is a certificate of currency for Overseas Student Health Cover held with Example Health, covering the applicant from 1 August 2026 to 1 August 2028.\n\n3. CONCERN AS TO COURSE COMPLETION DATE\n\nThe Department has indicated a concern that the applicant's course completion date falls outside the required period. The completion letter enclosed confirms the course was completed on 28 June 2026, which is within the period. The earlier date on the transcript reflects the final examination date, not the date of completion."),
      text("\n\nThis response is provided within the period allowed.\n\nWe would be grateful if the application could now proceed to decision. If any further concern remains, we ask to be given the opportunity to address it before a decision is made."),
    ],
  },
  {
    key: "mig.sponsor_obligations_advice",
    name: "Sponsorship Obligations Advice",
    description: "Advises an approved business sponsor of its ongoing obligations.",
    category: "Immigration",
    subcategory: "Sponsorship",
    documentType: "advice",
    matterTypes: MIGRATION,
    aiInstructions:
      "Draft advice to a business sponsor on its sponsorship obligations: paying the sponsored worker at least the agreed rate and at market rates, ensuring the worker works only in the nominated occupation, keeping prescribed records, notifying the Department of prescribed events within the required period, cooperating with inspectors, and not recovering sponsorship costs from the worker. Explain the consequences of breach -- bars, civil penalties and cancellation of sponsorship. Be direct: sponsor monitoring is active and breaches are commonly detected through routine data matching.",
    segments: [
      text("YOUR OBLIGATIONS AS AN APPROVED SPONSOR\n\nSponsor: "),
      field("sponsor", "Sponsor", "Example Logistics Pty Ltd"),
      text("\n\nApproval as a sponsor carries continuing legal obligations. The principal ones are set out below.\n\n1. PAY THE AGREED RATE\n\nYou must pay the sponsored worker at least the salary specified in the nomination, and at least the market rate for the position. You cannot reduce the salary, or move the worker to part-time, without addressing the nomination.\n\n2. NOMINATED OCCUPATION ONLY\n\nThe worker must work in the occupation nominated. Using a sponsored worker in a different role, even a more senior one, is a breach.\n\n3. KEEP RECORDS\n\nYou must keep prescribed records, including of the worker's duties, pay and hours, in a form that can be produced to the Department.\n\n4. NOTIFY CHANGES\n\nYou must notify the Department of prescribed events within the required period -- including if the worker's employment ends, their duties change, or your business changes ownership or ceases trading.\n\n5. DO NOT PASS ON COSTS\n\nYou must not recover from the worker any cost of sponsorship or nomination. This includes indirect recovery through deductions or reduced pay. This is one of the most commonly breached obligations and one of the most heavily penalised.\n\n6. COOPERATE WITH INSPECTORS\n\n"),
      field("specific_obligations", "Any obligations specific to this sponsor", "As you sponsor multiple workers, we recommend a single register recording each worker's nominated occupation, salary and key dates."),
      text("\n\nIF YOU BREACH\n\nConsequences include being barred from sponsoring further workers, civil penalties, cancellation of existing sponsorships, and publication of the breach. Departmental monitoring is active and breaches are frequently identified through data matching with the ATO and Services Australia.\n\nPlease contact us before making any change to a sponsored worker's role, pay or hours."),
    ],
    requiresReview: true,
    reviewNote:
      "Sponsorship obligations and notification periods are set by the Migration Regulations and are amended periodically. Confirm the current obligations and notifiable events before advising.",
  },
];
