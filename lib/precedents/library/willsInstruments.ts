// lib/precedents/library/willsInstruments.ts
// The instruments themselves -- wills, codicils, powers of attorney,
// guardianship appointments, and the revocations and resignations that go
// with them -- as distinct from the advice about them in
// willsEstatesNsw.ts and willsEstatesDepth.ts.
//
// TWO DELIBERATE DEPARTURES FROM OLDER PRECEDENT SETS:
//
// 1. GENDER-NEUTRAL DRAFTING. Published precedent sets, including recent
//    ones, still separate "Executor" from "Executrix" and offer "Simple Will
//    - Husband to Wife" and "Simple Will - Wife to Husband" as distinct
//    precedents. That doubles the library for no legal effect: "executor" is
//    correct for any person, and a will leaving an estate to a spouse does
//    not change with the gender of either. One precedent, drafted neutrally,
//    is used here. It also avoids the problem that gendered forms handle
//    same-sex couples badly.
//
// 2. REVOCATIONS ARE FIRST-CLASS DOCUMENTS. Revoking a power of attorney or
//    a guardianship appointment is at least as common as making one, and
//    getting it wrong leaves an attorney with apparent authority they should
//    no longer have. Revocation is not effective against a third party who
//    has no notice of it, so service is part of the job, not an afterthought
//    -- each revocation precedent below deals with service expressly.
//
// Powers of attorney and guardianship instruments are STATE-based, in form,
// name and witnessing requirements. Most states prescribe a statutory form,
// so these precedents are drafting and execution guidance around the
// prescribed form rather than substitutes for it.
import { text, field, type PrecedentSeed } from "./types";

const WILLS = ["Wills & Estates"];

