// lib/precedents/library/insolvency.ts
// Corporate and personal insolvency -- AUSTRALIAN law.
//
// Corporate insolvency is governed by the Corporations Act 2001 (Cth):
// voluntary administration (Part 5.3A), small business restructuring
// (Part 5.3B, introduced 2021), receivership, and the three liquidation
// pathways (creditors' voluntary, members' voluntary, and court-ordered).
// Personal insolvency is governed by the Bankruptcy Act 1966 (Cth):
// bankruptcy notices, creditor's and debtor's petitions, Part IX debt
// agreements and Part X personal insolvency agreements.
//
// Both are FEDERAL, so everything here is jurisdiction-neutral -- one set
// works in every state. That is unusual in this library and is why there are
// no state variants below.
//
// A NOTE ON SOURCES: New Zealand insolvency precedent sets are structured
// around similar concepts (liquidation, receivership, voluntary
// administration, voidable transactions) but sit on entirely different
// statutes -- the Companies Act 1993 and Insolvency Act 2006. NZ material
// should not be adapted for Australian use: the appointment mechanics,
// statutory time limits, voidable transaction tests and defences all differ.
//
// Deliberately NOT hard-coded anywhere below: the statutory demand minimum
// and its compliance period, the bankruptcy notice threshold, and the small
// business restructuring liabilities cap. All are set by regulation, all
// have been changed (several temporarily during 2020-21 and then reset), and
// a stale figure in an insolvency document is worse than none.
import { text, field, type PrecedentSeed } from "./types";

const INSOLVENCY = ["Commercial", "Litigation"];

