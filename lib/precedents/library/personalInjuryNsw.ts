// lib/precedents/library/personalInjuryNsw.ts
// NSW personal injury: motor accidents, workers compensation and public
// liability.
//
// Heavily NSW-specific. Disputes in the first two schemes are determined by
// the Personal Injury Commission (PIC), established 1 March 2021 under the
// Personal Injury Commission Act 2020 (NSW), which absorbed the former
// Workers Compensation Commission and the motor accidents claims assessment
// service. It sits in two divisions: Motor Accidents and Workers
// Compensation.
//
// Motor accident claims are governed by the Motor Accidents Injuries Act
// 2017 (NSW) for accidents on or after 1 December 2017, and the Motor
// Accidents Compensation Act 1999 (NSW) for earlier ones -- which scheme
// applies turns on the accident date, so it is a fill-in field, never an
// assumption.
//
// Every other state runs a completely different pre-litigation regime (QLD
// PIPA/MAIA notices and compulsory conference, VIC serious-injury
// certificates under the Wrongs Act, and so on). Those are separate
// precedents, not placeholders in these.
//
// TIME LIMITS ARE THE WHOLE BALLGAME in this area and are the single most
// common source of negligence claims against practitioners. No limitation
// period below is stated as settled -- each carries a review note requiring
// verification and immediate diarising.
import { text, field, type PrecedentSeed } from "./types";

const PI = ["Litigation", "Other"];

