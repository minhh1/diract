// lib/precedents/library/clientCare.ts
// File-lifecycle and client-care correspondence: the documents every matter
// needs regardless of practice area or state.
//
// All jurisdiction-neutral (no `jurisdictions`), with one deliberate
// exception -- costs disclosure thresholds and the "uniform law" framing
// differ, so those carry a review note rather than pretending one form fits
// every state. The Legal Profession Uniform Law applies in NSW and VIC
// only; QLD/SA/WA/TAS each have their own costs regime, which is why the
// costs agreement precedents below prompt for the governing Act rather than
// hard-coding one.
import { text, field, type PrecedentSeed } from "./types";

export const CLIENT_CARE_PRECEDENTS: PrecedentSeed[] = [
  {
    key: "care.costs_agreement_disclosure",
    name: "Costs Agreement and Costs Disclosure",
    description: "Engagement terms, estimate of costs and disclosure obligations. Sent at the start of every matter.",
    category: "Client Care",
    subcategory: "Engagement",
    documentType: "letter",
    aiInstructions:
      "Draft a costs agreement and costs disclosure letter. Cover: scope of work, who will do the work and their rates, an estimate of total costs (or a range with the basis for it), disbursements likely to be incurred, billing frequency, interest on overdue accounts, the client's right to negotiate the billing method, and the client's rights if they dispute costs. Keep the tone professional but plain-English. Do NOT state a specific statutory threshold or cite a specific costs Act unless the state is known -- the Legal Profession Uniform Law applies only in NSW and Victoria; Queensland, South Australia, Western Australia and Tasmania each have their own regime.",
    segments: [
      text("We are pleased to act for you in this matter. This letter sets out our terms of engagement and the costs disclosure we are required to give you.\n\n"),
      text("SCOPE OF WORK\n\nWe will act for you in relation to "),
      field("scope", "Scope of work", "the purchase of 12 Example Street, Sydney NSW 2000"),
      text(".\n\nPERSON RESPONSIBLE\n\nThe person with day-to-day conduct of your matter is "),
      field("solicitor", "Solicitor with conduct", "Jane Smith, Senior Associate"),
      text(", who will be supervised by "),
      field("supervisor", "Supervising principal", "Minh Huynh, Principal"),
      text(".\n\nOUR FEES\n\nOur professional fees for this matter are estimated at "),
      field("fee_estimate", "Fee estimate (or range)", "$2,500 to $3,500 plus GST"),
      text(".\n\nThis estimate is based on the work proceeding without unusual complication. We will tell you promptly if anything arises that is likely to change it materially.\n\nDISBURSEMENTS\n\nIn addition to our fees, the following disbursements are likely: "),
      field("disbursements", "Likely disbursements", "title searches, council and water certificates, PEXA settlement fee, and transfer duty"),
      text(".\n\nBILLING\n\nWe will bill you "),
      field("billing_frequency", "Billing frequency", "on completion of the matter"),
      text(". Accounts are payable within 14 days.\n\nYOUR RIGHTS\n\nYou have the right to negotiate the billing method, to receive an itemised account, and to seek an assessment of our costs if you dispute them. If you have any questions about this agreement, please raise them with us before signing.\n\nPlease sign and return the enclosed copy to confirm your instructions."),
    ],
    requiresReview: true,
    reviewNote:
      "Costs disclosure obligations and thresholds differ by state (Uniform Law in NSW/VIC only). Confirm the governing regime and current threshold before sending.",
  },
  {
    key: "care.client_authority_to_act",
    name: "Authority to Act",
    description: "Client's written authority for the firm to act and to receive/disburse funds on their behalf.",
    category: "Client Care",
    subcategory: "Engagement",
    documentType: "form",
    aiInstructions:
      "Draft a short authority to act for the client's signature. It should authorise the firm to act in the described matter, to correspond with third parties on the client's behalf, and to receive and disburse funds through the firm's trust account in accordance with the client's instructions. Keep it to one page.",
    segments: [
      text("AUTHORITY TO ACT\n\nI/We, "),
      field("client_name", "Client name(s)", "John Citizen and Mary Citizen"),
      text(", of "),
      field("client_address", "Client address", "5 Sample Road, Parramatta NSW 2150"),
      text(", authorise "),
      field("firm_name", "Firm name", "Huynh Lawyers"),
      text(" to act on my/our behalf in relation to "),
      field("matter_description", "Matter", "the purchase of 12 Example Street, Sydney NSW 2000"),
      text(".\n\nI/We authorise the firm to:\n\n1. correspond and negotiate with all other parties and their representatives on my/our behalf;\n2. obtain such searches, certificates and reports as are reasonably necessary;\n3. receive and hold funds in the firm's trust account, and disburse those funds in accordance with my/our instructions and the requirements of the matter; and\n4. sign documents on my/our behalf where I/we have given specific instructions to do so.\n\nSigned: ____________________________\n\nDate: "),
      field("date", "Date", "2 August 2026"),
    ],
  },
  {
    key: "care.voi_aml_request",
    name: "Verification of Identity and Source of Funds Request",
    description: "Requests ID documents and source-of-funds information to satisfy VOI and AML/CTF obligations.",
    category: "Client Care",
    subcategory: "Onboarding",
    documentType: "letter",
    aiInstructions:
      "Draft a letter requesting the documents needed to verify the client's identity and, where relevant, the source of funds. List the standard identity documents required, explain briefly why verification is required (legal and regulatory obligation, and protection against fraud), and give clear instructions on how to provide them. Be courteous -- clients can find this request intrusive.",
    segments: [
      text("Before we can proceed, we are required to verify your identity and, in property and financial matters, to make reasonable enquiries about the source of the funds being used.\n\nThis is a legal and regulatory requirement. It also protects you: identity fraud in property transactions is a real and growing risk.\n\nPlease provide the following:\n\nIDENTITY\n\n1. Australian passport, or foreign passport together with a current visa;\n2. Australian driver licence; and\n3. a document confirming your current residential address (rates notice, utility bill or bank statement dated within the last three months).\n\nSOURCE OF FUNDS\n\nPlease confirm where the funds for this transaction are coming from, for example: "),
      field("source_of_funds_examples", "Relevant sources", "savings, sale proceeds of another property, a bank loan, or a gift from a family member"),
      text(".\n\nIf any part of the funds is a gift, we will also need a short letter from the person providing it.\n\nYou can provide these documents "),
      field("how_to_provide", "How to provide", "by attending our office in person, or via the secure upload link we will send separately"),
      text(".\n\nWe cannot proceed to settlement without completing this step, so please attend to it promptly."),
    ],
  },
  {
    key: "care.file_opening_confirmation",
    name: "File Opening Confirmation",
    description: "Confirms instructions received, matter opened, key contacts and next steps.",
    category: "Client Care",
    subcategory: "Engagement",
    documentType: "letter",
    aiInstructions:
      "Draft a short letter confirming the file has been opened. Confirm the client's instructions as understood, give the matter reference, name the contact person, and set out the immediate next steps and anything needed from the client. Warm and brief.",
    segments: [
      text("Thank you for instructing us. We have opened a file in this matter.\n\nOur reference is "),
      field("matter_number", "Matter number", "260575", "matter_number"),
      text(".\n\nAs we understand it, your instructions are that "),
      field("instructions", "Instructions as understood", "we are to act for you in the purchase of 12 Example Street, Sydney NSW 2000"),
      text(".\n\nIf that does not accurately reflect your instructions, please tell us straight away.\n\nNEXT STEPS\n\n"),
      field("next_steps", "Next steps", "We will review the contract and provide our written advice within 3 business days."),
      text("\n\nWE NEED FROM YOU\n\n"),
      field("client_actions", "What we need from the client", "Your signed costs agreement, identity documents, and confirmation of your finance position."),
      text("\n\nPlease don't hesitate to contact us if you have any questions."),
    ],
  },
  {
    key: "care.request_for_funds",
    name: "Request for Funds (with payment fraud warning)",
    description: "Requests settlement or disbursement funds, with the standard warning that bank details are never changed by email.",
    category: "Client Care",
    subcategory: "Funds",
    documentType: "letter",
    aiInstructions:
      "Draft a request for funds. State the amount required, what it is for, the due date, and how to pay. CRITICAL: include a prominent payment-fraud warning telling the client that the firm will never change its bank details by email, and that they must telephone the firm on a known number to verify account details before transferring. Payment redirection fraud is the single largest source of loss in conveyancing -- this warning is not optional.",
    segments: [
      text("We now require funds in order to proceed.\n\nAMOUNT REQUIRED: "),
      field("amount", "Amount required", "$45,320.18"),
      text("\n\nTHIS IS FOR: "),
      field("purpose", "What the funds are for", "the balance of the purchase price, transfer duty and our fees"),
      text("\n\nREQUIRED BY: "),
      field("due_date", "Due by", "9:00am on 15 August 2026"),
      text("\n\nPAYMENT DETAILS\n\n"),
      field("payment_details", "Payment details", "Account name: Huynh Lawyers Trust Account\nBSB: 000-000\nAccount number: 00000000\nReference: 260575"),
      text("\n\n----------------------------------------\nIMPORTANT - PROTECT YOURSELF FROM FRAUD\n\nWe will NEVER email you to advise that our bank account details have changed.\n\nBefore transferring any funds, telephone us on a number you have independently confirmed (not a number contained in an email) and verbally verify the account details above.\n\nIf you receive an email appearing to come from us advising different account details, do not act on it. Telephone us immediately.\n----------------------------------------\n\nPlease send us the receipt once the transfer has been made."),
    ],
  },
  {
    key: "care.trust_receipt_confirmation",
    name: "Trust Receipt Confirmation",
    description: "Confirms receipt of client funds into the trust account.",
    category: "Client Care",
    subcategory: "Funds",
    documentType: "letter",
    aiInstructions:
      "Draft a short letter confirming funds have been received into the firm's trust account. State the amount, the date received, and what the funds are being held for. Keep it to a few lines.",
    segments: [
      text("We confirm that we have received "),
      field("amount", "Amount received", "$45,320.18"),
      text(" into our trust account on "),
      field("date_received", "Date received", "12 August 2026"),
      text(".\n\nThese funds are held on your behalf and will be applied towards "),
      field("purpose", "Purpose", "settlement of your purchase, transfer duty and our fees"),
      text(".\n\nA full trust statement will be provided to you on completion of the matter."),
    ],
  },
  {
    key: "care.final_report_and_trust_statement",
    name: "Final Report to Client and Trust Statement",
    description: "Closing letter reporting the outcome, accounting for trust monies and enclosing final documents.",
    category: "Client Care",
    subcategory: "File Closing",
    documentType: "letter",
    aiInstructions:
      "Draft a closing report to the client. Confirm the matter has completed, summarise the outcome, account for all trust monies received and disbursed, list the documents enclosed or being sent, and note any ongoing obligations or dates the client should diarise. End by thanking them for their instructions.",
    segments: [
      text("We are pleased to confirm that this matter has now completed.\n\nOUTCOME\n\n"),
      field("outcome", "Outcome summary", "Settlement of your purchase took place on 15 August 2026. Title has been transferred into your name."),
      text("\n\nTRUST ACCOUNT\n\nA full statement of the monies we received and disbursed on your behalf is enclosed. "),
      field("trust_summary", "Trust summary", "The balance of $312.40 has been refunded to your nominated account."),
      text("\n\nENCLOSED\n\n"),
      field("enclosures", "Documents enclosed", "Stamped contract, title search confirming registration, and our final tax invoice."),
      text("\n\nPLEASE DIARISE\n\n"),
      field("client_diary", "Dates or obligations for the client", "Your first council rates instalment falls due on 30 September 2026."),
      text("\n\nWe will retain your file for the period required by law and then destroy it securely.\n\nThank you for your instructions. We would be glad to assist you again."),
    ],
  },
  {
    key: "care.file_closing_internal_note",
    name: "File Closing Checklist (internal file note)",
    description: "Internal note recording that closing steps were completed before archiving.",
    category: "Client Care",
    subcategory: "File Closing",
    documentType: "file_note",
    aiInstructions:
      "Draft a brief internal file note recording the file-closing checks: all undertakings discharged, trust balance nil, original documents returned or accounted for, final invoice rendered and paid, key dates diarised for the client, and the retention/destruction date. This is an internal record, not client correspondence -- terse and factual.",
    segments: [
      text("FILE CLOSING NOTE\n\nMatter: "),
      field("matter_number", "Matter number", "260575", "matter_number"),
      text("\nClosed by: "),
      field("closed_by", "Closed by", "Jane Smith"),
      text("\nDate: "),
      field("date", "Date", "20 August 2026"),
      text("\n\n[ ] All undertakings given have been discharged\n[ ] Trust account balance for this matter is nil\n[ ] Original documents returned to client or accounted for\n[ ] Final invoice rendered and paid\n[ ] Client advised of any ongoing obligations and key dates\n[ ] Searches, certificates and settlement records saved to file\n\nRetention: file to be retained until "),
      field("retention_date", "Retention until", "20 August 2033"),
      text(" then destroyed securely.\n\nNotes: "),
      field("notes", "Notes", "Nil."),
    ],
  },
  {
    key: "care.change_of_solicitor_notice",
    name: "Notice of Change of Solicitor",
    description: "Notifies other parties that the firm has taken over (or ceased) acting.",
    category: "Client Care",
    subcategory: "Engagement",
    documentType: "letter",
    aiInstructions:
      "Draft a notice to the other party's representative confirming that this firm now acts for the named client, requesting that all future correspondence be directed to this firm, and asking for the file/relevant documents to be provided. Short and businesslike.",
    segments: [
      text("We confirm that we now act for "),
      field("client_name", "Client name", "John Citizen"),
      text(" in this matter, in place of "),
      field("former_solicitor", "Former solicitor", "Previous & Co Lawyers"),
      text(".\n\nPlease direct all future correspondence to this office, quoting our reference "),
      field("matter_number", "Our reference", "260575", "matter_number"),
      text(".\n\nWe would be grateful if you would provide us with "),
      field("documents_requested", "Documents requested", "copies of all correspondence and documents relevant to the matter"),
      text(" at your earliest convenience."),
    ],
  },
  {
    key: "care.termination_of_retainer",
    name: "Termination of Retainer",
    description: "Ends the retainer, explains why, and sets out what happens next.",
    category: "Client Care",
    subcategory: "File Closing",
    documentType: "letter",
    aiInstructions:
      "Draft a letter terminating the retainer. State clearly that the firm will cease acting and from when, give the reason in neutral and professional terms, set out any imminent deadlines the client must now attend to themselves, explain what will happen to the file and any trust monies, and recommend the client obtain alternative representation promptly. Never disparage the client. Be alert to any limitation period or court date that must be flagged.",
    segments: [
      text("We write to confirm that we will cease acting for you in this matter with effect from "),
      field("effective_date", "Effective date", "16 August 2026"),
      text(".\n\nREASON\n\n"),
      field("reason", "Reason (neutral wording)", "Regrettably we have been unable to obtain instructions from you despite repeated attempts to contact you."),
      text("\n\nIMPORTANT DATES YOU MUST NOW ATTEND TO\n\n"),
      field("critical_dates", "Critical dates the client must action", "Your defence is due to be filed by 30 August 2026. If it is not filed, judgment may be entered against you."),
      text("\n\nWe strongly recommend that you obtain alternative legal representation immediately so that these dates are not missed.\n\nYOUR FILE AND FUNDS\n\n"),
      field("file_and_funds", "File and trust monies", "Your file is available for collection from our office. The trust balance of $1,240.00 will be refunded to you once our outstanding invoice is settled."),
      text("\n\nWe are willing to provide reasonable assistance to your new solicitor in transferring the matter."),
    ],
  },
];
