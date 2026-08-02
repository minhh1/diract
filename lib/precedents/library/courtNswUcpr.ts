// lib/precedents/library/courtNswUcpr.ts
// NSW court documents written against the actual UCPR approved forms.
//
// These replace the earlier generic court skeletons in litigationCourt.ts,
// which had the right section names but invented the layout and left the
// substance to be generated at issue time. A court document is not a letter:
// it is filed under a prescribed form, and a form that doesn't match the
// approved one gets rejected at the registry or, worse, accepted and then
// challenged.
//
// Source: the approved forms published at
// https://www.dcj.nsw.gov.au/content/dcj/ctsd/ucpr/ucpr.html
//   Form 3A v7  (UCPR 6.2)   Statement of claim - legally represented
//   Form 6A v1  (UCPR 6.9, 6.11) Appearance
//   Form 7A v5  (UCPR 14.3)  Defence - legally represented
//   Form 9  v6  (UCPR 9.1)   Statement of cross-claim
//   Form 11 v3  (UCPR 21.3)  List of documents
//   Form 19 v2  (UCPR 21.10) Notice to produce for inspection
//   Form 20 v3  (UCPR 18.1, 18.3) Notice of motion
//   Form 26A v5 (UCPR 33.2)  Subpoena to produce
//   Form 40 v8  (UCPR 35.1)  Affidavit
//
// Every UCPR form shares the same opening shell -- COURT DETAILS, TITLE OF
// PROCEEDINGS, FILING DETAILS -- so that is written once in ucprShell() and
// each document adds its own operative part. The shell's field labels are the
// form's own labels, including the '#' prefix the forms use to mark optional
// lines, so that a solicitor comparing this against the approved form sees
// the same words in the same order.
//
// Form numbers and versions move. Each of these carries requiresReview with
// the version it was written against, so staff check the current form rather
// than trusting a version number baked in here.
import { text, field, type PrecedentSeed } from "./types";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

const NSW = ["NSW" as const];
const CIVIL = ["Litigation"];

/**
 * COURT DETAILS / TITLE OF PROCEEDINGS / FILING DETAILS, verbatim from the
 * approved forms. `filedForRole` is the role of the party filing ("plaintiff",
 * "defendant"), and `heading` is the form's own title line.
 *
 * `preparation` switches FILING DETAILS to PREPARATION DETAILS, which the
 * forms use for documents that are served rather than filed (Form 19).
 */
function ucprShell(opts: {
  formLine: string;
  heading: string;
  filedForRole: string;
  preparation?: boolean;
}): BodyTemplateSegment[] {
  return [
    text(`${opts.formLine}\n\n${opts.heading}\n\nCOURT DETAILS\n\nCourt: `),
    field("court", "Court", "Supreme Court of New South Wales"),
    text("\nDivision: "),
    field("division", "Division (if any)", "Common Law"),
    text("\nList: "),
    field("list", "List (if any)", "General"),
    text("\nRegistry: "),
    field("registry", "Registry", "Sydney"),
    text("\nCase number: "),
    field("case_number", "Case number", "2026/00012345"),
    text("\n\nTITLE OF PROCEEDINGS\n\nFirst plaintiff: "),
    field("plaintiff", "First plaintiff", "ACME Pty Ltd ACN 000 000 000"),
    text("\nFirst defendant: "),
    field("defendant", "First defendant", "John Citizen"),
    text(
      "\n\n[Where there is more than one plaintiff or defendant, state the second party and the total number, and refer to the Party Details at the rear of the form for the full list.]" +
      `\n\n${opts.preparation ? "PREPARATION DETAILS\n\nPrepared for: " : "FILING DETAILS\n\nFiled for: "}`
    ),
    field("filed_for", `Party ${opts.preparation ? "preparing" : "filing"} and role`, `ACME Pty Ltd, ${opts.filedForRole}`),
    text("\nLegal representative: "),
    field("legal_rep", "Solicitor on record and firm", "Jane Smith, Huynh Lawyers"),
    text("\nLegal representative reference: "),
    field("our_reference", "Reference", "JS:260575", "matter_number"),
    text("\nContact name and telephone: "),
    field("contact", "Contact name and telephone", "Jane Smith, (02) 9000 0000"),
    text("\nContact email: "),
    field("contact_email", "Contact email", "jsmith@example.com.au"),
  ];
}

/**
 * The signature block used by originating and pleading forms, including the
 * certificate required by cl 4 of Sch 2 to the Legal Profession Uniform Law
 * Application Act 2014 -- a solicitor cannot file a damages claim without
 * certifying reasonable prospects of success, and the certificate is part of
 * the form rather than an optional extra.
 */
