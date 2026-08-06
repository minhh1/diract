// lib/precedents/library/courtFcfcoa.ts
// Family law affidavits written against the Federal Circuit and Family Court
// of Australia's approved affidavit form.
//
// Source: Affidavit - Family law and child support proceedings, 0625 v1a,
// https://www.fcfcoa.gov.au/fl/forms/affidavit, obtained 2026-08-02. The file
// itself is in lib/precedents/forms/fcfcoa and checked daily for amendment by
// .github/workflows/court-forms-check.yml.
//
// One form, several precedents. The court publishes a single affidavit form
// used for every purpose; what differs is the evidence in Part D. So the shell
// is written once in fcfcoaShell() and each precedent supplies the Part D that
// its purpose requires -- an interim application needs different evidence from
// a separated-under-one-roof affidavit, but both are filed on this form.
//
// Formal requirements that are easy to miss and fatal to get wrong, from the
// form's own instructions:
//   - 12pt font, 1.5 line spacing, consecutive page numbering (Family Law
//     Rules r 2.14). This is NOT the 10pt used for correspondence.
//   - Every paragraph numbered; sub-paragraphs (a), (b), (c).
//   - Each page signed by BOTH the deponent and the witness.
//   - Any alteration initialled by both.
//   - Affidavits supporting an interlocutory application are limited to 25
//     pages and 10 annexures in Division 1, or 10 pages and 5 annexures in
//     Division 2 (r 5.08). Parts A, B, E and F don't count toward the limit.
import { text, field, type PrecedentSeed } from "./types";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

const FAMILY = ["Family Law"];

const FORMAL_REQUIREMENTS =
  "This affidavit must be in 12 point font with 1.5 line spacing and consecutively numbered pages (Family Law Rules r 2.14) -- not the 10 point used for correspondence. Every paragraph must be numbered. The deponent and the witness must each sign every page, and initial any alteration.";

/**
 * Parts A to C of the approved form: the header, the parties, the independent
 * children's lawyer, and the deponent. Part D (the evidence) is supplied by
 * each precedent; Parts E and F are the jurats, appended by fcfcoaJurat().
 */
function fcfcoaShell(): BodyTemplateSegment[] {
  return [
    text(
      "Federal Circuit and Family Court of Australia (Family Law) Rules 2021: RULE 8.15\n\n" +
      "AFFIDAVIT\n\n" +
      "Filed in: [ ] Federal Circuit and Family Court of Australia (Division 1)  [ ] Federal Circuit and Family Court of Australia (Division 2)\n\n" +
      "Name of person swearing/affirming this affidavit: "
    ),
    field("deponent_full_name", "Name of person swearing or affirming", "Sarah Nguyen"),
    text("\nDate of swearing/affirming: "),
    field("swearing_date", "Date of swearing or affirming", "12 August 2026"),
    text("\n\nPART A\n\nAbout the parties\n\nApplicant 1 family name: "),
    field("applicant_surname", "Applicant 1 family name", "Nguyen"),
    text("\nApplicant 1 given names: "),
    field("applicant_given", "Applicant 1 given names", "Sarah Jane"),
    text("\nRespondent 1 family name: "),
    field("respondent_surname", "Respondent 1 family name", "Nguyen"),
    text("\nRespondent 1 given names: "),
    field("respondent_given", "Respondent 1 given names", "David Minh"),
    text("\n\nAddress for service in Australia for the party filing this affidavit: "),
    field("service_address", "Address for service", "Huynh Lawyers, Level 1, 100 George Street, Sydney NSW 2000"),
    text("\nPhone: "),
    field("service_phone", "Phone", "(02) 9000 0000"),
    text("\nEmail: "),
    field("service_email", "Email", "jsmith@example.com.au"),
    text("\nLawyer's code: "),
    field("lawyers_code", "Lawyer's code", "12345"),
    text(
      "\n\nPART B\n\nAbout the independent children's lawyer (if any)\n\n" +
      "[Delete this Part if no independent children's lawyer has been appointed.]\n\n" +
      "Independent children's lawyer: "
    ),
    field("icl_name", "Independent children's lawyer name and firm", "Not applicable"),
    text("\n\nPART C\n\nAbout you (the deponent)\n\nFamily name: "),
    field("deponent_surname", "Deponent family name", "Nguyen"),
    text("\nGiven names: "),
    field("deponent_given", "Deponent given names", "Sarah Jane"),
    text("\nGender: [ ] Male  [ ] Female  [ ] X\n\nUsual occupation: "),
    field("deponent_occupation", "Usual occupation", "Registered nurse"),
    text(
      "\nAddress: "
    ),
    field("deponent_address", "Deponent's address", "12 Bank Street, Parramatta NSW 2150"),
    text(
      "\n\n[You do not have to give your residential address if you are concerned about your safety; an alternative address for service may be given instead.]\n\n" +
      "PART D\n\nEvidence\n\n"
    ),
  ];
}