export const PERSONAL_INJURY_NSW_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "pinsw.initial_advice_motor",
    name: "Initial Advice - Motor Accident (NSW)",
    description: "First advice to an injured person on the CTP scheme, statutory benefits and damages.",
    category: "Personal Injury",
    subcategory: "Motor Accident",
    documentType: "advice",
    jurisdictions: ["NSW"],
    matterTypes: PI,
    aiInstructions:
      "Draft initial advice to a person injured in a NSW motor accident. Explain the two limbs: statutory benefits (weekly payments and treatment expenses, largely no-fault, available regardless of who caused the accident but time-limited), and a common law damages claim (fault-based, and only available where the injury threshold is met). Explain that the applicable scheme depends on the accident date. Stress the urgency of lodging with the insurer. Explain the role of the Personal Injury Commission if a dispute arises. Do NOT state limitation periods, benefit durations or threshold percentages as settled figures -- confirm each against current legislation.",
    segments: [
      text("MOTOR ACCIDENT CLAIM - INITIAL ADVICE\n\nAccident date: "),
      field("accident_date", "Accident date", "14 June 2026"),
      text("\n\nWHICH SCHEME APPLIES\n\n"),
      field("scheme", "Applicable scheme", "As your accident occurred after 1 December 2017, your claim falls under the Motor Accidents Injuries Act 2017 (NSW)."),
      text("\n\nTHERE ARE TWO SEPARATE ENTITLEMENTS\n\n1. STATUTORY BENEFITS\n\nThese cover weekly income support and reasonable and necessary medical treatment. They are largely no-fault -- you can claim even if the accident was partly your own fault, though there are exceptions for serious offences and for wholly-at-fault drivers after an initial period.\n\nThese benefits are time-limited in duration, and continuing entitlement depends on the degree of your injury.\n\n2. COMMON LAW DAMAGES\n\nA damages claim is fault-based -- someone else must have been negligent -- and is only available if your injury meets the threshold set by the legislation. Damages can include past and future economic loss and, if the threshold is met, non-economic loss.\n\nYOUR POSITION\n\n"),
      field("position", "Assessment of the client's position", "Liability appears clear: the other driver failed to give way at a roundabout and was issued an infringement. Your injuries include a cervical spine injury and an ongoing shoulder impairment which may meet the threshold, though that will require medical assessment."),
      text("\n\nURGENT - LODGING YOUR CLAIM\n\nYou must lodge a claim with the at-fault vehicle's CTP insurer promptly. Late lodgement can reduce or defeat your entitlement and requires a full and satisfactory explanation.\n\n"),
      field("lodgement_status", "Lodgement status", "We will lodge your claim this week. Please provide the police event number and the other vehicle's registration."),
      text("\n\nIF THERE IS A DISPUTE\n\nDisputes about statutory benefits, treatment approval or the degree of impairment are determined by the Personal Injury Commission, not the courts.\n\nWHAT WE NEED FROM YOU\n\n"),
      field("client_actions", "What the client should do", "1. See your GP and make sure every symptom is recorded -- gaps in the medical record are used against claimants later.\n2. Keep all receipts for treatment, medication and travel.\n3. Do not give a recorded statement to any insurer before speaking to us."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the claim lodgement deadline, statutory benefit durations and the damages threshold against the current Motor Accidents Injuries Act 2017 (NSW) and diarise every date immediately. These provisions have been amended.",
  },
  {
    key: "pinsw.claim_to_ctp_insurer",
    name: "Claim Notification to CTP Insurer (NSW)",
    description: "Lodges the personal injury claim with the CTP insurer.",
    category: "Personal Injury",
    subcategory: "Motor Accident",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: PI,
    aiInstructions:
      "Draft a claim notification letter to a CTP insurer. Include the accident date, time and location, the vehicles and drivers involved, the police event number, a short factual account of how the accident happened, the injuries sustained, treatment to date, and the claimant's employment and income position. Enclose the completed claim form and any medical certificates. Ask the insurer to confirm receipt, acceptance of provisional liability and the commencement of weekly payments.",
    segments: [
      text("PERSONAL INJURY CLAIM - MOTOR ACCIDENT\n\nWe act for "),
      field("client_name", "Our client", "Jane Citizen"),
      text(", who was injured in a motor accident.\n\nACCIDENT DETAILS\n\nDate and time: "),
      field("accident_datetime", "Date and time", "14 June 2026 at approximately 8:15am"),
      text("\nLocation: "),
      field("location", "Location", "Roundabout at the intersection of Example Road and Sample Street, Parramatta NSW"),
      text("\nPolice event number: "),
      field("police_event", "Police event number", "E123456789"),
      text("\n\nInsured vehicle: "),
      field("insured_vehicle", "Insured vehicle and driver", "Registration ABC123, driven by Mr John Driver"),
      text("\nOur client's vehicle: "),
      field("client_vehicle", "Our client's vehicle", "Registration XYZ789"),
      text("\n\nHOW THE ACCIDENT HAPPENED\n\n"),
      field("circumstances", "Circumstances", "Our client was travelling through the roundabout when your insured entered from the left without giving way and struck the front left of our client's vehicle. Your insured was issued with an infringement notice for failing to give way."),
      text("\n\nINJURIES\n\n"),
      field("injuries", "Injuries sustained", "Cervical spine soft tissue injury, left shoulder injury with ongoing restricted range of movement, and associated headaches and sleep disturbance."),
      text("\n\nTREATMENT TO DATE\n\n"),
      field("treatment", "Treatment to date", "Attended Westmead Hospital Emergency on the day of the accident. Since reviewed by her GP on four occasions and has commenced physiotherapy."),
      text("\n\nEMPLOYMENT AND INCOME\n\n"),
      field("employment", "Employment and income", "Our client is employed full time as a registered nurse earning approximately $1,750 net per week. She has been unfit for work since the accident."),
      text("\n\nWe enclose the completed claim form and medical certificates.\n\nPlease confirm receipt, your position on liability, and when weekly payments will commence."),
    ],
  },
  {
    key: "pinsw.workers_comp_notification",
    name: "Workers Compensation Claim Notification (NSW)",
    description: "Notifies the employer and insurer of a workplace injury claim.",
    category: "Personal Injury",
    subcategory: "Workers Compensation",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: PI,
    aiInstructions:
      "Draft a workers compensation claim notification. Include the worker's details, employer, date and mechanism of injury, whether it was reported and to whom, the injuries, current work capacity, and pre-injury average weekly earnings if known. Enclose the certificate of capacity. Ask the insurer to confirm liability and commence weekly payments, and to nominate a case manager. Note that disputes go to the Personal Injury Commission.",
    segments: [
      text("WORKERS COMPENSATION CLAIM\n\nWe act for "),
      field("client_name", "Our client", "Jane Citizen"),
      text(".\n\nWorker: "),
      field("worker_details", "Worker details", "Jane Citizen, date of birth 4 April 1988, of 5 Sample Road, Parramatta NSW 2150"),
      text("\nEmployer: "),
      field("employer", "Employer", "Example Logistics Pty Ltd, 40 Industrial Drive, Wetherill Park NSW 2164"),
      text("\nDate of injury: "),
      field("injury_date", "Date of injury", "2 June 2026"),
      text("\n\nHOW THE INJURY OCCURRED\n\n"),
      field("mechanism", "Mechanism of injury", "Our client was lifting a 28kg carton from a pallet at floor level when she felt immediate sharp pain in her lower back. The task was performed without mechanical aid and without assistance."),
      text("\n\nREPORTING\n\n"),
      field("reporting", "How and when reported", "The injury was reported to her supervisor, Mr Sam Foreman, on the same day and recorded in the site register."),
      text("\n\nINJURIES\n\n"),
      field("injuries", "Injuries", "Lumbar spine injury with radicular symptoms into the left leg."),
      text("\n\nCURRENT CAPACITY\n\n"),
      field("capacity", "Current work capacity", "Our client is certified fit for suitable duties with a 10kg lifting restriction and no repetitive bending. Her employer has not offered suitable duties to date."),
      text("\n\nEARNINGS\n\n"),
      field("earnings", "Pre-injury average weekly earnings", "Pre-injury average weekly earnings of approximately $1,420 gross, including regular overtime and shift allowances, which must be included in the calculation."),
      text("\n\nWe enclose the certificate of capacity.\n\nPlease confirm liability, commence weekly payments, and nominate a case manager. If liability is disputed we will refer the matter to the Personal Injury Commission."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current claim notification deadline and the definition of pre-injury average weekly earnings under NSW workers compensation legislation -- both affect entitlement and have been amended.",
  },
  {
    key: "pinsw.request_medical_records",
    name: "Request for Medical Records",
    description: "Requests clinical records from a treating practitioner or hospital.",
    category: "Personal Injury",
    subcategory: "Evidence",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: PI,
    aiInstructions:
      "Draft a request for clinical records from a treating doctor or hospital. Enclose the client's signed authority, identify the patient and the relevant period, specify what is sought (clinical notes, imaging and reports, referrals, correspondence, and prescribing records), and ask for an itemised account. Ask for records covering a period before the injury as well, since the other side will obtain them and prior history is better known early than discovered at hearing.",
    segments: [
      text("REQUEST FOR MEDICAL RECORDS\n\nPatient: "),
      field("patient", "Patient", "Jane Citizen, date of birth 4 April 1988"),
      text("\nAddress: "),
      field("patient_address", "Patient address", "5 Sample Road, Parramatta NSW 2150"),
      text("\n\nWe act for the above patient and enclose her signed authority.\n\nPlease provide copies of all records relating to her, for the period "),
      field("period", "Period of records sought", "1 January 2021 to date"),
      text(", including:\n\n1. all clinical notes and consultation records;\n2. all imaging and radiology reports;\n3. all specialist referrals and reports received;\n4. all correspondence relating to the patient;\n5. prescribing and medication records;\n6. any certificates of capacity or medical certificates issued.\n\n"),
      field("specific_request", "Any specific request", "We are particularly interested in any records relating to prior lower back complaints."),
      text("\n\nPlease provide your itemised account with the records and we will attend to payment promptly."),
    ],
  },
  {
    key: "pinsw.medico_legal_report_request",
    name: "Medico-Legal Report Request",
    description: "Briefs an independent medical expert to provide a medico-legal report.",
    category: "Personal Injury",
    subcategory: "Evidence",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: PI,
    aiInstructions:
      "Draft a letter briefing a medical specialist for a medico-legal report. Set out the client's details, the accident or injury circumstances, the injuries claimed, the treatment history, and the specific questions the expert is asked to address (diagnosis, causation, treatment reasonableness, capacity for work, permanence, and whole person impairment where relevant). Enclose an index of the materials provided. Ask about fees and timeframe. Emphasise the expert's overriding duty is to the Court, not to the party paying -- an expert steered toward a conclusion is worthless.",
    segments: [
      text("REQUEST FOR MEDICO-LEGAL REPORT\n\nPatient: "),
      field("patient", "Patient", "Jane Citizen, date of birth 4 April 1988"),
      text("\n\nWe act for the above and would be grateful for your report.\n\nBACKGROUND\n\n"),
      field("background", "Injury circumstances", "Our client was injured in a motor accident on 14 June 2026 when the vehicle she was driving was struck by another vehicle failing to give way at a roundabout."),
      text("\n\nINJURIES CLAIMED\n\n"),
      field("injuries", "Injuries claimed", "Cervical spine injury, left shoulder injury with restricted range of movement, headaches and sleep disturbance."),
      text("\n\nTREATMENT HISTORY\n\n"),
      field("treatment_history", "Treatment history", "Emergency department attendance on the day, four GP consultations, 12 physiotherapy sessions, and an MRI of the cervical spine on 2 August 2026."),
      text("\n\nQUESTIONS FOR YOUR OPINION\n\nWe would be grateful for your opinion on:\n\n1. The diagnosis of each injury.\n2. Whether each injury was caused by the accident described, and if you consider any condition pre-existing or degenerative, the extent to which the accident aggravated it.\n3. Whether the treatment received has been reasonable and necessary.\n4. Our client's current and likely future capacity for work, including any restrictions.\n5. Whether the injuries are permanent and whether further treatment is likely to assist.\n\n"),
      field("additional_questions", "Additional questions", "6. Your assessment of whole person impairment, and whether the threshold for non-economic loss is met."),
      text("\n\nMATERIALS ENCLOSED\n\n"),
      field("materials", "Index of materials", "1. GP clinical records\n2. Westmead Hospital records\n3. MRI cervical spine report dated 2 August 2026\n4. Physiotherapy records\n5. Certificates of capacity"),
      text("\n\nWe remind you that your overriding duty is to assist the Court impartially, and that your opinion should not be influenced by the party requesting the report.\n\nPlease confirm your fee and the timeframe for your report."),
    ],
  },
  {
    key: "pinsw.limitation_warning_to_client",
    name: "Limitation Period Warning to Client",
    description: "Puts the client on clear written notice of an approaching limitation deadline.",
    category: "Personal Injury",
    subcategory: "Risk",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: PI,
    aiInstructions:
      "Draft a letter warning the client of an approaching limitation period. State the date the period expires, what must be done before it, what happens if it is missed (the claim is generally lost entirely and an extension requires the Court's permission which is not readily given), and what instructions are needed and by when. This letter protects both the client and the firm -- it must be unambiguous, and it should be sent well before the deadline, not on its eve.",
    segments: [
      text("URGENT - LIMITATION PERIOD\n\nWe write to put you on clear notice of a deadline affecting your claim.\n\nYOUR LIMITATION PERIOD EXPIRES ON: "),
      field("expiry_date", "Limitation expiry date", "14 June 2029"),
      text("\n\nWHAT THIS MEANS\n\nIf proceedings are not commenced before that date, your claim will in most circumstances be lost entirely, no matter how strong it is. An extension requires the Court's permission, which is not readily granted.\n\nWHAT MUST HAPPEN BEFORE THEN\n\n"),
      field("required_steps", "Steps required before expiry", "1. Completion of the medico-legal assessment.\n2. Resolution of the statutory benefits dispute currently before the Personal Injury Commission.\n3. Your instructions to commence proceedings."),
      text("\n\nWHAT WE NEED FROM YOU\n\n"),
      field("instructions_needed", "Instructions needed and by when", "Please confirm your instructions to commence proceedings by 14 March 2029 at the latest, so that we have adequate time to prepare and file."),
      text("\n\nIf we do not receive your instructions in time, we may be unable to protect your position.\n\nPlease telephone us to discuss if anything about this letter is unclear."),
    ],
    requiresReview: true,
    reviewNote:
      "Verify the applicable limitation period for this specific claim type and accident date before stating any expiry date. Diarise it with multiple reminders. Missed limitation periods are the most common source of negligence claims in this area.",
  },
  {
    key: "pinsw.pic_application_cover",
    name: "Personal Injury Commission Application (covering letter)",
    description: "Covers an application to the PIC to resolve a benefits or liability dispute.",
    category: "Personal Injury",
    subcategory: "Dispute Resolution",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: PI,
    aiInstructions:
      "Draft a covering letter for an application to the Personal Injury Commission. Identify the division (Motor Accidents or Workers Compensation), the nature of the dispute, the decision under challenge and its date, the outcome sought, and list the documents lodged. Keep it administrative and precise -- the substance belongs in the application and supporting statements.",
    segments: [
      text("APPLICATION TO THE PERSONAL INJURY COMMISSION\n\nDivision: "),
      field("division", "Division", "Motor Accidents Division"),
      text("\nClaimant: "),
      field("claimant", "Claimant", "Jane Citizen"),
      text("\nInsurer: "),
      field("insurer", "Insurer / respondent", "Example Insurance Limited"),
      text("\nClaim number: "),
      field("claim_number", "Claim number", "CTP-2026-004512"),
      text("\n\nWe lodge an application for resolution of the following dispute:\n\nNATURE OF DISPUTE\n\n"),
      field("dispute", "Nature of the dispute", "The insurer's denial of liability for ongoing weekly statutory benefits beyond 26 weeks, and its refusal to approve further physiotherapy as reasonable and necessary treatment."),
      text("\n\nDECISION UNDER CHALLENGE\n\n"),
      field("decision", "Decision and date", "Internal review decision dated 18 September 2026 affirming the original denial."),
      text("\n\nOUTCOME SOUGHT\n\n"),
      field("outcome_sought", "Outcome sought", "A determination that the claimant remains entitled to weekly statutory benefits, and that the proposed course of 12 physiotherapy sessions is reasonable and necessary treatment."),
      text("\n\nDOCUMENTS LODGED\n\n"),
      field("documents", "Documents lodged", "1. Application form\n2. Claimant's statement\n3. Certificates of capacity\n4. GP clinical records\n5. MRI report dated 2 August 2026\n6. Internal review decision dated 18 September 2026"),
    ],
    requiresReview: true,
    reviewNote:
      "PIC application forms, lodgement pathways and time limits for disputing an internal review differ between the Motor Accidents and Workers Compensation Divisions. Verify the correct current form and deadline.",
  },
];
