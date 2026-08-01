// lib/precedents/library/willsEstatesNsw.ts
// Wills, estate planning and deceased estate administration in NSW --
// Succession Act 2006 (NSW), with probate and administration granted by the
// Supreme Court of NSW.
//
// NSW-specific because succession legislation, the probate registry's own
// requirements, the notice-of-intended-distribution regime and the family
// provision rules all differ between states. The equivalents in VIC/QLD/SA/
// WA/TAS are separate precedents rather than one document with placeholders.
//
// Not hard-coded anywhere below: the family provision limitation period and
// the notice periods that protect an executor on distribution. Both are
// central to the advice and both must be confirmed against the current Act
// rather than quoted from memory.
import { text, field, type PrecedentSeed } from "./types";

const WILLS = ["Wills & Estates"];

export const WILLS_ESTATES_NSW_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "wills.will_instructions_confirmation",
    name: "Will Instructions Confirmation (NSW)",
    description: "Confirms the client's will instructions before drafting.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter confirming will instructions. Set out the executors and substitutes, the beneficiaries and their shares, any specific gifts, guardianship of minor children, funeral wishes, and what happens if a beneficiary predeceases. Flag anything that creates risk -- excluding a person who might make a family provision claim, gifts of jointly held property that pass by survivorship instead, superannuation and life insurance that pass outside the will, and assets held in a trust or company that the client does not personally own. Ask the client to confirm before drafting.",
    segments: [
      text("WILL INSTRUCTIONS - PLEASE CONFIRM\n\nThank you for your instructions. Before we draft your will, please confirm the following is correct.\n\nEXECUTORS\n\n"),
      field("executors", "Executors and substitutes", "Primary: your spouse, Mary Citizen. If she does not survive you or is unwilling to act: your daughter, Sarah Citizen."),
      text("\n\nBENEFICIARIES\n\n"),
      field("beneficiaries", "Beneficiaries and shares", "Your entire estate to your spouse Mary Citizen if she survives you by 30 days. If she does not, equally between your children Sarah and Thomas, with a deceased child's share passing to their own children."),
      text("\n\nSPECIFIC GIFTS\n\n"),
      field("specific_gifts", "Specific gifts", "Your grandfather's watch to your son Thomas. $10,000 to the Cancer Council."),
      text("\n\nGUARDIANSHIP\n\n"),
      field("guardianship", "Guardianship of minor children", "Not applicable - your children are adults."),
      text("\n\nIMPORTANT - ASSETS THAT DO NOT PASS UNDER YOUR WILL\n\nSome assets are not controlled by your will:\n\n"),
      field("non_estate_assets", "Non-estate assets", "1. Your family home is held as joint tenants with your spouse. It passes to her automatically by survivorship, regardless of your will.\n2. Your superannuation ($420,000) passes according to your binding death benefit nomination, not your will. Your current nomination is over three years old and may have lapsed - please check with your fund.\n3. Your life insurance passes to the nominated beneficiary."),
      text("\n\nMATTERS WE HAVE FLAGGED\n\n"),
      field("risk_flags", "Risks flagged", "You have instructed that your son Thomas receive a smaller share than his sister. Thomas is an eligible person who could make a family provision claim against your estate. We recommend we prepare a statement of your reasons to be kept with the will."),
      text("\n\nPlease confirm these instructions, or tell us what needs to change, and we will prepare the draft."),
    ],
  },
  {
    key: "wills.will_execution_instructions",
    name: "Will - Execution Instructions (NSW)",
    description: "Sends the will for signing with strict instructions on how to execute it validly.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter enclosing a will for execution. Give precise signing instructions: sign at the end in the presence of two witnesses both present at the same time, who then sign in the testator's presence; witnesses must not be beneficiaries or the spouse of a beneficiary; use the same pen and do not detach or re-staple the pages; do not write on, mark or amend the will after signing. Explain where the original should be kept and that a photocopy is not sufficient. Warn that failure to follow these steps can invalidate the will.",
    segments: [
      text("We enclose your will for signing.\n\nPLEASE FOLLOW THESE STEPS EXACTLY. A will that is not correctly executed may be invalid.\n\nHOW TO SIGN\n\n1. Arrange for TWO witnesses to be present with you at the same time.\n2. Neither witness may be a beneficiary under the will, nor the spouse or partner of a beneficiary. A gift to a witness (or their spouse) may fail.\n3. You sign first, at the end of the will, in the presence of both witnesses while they are both watching.\n4. Each witness then signs in your presence.\n5. All three of you should also initial the bottom of every other page.\n6. Use the same pen throughout and date it the day you sign.\n\nWHAT NOT TO DO\n\n- Do not detach, unstaple or re-staple the pages. Marks left by removed staples can raise questions about whether another document was attached.\n- Do not write on, highlight or amend the will after signing. Any alteration can invalidate the change or the will.\n- Do not sign a photocopy.\n\nWHERE TO KEEP IT\n\n"),
      field("storage", "Storage arrangements", "We recommend we hold the original in our safe custody at no charge, and you keep a copy. Please tell your executors where the original is held."),
      text("\n\nAlternatively, you are welcome to sign the will at our office and we will arrange witnesses. Many clients prefer this and it removes the risk of an execution error.\n\nPlease contact us to arrange a time if you would like to do so."),
    ],
  },
  {
    key: "wills.epa_advice",
    name: "Enduring Power of Attorney - Advice (NSW)",
    description: "Explains what an enduring power of attorney does and its risks.",
    category: "Wills & Estates",
    subcategory: "Estate Planning",
    documentType: "advice",
    jurisdictions: ["NSW"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft advice on an enduring power of attorney in NSW. Explain that it covers financial and legal decisions only (not medical or lifestyle, which require an enduring guardian), that 'enduring' means it continues if the principal loses capacity, when it commences, and that the attorney must keep the principal's money separate and keep records. Be direct about the risk: an attorney has very wide power over the principal's finances and misuse is common, so the choice of attorney matters more than any drafting. Explain registration is needed if the attorney will deal with land.",
    segments: [
      text("ENDURING POWER OF ATTORNEY - ADVICE\n\nWHAT IT COVERS\n\nAn enduring power of attorney allows the person you appoint to make FINANCIAL AND LEGAL decisions for you -- operating bank accounts, paying bills, selling property, dealing with investments.\n\nIt does NOT cover medical treatment or lifestyle decisions such as where you live. Those require an appointment of enduring guardian, which is a separate document.\n\nWHAT 'ENDURING' MEANS\n\nAn ordinary power of attorney ends if you lose mental capacity. An enduring power continues, which is precisely when it is most needed.\n\nWHEN IT STARTS\n\n"),
      field("commencement", "When the power commences", "You have instructed that the power commence only when a medical practitioner certifies you lack capacity to manage your own affairs."),
      text("\n\nYOUR ATTORNEY\n\n"),
      field("attorney", "Attorney and substitutes", "Primary: your spouse, Mary Citizen. Substitute: your daughter, Sarah Citizen."),
      text("\n\nPLEASE UNDERSTAND THE RISK\n\nAn attorney has very broad control over your money and property. Misuse of enduring powers of attorney is unfortunately common, and it is often difficult to recover money once it has gone.\n\nAppoint only someone you trust completely and who is capable of managing money properly. Your attorney must keep your money separate from their own and keep records of what they do.\n\n"),
      field("safeguards", "Safeguards adopted", "You have chosen to appoint your spouse and daughter jointly for any transaction over $20,000, which provides a useful check."),
      text("\n\nREGISTRATION\n\nIf your attorney will need to deal with land -- selling or mortgaging your property -- the power must be registered with NSW Land Registry Services. We recommend registering it now rather than at a time of crisis."),
    ],
  },
  {
    key: "wills.probate_application_cover",
    name: "Probate Application - Covering Letter to Executor (NSW)",
    description: "Explains the probate process to the executor and what is needed to apply.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter to an executor about applying for probate. Explain what probate is and why it is needed, the requirement to publish a notice of intended application, the documents required (original will, death certificate, inventory of property), the need to identify all assets and liabilities, and the timeframe. Explain that the executor should not distribute until the notice periods protecting them have expired. Do NOT state those periods as fixed figures without flagging verification.",
    segments: [
      text("APPLYING FOR PROBATE\n\nWHAT PROBATE IS\n\nProbate is an order of the Supreme Court of NSW confirming the will is valid and that you, as executor, are authorised to administer the estate. Banks, share registries and the Land Registry will generally not deal with estate assets until probate is granted.\n\nWHAT WE NEED FROM YOU\n\n1. The original will (not a copy).\n2. The death certificate.\n3. Details of all assets: bank accounts, property, shares, superannuation, vehicles, personal effects, with approximate values at the date of death.\n4. Details of all liabilities: mortgages, loans, credit cards, funeral expenses, outstanding tax.\n\n"),
      field("assets_known", "Assets identified so far", "We understand the estate comprises the property at 12 Example Street (approximately $1,150,000), bank accounts of about $86,000, and a share portfolio of about $140,000."),
      text("\n\nTHE PROCESS\n\nWe must first publish an online notice of intended application for probate. After the required period we can file the application. The Registry then reviews it, and if in order, the grant issues.\n\n"),
      field("timeframe", "Expected timeframe", "Registry processing times vary. Allow approximately 6 to 10 weeks from filing, longer if the Registry raises a requisition."),
      text("\n\nIMPORTANT - DO NOT DISTRIBUTE TOO EARLY\n\nAs executor you are personally liable if you distribute the estate and a valid claim is later made against it.\n\nThere are notice periods that must expire before you can distribute with protection, and a separate period during which an eligible person may bring a family provision claim. We will advise you when it is safe to distribute.\n\nPlease do not pay out any beneficiary, however pressing their request, until we confirm."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current notice-of-intended-distribution periods and the family provision limitation period under the Succession Act 2006 (NSW) before advising the executor when distribution is safe.",
  },
  {
    key: "wills.letters_of_administration_cover",
    name: "Letters of Administration - Covering Letter (NSW)",
    description: "Explains intestacy and the administration application where there is no will.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter about applying for letters of administration where the deceased left no valid will. Explain intestacy: that the estate is distributed according to the statutory order regardless of what the deceased may have wanted or said; who is entitled to apply for administration; and that the order of entitlement to the estate is fixed by statute. Set out the likely distribution. Explain that an administration bond or sureties may be required in some circumstances.",
    segments: [
      text("LETTERS OF ADMINISTRATION - NO WILL\n\nWHAT INTESTACY MEANS\n\n"),
      field("deceased", "Deceased", "Robert Citizen, who died on 3 July 2026"),
      text(" did not leave a valid will. The estate is therefore distributed according to the statutory rules of intestacy in the Succession Act 2006 (NSW).\n\nThose rules apply regardless of what the deceased may have said or intended. Verbal wishes have no effect.\n\nWHO CAN APPLY\n\nThe person with the greatest entitlement to the estate generally has the first right to apply to administer it.\n\n"),
      field("applicant", "Proposed administrator", "As the deceased's spouse, you have the primary entitlement to apply."),
      text("\n\nLIKELY DISTRIBUTION\n\n"),
      field("distribution", "Statutory distribution", "As the deceased left a spouse and children of that same relationship, the whole estate passes to you as the surviving spouse. Had there been children from an earlier relationship, the position would be different."),
      text("\n\nTHE PROCESS\n\nWe must publish a notice of intended application, then file the application with the Supreme Court. The Court will require evidence of the death, of your relationship to the deceased, and of the assets and liabilities.\n\n"),
      field("additional_requirements", "Any additional requirements", "As all beneficiaries are adults and there is no dispute, we do not expect the Court to require an administration bond."),
      text("\n\nAs with probate, do not distribute any part of the estate until we advise it is safe to do so."),
    ],
    requiresReview: true,
    reviewNote:
      "The intestacy distribution rules are detailed, particularly where there are children from another relationship or no spouse. Confirm the statutory order under the Succession Act 2006 (NSW) applies as described.",
  },
  {
    key: "wills.executor_duties_letter",
    name: "Executor's Duties (NSW)",
    description: "Explains to a newly appointed executor what the role actually requires.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter explaining an executor's duties. Cover: securing and insuring assets; identifying all assets and liabilities; not mixing estate money with their own; keeping proper accounts; acting impartially between beneficiaries; paying debts before distributing; lodging any outstanding tax returns and a date-of-death return; and personal liability for getting it wrong. Also explain they are entitled to be reimbursed reasonable expenses and to obtain professional help at estate cost. Reassure -- most new executors find this daunting.",
    segments: [
      text("YOUR ROLE AS EXECUTOR\n\nBeing an executor is a legal office with real responsibilities. This letter explains what is expected of you. Most of it is manageable, and we will help you through each step.\n\nWHAT YOU MUST DO\n\n1. SECURE THE ASSETS. Make sure property is locked, insured and the insurer told the property is unoccupied. Unoccupied property is often not covered under an ordinary policy.\n\n2. IDENTIFY EVERYTHING. All assets and all debts, valued as at the date of death.\n\n3. KEEP ESTATE MONEY SEPARATE. Never mix estate funds with your own. Open a dedicated estate account.\n\n4. KEEP RECORDS. You must be able to account to the beneficiaries for every dollar in and out.\n\n5. BE IMPARTIAL. You act for all beneficiaries equally, even those you may not get on with, and even if you are also a beneficiary.\n\n6. PAY DEBTS FIRST. Debts, funeral and administration expenses and tax are paid before any beneficiary receives anything.\n\n7. TAX. Any outstanding returns for the deceased must be lodged, plus a date-of-death return, and possibly estate returns.\n\nYOUR PERSONAL EXPOSURE\n\nIf you distribute the estate and it turns out a debt was unpaid or a valid claim is made, you can be personally liable for it. That is why we will tell you when it is safe to distribute, and why you should not pay anyone early.\n\nWHAT YOU ARE ENTITLED TO\n\nYou may reimburse yourself reasonable out-of-pocket expenses from the estate, and you may engage solicitors and accountants at the estate's cost.\n\n"),
      field("commission_note", "Executor's commission note", "You may also apply to the Court for commission for your time and trouble, though most family executors do not."),
      text("\n\nNEXT STEPS\n\n"),
      field("next_steps", "Next steps", "Please provide us with the original will, the death certificate, and a list of the assets and debts you are aware of. We will then prepare the probate application."),
    ],
  },
  {
    key: "wills.notice_to_institutions",
    name: "Notification of Death to Institution (NSW)",
    description: "Notifies a bank, share registry or other institution of the death and requests date-of-death balances.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter notifying an institution of a death and requesting information. Ask for the balance as at the date of death, details of any accrued interest, details of any liabilities, confirmation of any nominated beneficiary, and the institution's requirements for release of funds. Ask that the account be frozen against further withdrawals but that direct debits for insurance be maintained if relevant.",
    segments: [
      text("NOTIFICATION OF DEATH\n\nWe act for the executor of the estate of "),
      field("deceased", "Deceased", "Robert Citizen"),
      text(", late of "),
      field("deceased_address", "Deceased's address", "12 Example Street, Sydney NSW 2000"),
      text(", who died on "),
      field("date_of_death", "Date of death", "3 July 2026"),
      text(".\n\nWe enclose a certified copy of the death certificate.\n\nAccount/reference: "),
      field("account_reference", "Account or reference", "Account 1234 5678"),
      text("\n\nPlease provide:\n\n1. the balance as at the date of death, and any interest accrued to that date;\n2. details of any liabilities owing;\n3. confirmation of any nominated beneficiary or binding death benefit nomination;\n4. your requirements for release of the funds to the estate.\n\nPlease place a stop on any further withdrawals from the account, but "),
      field("direct_debits", "Direct debit instruction", "please continue to honour the direct debit for the building insurance on the property"),
      text(".\n\nWe will provide a copy of the grant of probate once it issues."),
    ],
  },
  {
    key: "wills.family_provision_initial",
    name: "Family Provision Claim - Initial Letter (NSW)",
    description: "Notifies an estate of an intended family provision claim under the Succession Act.",
    category: "Wills & Estates",
    subcategory: "Family Provision",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter on behalf of a claimant notifying the executor of an intended family provision claim in NSW. Identify the claimant and the basis on which they are an eligible person, state that they were left without adequate provision for their proper maintenance, education or advancement in life, request that the estate not be distributed, and ask for an inventory of the estate. Propose mediation. Note the limitation period applies and that the claim will be filed if not resolved.",
    segments: [
      text("INTENDED FAMILY PROVISION CLAIM\n\nWe act for "),
      field("claimant", "Our client", "Thomas Citizen"),
      text(" in relation to the estate of "),
      field("deceased", "Deceased", "Robert Citizen, who died on 3 July 2026"),
      text(".\n\nELIGIBILITY\n\nOur client is an eligible person, being "),
      field("eligibility", "Basis of eligibility", "a child of the deceased"),
      text(".\n\nTHE CLAIM\n\nOur client's position is that the provision made for him "),
      field("claim_basis", "Basis of the claim", "under the will dated 2 February 2024, being a legacy of $20,000 from an estate of approximately $1.3 million, is not adequate provision for his proper maintenance and advancement in life. Our client is 34, has a chronic health condition limiting his capacity to work, and has no assets of substance."),
      text("\n\nPLEASE DO NOT DISTRIBUTE\n\nWe put you on notice of this claim. Please do not distribute the estate, or any part of it, pending resolution. If you distribute with notice of this claim you may be personally liable.\n\nPLEASE PROVIDE\n\n1. A copy of the will and any earlier will.\n2. An inventory of the estate assets and liabilities with values.\n3. Confirmation of what, if anything, has been distributed to date.\n\nRESOLUTION\n\nOur client would prefer to resolve this without litigation. We propose mediation once the estate's position is known.\n\nWe note the limitation period for filing and our client will file within time if the matter is not resolved."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current family provision limitation period under the Succession Act 2006 (NSW) and diarise it immediately. Late claims require leave and are not always granted.",
  },
  {
    key: "wills.estate_account_to_beneficiaries",
    name: "Estate Account to Beneficiaries (NSW)",
    description: "Provides beneficiaries with the estate accounts before distribution.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "letter",
    jurisdictions: ["NSW"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter providing estate accounts to beneficiaries. Set out assets realised, liabilities and expenses paid, administration costs, and the net balance available for distribution with each beneficiary's entitlement. Invite queries within a stated period and ask for signed confirmation before distribution. Be transparent -- most beneficiary disputes come from poor communication rather than actual wrongdoing.",
    segments: [
      text("ESTATE ACCOUNTS\n\nEstate of "),
      field("deceased", "Deceased", "Robert Citizen"),
      text("\n\nAdministration of the estate is now substantially complete. The accounts are set out below.\n\n"),
      field("accounts", "Estate accounts", "ASSETS REALISED\nSale of 12 Example Street                  $1,148,000.00\nCommonwealth Bank accounts                     $86,412.30\nShare portfolio (sold)                        $141,206.85\nMotor vehicle                                  $18,500.00\n                                            ---------------\nTOTAL ASSETS                                $1,394,119.15\n\nLESS LIABILITIES AND EXPENSES\nFuneral expenses                               -$9,840.00\nOutstanding credit card                        -$4,212.66\nRates and utilities to date of sale            -$2,106.40\nIncome tax (date of death return)              -$3,880.00\nLegal costs and disbursements                 -$14,300.00\nProbate filing and publication fees            -$1,842.00\n                                            ---------------\nNET ESTATE                                  $1,357,938.09"),
      text("\n\nDISTRIBUTION\n\n"),
      field("distribution", "Each beneficiary's entitlement", "Mary Citizen (spouse) - whole of residue: $1,337,938.09\nThomas Citizen - legacy: $20,000.00"),
      text("\n\nIF YOU HAVE QUESTIONS\n\nPlease raise any query about these accounts by "),
      field("query_deadline", "Query by", "30 October 2026"),
      text(". If we do not hear from you we will proceed to distribute on that basis.\n\nPlease sign and return the enclosed acknowledgement so that distribution can be made."),
    ],
  },
];