/** Parts E and F: the jurat, and the alternative jurat where an interpreter was used. */
const FCFCOA_JURAT: BodyTemplateSegment[] = [
  text(
    "\n\nPART E\n\nSignature\n\n" +
    "Signature of deponent: ______________________________\n\n" +
    "Place: "
  ),
  field("jurat_place", "Place sworn or affirmed", "Sydney"),
  text("\nDate: "),
  field("jurat_date", "Date sworn or affirmed", "12 August 2026"),
  text(
    "\n\nBefore me (signature of witness): ______________________________\n\n" +
    "Full name of witness (please print): "
  ),
  field("witness_name", "Full name of witness", "Jane Smith"),
  text(
    "\n\nWitness capacity: [ ] Justice of the Peace (JP # ______)  [ ] Notary public  [ ] Lawyer  [ ] Other person authorised by law to witness an affidavit\n\n" +
    "Print name and lawyer's code: "
  ),
  field("witness_code", "Witness name and lawyer's code", "Jane Smith, 12345"),
  text(
    "\n\nPART F\n\nAlternative jurat for non-English speaking affidavit\n\n" +
    "[Delete this Part unless an interpreter was used.]\n\n" +
    "I certify that I understand the English language and the "
  ),
  field("interpreter_language", "Language interpreted", "Vietnamese"),
  text(
    " language, and that I have truly interpreted to the deponent named in Part C the contents of this affidavit, and that the deponent appeared to understand it before swearing or affirming it.\n\n" +
    "Signature of interpreter: ______________________________\n\n" +
    "Interpreter's full name: "
  ),
  field("interpreter_name", "Interpreter's full name", "Linh Tran"),
  text("\nInterpreter's address: "),
  field("interpreter_address", "Interpreter's address", "45 Church Street, Cabramatta NSW 2166"),
  text(
    "\n\nNote: the deponent and the witness must sign each page of this affidavit."
  ),
];

const REVIEW =
  "Written against the FCFCOA affidavit form 0625 v1a (obtained 2026-08-02). " + FORMAL_REQUIREMENTS +
  " Check the current form at fcfcoa.gov.au before filing.";