function signatureWithProspectsCertificate(docNoun: string): BodyTemplateSegment[] {
  return [
    text(
      "\n\nSIGNATURE OF LEGAL REPRESENTATIVE\n\n" +
      `[Delete whichever does not apply.]\n\n#This ${docNoun} does not require a certificate under clause 4 of Schedule 2 to the Legal Profession Uniform Law Application Act 2014.\n\n` +
      "#I certify under clause 4 of Schedule 2 to the Legal Profession Uniform Law Application Act 2014 that there are reasonable grounds for believing on the basis of provable facts and a reasonably arguable view of the law that the claim for damages in this " +
      `${docNoun} has reasonable prospects of success.\n\n` +
      "I have advised the plaintiff that court fees may be payable during these proceedings. These fees may include a hearing allocation fee.\n\nSignature: ______________________________\n\nCapacity: "
    ),
    field("signing_capacity", "Capacity", "Solicitor on record"),
    text("\nDate of signature: "),
    field("signature_date", "Date of signature", "12 August 2026"),
  ];
}

/**
 * The jurat and witness certification from Form 40, including the UCPR 35.7B
 * requirements. Written out because getting a jurat wrong is one of the
 * commonest reasons an affidavit is rejected.
 */
const AFFIDAVIT_JURAT: BodyTemplateSegment[] = [
  text(
    "\n\nSWORN / AFFIRMED at "
  ),
  field("jurat_place", "Place sworn or affirmed", "Sydney"),
  text("\n\nSignature of deponent: ______________________________\n\nName of witness: "),
  field("witness_name", "Name of witness", "Jane Smith"),
  text("\nAddress of witness: "),
  field("witness_address", "Address of witness", "Level 1, 100 George Street, Sydney NSW 2000"),
  text(
    "\nCapacity of witness: [Justice of the peace / Solicitor / Barrister / Commissioner for affidavits / Notary public]\n\n" +
    "And as a witness, I certify the following matters concerning the person who made this affidavit (the deponent):\n\n" +
    "1. [Delete whichever does not apply.]\n" +
    "   #I saw the face of the deponent.\n" +
    "   #I did not see the face of the deponent because the deponent was wearing a face covering, but I am satisfied that the deponent had a special justification for not removing the covering.\n\n" +
    "2. [Delete whichever does not apply.]\n" +
    "   #I have known the deponent for at least 12 months.\n" +
    "   #I have confirmed the deponent's identity using the following identification document: ______________________________\n\n" +
    "Signature of witness: ______________________________\n\n" +
    "Note: The deponent and witness must sign each page of the affidavit. See UCPR 35.7B."
  ),
];

const REVIEW_FORM = (form: string, version: string) =>
  `Written against ${form} (${version}). Approved forms are amended from time to time -- download the current version from the UCPR forms page before filing and check the version line and rule reference still match.`;