export const INSOLVENCY_PRECEDENTS: PrecedentSeed[] = [
  // ── Advising a company in distress ──────────────────────────────
  {
    key: "insol.director_duties_distress_advice",
    name: "Directors' Duties When a Company is in Financial Distress",
    description: "Advises directors on insolvent trading exposure, safe harbour and the options available.",
    category: "Commercial",
    subcategory: "Insolvency",
    documentType: "advice",
    matterTypes: INSOLVENCY,
    aiInstructions:
      "Draft advice to directors of a company in financial difficulty. Cover: the duty to prevent insolvent trading under s 588G of the Corporations Act and the personal liability that follows breach; what insolvency means (inability to pay debts as and when they fall due, a cash-flow test rather than a balance-sheet one); the warning signs a court will look at; the SAFE HARBOUR under s 588GA, its preconditions including that employee entitlements and tax reporting must be up to date, and that it protects a director developing a course of action reasonably likely to lead to a better outcome; director penalty notices from the ATO and the difference between lockdown and non-lockdown notices; and the formal options (voluntary administration, small business restructuring, liquidation). Be direct that continuing to trade while insolvent, hoping something turns up, is the single most common way directors incur personal liability.",
    segments: [
      text("DIRECTORS' DUTIES - COMPANY IN FINANCIAL DIFFICULTY\n\nCompany: "),
      field("company", "Company", "Example Trading Pty Ltd (ACN 000 000 000)"),
      text("\n\nWHY WE ARE WRITING\n\n"),
      field("circumstances", "Circumstances", "You have told us the company is approximately $340,000 behind in trade creditors, has an outstanding ATO liability of $180,000, and is currently paying suppliers on an ad hoc basis as cash allows."),
      text("\n\nTHE TEST FOR INSOLVENCY\n\nA company is insolvent if it cannot pay all its debts as and when they become due and payable. This is a CASH FLOW test, not a balance sheet one. A company with substantial assets can be insolvent if it cannot realise them in time to pay debts as they fall due.\n\nYOUR PERSONAL EXPOSURE\n\nUnder s 588G of the Corporations Act, a director who allows a company to incur a debt while it is insolvent, or which causes it to become insolvent, can be PERSONALLY LIABLE for that debt. Liability can extend to compensation, civil penalties, and in serious cases criminal liability.\n\nThe most common way directors incur this liability is by continuing to trade while hoping the position will improve. Hope is not a defence.\n\nSAFE HARBOUR\n\nSection 588GA provides protection where a director, after starting to suspect insolvency, develops one or more courses of action reasonably likely to lead to a better outcome for the company than immediate administration or liquidation.\n\nThe protection is conditional. It is generally unavailable if the company has failed to pay employee entitlements when due, or has failed to meet its tax reporting obligations.\n\n"),
      field("safe_harbour_assessment", "Safe harbour assessment", "The company's superannuation guarantee payments are two quarters in arrears. That is likely to put safe harbour out of reach unless rectified immediately, and rectifying it should be the first priority if you intend to rely on it."),
      text("\n\nATO DIRECTOR PENALTY NOTICES\n\nThe ATO can issue a director penalty notice making you personally liable for the company's PAYG withholding, GST and superannuation guarantee.\n\nThe critical distinction: if the liabilities were REPORTED on time, the notice can usually be remitted by appointing an administrator or liquidator within the notice period. If they were NOT reported on time, it becomes a LOCKDOWN notice and the only way out is payment. Reporting on time, even when you cannot pay, materially preserves your options.\n\nYOUR OPTIONS\n\n"),
      field("options", "Options available", "1. VOLUNTARY ADMINISTRATION -- an independent administrator takes control, a moratorium applies, and creditors decide between a deed of company arrangement, liquidation, or handing the company back.\n2. SMALL BUSINESS RESTRUCTURING -- for eligible smaller companies, allows directors to stay in control while a restructuring plan is put to creditors.\n3. LIQUIDATION -- an orderly winding up.\n4. INFORMAL WORKOUT -- negotiated arrangements with key creditors, viable only if they will hold off."),
      text("\n\nOUR RECOMMENDATION\n\n"),
      field("recommendation", "Recommendation", "Bring the superannuation up to date immediately and ensure all BAS lodgements are current, whether or not you can pay. Then obtain an urgent assessment from an insolvency practitioner on eligibility for small business restructuring. Do not incur further credit in the meantime."),
      text("\n\nPlease do not delay. The options available narrow considerably with time, and the exposure grows."),
    ],
    requiresReview: true,
    reviewNote:
      "Safe harbour preconditions and the director penalty notice regime have both been amended. Confirm the current requirements, and confirm eligibility thresholds before advising on small business restructuring.",
  },
  {
    key: "insol.voluntary_administration_advice",
    name: "Voluntary Administration - Advice to Directors",
    description: "Explains the Part 5.3A process, the moratorium, and what directors must do.",
    category: "Commercial",
    subcategory: "Insolvency",
    documentType: "advice",
    matterTypes: INSOLVENCY,
    aiInstructions:
      "Draft advice on voluntary administration under Part 5.3A of the Corporations Act. Cover: how an administrator is appointed (usually by directors' resolution that the company is insolvent or likely to become insolvent); that control passes to the administrator immediately; the moratorium on claims and enforcement and its limits, particularly that a secured creditor with security over substantially the whole of the property has a decision period in which it may enforce; personal guarantees are NOT protected by the moratorium; the first and second creditors' meetings and the three outcomes creditors may resolve on (DOCA, liquidation, or return to directors); the administrator's report; and the directors' obligation to provide the report on company activities and property and to assist the administrator. Be clear that directors lose control on appointment.",
    segments: [
      text("VOLUNTARY ADMINISTRATION - ADVICE\n\nCompany: "),
      field("company", "Company", "Example Trading Pty Ltd (ACN 000 000 000)"),
      text("\n\nWHAT IT IS\n\nVoluntary administration places an independent administrator in control of the company, gives it breathing space from creditors, and lets creditors decide the company's future.\n\nHOW IT STARTS\n\nMost commonly the directors resolve that the company is insolvent, or likely to become insolvent at some future time, and appoint an administrator. The appointment takes effect immediately.\n\nYOU LOSE CONTROL IMMEDIATELY\n\nFrom appointment, the administrator controls the company and its business. Your powers as directors are suspended. You must:\n\n1. deliver the books and records to the administrator;\n2. provide a report on the company's business, property, affairs and financial circumstances within the required period; and\n3. assist the administrator and answer their questions.\n\nTHE MORATORIUM - AND ITS LIMITS\n\nDuring administration most creditors cannot commence or continue proceedings or enforce security without the administrator's consent or leave of the Court.\n\nBut note two important limits:\n\n1. A secured creditor holding security over substantially the whole of the company's property has a decision period during which it MAY enforce. If your financier holds an all-assets security, its position matters enormously.\n\n2. PERSONAL GUARANTEES ARE NOT PROTECTED. A creditor can pursue you personally on a guarantee during the administration. This surprises directors and is often the biggest practical consequence for them.\n\n"),
      field("guarantee_exposure", "Personal guarantee exposure", "You have each guaranteed the equipment finance facility and the premises lease. Those guarantees remain fully enforceable against you personally regardless of the administration."),
      text("\n\nTHE CREDITORS' MEETINGS\n\nThere are two. At the second, creditors choose between:\n\n1. A DEED OF COMPANY ARRANGEMENT -- a binding compromise, usually paying creditors a stated return, allowing the business to continue.\n2. LIQUIDATION.\n3. Returning the company to the directors -- rare in practice.\n\nWHAT WE EXPECT HERE\n\n"),
      field("expectation", "Expected outcome", "Given the business remains profitable at the gross margin level and the principal problem is legacy debt, a deed of company arrangement funded partly by a contribution from you is a realistic outcome and likely to deliver creditors more than liquidation."),
      text("\n\nNEXT STEPS\n\n"),
      field("next_steps", "Next steps", "We will arrange a meeting with an insolvency practitioner this week to confirm the appointment is appropriate and to discuss a possible deed proposal."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current timing for the creditors' meetings, the directors' report deadline, and the secured creditor decision period under Part 5.3A -- these are prescribed and have been varied.",
  },
  {
    key: "insol.small_business_restructuring_advice",
    name: "Small Business Restructuring - Advice to Directors",
    description: "Explains Part 5.3B restructuring, where directors stay in control.",
    category: "Commercial",
    subcategory: "Insolvency",
    documentType: "advice",
    matterTypes: INSOLVENCY,
    aiInstructions:
      "Draft advice on small business restructuring under Part 5.3B of the Corporations Act. Explain the key difference from voluntary administration -- the directors REMAIN IN CONTROL of the business while a restructuring practitioner assists in developing a plan. Cover eligibility (a liabilities threshold, employee entitlements must be paid and tax lodgements up to date, and the company must not have used the process recently), the process (appointment, proposal period, creditor vote requiring a majority in value), the moratorium, and what happens if the plan is not accepted. Note it is designed to be cheaper and faster than administration and suits companies with a viable business and manageable legacy debt. Do not state the liabilities threshold as a fixed figure.",
    segments: [
      text("SMALL BUSINESS RESTRUCTURING - ADVICE\n\nCompany: "),
      field("company", "Company", "Example Trading Pty Ltd (ACN 000 000 000)"),
      text("\n\nWHY THIS IS DIFFERENT\n\nUnlike voluntary administration, small business restructuring lets you STAY IN CONTROL of the business. A restructuring practitioner is appointed to help develop a plan and to certify it to creditors, but you continue to run the company in the ordinary course.\n\nIt is designed to be quicker and materially cheaper than administration.\n\nELIGIBILITY\n\nThe company must:\n\n1. have total liabilities below the prescribed threshold;\n2. have paid all employee entitlements that are due and payable, including superannuation;\n3. have all tax lodgements up to date (lodged, not necessarily paid); and\n4. not have been subject to restructuring or a simplified liquidation recently.\n\n"),
      field("eligibility_assessment", "Eligibility assessment", "The company's total liabilities are approximately $620,000, which we expect is within the threshold. However, superannuation is two quarters in arrears -- that must be brought fully up to date before the company can be eligible. This is the first thing to address."),
      text("\n\nHOW IT WORKS\n\n1. A restructuring practitioner is appointed.\n2. You and the practitioner develop a restructuring plan during the proposal period.\n3. The plan goes to creditors, who vote. Acceptance requires a majority in value of those who vote.\n4. If accepted, the plan binds all admissible creditors and is administered by the practitioner.\n5. If rejected, the restructuring ends and the company must consider administration or liquidation.\n\nDURING THE PROCESS\n\nA moratorium applies, similar to administration. You may only enter transactions in the ordinary course of business without the practitioner's consent.\n\nAs with administration, PERSONAL GUARANTEES ARE NOT AFFECTED and can be enforced against you.\n\nWHAT A PLAN TYPICALLY LOOKS LIKE\n\n"),
      field("plan_shape", "Likely shape of a plan", "Typically a contribution from ongoing trading and/or from the directors, paid over 12 to 36 months, returning creditors a stated cents-in-the-dollar amount. Here, on preliminary figures, a return in the order of 25 to 35 cents may be achievable, against an estimated liquidation return of very little."),
      text("\n\nOUR RECOMMENDATION\n\n"),
      field("recommendation", "Recommendation", "Bring superannuation up to date immediately, confirm all BAS lodgements are current, and then engage a restructuring practitioner to test the numbers. This process is well suited to your circumstances -- the underlying business is viable and the problem is historic debt."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current liabilities threshold and eligibility criteria for Part 5.3B restructuring, and the proposal and voting periods. These are prescribed by regulation and have been amended.",
  },

  // ── Acting for creditors ────────────────────────────────────────
  {
    key: "insol.proof_of_debt_cover",
    name: "Proof of Debt (covering letter)",
    description: "Lodges a creditor's proof of debt with an administrator, liquidator or trustee.",
    category: "Commercial",
    subcategory: "Insolvency",
    documentType: "letter",
    matterTypes: INSOLVENCY,
    aiInstructions:
      "Draft a covering letter lodging a proof of debt. Identify the insolvent entity and the appointment, the creditor, the amount claimed and how it is calculated, the basis of the debt, and whether the creditor claims as secured, priority or unsecured. Enclose supporting documents. Ask for confirmation of admission and for notice of all meetings and reports. Where the creditor holds security or retention of title, say so expressly and reserve those rights rather than lodging as an unsecured creditor by default, which can waive them.",
    segments: [
      text("PROOF OF DEBT\n\nInsolvent entity: "),
      field("entity", "Insolvent entity", "Example Trading Pty Ltd (ACN 000 000 000) (Administrators Appointed)"),
      text("\nAppointment: "),
      field("appointment", "Appointment details", "Voluntary administration; administrators appointed 14 September 2026"),
      text("\nCreditor: "),
      field("creditor", "Our client", "ABC Supplies Pty Ltd (ACN 111 111 111)"),
      text("\n\nWe act for the creditor and lodge the enclosed proof of debt.\n\nAMOUNT CLAIMED\n\n"),
      field("amount", "Amount and calculation", "$46,820.00, being the unpaid balance of invoices 1043, 1051, 1066 and 1082 issued between March and August 2026, less a credit of $1,180 for returned stock."),
      text("\n\nBASIS OF THE DEBT\n\n"),
      field("basis", "Basis of the debt", "Goods supplied under written terms of trade dated 1 March 2026, delivered and accepted."),
      text("\n\nSTATUS OF THE CLAIM\n\n"),
      field("status", "Secured / priority / unsecured status", "Our client claims as a SECURED creditor to the extent of goods supplied under retention of title and still in the company's possession, and as an unsecured creditor for the balance. Our client holds a registered purchase money security interest on the PPSR (registration number 000000000000). Nothing in this proof is a waiver of that security."),
      text("\n\nENCLOSED\n\n"),
      field("enclosures", "Enclosures", "1. Proof of debt form\n2. Terms of trade\n3. Invoices and delivery dockets\n4. PPSR registration verification statement\n5. Statement of account"),
      text("\n\nPlease confirm admission of the claim, and please ensure our client receives notice of all meetings, reports and distributions."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the correct proof of debt form for the appointment type and that lodging does not prejudice any security or retention of title claim. A secured creditor should not lodge as unsecured without expressly reserving its security.",
  },
  {
    key: "insol.unfair_preference_response",
    name: "Response to Unfair Preference Demand",
    description: "Acting for a creditor facing a liquidator's preference claim, raising the available defences.",
    category: "Commercial",
    subcategory: "Insolvency",
    documentType: "letter",
    matterTypes: INSOLVENCY,
    aiInstructions:
      "Draft a response to a liquidator's unfair preference demand under s 588FA of the Corporations Act. Explain and deploy the available defences: the good faith defence under s 588FG (that the creditor received the payment in good faith, had no reasonable grounds to suspect insolvency, and gave valuable consideration or changed its position); the running account principle under s 588FA(3), where a continuing business relationship means only the net reduction over the period is preferential rather than each payment; and set-off. Put the liquidator to proof of insolvency at the relevant time. Be constructive -- most preference claims resolve commercially, and an aggressive response rarely helps.",
    segments: [
      text("UNFAIR PREFERENCE CLAIM - RESPONSE\n\nWe act for "),
      field("creditor", "Our client", "ABC Supplies Pty Ltd"),
      text(" and refer to your demand dated "),
      field("demand_date", "Demand date", "10 September 2026"),
      text(" seeking repayment of "),
      field("amount_claimed", "Amount claimed", "$68,400"),
      text(" as alleged unfair preferences.\n\nOur client does not accept the claim, for the reasons below.\n\n1. RUNNING ACCOUNT\n\n"),
      field("running_account", "Running account argument", "Our client and the company had a continuing business relationship throughout the relation-back period. Our client continued to supply goods on credit while receiving payments, and the account fluctuated continuously.\n\nOn the running account principle in s 588FA(3), the transactions must be viewed as a single continuing transaction. The net reduction in the account over the period was $14,200, not the $68,400 claimed. Any preference is limited to that net amount."),
      text("\n\n2. GOOD FAITH DEFENCE\n\n"),
      field("good_faith", "Good faith defence", "Our client received each payment in good faith and had no reasonable grounds to suspect the company was insolvent. Payments were made broadly within terms until July 2026. Our client continued to supply goods of equivalent value, giving valuable consideration and changing its position in reliance on the payments received."),
      text("\n\n3. PROOF OF INSOLVENCY\n\nYour client is put to proof that the company was insolvent at the time of each impugned payment. The bare assertion of insolvency across the whole period is not sufficient.\n\n"),
      field("other_defences", "Other defences or set-off (or 'Nil')", "4. SET-OFF. Our client holds an unpaid claim of $9,100 for goods returned damaged, which is available as a set-off under s 553C."),
      text("\n\nRESOLUTION\n\nOur client would prefer to resolve this commercially rather than incur the cost of litigation on both sides.\n\n"),
      field("offer", "Commercial proposal", "Without admission, our client is prepared to pay $12,000 in full and final settlement, on the basis that this reflects the net running account reduction less the available set-off. That offer is open for 21 days."),
    ],
    requiresReview: true,
    reviewNote:
      "The relation-back period, the running account principle and the s 588FG defence elements are technical and heavily litigated. Verify the relevant dates and the current state of the authorities before settling the response.",
  },
  {
    key: "insol.winding_up_application_cover",
    name: "Winding Up Application (covering letter)",
    description: "Covers an application to wind up a company in insolvency after an unsatisfied statutory demand.",
    category: "Commercial",
    subcategory: "Insolvency",
    documentType: "letter",
    matterTypes: INSOLVENCY,
    aiInstructions:
      "Draft a covering letter serving an originating process to wind up a company in insolvency. Refer to the statutory demand and the failure to comply, note the resulting presumption of insolvency, identify the return date, and note that the company may only oppose on limited grounds and generally requires leave to raise a dispute about the debt that could have been raised on a setting-aside application. Note the applicant's costs are sought. Advise that payment before the hearing may still resolve it.",
    segments: [
      text("APPLICATION TO WIND UP IN INSOLVENCY\n\nCompany: "),
      field("company", "Company", "XYZ Builders Pty Ltd (ACN 111 111 111)"),
      text("\n\nWe act for "),
      field("creditor", "Our client", "ABC Supplies Pty Ltd"),
      text(" and enclose by way of service an Originating Process seeking that the company be wound up in insolvency, together with the supporting affidavit and consent of the proposed liquidator.\n\nBACKGROUND\n\nA creditor's statutory demand was served on the company on "),
      field("demand_date", "Statutory demand served", "12 August 2026"),
      text(". The company did not comply with it, did not apply to set it aside within the statutory period, and the debt remains unpaid.\n\nThe company is accordingly presumed to be insolvent.\n\nHEARING\n\nThe application is returnable on "),
      field("return_date", "Return date", "20 October 2026"),
      text(" in the "),
      field("court", "Court", "Supreme Court of New South Wales"),
      text(".\n\nGROUNDS OF OPPOSITION ARE LIMITED\n\nBecause the company failed to apply to set aside the statutory demand within time, it generally cannot now dispute the debt without the leave of the Court, and leave is not readily granted.\n\nRESOLUTION IS STILL POSSIBLE\n\nIf the debt, together with our client's costs, is paid before the hearing, our client will not press the application. Contact us if the company wishes to resolve the matter."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the statutory demand was validly served and that the compliance period expired without an application to set aside. Verify the current period and that the supporting affidavit is sworn within the required time before filing.",
  },

  // ── Personal insolvency ─────────────────────────────────────────
  {
    key: "insol.bankruptcy_advice_debtor",
    name: "Bankruptcy - Advice to Debtor",
    description: "Advises an individual on bankruptcy, its consequences and the alternatives.",
    category: "Commercial",
    subcategory: "Personal Insolvency",
    documentType: "advice",
    matterTypes: INSOLVENCY,
    aiInstructions:
      "Draft advice to an individual facing bankruptcy under the Bankruptcy Act 1966 (Cth). Cover: how bankruptcy begins (debtor's petition, or a creditor's petition following an unsatisfied bankruptcy notice); the period of bankruptcy and that it can be extended by objection; what vests in the trustee and what the debtor may keep (household goods, tools of trade up to a limit, a vehicle up to a limit, and superannuation in most cases); income contributions above a threshold; restrictions during bankruptcy including on travel, on acting as a director, and on obtaining credit above a limit without disclosure; the effect on the credit file and the National Personal Insolvency Index, which is permanent; and the alternatives -- Part IX debt agreements and Part X personal insolvency agreements. Be candid and non-judgmental. Do not state thresholds as fixed figures.",
    segments: [
      text("BANKRUPTCY - ADVICE\n\nWHAT BANKRUPTCY IS\n\nBankruptcy is a formal process under the Bankruptcy Act 1966 (Cth) in which a trustee takes control of your divisible property and administers it for the benefit of creditors. Most unsecured debts are released at the end of it.\n\nHOW IT STARTS\n\n1. You petition voluntarily (a debtor's petition); or\n2. A creditor petitions, usually after serving a bankruptcy notice with which you have not complied.\n\n"),
      field("how_arising", "How bankruptcy arises here", "A bankruptcy notice was served on you on 2 September 2026 in respect of a judgment debt of $34,000. If you do not comply within the statutory period, the creditor may petition."),
      text("\n\nWHAT YOU KEEP\n\nYou do not lose everything. You generally keep:\n\n1. ordinary household furniture and effects;\n2. tools of trade up to a prescribed limit;\n3. a vehicle up to a prescribed equity limit;\n4. superannuation, in most circumstances, including a lump sum received on or after bankruptcy; and\n5. certain compensation and personal injury damages.\n\nWHAT VESTS IN THE TRUSTEE\n\nReal property, shares, and other assets above the protected limits. Equity in your home vests, which is usually the most significant consequence.\n\n"),
      field("asset_position", "Asset position", "Your principal asset is a half interest in the family home, with equity of approximately $180,000. That interest would vest in the trustee and would ordinarily need to be realised, either by sale or by your spouse purchasing the trustee's interest."),
      text("\n\nINCOME CONTRIBUTIONS\n\nIf your income exceeds a prescribed threshold (which increases with the number of dependants) you must pay contributions to the trustee.\n\nRESTRICTIONS DURING BANKRUPTCY\n\n1. You cannot travel overseas without your trustee's consent.\n2. You cannot be a company director.\n3. You must disclose your bankruptcy when obtaining credit above a prescribed amount.\n4. Some occupations and licences are affected.\n\nTHE PERMANENT RECORD\n\nYour bankruptcy is recorded on the National Personal Insolvency Index PERMANENTLY. It remains searchable after your discharge. Credit reporting agencies list it for a period after discharge.\n\nTHE ALTERNATIVES\n\n"),
      field("alternatives", "Alternatives", "1. PART IX DEBT AGREEMENT -- a binding arrangement to pay a proportion of your debts, available where your debts, assets and income are below prescribed thresholds. It is an act of bankruptcy and is also recorded on the NPII, but is not bankruptcy.\n2. PART X PERSONAL INSOLVENCY AGREEMENT -- a more flexible arrangement administered by a trustee, with no threshold limits, suited where there are assets or income to offer creditors.\n3. INFORMAL ARRANGEMENT -- negotiated directly with creditors."),
      text("\n\nOUR RECOMMENDATION\n\n"),
      field("recommendation", "Recommendation", "Given the equity in the home, we recommend exploring a Part X personal insolvency agreement funded by a contribution from your spouse or family. That may deliver creditors more than bankruptcy while preserving the home, and avoids the restrictions above."),
    ],
    requiresReview: true,
    reviewNote:
      "Protected asset limits, income contribution thresholds, the bankruptcy notice minimum and Part IX eligibility thresholds are all indexed and change. Confirm current figures with AFSA before advising.",
  },
  {
    key: "insol.bankruptcy_notice_cover",
    name: "Bankruptcy Notice (covering letter)",
    description: "Serves a bankruptcy notice on a judgment debtor.",
    category: "Commercial",
    subcategory: "Personal Insolvency",
    documentType: "letter",
    matterTypes: INSOLVENCY,
    aiInstructions:
      "Draft a covering letter serving a bankruptcy notice on a judgment debtor. Identify the judgment and the amount, explain that failure to comply within the statutory period is an act of bankruptcy on which a creditor's petition may be founded, note that the debtor may apply to set the notice aside or to extend time, and recommend they obtain urgent advice. Note that payment or a satisfactory arrangement will resolve it.",
    segments: [
      text("BANKRUPTCY NOTICE\n\nWe act for "),
      field("creditor", "Our client", "ABC Supplies Pty Ltd"),
      text(" and enclose by way of service a Bankruptcy Notice issued by the Official Receiver.\n\nTHE JUDGMENT\n\n"),
      field("judgment", "Judgment details", "Judgment was entered against you in the Local Court of New South Wales on 14 July 2026 in proceedings 2026/00123456 in the sum of $34,180.40, which remains wholly unpaid."),
      text("\n\nWHAT THIS MEANS\n\nIf you do not comply with the notice within the period stated in it, you will commit an act of bankruptcy. Our client may then present a creditor's petition seeking a sequestration order making you bankrupt.\n\nYOUR OPTIONS\n\n1. Pay the amount claimed.\n2. Make an arrangement with our client that it is prepared to accept.\n3. Apply to the Court to set aside the notice, or to extend the time for compliance. Strict time limits apply to any such application.\n\nWE STRONGLY RECOMMEND YOU OBTAIN LEGAL ADVICE IMMEDIATELY.\n\nIf you wish to discuss payment, contact us without delay. Our client would prefer to be paid than to make you bankrupt."),
    ],
    requiresReview: true,
    reviewNote:
      "The bankruptcy notice minimum threshold and the compliance period are prescribed and have been amended. Confirm the current figures, and that the judgment is final and enforceable, before applying for the notice.",
  },
  {
    key: "insol.personal_guarantee_demand",
    name: "Demand on Personal Guarantee (post-insolvency)",
    description: "Calls on a guarantee after the principal debtor has entered administration or liquidation.",
    category: "Commercial",
    subcategory: "Insolvency",
    documentType: "letter",
    matterTypes: INSOLVENCY,
    aiInstructions:
      "Draft a demand on a personal guarantor following the principal debtor's insolvency. Identify the guarantee, the principal debt, and the insolvency event. Explain that the moratorium in administration or restructuring does NOT protect a guarantor, and that the creditor is entitled to proceed against the guarantor regardless of the administration. State the amount demanded, the deadline, and the consequences of non-payment. Note the guarantor's right of subrogation and to prove in the principal's insolvency to the extent they pay.",
    segments: [
      text("DEMAND ON GUARANTEE\n\nWe act for "),
      field("creditor", "Our client", "ABC Supplies Pty Ltd"),
      text(".\n\nTHE GUARANTEE\n\nYou guaranteed the obligations of "),
      field("principal", "Principal debtor", "Example Trading Pty Ltd (ACN 000 000 000)"),
      text(" to our client under a guarantee dated "),
      field("guarantee_date", "Guarantee date", "1 March 2026"),
      text(".\n\nTHE INSOLVENCY EVENT\n\n"),
      field("insolvency_event", "Insolvency event", "Administrators were appointed to the principal debtor on 14 September 2026. Our client's claim in that administration is $46,820."),
      text("\n\nTHE MORATORIUM DOES NOT PROTECT YOU\n\nThe statutory moratorium arising on the appointment of administrators protects the COMPANY. It does not protect a guarantor.\n\nOur client is entitled to proceed against you personally for the full amount, and is not required to wait for the outcome of the administration or to first exhaust its claim against the company.\n\nDEMAND\n\nOur client demands payment of "),
      field("amount", "Amount demanded", "$46,820.00"),
      text(" by "),
      field("deadline", "Deadline", "5:00pm on 10 October 2026"),
      text(".\n\nIF YOU DO NOT PAY\n\nOur client will commence proceedings against you without further notice and will seek judgment, interest and costs. A judgment may found a bankruptcy notice.\n\nYOUR POSITION IN THE ADMINISTRATION\n\nTo the extent you pay under the guarantee, you are entitled to be subrogated to our client's rights against the company and may prove in the administration for the amount you have paid. You should obtain advice about that.\n\nIf you wish to discuss an arrangement, contact us before the deadline."),
    ],
  },
];
