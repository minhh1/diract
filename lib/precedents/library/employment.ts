// lib/precedents/library/employment.ts
// Employment law: contracts, performance management, termination, redundancy
// and post-employment restraints.
//
// Almost entirely federal and therefore jurisdiction-neutral -- the Fair Work
// Act 2009 (Cth) covers national system employers, which is most private
// sector employers in every state. Modern awards, the National Employment
// Standards, unfair dismissal and general protections all sit there.
//
// The exceptions worth knowing: long service leave remains state-based, with
// different qualifying periods and accrual rates in each state; and
// work health and safety, while harmonised in most jurisdictions, is
// separately enacted in each. Those precedents prompt for the applicable
// state rather than assuming one.
import { text, field, type PrecedentSeed } from "./types";

const EMPLOYMENT = ["Commercial", "Other"];

export const EMPLOYMENT_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "emp.employment_contract_advice",
    name: "Employment Contract: Advice to Employer",
    description: "Advises an employer on the key terms of an employment contract and award coverage.",
    category: "Commercial",
    subcategory: "Employment",
    documentType: "advice",
    matterTypes: EMPLOYMENT,
    aiInstructions:
      "Draft advice to an employer on an employment contract. Cover: whether a modern award applies and the consequences if it does (minimum rates, penalties, allowances, and that a contract cannot undercut the award); the National Employment Standards as a floor that cannot be contracted out of; the probation period and how it interacts with the unfair dismissal minimum employment period; whether the role is genuinely full-time, part-time or casual and the risk of misclassification; annualised salary arrangements and the need to reconcile them against award entitlements; confidentiality and IP assignment; and post-employment restraints and their enforceability. Flag that set-off clauses must be drafted carefully to be effective.",
    segments: [
      text("EMPLOYMENT CONTRACT: ADVICE\n\nPosition: "),
      field("position", "Position", "Operations Manager"),
      text("\nEmployee: "),
      field("employee", "Employee", "Sam Taylor"),
      text("\n\nAWARD COVERAGE\n\n"),
      field("award", "Award coverage", "In our view this role is covered by the Clerks: Private Sector Award 2020 at Level 5. Award coverage turns on the duties actually performed, not the job title, so it should be reviewed if the role changes materially."),
      text("\n\nIf an award applies, the contract cannot provide less than the award on any term. An annualised salary can absorb award entitlements, but only if the contract says so clearly and the salary is in fact sufficient: you should reconcile annually and keep the records.\n\nMINIMUM ENTITLEMENTS\n\nThe National Employment Standards apply regardless of what the contract says. They cannot be contracted out of, and an attempt to do so is simply void.\n\nPROBATION\n\n"),
      field("probation", "Probation period", "A 6 month probation period is proposed."),
      text("\n\nNote that probation is a contractual concept, not a statutory one. What actually protects you is the minimum employment period before an employee can bring an unfair dismissal claim: 6 months, or 12 months for a small business employer. Align the probation period with that, not with some other figure.\n\nCLASSIFICATION\n\n"),
      field("classification", "Employment type", "Full-time, ongoing."),
      text("\n\nMisclassifying an employee as a casual or a contractor when the substance of the relationship is otherwise creates real exposure: back-payment of leave, superannuation and potentially penalties.\n\nCONFIDENTIALITY AND IP\n\n"),
      field("confidentiality_ip", "Confidentiality and IP terms", "The contract includes confidentiality obligations continuing after employment, and assignment of intellectual property created in the course of employment. Given this role involves developing internal systems, the IP clause should be express rather than left to the default position."),
      text("\n\nRESTRAINTS\n\n"),
      field("restraints", "Restraint provisions", "A 6 month non-solicitation of clients and staff, and a 3 month non-compete within 20km. Restraints are enforceable only so far as reasonably necessary to protect a legitimate business interest. We have drafted them as cascading periods and areas so that if the widest is struck down, a narrower one survives."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm current award coverage and classification against the applicable modern award, and check the current minimum employment period and high income threshold before relying on them.",
  },
  {
    key: "emp.performance_warning",
    name: "Performance Warning Letter",
    description: "Formal written warning documenting performance concerns and required improvement.",
    category: "Commercial",
    subcategory: "Employment",
    documentType: "letter",
    matterTypes: EMPLOYMENT,
    aiInstructions:
      "Draft a formal performance warning letter. It must: identify the specific performance concerns with dates and examples (not vague generalities); refer to any earlier discussions; state clearly what improvement is required and by when; identify the support or training being provided; state the consequence of failure to improve, including that termination may result; and record that the employee was given an opportunity to respond and had the right to a support person. This letter is the evidence in any later unfair dismissal claim: specificity is what makes a subsequent dismissal defensible.",
    segments: [
      text("FORMAL WARNING\n\nEmployee: "),
      field("employee", "Employee", "Sam Taylor"),
      text("\nPosition: "),
      field("position", "Position", "Operations Manager"),
      text("\nDate: "),
      field("date", "Date", "20 September 2026"),
      text("\n\nThis letter confirms the outcome of our meeting on "),
      field("meeting_date", "Meeting date", "18 September 2026"),
      text(", at which "),
      field("support_person", "Support person", "you were offered the opportunity to bring a support person and chose to attend alone"),
      text(".\n\nTHE CONCERNS\n\n"),
      field("concerns", "Specific concerns with dates and examples", "1. On 4 September 2026 the monthly stock reconciliation was not completed by the due date, and was ultimately submitted on 11 September, seven days late. This is the third consecutive month in which the reconciliation has been late.\n\n2. On 12 September 2026 three customer orders were dispatched to incorrect addresses because delivery details were not checked against the order records, resulting in $1,840 of re-delivery costs."),
      text("\n\nYOUR RESPONSE\n\n"),
      field("employee_response", "Employee's response", "You said that the reconciliation delays were caused by the new inventory system and that you had not received adequate training on it. You accepted responsibility for the dispatch errors."),
      text("\n\nWHAT IS REQUIRED\n\n"),
      field("required_improvement", "Required improvement and timeframe", "1. The monthly stock reconciliation must be completed by the last business day of each month, commencing with the October reconciliation.\n2. All dispatch details must be checked against order records before dispatch, with zero address errors."),
      text("\n\nSUPPORT WE WILL PROVIDE\n\n"),
      field("support", "Support and training offered", "We will arrange a half-day training session on the inventory system with the vendor before 30 September, and Priya Nair will review your first reconciliation with you."),
      text("\n\nREVIEW\n\nWe will review your performance on "),
      field("review_date", "Review date", "3 November 2026"),
      text(".\n\nCONSEQUENCE\n\nIf the required improvement is not achieved and sustained, further disciplinary action may follow, which may include termination of your employment.\n\nPlease sign and return the attached acknowledgement. Signing acknowledges receipt only, not agreement with the contents. If you wish to provide a written response it will be placed on your file."),
    ],
  },
  {
    key: "emp.termination_letter",
    name: "Termination of Employment Letter",
    description: "Terminates employment, setting out the reason, notice and final payments.",
    category: "Commercial",
    subcategory: "Employment",
    documentType: "letter",
    matterTypes: EMPLOYMENT,
    aiInstructions:
      "Draft a termination of employment letter. State the reason for termination clearly and consistently with what was put to the employee, the effective date, whether notice is worked or paid in lieu, and itemise the final payment (wages to termination, accrued annual leave, any long service leave, notice in lieu, and superannuation). Confirm return of company property and remind the employee of continuing obligations of confidentiality and any restraint. Keep the tone neutral and factual: this letter will be scrutinised if a claim follows, and any inconsistency between the reason given here and the reason given earlier is damaging.",
    segments: [
      text("TERMINATION OF EMPLOYMENT\n\nEmployee: "),
      field("employee", "Employee", "Sam Taylor"),
      text("\nPosition: "),
      field("position", "Position", "Operations Manager"),
      text("\n\nThis letter confirms the termination of your employment.\n\nREASON\n\n"),
      field("reason", "Reason for termination", "Following the formal warning issued on 20 September 2026 and the review meeting held on 3 November 2026, your performance has not improved to the required standard. Specifically, the October reconciliation was again submitted late, and two further dispatch address errors occurred on 21 and 28 October 2026."),
      text("\n\nYou were given an opportunity to respond at the meeting on "),
      field("response_meeting", "Response meeting date", "3 November 2026"),
      text(" and were offered the opportunity to have a support person present.\n\nEFFECTIVE DATE\n\nYour employment terminates on "),
      field("termination_date", "Termination date", "17 November 2026"),
      text(".\n\nNOTICE\n\n"),
      field("notice", "Notice arrangements", "You are entitled to 2 weeks notice. You will not be required to work that notice, and will instead be paid in lieu."),
      text("\n\nFINAL PAYMENT\n\n"),
      field("final_payment", "Itemised final payment", "Wages to 17 November 2026        $2,840.00\nPayment in lieu of notice          $2,840.00\nAccrued annual leave (68.4 hrs)    $2,395.00\nSuperannuation on the above        as required\n                                 -------------\nLess: outstanding staff loan        -$420.00"),
      text("\n\nThis will be paid into your nominated account within "),
      field("payment_timing", "Payment timing", "7 days of your termination date"),
      text(".\n\nCOMPANY PROPERTY\n\n"),
      field("property", "Company property to be returned", "Please return your laptop, access pass, keys and company mobile telephone on your last day."),
      text("\n\nCONTINUING OBLIGATIONS\n\nYour obligations of confidentiality continue after your employment ends, as do the restraint obligations in clause 18 of your employment contract.\n\nWe will provide a statement of service on request."),
    ],
    requiresReview: true,
    reviewNote:
      "Check the minimum notice period under the NES and any longer contractual or award period, and confirm whether the employee has served the minimum employment period for unfair dismissal. If the reason relates to a protected attribute or a workplace right, obtain advice before proceeding.",
  },
  {
    key: "emp.redundancy_consultation",
    name: "Redundancy Consultation Letter",
    description: "Opens consultation on a proposed redundancy, before any decision is made.",
    category: "Commercial",
    subcategory: "Employment",
    documentType: "letter",
    matterTypes: EMPLOYMENT,
    aiInstructions:
      "Draft a letter opening redundancy consultation. Critically, it must be framed as a PROPOSAL, not a decision: consultation obligations under modern awards and enterprise agreements require genuine consultation before a decision is made, and a letter that announces a concluded outcome defeats the genuine redundancy defence. Explain the business reason, that the position (not the person) is proposed to be redundant, invite the employee to a consultation meeting with a support person, invite suggestions including redeployment, and state that no decision has been made. Set out what would follow if the proposal proceeds.",
    segments: [
      text("PROPOSED REDUNDANCY: CONSULTATION\n\nEmployee: "),
      field("employee", "Employee", "Sam Taylor"),
      text("\nPosition: "),
      field("position", "Position", "Operations Manager"),
      text("\nDate: "),
      field("date", "Date", "20 September 2026"),
      text("\n\nWe are writing to advise you of a proposed change to the business which may affect your position, and to begin consultation with you about it.\n\nNO DECISION HAS BEEN MADE. We are writing to you before any decision so that your views can genuinely be taken into account.\n\nTHE PROPOSED CHANGE\n\n"),
      field("business_reason", "Business reason for the change", "Following the closure of the Wetherill Park distribution site announced last month, the operations function will be consolidated into the Sydney office. The proposal is that the separate Operations Manager role at Wetherill Park would no longer be required."),
      text("\n\nWe want to be clear that this concerns the position, not your performance, which is not in question.\n\nCONSULTATION MEETING\n\nWe invite you to a meeting on "),
      field("meeting_details", "Meeting details", "25 September 2026 at 10:00am in the Sydney office boardroom"),
      text(". You are welcome to bring a support person.\n\nAt that meeting we would like to discuss:\n\n1. the reasons for the proposed change;\n2. the likely effect on you;\n3. any measures to avoid or reduce the effect, including redeployment; and\n4. any suggestions or alternatives you wish to put forward.\n\nREDEPLOYMENT\n\n"),
      field("redeployment", "Redeployment options being explored", "We are currently reviewing whether the Logistics Coordinator vacancy in the Sydney office may be suitable. We would welcome your views on that, and on any other role you consider you could perform."),
      text("\n\nIF THE PROPOSAL PROCEEDS\n\nIf, after consultation, the decision is made to proceed and no suitable redeployment is available, your position would be made redundant and you would be entitled to notice and redundancy pay in accordance with the National Employment Standards and your contract.\n\nPlease let us know if you would prefer a different time for the meeting."),
    ],
    requiresReview: true,
    reviewNote:
      "Consultation obligations are set by the applicable modern award or enterprise agreement and differ. Confirm the obligation, and note that the genuine redundancy defence to unfair dismissal requires both genuine consultation and genuine consideration of redeployment across the business and related entities.",
  },
  {
    key: "emp.deed_of_release",
    name: "Deed of Release (employment separation)",
    description: "Covering advice on a separation deed and mutual release.",
    category: "Commercial",
    subcategory: "Employment",
    documentType: "letter",
    matterTypes: EMPLOYMENT,
    aiInstructions:
      "Draft a covering letter enclosing a deed of release on separation of employment. Set out the payment offered and its components, the release being given (all claims arising from employment and its termination), confidentiality and non-disparagement, the agreed statement of service or reference, and the fact that the employee should obtain independent advice. Note that a release cannot exclude certain statutory entitlements. Explain that the payment is offered on a without prejudice basis and is conditional on execution.",
    segments: [
      text("WITHOUT PREJUDICE\n\nDEED OF RELEASE\n\nWe enclose a Deed of Release for your consideration in connection with the ending of your employment.\n\nWHAT IS OFFERED\n\n"),
      field("payment", "Payment offered and components", "In addition to your statutory entitlements (notice, accrued annual leave and superannuation), the company offers an additional separation payment of $12,000 gross."),
      text("\n\nWHAT IS ASKED IN RETURN\n\n1. A release of all claims arising out of your employment and its termination.\n2. Confidentiality as to the terms of the deed and the circumstances of your departure.\n3. Mutual non-disparagement.\n\n"),
      field("additional_terms", "Additional terms", "4. An agreed statement of service confirming your role and dates of employment, in the form attached."),
      text("\n\nWHAT A RELEASE CANNOT DO\n\nA release cannot exclude every entitlement. Certain statutory rights, including workers compensation entitlements and superannuation guarantee obligations, are not affected by a deed of this kind.\n\nINDEPENDENT ADVICE\n\nWe recommend you obtain independent legal advice before signing. "),
      field("advice_contribution", "Contribution to legal costs (if offered)", "The company will contribute up to $750 plus GST towards the cost of that advice on production of an invoice."),
      text("\n\nThis offer is made on a without prejudice basis, is conditional on the deed being executed, and is open until "),
      field("open_until", "Open until", "5:00pm on 4 October 2026"),
      text("."),
    ],
  },
  {
    key: "emp.long_service_leave_note",
    name: "Long Service Leave: Entitlement by State (file note)",
    description: "Internal note that long service leave remains state-based, unlike most employment entitlements.",
    category: "Commercial",
    subcategory: "Employment",
    documentType: "file_note",
    matterTypes: EMPLOYMENT,
    aiInstructions:
      "Draft an internal file note recording that long service leave is state-based rather than federal, that qualifying periods and accrual rates differ between states, that pro-rata entitlements on termination differ, and that portable long service leave schemes operate in some industries (notably construction) in most states. State plainly it is a prompt to check the applicable state Act, not a substitute for doing so.",
    segments: [
      text("LONG SERVICE LEAVE: CHECK THE STATE\n\nInternal aide-memoire.\n\nUnlike almost everything else in employment law, long service leave is NOT federal. It is governed by a separate Act in each state and territory, and the entitlements genuinely differ:\n\n- the qualifying period before an entitlement arises;\n- the rate of accrual;\n- whether and when a pro-rata entitlement is payable on termination, and whether it depends on the reason for termination;\n- how a period of parental or unpaid leave affects continuity.\n\nAlso check whether a PORTABLE long service leave scheme applies. These operate in the construction industry in most states, and in some states also in contract cleaning and community services. Where a portable scheme applies, entitlements follow the worker across employers within the industry, which changes the analysis entirely.\n\nWHICH STATE\n\nGenerally the state in which the employee is based, but this can be genuinely difficult where an employee has worked across states during their service. Take instructions on the full service history before advising.\n\n"),
      field("matter_note", "Note for this matter", "Employee based in NSW throughout. Long Service Leave Act 1955 (NSW) applies. Service from 3 February 2014."),
    ],
    requiresReview: true,
    reviewNote:
      "Long service leave entitlements, qualifying periods and pro-rata rules differ in every state. Confirm the applicable Act and the current entitlement before advising or calculating a payment.",
  },
];