export const COURT_FCFCOA_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "court.fcfcoa.affidavit_general",
    name: "Affidavit: Family Law (FCFCOA approved form)",
    description: "Affidavit in family law or child support proceedings, in the court's approved form with Parts A to F.",
    category: "Family Law",
    subcategory: "Evidence",
    documentType: "court_document",
    matterTypes: FAMILY,
    requiresReview: true,
    reviewNote: REVIEW,
    aiInstructions:
      "Assist with structure only; the evidence must come from the deponent in their own words. Part D must be numbered paragraphs of fact, not argument and not opinion -- an affidavit that argues the case is liable to have passages struck out with costs. Depose only to what the deponent knows personally; where a matter is on information and belief, say so and identify the source. Record conversations in direct speech as 'words to the effect of', with the date, place and who was present. Refer to each annexure as 'Annexure A' and have it marked and signed by the witness. Keep to the r 5.08 limits where the affidavit supports an interim application.",
    segments: [
      ...fcfcoaShell(),
      text("1. "),
      field("evidence", "The evidence, in numbered paragraphs, in the deponent's own words", "I am the applicant in these proceedings. I married the respondent on 4 May 2012 at Sydney and we separated on 2 February 2025."),
      text(
        "\n\n[Continue in numbered paragraphs. Facts only, in the deponent's own words. Use sub-paragraphs (a), (b), (c) where a paragraph has parts.]"
      ),
      ...FCFCOA_JURAT,
    ],
  },

  {
    key: "court.fcfcoa.affidavit_interim",
    name: "Affidavit in Support of Interim Application (FCFCOA)",
    description: "Affidavit supporting an interim or interlocutory application, within the r 5.08 page and annexure limits.",
    category: "Family Law",
    subcategory: "Interim applications",
    documentType: "court_document",
    matterTypes: FAMILY,
    requiresReview: true,
    reviewNote:
      REVIEW +
      " Page limits apply: 25 pages and 10 annexures in Division 1, or 10 pages and 5 annexures in Division 2 (r 5.08). Parts A, B, E and F do not count toward the limit. An over-length affidavit may be refused for filing.",
    aiInstructions:
      "Assist with structure only. An interim affidavit is read quickly and under a page limit, so it must be tightly confined to the orders sought: what is happening now, why it cannot wait until final hearing, and what the applicant asks the court to do in the meantime. Deal with the children's living arrangements and any risk issues first if the application is parenting; with the asset at risk if it is property. Do not re-argue the final case. Where the application is urgent or ex parte, depose to the facts said to make it so, and to what notice has been given or why none was given.",
    segments: [
      ...fcfcoaShell(),
      text("1. I make this affidavit in support of the Application in a Proceeding filed on "),
      field("application_date", "Date of the interim application", "10 August 2026"),
      text(", in which I seek the orders set out in that application.\n\n2. "),
      field("current_arrangements", "The current arrangements", "Since separation on 2 February 2025 the children have lived with me and spent time with the respondent each alternate weekend."),
      text("\n\n3. "),
      field("why_urgent", "Why the matter cannot wait until final hearing", "On 5 August 2026 the respondent told me he intends to enrol the children at a school in Melbourne from the start of next term."),
      text("\n\n4. "),
      field("orders_basis", "The facts supporting the orders sought", "The children have attended their current school since 2021 and both have treating practitioners in Sydney."),
      text(
        "\n\n[Continue in numbered paragraphs, confined to the interim orders sought. Watch the page limit: Part D is what counts.]"
      ),
      ...FCFCOA_JURAT,
    ],
  },

  {
    key: "court.fcfcoa.affidavit_separated_under_one_roof",
    name: "Affidavit: Separated Under One Roof (FCFCOA)",
    description: "Affidavit required for a divorce where the parties lived under the same roof during the 12 months of separation.",
    category: "Family Law",
    subcategory: "Divorce",
    documentType: "court_document",
    matterTypes: FAMILY,
    requiresReview: true,
    reviewNote:
      REVIEW +
      " Where the parties lived under one roof for any part of the 12 months, the court requires evidence of separation from the applicant and, ordinarily, a corroborating affidavit from an independent person (s 48 and s 49(2) Family Law Act 1975 (Cth)).",
    aiInstructions:
      "Assist with structure only. The question is whether the marriage broke down irretrievably and the parties lived separately and apart for 12 months, notwithstanding that they remained under one roof: s 48 and s 49(2) of the Family Law Act 1975 (Cth). Depose to the change in the relationship from the date of separation, addressing the matters the court looks for: sleeping arrangements, whether household services continued to be performed for the other, whether finances were separated, whether the separation was communicated to family, friends and government agencies, and whether there was any resumption of the relationship. A separate corroborating affidavit from an independent person is ordinarily required.",
    segments: [
      ...fcfcoaShell(),
      text("1. I am the applicant. I married the respondent on "),
      field("marriage_date", "Date of marriage", "4 May 2012"),
      text(" at "),
      field("marriage_place", "Place of marriage", "Sydney, New South Wales"),
      text(".\n\n2. The marriage broke down irretrievably and we separated on "),
      field("separation_date", "Date of separation", "2 February 2025"),
      text(". We continued to live under the same roof from that date until "),
      field("under_roof_until", "Date the parties ceased living under one roof", "20 December 2025"),
      text(
        ".\n\n3. Since the date of separation there has been no resumption of the relationship. In particular:\n\n   (a) Sleeping arrangements: "
      ),
      field("sleeping", "Sleeping arrangements since separation", "I moved into the spare bedroom on 2 February 2025 and we have not shared a bedroom since."),
      text("\n\n   (b) Household services: "),
      field("household", "Whether household services continued", "We stopped cooking or doing laundry for one another. Each of us shops and cooks separately."),
      text("\n\n   (c) Finances: "),
      field("finances", "Financial separation", "We closed our joint account on 1 March 2025 and have kept separate accounts since."),
      text("\n\n   (d) Communication to others: "),
      field("told_others", "Who was told of the separation and when", "We told both our families in February 2025, and I notified Centrelink of the separation on 20 February 2025."),
      text("\n\n   (e) Social and public aspects: "),
      field("social", "Social aspects", "We have not attended social occasions together as a couple since separation."),
      text("\n\n4. "),
      field("further_evidence", "Any further evidence", "I have arranged for a corroborating affidavit from my sister, who visited the home regularly throughout this period."),
      ...FCFCOA_JURAT,
    ],
  },

  {
    key: "court.fcfcoa.affidavit_substituted_service",
    name: "Affidavit in Support of Substituted Service (FCFCOA)",
    description: "Affidavit supporting an application for substituted service or dispensation with service, setting out the attempts made.",
    category: "Family Law",
    subcategory: "Service",
    documentType: "court_document",
    matterTypes: FAMILY,
    requiresReview: true,
    reviewNote:
      REVIEW +
      " The court will not make an order for substituted service without evidence of genuine attempts at ordinary service and a method shown to be likely to bring the document to the party's attention (Family Law Rules Part 2.8).",
    aiInstructions:
      "Assist with structure only. Two things must be established: that reasonable attempts at ordinary service have failed, and that the proposed alternative method is likely in fact to bring the document to the other party's attention. Set out each attempt with its date, method, address and outcome -- a general assertion that service 'has not been possible' is not enough. Then depose to the evidence that the proposed method works: that the email address or social media account is current and in use, and how that is known. Where dispensation with service is sought instead, address why no method is likely to succeed.",
    segments: [
      ...fcfcoaShell(),
      text("1. I make this affidavit in support of my application for an order for substituted service of the "),
      field("document_to_serve", "Document to be served", "Initiating Application filed on 10 August 2026"),
      text(" on the respondent.\n\n2. I have made the following attempts to serve the respondent:\n\n   (a) "),
      field("attempt_1", "First attempt: date, method, address, outcome", "On 12 August 2026 I sent the document by post to 10 Smith Street, Parramatta NSW 2150, the respondent's last known address. It was returned marked 'not at this address' on 20 August 2026."),
      text("\n\n   (b) "),
      field("attempt_2", "Second attempt: date, method, address, outcome", "On 22 August 2026 I engaged a process server, whose affidavit of attempted service is annexed and marked 'Annexure A'. The server attended the address on three occasions and was told the respondent had moved."),
      text("\n\n   (c) "),
      field("attempt_3", "Further attempt", "On 26 August 2026 I telephoned the respondent's last known mobile number. The number is disconnected."),
      text("\n\n3. I seek an order that service be effected by "),
      field("proposed_method", "Proposed method of substituted service", "email to davidnguyen@example.com"),
      text(".\n\n4. That method is likely to bring the document to the respondent's attention because "),
      field("why_effective", "Why the proposed method is likely to work", "the respondent sent me an email from that address on 1 August 2026, a copy of which is annexed and marked 'Annexure B', and he has continued to respond to messages sent to it."),
      text("\n\n5. "),
      field("further_matters", "Any further matters", "I do not know the respondent's current residential address and have no other means of contacting him."),
      ...FCFCOA_JURAT,
    ],
  },
];
