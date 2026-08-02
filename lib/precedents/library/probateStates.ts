// lib/precedents/library/probateStates.ts
// Deceased estate administration outside NSW, plus estate-planning documents
// whose form is state-specific.
//
// Probate and letters of administration are granted by the Supreme Court of
// each state, under that state's own succession legislation, with its own
// registry practice, advertising requirements and forms:
//
//   VIC  Administration and Probate Act 1958; Wills Act 1997
//   QLD  Succession Act 1981; Uniform Civil Procedure Rules 1999 Ch 15
//   SA   Administration and Probate Act 1919; Wills Act 1936
//   WA   Administration Act 1903; Wills Act 1970
//   TAS  Administration and Probate Act 1935; Wills Act 2008
//
// Family provision (or "testator's family maintenance" in some states) also
// differs materially: who is an eligible person, and the limitation period,
// are not the same across states. Those are the two things most likely to be
// got wrong by assuming the NSW position travels, so both are prompted
// rather than stated.
//
// Enduring powers of attorney and guardianship documents are also
// state-specific in both form and terminology, and a document valid in one
// state is not automatically effective in another.
import { text, field, type PrecedentSeed } from "./types";

const WILLS = ["Wills & Estates"];

export const PROBATE_STATES_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "probvic.application_cover",
    name: "Probate Application - Covering Letter (VIC)",
    description: "Explains the Victorian probate process to an executor.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "letter",
    jurisdictions: ["VIC"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter to an executor about applying for probate in Victoria, under the Administration and Probate Act 1958 (Vic), in the Supreme Court of Victoria. Cover the online advertising of intention to apply, the documents required (original will, death certificate, inventory of assets and liabilities), the affidavit of executor, and the need to identify all assets. Explain the executor should not distribute until the notice periods protecting them have run, and that a family provision claim period applies.",
    segments: [
      text("APPLYING FOR PROBATE - VICTORIA\n\nWHAT PROBATE IS\n\nProbate is an order of the Supreme Court of Victoria confirming the will is valid and that you are authorised to administer the estate. Banks, share registries and Land Use Victoria will generally not deal with estate assets without it.\n\nWHAT WE NEED FROM YOU\n\n1. The original will (not a copy).\n2. The death certificate.\n3. Details of all assets and their values at the date of death.\n4. Details of all liabilities, including funeral expenses.\n\n"),
      field("assets_known", "Assets identified so far", "We understand the estate comprises the property at 24 Example Street, Richmond (approximately $1,180,000), bank accounts of about $64,000, and a share portfolio of about $95,000."),
      text("\n\nTHE PROCESS\n\nWe must first publish an online notice of intention to apply for probate on the Supreme Court website. After the required period we file the application, supported by your affidavit as executor and an inventory of assets and liabilities.\n\n"),
      field("timeframe", "Expected timeframe", "Allow approximately 4 to 8 weeks from filing, longer if the Registry raises a requisition."),
      text("\n\nDO NOT DISTRIBUTE TOO EARLY\n\nAs executor you can be personally liable if you distribute and a valid claim is later made against the estate.\n\nThere are notice periods that must run before you can distribute with protection, and a separate period during which an eligible person may bring a family provision claim. We will tell you when it is safe to distribute -- please do not pay any beneficiary before then, however pressing the request."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm current Supreme Court of Victoria probate advertising requirements, the notice period protecting an executor on distribution, and the family provision limitation period under the Administration and Probate Act 1958 (Vic).",
  },
  {
    key: "probqld.application_cover",
    name: "Probate Application - Covering Letter (QLD)",
    description: "Explains the Queensland probate process to an executor.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "letter",
    jurisdictions: ["QLD"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter to an executor about applying for probate in Queensland, under the Succession Act 1981 (Qld) and UCPR Chapter 15, in the Supreme Court of Queensland. Cover the requirement to publish a notice of intention to apply and to serve it on the Public Trustee, the waiting period before filing, the documents required, and the family provision regime in Queensland which requires notice of an intention to claim within a period and then filing within a further period -- a two-stage structure that differs from other states.",
    segments: [
      text("APPLYING FOR PROBATE - QUEENSLAND\n\nWHAT PROBATE IS\n\nProbate is an order of the Supreme Court of Queensland confirming the will and your authority to administer the estate.\n\nWHAT WE NEED FROM YOU\n\n1. The original will.\n2. The death certificate.\n3. Details of all assets and liabilities with date-of-death values.\n\n"),
      field("assets_known", "Assets identified so far", "We understand the estate comprises the property at 18 Example Street, Ipswich (approximately $720,000) and bank accounts of about $48,000."),
      text("\n\nTHE PROCESS\n\nWe must publish a notice of intention to apply for a grant and serve a copy on the Public Trustee of Queensland. There is then a waiting period before the application can be filed.\n\n"),
      field("timeframe", "Expected timeframe", "Allow approximately 6 to 10 weeks in total, including the notice period."),
      text("\n\nFAMILY PROVISION IN QUEENSLAND - A TWO STAGE PROCESS\n\nQueensland differs from other states. An eligible person who wishes to make a family provision claim must first give NOTICE of that intention within one period, and then FILE the claim within a further period.\n\nThat means the estate may receive notice of a claim well before any proceeding is filed. If you receive anything that looks like such a notice, send it to us immediately and do not distribute.\n\nDO NOT DISTRIBUTE TOO EARLY\n\nYou can be personally liable if you distribute and a claim is later made. We will confirm when it is safe."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm the current notice and filing periods for family provision under the Succession Act 1981 (Qld) -- the two-stage notice-then-file structure is specific to Queensland and the periods must be diarised separately.",
  },
  {
    key: "probsa.application_cover",
    name: "Probate Application - Covering Letter (SA)",
    description: "Explains the South Australian probate process to an executor.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "letter",
    jurisdictions: ["SA"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter to an executor about applying for probate in South Australia, under the Administration and Probate Act 1919 (SA), through the Probate Registry of the Supreme Court of South Australia. Cover the documents required, the process, and the family provision regime under the Inheritance (Family Provision) Act 1972 (SA). Explain the executor should not distribute until the protective periods have run.",
    segments: [
      text("APPLYING FOR PROBATE - SOUTH AUSTRALIA\n\nWHAT PROBATE IS\n\nProbate is a grant from the Probate Registry of the Supreme Court of South Australia confirming the will and your authority as executor.\n\nWHAT WE NEED FROM YOU\n\n1. The original will.\n2. The death certificate.\n3. A full statement of assets and liabilities at the date of death.\n\n"),
      field("assets_known", "Assets identified so far", "We understand the estate comprises the property at 9 Example Street, Norwood (approximately $860,000) and bank accounts of about $52,000."),
      text("\n\nTHE PROCESS\n\n"),
      field("process_note", "Process detail", "We will prepare the application and your supporting affidavit, and lodge with the Probate Registry. Allow approximately 4 to 8 weeks."),
      text("\n\nFAMILY PROVISION\n\nAn eligible person may apply for provision from the estate under the Inheritance (Family Provision) Act 1972 (SA). A limitation period applies, running from the grant.\n\nNOTICE TO CREDITORS\n\nWe recommend publishing a notice of intended distribution, which gives creditors a fixed period to make a claim and, once that period passes without a claim, protects you from personal liability to a creditor you did not know about.\n\nDO NOT DISTRIBUTE TOO EARLY\n\nYou can be personally liable if you distribute and a valid claim is later made. We will confirm when distribution is safe.\n\nOUR FEES\n\n"),
      field("fee_estimate", "Fee estimate for the application", "Our estimate for obtaining the grant, exclusive of the Court filing fee and disbursements, is $2,800 to $3,600 plus GST, depending on the complexity of the assets."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm who is an eligible person and the current limitation period under the Inheritance (Family Provision) Act 1972 (SA) -- eligibility differs materially from NSW.",
  },
  {
    key: "probwa.application_cover",
    name: "Probate Application - Covering Letter (WA)",
    description: "Explains the Western Australian probate process to an executor.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "letter",
    jurisdictions: ["WA"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter to an executor about applying for probate in Western Australia, under the Administration Act 1903 (WA), through the Probate Registry of the Supreme Court of Western Australia. Cover the documents required, the process, and family provision under the Family Provision Act 1972 (WA). Note the executor's exposure if distributing early.",
    segments: [
      text("APPLYING FOR PROBATE - WESTERN AUSTRALIA\n\nWHAT PROBATE IS\n\nProbate is a grant from the Probate Registry of the Supreme Court of Western Australia confirming the will and your authority to administer the estate.\n\nWHAT WE NEED FROM YOU\n\n1. The original will.\n2. The death certificate.\n3. A statement of all assets and liabilities at the date of death.\n\n"),
      field("assets_known", "Assets identified so far", "We understand the estate comprises the property at 42 Example Street, Subiaco (approximately $980,000) and bank accounts of about $71,000."),
      text("\n\nTHE PROCESS\n\n"),
      field("process_note", "Process detail", "We will prepare the application, your affidavit and the statement of assets and liabilities for lodgement with the Probate Registry. Allow approximately 4 to 8 weeks."),
      text("\n\nFAMILY PROVISION\n\nAn eligible person may apply for provision under the Family Provision Act 1972 (WA), within the limitation period running from the grant.\n\nNOTICE TO CREDITORS\n\nWe recommend publishing a notice of intended distribution to give creditors a fixed period to come forward. Once that period passes without a claim, you are protected from personal liability to a creditor you did not know about.\n\nDO NOT DISTRIBUTE TOO EARLY\n\nDistributing before the protective period has run exposes you personally if a claim is made. We will advise when it is safe to distribute.\n\nOUR FEES\n\n"),
      field("fee_estimate", "Fee estimate for the application", "Our estimate for obtaining the grant, exclusive of the Court filing fee and disbursements, is $2,800 to $3,600 plus GST, depending on the complexity of the assets."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm eligibility and the current limitation period under the Family Provision Act 1972 (WA) before advising the executor when distribution is safe.",
  },
  {
    key: "probtas.application_cover",
    name: "Probate Application - Covering Letter (TAS)",
    description: "Explains the Tasmanian probate process to an executor.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "letter",
    jurisdictions: ["TAS"],
    matterTypes: WILLS,
    aiInstructions:
      "Draft a letter to an executor about applying for probate in Tasmania, under the Administration and Probate Act 1935 (Tas), in the Supreme Court of Tasmania. Cover the documents required, advertising of intention to apply, the process, and family provision under the Testator's Family Maintenance Act 1912 (Tas) -- noting Tasmania uses the older 'testator's family maintenance' terminology rather than 'family provision'.",
    segments: [
      text("APPLYING FOR PROBATE - TASMANIA\n\nWHAT PROBATE IS\n\nProbate is a grant from the Supreme Court of Tasmania confirming the will and your authority as executor.\n\nWHAT WE NEED FROM YOU\n\n1. The original will.\n2. The death certificate.\n3. Details of all assets and liabilities at the date of death.\n\n"),
      field("assets_known", "Assets identified so far", "We understand the estate comprises the property at 7 Example Street, Battery Point (approximately $690,000) and bank accounts of about $38,000."),
      text("\n\nTHE PROCESS\n\n"),
      field("process_note", "Process detail", "We will advertise the intention to apply, then lodge the application with your supporting affidavit. Allow approximately 4 to 8 weeks."),
      text("\n\nCLAIMS AGAINST THE ESTATE\n\nIn Tasmania, claims of this kind are made under the Testator's Family Maintenance Act 1912 (Tas). You may see the term 'testator's family maintenance' rather than 'family provision' used elsewhere -- it is the same concept.\n\nA limitation period applies, running from the grant.\n\nDO NOT DISTRIBUTE TOO EARLY\n\nYou can be personally liable if you distribute and a claim is later made. We will confirm when it is safe."),
    ],
    requiresReview: true,
    reviewNote:
      "Confirm eligibility and the current limitation period under the Testator's Family Maintenance Act 1912 (Tas) before advising on distribution.",
  },
  {
    key: "prob.small_estate_advice",
    name: "Small Estate - Is a Grant Required?",
    description: "Advises whether probate is actually needed, or whether assets can be released without a grant.",
    category: "Wills & Estates",
    subcategory: "Estate Administration",
    documentType: "advice",
    matterTypes: WILLS,
    aiInstructions:
      "Draft advice on whether a grant of probate or administration is actually required. Explain that a grant is generally needed where the deceased held real property in their sole name, or where an institution holds funds above its own release threshold. Explain that jointly held property passes by survivorship without a grant, and that superannuation and life insurance with a valid nomination pass outside the estate. Note that institutional thresholds for release without a grant differ between banks and are set by each institution, not by law, so they must be checked with each. Recommend a grant anyway where there is any prospect of a claim, because a grant starts limitation periods running.",
    segments: [
      text("DO YOU ACTUALLY NEED PROBATE?\n\nNot every estate requires a grant. It is worth checking before incurring the cost.\n\nWHEN A GRANT IS USUALLY REQUIRED\n\n1. The deceased held real property in their SOLE name.\n2. An institution holds funds above the threshold at which it will release without a grant.\n\nWHEN IT USUALLY IS NOT\n\n1. Property held as JOINT TENANTS passes automatically to the survivor. No grant is needed -- only a notification of death to the land registry.\n2. Superannuation with a valid binding death benefit nomination passes to the nominee, outside the estate.\n3. Life insurance with a nominated beneficiary likewise.\n4. Small bank balances, where the institution will release on production of a death certificate and an indemnity.\n\nIMPORTANT: release thresholds are set by each institution, not by law. They differ between banks and change. We will check with each institution holding funds.\n\nTHIS ESTATE\n\n"),
      field("estate_position", "Position in this estate", "The family home was held as joint tenants and passes to the surviving spouse by survivorship. The deceased's superannuation had a valid binding nomination in favour of the spouse. The only remaining assets are two bank accounts totalling approximately $34,000 and a vehicle."),
      text("\n\nOUR ADVICE\n\n"),
      field("advice", "Our advice", "On the face of it, a grant may not be required. We will write to both banks to confirm whether they will release the funds on production of the death certificate and an indemnity. If either declines, a grant will be needed for that account alone."),
      text("\n\nONE REASON TO OBTAIN A GRANT ANYWAY\n\n"),
      field("claim_risk", "Claim risk consideration", "If there is any realistic prospect of a family provision claim, a grant is worth obtaining even where not strictly necessary, because the limitation period for such claims generally runs from the date of the grant. Without one, the estate can remain exposed indefinitely."),
    ],
    requiresReview: true,
    reviewNote:
      "Institutional release thresholds are set by each institution and change. Confirm with each before advising that no grant is required, and confirm how the family provision limitation period runs in the relevant state.",
  },
];