export const WILLS_INSTRUMENTS_PRECEDENTS: PrecedentSeed[] = [
  // ── Wills and codicils ──────────────────────────────────────────
  {
    key: "wins.simple_will",
    name: "Simple Will (spouse then children)",
    description: "Straightforward will leaving everything to a spouse, then to children equally.",
    category: "Wills & Estates",
    subcategory: "Wills",
    documentType: "form",
    matterTypes: WILLS,
    aiInstructions:
      "Draft a simple will: everything to the spouse if they survive by a stated period, otherwise to the children equally, with a substitution provision for a child who predeceases leaving issue. Include: revocation of earlier wills; appointment of executor and substitute; a survivorship period (commonly 30 days, which avoids the estate passing through a spouse's estate where both die in a common accident); the gift of residue; a contingent gift if no beneficiary survives; guardianship of minor children if applicable; trustee powers including power to postpone sale, to invest, and to apply income and capital for a minor's maintenance and education; and a direction as to debts, funeral and testamentary expenses. Draft gender-neutrally throughout -- 'executor', not 'executrix'. Do not include a testamentary trust in this precedent; that is a separate one.",
    segments: [
      text("WILL\n\nThis is the last will of "),
      field("testator", "Testator full name and address", "Robert James Citizen of 12 Example Street, Sydney NSW 2000"),
      text(".\n\n1. REVOCATION\n\nI revoke all earlier wills and testamentary dispositions.\n\n2. EXECUTOR\n\nI appoint "),
      field("executor", "Executor", "my spouse, Margaret Anne Citizen"),
      text(" as my executor and trustee.\n\nIf that person does not survive me, is unwilling or unable to act, or ceases to act, I appoint "),
      field("substitute_executor", "Substitute executor", "my daughter, Sarah Louise Citizen of 5 Sample Road, Parramatta NSW 2150"),
      text(" in their place.\n\n3. GIFT OF RESIDUE\n\nI give the whole of my estate to "),
      field("primary_beneficiary", "Primary beneficiary", "my spouse, Margaret Anne Citizen"),
      text(" if they survive me by 30 days.\n\n4. IF MY SPOUSE DOES NOT SURVIVE ME\n\nIf that gift fails, I give the whole of my estate to "),
      field("substitute_beneficiaries", "Substitute beneficiaries", "such of my children as survive me by 30 days and attain the age of 25 years, in equal shares"),
      text(".\n\nIf any child of mine does not survive me but leaves children who survive me, those children take equally the share their parent would have taken.\n\n5. IF NO BENEFICIARY SURVIVES\n\n"),
      field("ultimate_gift", "Ultimate gift", "If no person becomes entitled under the above provisions, I give my estate to the Royal Flying Doctor Service of Australia for its general purposes, and the receipt of its treasurer or authorised officer is a sufficient discharge to my trustee."),
      text("\n\n6. GUARDIANSHIP\n\n"),
      field("guardianship", "Guardianship clause (or 'Not applicable')", "If any child of mine is under 18 at my death and has no surviving parent, I appoint Sarah Louise Citizen as guardian of that child."),
      text("\n\n7. TRUSTEE POWERS\n\nIn addition to powers conferred by law, my trustee may:\n\n(a) postpone the sale or conversion of any asset for as long as they think fit, without being liable for loss;\n(b) invest in any investment they could make if absolutely entitled;\n(c) apply income and capital of a minor beneficiary's share for that beneficiary's maintenance, education, advancement or benefit; and\n(d) carry on or dispose of any business forming part of my estate.\n\n8. DEBTS AND EXPENSES\n\nMy debts, funeral and testamentary expenses are to be paid out of my estate.\n\n"),
      field("additional_clauses", "Additional clauses (or 'Nil')", "9. FUNERAL WISHES\n\nI wish to be cremated. I record that this is a wish and is not binding on my executor."),
      text("\n\nSIGNED by the testator in the presence of both witnesses present at the same time, and by the witnesses in the presence of the testator:\n\nTestator: ____________________________  Date: "),
      field("date", "Date", "20 October 2026"),
      text("\n\nWitness 1: ____________________________\nName and address: "),
      field("witness1", "Witness 1 name and address", "____________________________"),
      text("\n\nWitness 2: ____________________________\nName and address: "),
      field("witness2", "Witness 2 name and address", "____________________________"),
    ],
    requiresReview: true,
    reviewNote:
      "Execution formalities are governed by the relevant state Wills Act. Check that neither witness is a beneficiary or the spouse of a beneficiary, and confirm the current requirements before execution.",
  },
  {
    key: "wins.codicil",
    name: "Codicil",
    description: "Formal amendment to an existing will, executed with the same formalities.",
    category: "Wills & Estates",
    subcategory: "Wills",
    documentType: "form",
    matterTypes: WILLS,
    aiInstructions:
      "Draft a codicil. It must: identify the will being amended by date with precision; state the amendments clearly, whether revoking a clause, substituting one, or adding one; and confirm the will is otherwise ratified and confirmed. Execute with the same formalities as a will. Keep amendments unambiguous -- a codicil that sits awkwardly against the original clause creates exactly the uncertainty it was meant to avoid. Note in the drafting guidance that a fresh will is usually preferable for anything beyond a trivial change.",
    segments: [
      text("CODICIL\n\nThis is a codicil to the will of "),
      field("testator", "Testator", "Robert James Citizen of 12 Example Street, Sydney NSW 2000"),
      text(" dated "),
      field("will_date", "Date of the will being amended", "3 February 2019"),
      text(".\n\n1. AMENDMENTS\n\n"),
      field("amendments", "The amendments", "(a) I revoke clause 2 of my will and substitute the following:\n\n    '2. EXECUTOR. I appoint my daughter, Sarah Louise Citizen of 5 Sample Road, Parramatta NSW 2150, as my executor and trustee. If she does not survive me or is unwilling or unable to act, I appoint my grandson, James Robert Citizen, in her place.'\n\n(b) I add the following clause after clause 4:\n\n    '4A. I give the sum of $10,000 to my grandson James Robert Citizen if he survives me by 30 days.'"),
      text("\n\n2. CONFIRMATION\n\nIn all other respects I confirm my will "),
      field("prior_codicils", "Reference to any prior codicils (or 'dated as above')", "dated 3 February 2019"),
      text(".\n\nSIGNED by the testator in the presence of both witnesses present at the same time, and by the witnesses in the presence of the testator:\n\nTestator: ____________________________  Date: "),
      field("date", "Date", "20 October 2026"),
      text("\n\nWitness 1: ____________________________\nName and address: "),
      field("witness1", "Witness 1", "____________________________"),
      text("\n\nWitness 2: ____________________________\nName and address: "),
      field("witness2", "Witness 2", "____________________________"),
    ],
    requiresReview: true,
    reviewNote:
      "A codicil must be executed with the same formalities as a will. Check the amended clauses read coherently against the original will as a whole, and consider whether a fresh will would be safer.",
  },
  {
    key: "wins.executor_trustee_clauses",
    name: "Executor and Trustee Appointment Clauses (clause bank)",
    description: "Alternative appointment clauses for different family and professional arrangements.",
    category: "Wills & Estates",
    subcategory: "Wills",
    documentType: "form",
    matterTypes: WILLS,
    aiInstructions:
      "Produce the appropriate executor and trustee appointment clause for the arrangement described. This is a clause bank rather than a whole document -- the variants that matter are: a sole executor; a sole executor who is also the sole beneficiary; joint executors, with or without a mechanism for resolving disagreement; an appointment taking effect only when a beneficiary attains a stated age; a professional trustee (a firm, with a charging clause and a provision for the firm's successors); a lay person and a firm appointed together; and a substitute appointment. Draft gender-neutrally -- 'executor' is correct for any person and there is no need for a separate 'executrix' form. Where a firm is appointed, a charging clause is essential, because a professional trustee cannot charge for its services without express authority.",
    segments: [
      text("EXECUTOR AND TRUSTEE APPOINTMENT\n\nArrangement required: "),
      field("arrangement", "Which arrangement is needed", "Joint appointment of the testator's two adult children, with a mechanism for resolving disagreement, and a firm of solicitors as substitute"),
      text("\n\nCLAUSE\n\n"),
      field("clause", "The appointment clause", "2. EXECUTORS AND TRUSTEES\n\n(a) I appoint my children, Sarah Louise Citizen and Thomas James Citizen, jointly as my executors and trustees.\n\n(b) If my executors are unable to agree on any matter in the administration of my estate, the decision of Sarah Louise Citizen prevails.\n\n(c) If either of them does not survive me, or is unwilling or unable to act, or ceases to act, the other may act alone.\n\n(d) If neither is able or willing to act, I appoint the partners at the date of my death in the firm of Example Lawyers, or the firm that has succeeded to and carries on its practice, and I appoint any two of those partners to act as my executors and trustees.\n\n(e) Any of my executors or trustees who is engaged in a profession or business may charge for all work done by them or their firm in connection with my estate, including work which an executor or trustee not being in a profession or business could have done personally."),
      text("\n\nNOTES ON THIS CLAUSE\n\n"),
      field("notes", "Drafting notes", "The charging clause at (e) is essential wherever a professional is appointed. Without express authority, a professional trustee cannot charge for their services, and a firm appointed under a will with no charging clause is in the awkward position of either acting for nothing or applying to the Court.\n\nThe casting-vote mechanism at (b) is worth including wherever joint executors are appointed. Deadlocked executors otherwise have to apply to the Court, at the estate's expense."),
    ],
  },

  // ── Powers of attorney ──────────────────────────────────────────
  {
    key: "wins.general_power_of_attorney",
    name: "General Power of Attorney - Advice and Execution",
    description: "Non-enduring power of attorney for a defined period or purpose.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "form",
    matterTypes: WILLS,
    aiInstructions:
      "Draft advice and execution guidance for a GENERAL (non-enduring) power of attorney. The key distinction from an enduring power must be stated plainly: a general power CEASES on loss of capacity, which is precisely when people assume it starts working. It is used for a defined purpose or period -- travelling overseas, a specific transaction, a period of hospitalisation -- not for incapacity planning. Cover the scope (general or limited to specified acts), the period, whether it must be registered for land dealings, revocation, and that the attorney must act in the principal's interests and keep the principal's money separate. Recommend an enduring power instead where incapacity is the concern.",
    segments: [
      text("GENERAL POWER OF ATTORNEY\n\nPrincipal: "),
      field("principal", "Principal", "Robert James Citizen of 12 Example Street, Sydney NSW 2000"),
      text("\nAttorney: "),
      field("attorney", "Attorney", "Sarah Louise Citizen of 5 Sample Road, Parramatta NSW 2150"),
      text("\n\nIMPORTANT - WHAT THIS DOES NOT DO\n\nA general power of attorney CEASES to have effect if you lose mental capacity.\n\nThis is the opposite of what most people assume. If your concern is who will manage your affairs if you become unable to, a general power is not the document you need -- you need an ENDURING power of attorney.\n\n"),
      field("purpose", "Why a general power is being used here", "You have asked for a general power because you will be overseas from January to June 2027 and need your daughter to be able to deal with your investment property in your absence. That is exactly what a general power is for."),
      text("\n\nSCOPE\n\n"),
      field("scope", "Scope of the power", "This power is limited to matters concerning the property at 40 Sample Street, Newtown NSW 2042, including collecting rent, instructing the managing agent, paying outgoings, and arranging repairs. It does NOT authorise sale or mortgage of the property."),
      text("\n\nPERIOD\n\n"),
      field("period", "Period", "From 5 January 2027 until 30 June 2027, unless revoked earlier."),
      text("\n\nREGISTRATION\n\n"),
      field("registration", "Registration position", "Registration is not required as the power does not extend to dealing with the land itself. If you later want your attorney to be able to sell or mortgage, the power must be varied and registered."),
      text("\n\nYOUR ATTORNEY'S OBLIGATIONS\n\nYour attorney must act in your interests, must keep your money separate from their own, must keep records, and must not obtain a benefit for themselves unless the power expressly allows it.\n\nHOW TO END IT\n\nYou may revoke this power at any time while you have capacity. Revocation must be in writing and, importantly, must be communicated to the attorney and to anyone who has been dealing with them -- a revocation is not effective against someone who does not know about it."),
    ],
    requiresReview: true,
    reviewNote:
      "Most states prescribe a statutory form for powers of attorney with specific execution and witnessing requirements. Use the prescribed form for the relevant state and confirm the current witnessing requirements.",
  },
  {
    key: "wins.revocation_power_of_attorney",
    name: "Revocation of Power of Attorney",
    description: "Revokes a power of attorney and, critically, gives notice of the revocation.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "form",
    matterTypes: WILLS,
    aiInstructions:
      "Draft a revocation of power of attorney together with the notice letters that must accompany it. The central practical point: a revocation is NOT effective against a third party who has no notice of it. Revoking the document without telling anyone leaves the former attorney with apparent authority, and a bank that acts on the old power in good faith is protected. So the precedent must cover: the revocation instrument itself; written notice to the attorney requiring return of the original and any certified copies; notice to every bank, financial institution, land registry (where registered), and any other party known to have dealt with the attorney; and deregistration where the power was registered. Also note that the principal must have capacity to revoke.",
    segments: [
      text("REVOCATION OF POWER OF ATTORNEY\n\nI, "),
      field("principal", "Principal", "Robert James Citizen of 12 Example Street, Sydney NSW 2000"),
      text(", REVOKE the power of attorney made by me on "),
      field("poa_date", "Date of the power being revoked", "14 March 2022"),
      text(" appointing "),
      field("attorney", "Attorney whose authority is revoked", "Thomas James Citizen"),
      text(" as my attorney.\n\nThat power is revoked with effect from the date of this instrument.\n\nSigned: ____________________________\n\nDate: "),
      field("date", "Date", "20 October 2026"),
      text("\n\nWitness: ____________________________\n\n----------------------------------------\n\nNOTICE OF REVOCATION - WHY THIS PART MATTERS MORE THAN THE DOCUMENT\n\nA revocation is NOT effective against someone who does not know about it.\n\nIf your former attorney presents the original power to your bank, and the bank has not been told it is revoked, the bank may act on it in good faith and be protected. The document above achieves nothing on its own.\n\nNOTICE MUST BE GIVEN TO:\n\n1. THE FORMER ATTORNEY\n\n"),
      field("attorney_notice", "Notice to the attorney", "A letter enclosing the revocation, requiring the immediate return of the original power of attorney and every certified copy, and stating that they have no authority to act for you from the date of the revocation."),
      text("\n\n2. EVERY INSTITUTION AND PERSON WHO MAY DEAL WITH THEM\n\n"),
      field("third_parties", "Third parties to be notified", "- Commonwealth Bank (accounts 1234 5678 and 8765 4321)\n- AMP Superannuation\n- The managing agent for 40 Sample Street, Newtown\n- Your accountant, Example Accounting"),
      text("\n\n3. THE LAND REGISTRY, IF THE POWER WAS REGISTERED\n\n"),
      field("registration", "Registration position", "The power was registered with NSW Land Registry Services on 20 March 2022. We will lodge the revocation for registration so the register reflects it."),
      text("\n\nWE WILL ATTEND TO ALL OF THE ABOVE\n\n"),
      field("capacity_note", "Capacity note", "You must have capacity to revoke a power of attorney. We are satisfied you do."),
    ],
    requiresReview: true,
    reviewNote:
      "Revocation requirements and whether registration of the revocation is required differ by state. Confirm the position, and ensure notice is actually given and evidenced -- a revocation not notified is ineffective against a third party without notice.",
  },

  // ── Guardianship ────────────────────────────────────────────────
  {
    key: "wins.enduring_guardian_appointment",
    name: "Appointment of Enduring Guardian - Advice and Execution",
    description: "Appoints a substitute decision-maker for health and lifestyle decisions.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "form",
    matterTypes: WILLS,
    aiInstructions:
      "Draft advice and execution guidance for an appointment of enduring guardian. Explain the distinction from an enduring power of attorney: a guardian makes HEALTH AND LIFESTYLE decisions -- where the person lives, what services they receive, what medical treatment they have -- while an attorney makes financial and legal decisions. Cover: when the appointment operates (only when the person lacks capacity for the particular decision); the functions that can be conferred and any limits or directions the appointor wishes to impose; that a guardian cannot override a valid refusal of treatment made by the person while capable; and that the terminology differs by state. Note the interaction with any advance care directive.",
    segments: [
      text("APPOINTMENT OF ENDURING GUARDIAN\n\nAppointor: "),
      field("appointor", "Appointor", "Robert James Citizen of 12 Example Street, Sydney NSW 2000"),
      text("\nGuardian: "),
      field("guardian", "Guardian appointed", "Sarah Louise Citizen of 5 Sample Road, Parramatta NSW 2150"),
      text("\nSubstitute: "),
      field("substitute", "Substitute guardian", "Margaret Anne Citizen"),
      text("\n\nWHAT A GUARDIAN DOES - AND HOW IT DIFFERS FROM AN ATTORNEY\n\nThis document is about HEALTH AND LIFESTYLE decisions:\n\n- where you live;\n- what health care and personal services you receive;\n- what medical and dental treatment you have.\n\nYour enduring power of attorney covers FINANCIAL AND LEGAL decisions. They are separate documents doing separate jobs, and most people need both.\n\nWHEN IT OPERATES\n\nOnly when you lack capacity to make the particular decision yourself. It does not operate while you can decide, and it does not operate for decisions you remain able to make.\n\nFUNCTIONS CONFERRED\n\n"),
      field("functions", "Functions conferred", "I authorise my guardian to decide where I live, to decide what health care and personal services I receive, and to consent to medical and dental treatment on my behalf."),
      text("\n\nLIMITS AND DIRECTIONS\n\n"),
      field("limits", "Limits or directions imposed", "I direct my guardian that it is my wish to remain living in my own home for as long as it is reasonably safe and practicable to do so, and that residential aged care be considered only when home-based care is no longer sufficient."),
      text("\n\nWHAT A GUARDIAN CANNOT DO\n\nA guardian cannot override a valid refusal of treatment you made while you had capacity. If you have made an advance care directive refusing particular treatment, that stands.\n\n"),
      field("acd_interaction", "Interaction with any advance care directive", "You have also made an advance care directive dated 20 October 2026 recording your wishes about life-sustaining treatment. Your guardian must act consistently with it. We recommend giving a copy of both documents to your GP and to your daughter."),
      text("\n\nEXECUTION\n\nSigned by the appointor: ____________________________  Date: "),
      field("date", "Date", "20 October 2026"),
      text("\n\nAccepted by the guardian: ____________________________\n\nWitness: ____________________________"),
    ],
    requiresReview: true,
    reviewNote:
      "The instrument name, prescribed form and witnessing requirements differ by state -- Appointment of Enduring Guardian (NSW, TAS), Enduring Power of Guardianship (WA), and in VIC, QLD and SA personal/health decisions are dealt with through the EPA or an advance care directive. Use the correct instrument for the state.",
  },
  {
    key: "wins.revocation_enduring_guardian",
    name: "Revocation of Appointment of Enduring Guardian",
    description: "Revokes a guardianship appointment and notifies those who need to know.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "form",
    matterTypes: WILLS,
    aiInstructions:
      "Draft a revocation of an appointment of enduring guardian, with the accompanying notices. As with a power of attorney, the revocation must be communicated -- a treating hospital that does not know of the revocation may act on the appointment. Cover the revocation instrument, notice to the former guardian requiring return of the original, notice to treating practitioners, any hospital or aged care facility, and any registry where the appointment was registered. Note the appointor must have capacity to revoke, and that where they do not, an application to the relevant tribunal is required instead.",
    segments: [
      text("REVOCATION OF APPOINTMENT OF ENDURING GUARDIAN\n\nI, "),
      field("appointor", "Appointor", "Robert James Citizen of 12 Example Street, Sydney NSW 2000"),
      text(", REVOKE the appointment of enduring guardian made by me on "),
      field("appointment_date", "Date of appointment being revoked", "14 March 2022"),
      text(" appointing "),
      field("guardian", "Guardian whose appointment is revoked", "Thomas James Citizen"),
      text(" as my enduring guardian.\n\nSigned: ____________________________\n\nDate: "),
      field("date", "Date", "20 October 2026"),
      text("\n\nWitness: ____________________________\n\n----------------------------------------\n\nNOTICE OF REVOCATION\n\nAs with a power of attorney, revoking the document is only half the job. A hospital or aged care facility that has a copy of the old appointment and does not know it is revoked may act on it.\n\nNOTICE MUST BE GIVEN TO:\n\n1. THE FORMER GUARDIAN\n\nA letter enclosing the revocation and requiring return of the original and all copies.\n\n2. HEALTH PROVIDERS AND FACILITIES\n\n"),
      field("health_providers", "Health providers to notify", "- Your GP, Dr Example of Example Medical Centre\n- Westmead Hospital, which holds a copy on your file\n- Example Home Care Services"),
      text("\n\n3. ANY REGISTRY WHERE IT WAS REGISTERED\n\n"),
      field("registration", "Registration position", "The appointment was not registered, so no deregistration is required."),
      text("\n\nIF YOU ARE APPOINTING SOMEONE ELSE\n\n"),
      field("replacement", "Replacement appointment", "You are appointing your daughter Sarah Louise Citizen as your new enduring guardian. We will prepare that appointment at the same time so there is no period during which no one is appointed, and we will send both documents to your GP together."),
      text("\n\nCAPACITY\n\n"),
      field("capacity_note", "Capacity note", "You must have capacity to revoke an appointment. We are satisfied you do. If an appointor has lost capacity, revocation requires an application to the relevant State tribunal instead."),
    ],
    requiresReview: true,
    reviewNote:
      "Revocation requirements and the tribunal pathway where the appointor lacks capacity differ by state. Confirm the correct process, and ensure notice is given to every health provider holding a copy.",
  },
  {
    key: "wins.guardian_resignation",
    name: "Resignation as Attorney or Enduring Guardian",
    description: "Resigns an appointment, with the constraints that apply once the principal has lost capacity.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "form",
    matterTypes: WILLS,
    aiInstructions:
      "Draft a notice of resignation by an attorney or enduring guardian, with advice on the constraints. The critical point: while the principal HAS capacity, an attorney or guardian may generally resign by giving written notice to the principal. Once the principal has LOST capacity, resignation usually requires the leave of the relevant tribunal or court -- an appointee cannot simply walk away from an incapacitated person, and attempting to do so may leave them still on the record and still exposed. Cover both situations, who must be notified, and the practical steps of handing over records and accounting for anything done.",
    segments: [
      text("NOTICE OF RESIGNATION\n\nI, "),
      field("appointee", "Person resigning", "Thomas James Citizen of 22 Sample Avenue, Newcastle NSW 2300"),
      text(", RESIGN as "),
      field("role", "Role being resigned", "attorney"),
      text(" appointed by "),
      field("principal", "Principal", "Robert James Citizen"),
      text(" under the instrument dated "),
      field("instrument_date", "Instrument date", "14 March 2022"),
      text(".\n\nSigned: ____________________________\n\nDate: "),
      field("date", "Date", "20 October 2026"),
      text("\n\n----------------------------------------\n\nADVICE ON RESIGNING\n\nCAN YOU SIMPLY RESIGN?\n\nThat depends entirely on whether the principal still has capacity.\n\n"),
      field("capacity_position", "The principal's capacity position", "Mr Citizen currently has capacity. You may therefore resign by giving him written notice, which is what the document above does."),
      text("\n\nIF THE PRINCIPAL HAS LOST CAPACITY\n\nThis is the point that catches people out. Once the principal has lost capacity, you generally CANNOT simply resign. Resignation usually requires the leave of the relevant State tribunal or the Court.\n\nThe reason is obvious once stated: an incapacitated person cannot appoint a replacement, and allowing an appointee to walk away would leave them with nobody.\n\nIf you purport to resign in that situation without leave, you may remain on the record and remain exposed to the obligations of the role.\n\nWHO MUST BE NOTIFIED\n\n"),
      field("notification", "Who must be notified", "1. The principal.\n2. Any co-attorney or co-guardian.\n3. The substitute appointee, so they know the role now falls to them.\n4. Any institution currently dealing with you in the role -- here, the Commonwealth Bank and the managing agent for the Newtown property."),
      text("\n\nWHAT YOU MUST DO ON RESIGNING\n\n"),
      field("handover", "Handover obligations", "1. Return the original instrument and all copies to the principal.\n2. Provide a full account of everything you have done in the role, with supporting records.\n3. Hand over any of the principal's property, documents or funds in your possession.\n\nYour obligation to account for what you did while acting does not end when you resign."),
    ],
    requiresReview: true,
    reviewNote:
      "Whether an appointee may resign unilaterally, and the tribunal pathway where the principal lacks capacity, differ by state. Confirm the position before purporting to resign -- an ineffective resignation leaves the appointee still bound.",
  },
];