export const COURT_NSW_UCPR_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "court.nsw.ucpr.form_3a_statement_of_claim",
    name: "Statement of Claim (NSW UCPR Form 3A)",
    description: "Originating pleading in the approved form, with the prospects-of-success certificate, notice to defendant and affidavit verifying.",
    category: "Litigation",
    subcategory: "Commencing proceedings",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CIVIL,
    requiresReview: true,
    reviewNote: REVIEW_FORM("UCPR Form 3A", "version 7") +
      " Do not include the affidavit verifying in Local Court proceedings (see the Guide to preparing documents for the other exceptions).",
    aiInstructions:
      "Draft the pleadings and particulars for a statement of claim in the approved NSW form. Plead material facts, not evidence and not law. One allegation per numbered paragraph. Order: the parties and their capacity; the agreement or duty relied on and its material terms; performance by the plaintiff; the breach; causation; loss and damage. Give particulars where required, and always for fraud, misrepresentation, and any statutory cause of action. State the relief in the RELIEF CLAIMED section as a numbered prayer, not in the body. Do not plead a conclusion without the facts that support it -- asserting breach without pleading the term breached invites a strike-out application.",
    segments: [
      ...ucprShell({
        formLine: "Form 3A (version 7)\nUCPR 6.2",
        heading: "STATEMENT OF CLAIM",
        filedForRole: "plaintiff",
      }),
      text("\n\nTYPE OF CLAIM\n\n"),
      field("type_of_claim", "Type of claim", "Commercial - contract"),
      text(
        "\n\n[Select the type of claim from the list in the Guide to preparing documents on the UCPR website.]" +
        "\n\nRELIEF CLAIMED\n\n1. "
      ),
      field("relief_1", "First relief claimed", "Judgment in the sum of $250,000"),
      text("\n2. "),
      field("relief_2", "Further relief claimed", "Interest pursuant to s 100 of the Civil Procedure Act 2005 (NSW)"),
      text(
        "\n3. Costs.\n\n" +
        "[For a liquidated claim, complete the following. Delete it for an unliquidated claim.]\n\n" +
        "Amount of claim: $"
      ),
      field("amount_of_claim", "Amount of claim", "250,000.00"),
      text("\nInterest: $"),
      field("interest_amount", "Interest", "8,450.00"),
      text("\nFiling fees: $"),
      field("filing_fees", "Filing fees", "1,286.00"),
      text("\nService fees: $"),
      field("service_fees", "Service fees", "120.00"),
      text("\nSolicitors fees: $"),
      field("solicitors_fees", "Solicitors fees", "2,600.00"),
      text("\nTOTAL: $"),
      field("total_claim", "Total", "262,456.00"),
      text(
        "\n\nPLEADINGS AND PARTICULARS\n\nTHE PARTIES\n\n1. The plaintiff is and was at all material times "
      ),
      field("plaintiff_capacity", "Plaintiff's capacity", "a company incorporated under the Corporations Act 2001 (Cth) and able to be sued"),
      text(".\n\n2. The defendant is and was at all material times "),
      field("defendant_capacity", "Defendant's capacity", "a company incorporated under the Corporations Act 2001 (Cth) and able to be sued"),
      text(".\n\nTHE AGREEMENT\n\n3. On or about "),
      field("agreement_date", "Date of the agreement", "1 March 2025"),
      text(", the plaintiff and the defendant entered into an agreement ("),
      field("agreement_defined_term", "Defined term for the agreement", "the Agreement"),
      text(") "),
      field("agreement_form", "How the agreement was made", "in writing, constituted by the plaintiff's quotation dated 1 March 2025 and the defendant's written acceptance dated 3 March 2025"),
      text(".\n\n4. The material terms of the Agreement were:\n\n   (a) "),
      field("term_a", "First material term", "the plaintiff would supply and install the goods described in the quotation"),
      text(";\n   (b) "),
      field("term_b", "Second material term", "the defendant would pay the plaintiff $250,000 within 30 days of invoice"),
      text(
        ".\n\nPARTICULARS\n\n[Identify the document or, if the agreement was oral, the parties to the conversation, and when and where it took place.]\n\n"
      ),
      field("agreement_particulars", "Particulars of the agreement", "The Agreement is in writing and is contained in the documents identified in paragraph 3."),
      text("\n\nPERFORMANCE\n\n5. The plaintiff performed its obligations under the Agreement.\n\nPARTICULARS\n\n"),
      field("performance_particulars", "Particulars of performance", "The plaintiff supplied and installed the goods on 14 April 2025 and issued invoice 1043 on 15 April 2025."),
      text("\n\nBREACH\n\n6. In breach of the Agreement, the defendant "),
      field("breach", "The breach", "failed to pay the sum of $250,000, or any part of it, within 30 days of invoice or at all"),
      text(".\n\nPARTICULARS\n\n"),
      field("breach_particulars", "Particulars of breach", "Payment fell due on 15 May 2025. No payment has been received as at the date of this statement of claim."),
      text("\n\nLOSS AND DAMAGE\n\n7. By reason of the breach, the plaintiff has suffered loss and damage.\n\nPARTICULARS\n\n"),
      field("loss_particulars", "Particulars of loss", "Unpaid contract price: $250,000. Interest pursuant to s 100 of the Civil Procedure Act 2005 (NSW) from 15 May 2025."),
      text("\n\nAND THE PLAINTIFF CLAIMS the relief set out above."),
      ...signatureWithProspectsCertificate("statement of claim"),
      text(
        "\n\nNOTICE TO DEFENDANT\n\nIf you do not file a defence within 28 days of being served with this statement of claim:\n\n" +
        "- You will be in default in these proceedings.\n" +
        "- The court may enter judgment against you without any further notice to you.\n\n" +
        "The judgment may be for the relief claimed in the statement of claim and for the plaintiff's costs of bringing these proceedings. The court may provide third parties with details of any default judgment entered against you.\n\n" +
        "HOW TO RESPOND\n\n" +
        "Please read this statement of claim very carefully. If you have any trouble understanding it or require assistance on how to respond to the claim you should get legal advice as soon as possible.\n\n" +
        "You can get further information about what you need to do to respond to the claim from:\n\n" +
        "- A legal practitioner.\n" +
        "- LawAccess NSW on 1300 888 529 or at www.lawaccess.nsw.gov.au.\n" +
        "- The court registry for limited procedural information.\n\n" +
        "You can respond in one of the following ways:\n\n" +
        "1. If you intend to dispute the claim or part of the claim, by filing a defence and/or making a cross-claim.\n" +
        "2. If money is claimed, and you believe you owe the money claimed, by paying the plaintiff all of the money and interest claimed; filing an acknowledgement of the claim; or applying to the court for further time to pay the claim. If you file a notice of payment under UCPR 6.17 further proceedings against you will be stayed unless the court otherwise orders.\n" +
        "3. If money is claimed, and you believe you owe part of the money claimed, by paying the plaintiff that part of the money claimed and filing a defence in relation to the part that you do not believe is owed.\n\n" +
        "REGISTRY ADDRESS\n\nStreet address: "
      ),
      field("registry_street", "Registry street address", "Law Courts Building, 184 Phillip Street, Sydney NSW 2000"),
      text("\nPostal address: "),
      field("registry_postal", "Registry postal address", "GPO Box 3, Sydney NSW 2001"),
      text("\nTelephone: "),
      field("registry_phone", "Registry telephone", "1300 679 272"),
      text(
        "\n\nAFFIDAVIT VERIFYING\n\n[Do not include in Local Court proceedings.]\n\nName: "
      ),
      field("deponent_name", "Name of deponent", "Sarah Nguyen"),
      text("\nAddress: "),
      field("deponent_address", "Address of deponent", "Level 3, 20 Market Street, Sydney NSW 2000"),
      text("\nOccupation: "),
      field("deponent_occupation", "Occupation", "Company director"),
      text("\nDate: "),
      field("deponent_date", "Date", "12 August 2026"),
      text("\n\nI say on oath / affirm:\n\n1. "),
      field("deponent_capacity", "Deponent's capacity", "I am a director of the plaintiff and am authorised to make this affidavit on its behalf."),
      text("\n\n2. I believe that the allegations of fact in the statement of claim are true."),
      ...AFFIDAVIT_JURAT,
    ],
  },

  {
    key: "court.nsw.ucpr.form_7a_defence",
    name: "Defence (NSW UCPR Form 7A)",
    description: "Defence in the approved form, pleading to each paragraph and setting out any affirmative defence.",
    category: "Litigation",
    subcategory: "Defending proceedings",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CIVIL,
    requiresReview: true,
    reviewNote: REVIEW_FORM("UCPR Form 7A", "version 5") +
      " A defence must be filed within 28 days of service of the statement of claim (UCPR 14.3); check whether that time has been extended before relying on it.",
    aiInstructions:
      "Draft the defence. Plead to every paragraph of the statement of claim in order: admit, do not admit, or deny. Under UCPR 14.26 a denial must be accompanied by the reason for denying, and an allegation not traversed is taken to be admitted, so do not leave a paragraph unanswered. Plead affirmatively any matter that would take the plaintiff by surprise or that raises a fact not arising out of the statement of claim -- limitation, release, accord and satisfaction, set-off, contributory negligence, illegality (UCPR 14.14). Keep the defence to answering the pleading; a positive claim belongs in a cross-claim.",
    segments: [
      ...ucprShell({
        formLine: "Form 7A (version 5)\nUCPR 14.3",
        heading: "DEFENCE",
        filedForRole: "defendant",
      }),
      text(
        "\n\nHEARING DETAILS\n\nIf the proceedings do not already have a listing date, they are to be listed at [time, date and place to be inserted by the registry].\n\n" +
        "DEFENCE\n\nThe defendant says:\n\n1. The defendant admits paragraphs "
      ),
      field("admitted", "Paragraphs admitted", "1, 2 and 3"),
      text(" of the statement of claim.\n\n2. The defendant does not admit paragraphs "),
      field("not_admitted", "Paragraphs not admitted", "4 and 5"),
      text(" of the statement of claim, because "),
      field("not_admitted_reason", "Reason for not admitting", "after reasonable inquiry the defendant remains uncertain as to the truth or falsity of those allegations"),
      text(".\n\n3. The defendant denies paragraph "),
      field("denied", "Paragraphs denied", "6"),
      text(" of the statement of claim, and says that "),
      field("denial_reason", "Reason for the denial (UCPR 14.26)", "it paid the sum of $250,000 to the plaintiff on 20 May 2025 by electronic transfer"),
      text(
        ".\n\n[UCPR 14.26: a denial must be accompanied by the reason for denying. An allegation not traversed is taken to be admitted.]\n\n" +
        "AFFIRMATIVE DEFENCE\n\n[Plead any matter that must be pleaded specifically under UCPR 14.14 -- limitation, release, accord and satisfaction, set-off, contributory negligence, illegality. Delete this section if none is relied on.]\n\n4. "
      ),
      field("affirmative_defence", "Affirmative defence", "Further, the proceedings were commenced more than six years after the cause of action first accrued and are statute-barred by s 14(1)(a) of the Limitation Act 1969 (NSW)."),
      text("\n\nPARTICULARS\n\n"),
      field("affirmative_particulars", "Particulars", "The cause of action accrued on 15 May 2018. The statement of claim was filed on 1 August 2026."),
      text("\n\n5. The defendant otherwise denies each and every allegation in the statement of claim."),
      ...signatureWithProspectsCertificate("defence"),
    ],
  },

  {
    key: "court.nsw.ucpr.form_40_affidavit",
    name: "Affidavit (NSW UCPR Form 40)",
    description: "Affidavit in the approved form, with the generative-AI declaration and the UCPR 35.7B jurat.",
    category: "Litigation",
    subcategory: "Evidence",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CIVIL,
    requiresReview: true,
    reviewNote:
      REVIEW_FORM("UCPR Form 40", "version 8") +
      " IMPORTANT: version 8 of this form contains a sworn declaration that generative AI was not used to generate the affidavit or its annexures. Do not use the AI drafting in this system to produce an affidavit that will be sworn on that form. Type the evidence, or delete the declaration only where leave has been granted and identify the leave.",
    aiInstructions:
      "Do NOT generate the deponent's evidence. NSW Supreme Court practice restricts the use of generative AI in affidavit content, and Form 40 version 8 carries a sworn declaration that generative AI was not used. Assist only with the structure of the form: the court details, the filing details, the numbering of paragraphs and the jurat. Evidence must be taken from the deponent in their own words. If asked to write the substance of an affidavit, decline and explain the declaration.",
    segments: [
      ...ucprShell({
        formLine: "Form 40 (version 8)\nUCPR 35.1",
        heading: "AFFIDAVIT",
        filedForRole: "plaintiff",
      }),
      text("\n\nAFFIDAVIT OF "),
      field("deponent_name", "Name of deponent", "Sarah Nguyen"),
      text("\n\nName: "),
      field("deponent_name_2", "Name", "Sarah Nguyen"),
      text("\nAddress: "),
      field("deponent_address", "Address", "Level 3, 20 Market Street, Sydney NSW 2000"),
      text("\nOccupation: "),
      field("deponent_occupation", "Occupation", "Company director"),
      text("\nDate: "),
      field("affidavit_date", "Date", "12 August 2026"),
      text("\n\nI say on oath / affirm:\n\n1. "),
      field("deponent_role", "Deponent's role", "I am a director of the plaintiff and am authorised to make this affidavit on its behalf."),
      text(
        "\n\n2. Generative artificial intelligence was not used to generate:\n\n" +
        "   (a) this affidavit; and\n" +
        "   (b) any annexure or exhibit to this affidavit prepared or created, to the deponent's knowledge, for the purposes of these proceedings,\n\n" +
        "   [where applicable] other than the annexure or exhibit marked "
      ),
      field("ai_exception", "AI exception, if any (otherwise delete)", "(not applicable)"),
      text(" in accordance with leave granted by "),
      field("ai_leave", "Who granted leave and when (otherwise delete)", "(not applicable)"),
      text(
        ".\n\n[Delete the exception if no annexure was AI-generated. Do not swear this paragraph if generative AI was used and leave has not been granted.]\n\n" +
        "3. "
      ),
      field("evidence", "The evidence, in numbered paragraphs, in the deponent's own words", "On 1 March 2025 I met Mr Citizen at his office at 10 Smith Street, Parramatta. He said to me words to the effect: \"Send the quote through and we'll sign it this week.\""),
      text(
        "\n\n[Continue in numbered paragraphs. Depose to facts within the deponent's own knowledge; where a matter is on information and belief, say so and identify the source (UCPR 35.3 permits this only on interlocutory applications). Refer to each annexure as \"Annexure A\" and have it marked and signed by the witness.]"
      ),
      ...AFFIDAVIT_JURAT,
    ],
  },

  {
    key: "court.nsw.ucpr.form_20_notice_of_motion",
    name: "Notice of Motion (NSW UCPR Form 20)",
    description: "Interlocutory application in the approved form, with the orders sought and the notice to the person affected.",
    category: "Litigation",
    subcategory: "Interlocutory",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CIVIL,
    requiresReview: true,
    reviewNote: REVIEW_FORM("UCPR Form 20", "version 3") +
      " A notice of motion must ordinarily be served at least 3 days before the return date (UCPR 18.4) and be supported by affidavit evidence unless the court dispenses with it.",
    aiInstructions:
      "Draft the orders sought. Each order must be numbered, self-contained and capable of being made as drafted -- a registrar or judge should be able to initial it without rewriting. Identify the rule or statutory power relied on where it is not obvious. Include an order for costs, and where the motion is urgent or made ex parte, an order abridging time for service. Do not argue the motion in the orders; the argument belongs in the supporting affidavit and submissions.",
    segments: [
      ...ucprShell({
        formLine: "Form 20 (version 3)\nUCPR 18.1 and 18.3",
        heading: "NOTICE OF MOTION",
        filedForRole: "plaintiff",
      }),
      text("\n\nPERSON AFFECTED BY ORDERS SOUGHT\n\n"),
      field("person_affected", "Person affected and their role", "John Citizen, defendant"),
      text(
        "\n\nHEARING DETAILS\n\nThis motion is listed at [time, date and place to be inserted by the registry].\n\n" +
        "ORDERS SOUGHT\n\n1. "
      ),
      field("order_1", "First order sought", "Pursuant to UCPR 21.2, the defendant give discovery of documents falling within the classes set out in the Schedule to this notice of motion."),
      text("\n2. "),
      field("order_2", "Second order sought", "The defendant pay the plaintiff's costs of this motion."),
      text("\n3. "),
      field("order_3", "Further order sought", "Such further or other order as the Court thinks fit."),
      text(
        "\n\n[Where the motion is urgent, add an order abridging time for service.]\n\n" +
        "SIGNATURE\n\nSignature of legal representative: ______________________________\n\nCapacity: "
      ),
      field("signing_capacity", "Capacity", "Solicitor on record"),
      text("\nDate of signature: "),
      field("signature_date", "Date of signature", "12 August 2026"),
      text(
        "\n\nNOTICE TO PERSON AFFECTED BY ORDERS SOUGHT\n\n" +
        "If you do not attend, the court may hear the motion and make orders, including orders for costs, in your absence."
      ),
    ],
  },

  {
    key: "court.nsw.ucpr.form_6a_appearance",
    name: "Appearance (NSW UCPR Form 6A)",
    description: "Notice of appearance in the approved form, entering an appearance for a party and giving an address for service.",
    category: "Litigation",
    subcategory: "Defending proceedings",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CIVIL,
    requiresReview: true,
    reviewNote: REVIEW_FORM("UCPR Form 6A", "version 1") +
      " Filing an appearance submits to the court's jurisdiction. Where jurisdiction is to be contested, file a conditional appearance under UCPR 12.11 instead, within the time allowed.",
    aiInstructions:
      "This is a short procedural form. Confirm whether the appearance is unconditional or conditional -- a conditional appearance under UCPR 12.11 preserves an objection to jurisdiction or service, and an unconditional one waives it. The address for service must be in NSW unless an exception in UCPR 4.5(3) applies.",
    segments: [
      ...ucprShell({
        formLine: "Form 6A (version 1)\nUCPR 6.9, 6.11",
        heading: "APPEARANCE",
        filedForRole: "defendant",
      }),
      text("\n\nAPPEARANCE\n\n"),
      field("appearing_party", "Party appearing and role", "John Citizen, defendant"),
      text(" appears.\n\n[For a conditional appearance under UCPR 12.11, state: appears conditionally, and identify the objection.]\n\nADDRESS FOR SERVICE\n\n"),
      field("address_for_service", "Address for service in NSW", "Huynh Lawyers, Level 1, 100 George Street, Sydney NSW 2000"),
      text("\n\n[Must be an address in NSW unless an exception in UCPR 4.5(3) applies.]\n\nSIGNATURE\n\nSignature: ______________________________\n\nCapacity: "),
      field("signing_capacity", "Capacity", "Solicitor on record"),
      text("\nDate of signature: "),
      field("signature_date", "Date of signature", "12 August 2026"),
    ],
  },

  {
    key: "court.nsw.ucpr.form_19_notice_to_produce",
    name: "Notice to Produce for Inspection (NSW UCPR Form 19)",
    description: "Party-to-party notice requiring production of documents for inspection, in the approved form.",
    category: "Litigation",
    subcategory: "Discovery",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CIVIL,
    requiresReview: true,
    reviewNote: REVIEW_FORM("UCPR Form 19", "version 2") +
      " This is served on another party, not filed as an originating process, and is not a subpoena -- use a subpoena for a non-party.",
    aiInstructions:
      "Draft the list of documents or things required. Describe each by class with enough precision that the recipient can identify what is caught without exercising judgment -- 'all documents relating to the dispute' is oppressive and liable to be set aside, whereas 'invoices issued by the defendant to the plaintiff between 1 January and 30 June 2025' is not. Confine the classes to documents relevant to a fact in issue on the pleadings.",
    segments: [
      ...ucprShell({
        formLine: "Form 19 (version 2)\nUCPR 21.10",
        heading: "NOTICE TO PRODUCE FOR INSPECTION",
        filedForRole: "plaintiff",
        preparation: true,
      }),
      text("\n\nNOTICE TO PRODUCE\n\nTo: "),
      field("recipient_name", "Name of party required to produce", "John Citizen"),
      text("\nAddress: "),
      field("recipient_address", "Address", "10 Smith Street, Parramatta NSW 2150"),
      text("\n\nYou are required to produce the following documents or things for inspection by the "),
      field("requesting_role", "Role of the party requiring production", "plaintiff"),
      text(" by "),
      field("production_date", "Date for production", "2 September 2026"),
      text(
        ".\n\n[Note: 14 days or longer is taken to be reasonable unless the contrary is established.]\n\n" +
        "SCHEDULE\n\n1. "
      ),
      field("document_1", "First class of documents", "All invoices issued by the defendant to the plaintiff between 1 January 2025 and 30 June 2025."),
      text("\n2. "),
      field("document_2", "Second class of documents", "All correspondence between the parties concerning the Agreement, including email."),
      text("\n3. "),
      field("document_3", "Further class of documents", "All bank statements evidencing the payment alleged in paragraph 3 of the defence."),
    ],
  },

  {
    key: "court.nsw.ucpr.form_11_list_of_documents",
    name: "List of Documents (NSW UCPR Form 11)",
    description: "Verified list of documents on discovery, with the solicitor's certificate and the deponent's affidavit.",
    category: "Litigation",
    subcategory: "Discovery",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CIVIL,
    requiresReview: true,
    reviewNote: REVIEW_FORM("UCPR Form 11", "version 3") +
      " The solicitor's certificate is a personal certification that the client has been advised of its discovery obligations -- do not sign it before that advice has actually been given and recorded on the file.",
    aiInstructions:
      "Structure the list in the three parts the form requires: Part 1, documents in the party's possession that it does not object to producing; Part 2, documents in its possession that it objects to producing, with the ground of objection stated for each; Part 3, documents no longer in its possession, stating what became of them and who has them now. Number every document and give enough description to identify it -- date, type, author, recipient. Where privilege is claimed, identify the class of privilege; a bare assertion of 'privilege' is not a ground.",
    segments: [
      ...ucprShell({
        formLine: "Form 11 (version 3)\nUCPR 21.3",
        heading: "LIST OF DOCUMENTS",
        filedForRole: "plaintiff",
      }),
      text("\n\nORDER FOR DISCOVERY\n\nMade on "),
      field("order_date", "Date of the discovery order", "5 August 2026"),
      text(
        "\n\nPART 1 - DOCUMENTS IN THE PARTY'S POSSESSION THAT IT DOES NOT OBJECT TO PRODUCING\n\n1. "
      ),
      field("part1_documents", "Documents, numbered and described", "Quotation from the plaintiff to the defendant dated 1 March 2025.\n2. Written acceptance from the defendant dated 3 March 2025.\n3. Invoice 1043 dated 15 April 2025."),
      text(
        "\n\nPART 2 - DOCUMENTS IN THE PARTY'S POSSESSION THAT IT OBJECTS TO PRODUCING\n\n1. "
      ),
      field("part2_documents", "Documents and the ground of objection for each", "File notes of advice between the plaintiff and its solicitors dated 2 to 20 June 2025. Ground: legal professional privilege (legal advice privilege)."),
      text(
        "\n\nPART 3 - DOCUMENTS NO LONGER IN THE PARTY'S POSSESSION\n\n1. "
      ),
      field("part3_documents", "Documents, what became of them, and who has them now", "Original signed quotation, provided to the defendant on 3 March 2025 and now in the defendant's possession."),
      text(
        "\n\nSOLICITOR'S CERTIFICATE\n\nI certify that:\n\n" +
        "1. I have advised the "
      ),
      field("advised_party_role", "Role of the party advised", "plaintiff"),
      text(
        " as to the obligations arising under an order for discovery.\n\n" +
        "2. I am not aware of any documents within any of the classes specified in the order (other than excluded documents) that are, or that within the last 6 months before the commencement of the proceedings have been, in the possession of the party ordered to produce the list of documents, other than those referred to in Part 1 or Part 2 of the list of documents.\n\n" +
        "Signature: ______________________________\n\nCapacity: "
      ),
      field("signing_capacity", "Capacity", "Solicitor on record"),
      text("\nDate of signature: "),
      field("signature_date", "Date of signature", "12 August 2026"),
      text("\n\nAFFIDAVIT\n\nName: "),
      field("deponent_name", "Name of deponent", "Sarah Nguyen"),
      text("\nAddress: "),
      field("deponent_address", "Address", "Level 3, 20 Market Street, Sydney NSW 2000"),
      text("\nOccupation: "),
      field("deponent_occupation", "Occupation", "Company director"),
      text("\nDate: "),
      field("deponent_date", "Date", "12 August 2026"),
      text("\n\nI say on oath / affirm:\n\n1. I am the "),
      field("deponent_role", "Deponent's role", "director of the plaintiff authorised to make this affidavit"),
      text(
        ".\n\n2. The documents listed in this list of documents are the documents required to be listed under the order for discovery.\n\n" +
        "3. To the best of my knowledge and belief, there are no other documents falling within the classes specified in the order that are, or within the last 6 months before the commencement of the proceedings have been, in the possession of the party."
      ),
      ...AFFIDAVIT_JURAT,
    ],
  },

  {
    key: "court.nsw.ucpr.form_26a_subpoena_produce",
    name: "Subpoena to Produce (NSW UCPR Form 26A)",
    description: "Subpoena requiring a non-party to produce documents, with the proposed access order and the notice to the recipient.",
    category: "Litigation",
    subcategory: "Evidence",
    documentType: "court_document",
    jurisdictions: NSW,
    matterTypes: CIVIL,
    requiresReview: true,
    reviewNote: REVIEW_FORM("UCPR Form 26A", "version 5") +
      " A subpoena must be issued by the court, conduct money must be provided, and the last day for service is 5 days before the date for production (UCPR 33.3). The full notes 1-18 form part of the approved form and must be served with it -- they are not reproduced here.",
    aiInstructions:
      "Draft the Schedule. Each class must be described so the recipient can comply without making judgment calls about relevance, and must be confined to documents that bear on a fact in issue. A subpoena that is in substance discovery against a non-party, or that is a fishing expedition, will be set aside with costs. Identify a date range and a document type for every class. Consider whether any class will capture privileged or confidential third-party material and flag it for the proposed access order.",
    segments: [
      ...ucprShell({
        formLine: "Form 26A (version 5)\nUCPR 33.2",
        heading: "SUBPOENA TO PRODUCE",
        filedForRole: "plaintiff",
      }),
      text("\n\nORDER TO THE SUBPOENA RECIPIENT\n\nTo: "),
      field("recipient_name", "Name of subpoena recipient", "Westpac Banking Corporation"),
      text("\nAddress: "),
      field("recipient_address", "Address", "275 Kent Street, Sydney NSW 2000"),
      text(
        "\n\nYou are ordered to produce this subpoena or a copy of it and the documents or things specified in the Schedule to the court.\n\n" +
        "PROPOSED ACCESS ORDER\n\n[Delete whichever does not apply.]\n\n" +
        "#The plaintiff to have first access for 7 days because that party may be entitled to claim privilege; thereafter, in the absence of further application, access to all parties.\n\n" +
        "#Access granted to all parties, because no claims for privilege are likely to arise.\n\n" +
        "NOTICE TO THE SUBPOENA RECIPIENT\n\n" +
        "Failure to comply with this subpoena without lawful excuse is a contempt of court and may result in your arrest.\n\n" +
        "The last day for service of this subpoena is "
      ),
      field("last_service_date", "Last day for service", "26 August 2026"),
      text(
        ".\n\n[Must be at least 5 days before the earliest date for compliance, unless the court fixes another date: UCPR 33.3.]\n\n" +
        "Please read notes 1 to 18 included in the approved form. You must complete the Declaration on the last page and attach it to the subpoena or copy that accompanies the documents produced.\n\n" +
        "DATE, TIME AND PLACE FOR PRODUCTION\n\n"
      ),
      field("production_details", "Date, time and place for production", "2 September 2026 at 9:00am, Supreme Court of New South Wales, Law Courts Building, 184 Phillip Street, Sydney"),
      text(
        "\n\nHOW TO RESPOND\n\nYou must comply with this subpoena by uploading the documents specified in the Schedule to NSW Subpoena Response (https://subpoenaresponse.justice.nsw.gov.au) so that they are received before the time and date specified for production; or by attending to produce them at the address above at that time; or by delivering or sending them so that they are received not less than 2 clear days before the date specified for production.\n\n" +
        "SCHEDULE\n\n1. "
      ),
      field("schedule_1", "First class of documents", "All bank statements for account number 000-000 12345678 in the name of John Citizen for the period 1 January 2025 to 31 December 2025."),
      text("\n2. "),
      field("schedule_2", "Further class of documents", "All records of electronic transfers from that account to the plaintiff between 1 May 2025 and 30 June 2025."),
      text("\n\nISSUED BY THE COURT\n\nDate of issue: ______________________________\n\nSignature / seal of the court: ______________________________"),
    ],
  },
];
