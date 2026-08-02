// lib/precedents/library/agreementsBatch2.ts
// Full commercial agreements, continuing agreementsBatch1.ts: a consultancy
// agreement, an independent contractor agreement, and a supplier's terms and
// conditions of trade.
//
// The consultancy and contractor agreements read as separate documents
// rather than one with a note about which clauses to cut, because the
// difference between them is not cosmetic. A consultancy engages someone for
// their professional judgement and is comfortable assuming they do the work
// personally; an independent contractor agreement exists mainly to withstand
// a characterisation challenge, so it puts a genuine right to delegate, the
// contractor's own tools and freedom to work for others into the operative
// clauses themselves rather than a recital that changes nothing. A label
// never determines status -- the substance does -- and a contract that only
// asserts contractor status while functioning like an employment contract in
// every operative clause is exactly the kind of document that loses a sham
// contracting claim.
//
// Terms of trade are structurally different again: not two parties
// negotiating from a blank page, but a supplier's standing terms that a
// customer accepts, most often as part of a credit application. It is
// drafted here to double as that credit application -- Parties are the
// Supplier and the Customer, and it is executed as a DEED rather than an
// agreement specifically so the personal guarantee clause binds the
// guarantor without a separate consideration problem, which is why its
// execution page departs from execution() in agreementParts.ts (bespoke:
// Customer and Guarantor sign, the Supplier does not -- these are its own
// terms, not a negotiated bargain it needs to be bound to by deed).
import { field, type PrecedentSeed } from "./types";
import { L, executionLines, CHOOSE_EXECUTION_BLOCK_NOTE } from "./instrumentParts";
import { opening, interpretation, generalProvisions, execution, confidentialInformationExceptions } from "./agreementParts";
import { executedAsLine } from "@/lib/precedents/executionClauses";
import { DEED_PAGE_BREAK } from "@/lib/precedents/deedDocx";

const COMMERCIAL = ["Commercial"];

export const AGREEMENTS_BATCH_2: PrecedentSeed[] = [
  // ── Consultancy ─────────────────────────────────────────────────
  {
    key: "agr.consultancy_agreement",
    name: "Consultancy Agreement",
    description:
      "Engagement of a consultant in full: services by schedule, fees, IP assignment with licence-back, confidentiality, insurance and contractor-status protections.",
    category: "Commercial",
    subcategory: "Services",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "Fill in Schedule 1 with the actual services and fee structure before sending -- a scope described only as 'consulting services' gives no basis to say the engagement ended or was performed defectively. Check the insurance amounts in the insurance clause against what the Principal's own risk exposure actually calls for. Delete the restraint clause if none was agreed; an unnegotiated non-solicitation clause is a common reason a consultant simply refuses to sign. Confirm the liability cap is proportionate to the fees -- a cap set too low can itself be evidence the 'independent contractor' characterisation is a fiction if the consultant is otherwise treated like an employee. If the consultant will access the Principal's premises or systems regularly, review with the actual working arrangement in mind: hours dictated by the Principal, no ability to delegate and use of the Principal's equipment all point away from independent contractor status regardless of what this document says.",
    aiInstructions:
      "This is a full consultancy agreement, not a scope note. Keep the engagement genuinely tied to the Schedule -- services, fees and term are fields, not prose, because a consultancy that has to be redrafted for every new engagement defeats the point of a precedent. Keep the independent contractor clause doing real work: it should say the Consultant controls how the services are performed, may (subject to the Principal's consent) use its own personnel, and is responsible for its own tax and superannuation, with an indemnity if that characterisation is later challenged -- but do not let the drafting imply the label itself is what protects the Principal. Assign IP created in performing the services to the Principal on payment, with a licence back for the Consultant's own pre-existing tools and know-how; without the licence-back a consultant who reuses a method or template across clients is technically infringing every subsequent client's copyright. Keep the liability cap and the insurance clause aligned -- a cap with no insurance behind it is not worth much if the Consultant cannot pay it.",
    segments: [
      ...L(null, ["CONSULTANCY AGREEMENT"]),
      ...L(null, [""]),
      ...opening(
        {
          key: "principal",
          label: "Principal",
          example: "ACME Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email accounts@acme.com.au",
          shortExample: "the Principal",
        },
        {
          key: "consultant",
          label: "Consultant",
          example: "Brightside Consulting Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email admin@brightsideconsulting.com.au",
          shortExample: "the Consultant",
        },
        [
          ...L("DeedRecital", [
            "The Principal wishes to engage the Consultant to provide the services described in Schedule 1 (the Services), and the Consultant has agreed to provide the Services on the terms of this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", [
        "Confidential Information means all information of or relating to a party or its Related Bodies Corporate that is disclosed to, or observed or obtained by, the other party or its Personnel in connection with this agreement, whether before or after the date of this agreement, in any form, but does not include information that:",
      ]),
      ...confidentialInformationExceptions(),
      ...L("DeedList-Level3", ["Deliverables means any document, report, work or other output the Consultant provides to the Principal as part of the Services."]),
      ...L("DeedList-Level3", ["Fees has the meaning given in Schedule 1."]),
      ...L("DeedList-Level3", [
        "Intellectual Property means all intellectual property rights, including copyright, patents, trade marks, design rights, trade secrets and know-how, whether registered or unregistered.",
      ]),
      ...L("DeedList-Level3", ["Personnel means, in relation to the Consultant, its employees, subcontractors and agents engaged in performing the Services."]),
      ...L("DeedList-Level3", ["Related Body Corporate has the meaning given in the Corporations Act 2001 (Cth)."]),
      ...L("DeedList-Level3", ["Services has the meaning given in Schedule 1."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Engagement and term"]),
      ...L("DeedList-Level2-Normal", ["The Principal engages the Consultant, and the Consultant accepts the engagement, to provide the Services."]),
      ...L("DeedList-Level2-Normal", [
        "This agreement commences on ",
        field("commencement_date", "Commencement date", "1 September 2026"),
        " and continues for ",
        field("term", "Term", "12 months"),
        " unless ended earlier under clause 11, and may be extended by written agreement of the parties.",
      ]),

      ...L("DeedList-Level1-Bold", ["Services"]),
      ...L("DeedList-Level2-Normal", ["The Consultant must provide the Services:"]),
      ...L("DeedList-Level3", ["with due care, skill and diligence and to a standard consistent with good industry practice;"]),
      ...L("DeedList-Level3", ["in accordance with all reasonable directions of the Principal; and"]),
      ...L("DeedList-Level3", ["in compliance with all laws applicable to the performance of the Services."]),
      ...L("DeedList-Level2-Normal", [
        "The scope of the Services may only be varied by written agreement between the parties, including any consequent adjustment to the Fees or the timetable in Schedule 1.",
      ]),

      ...L("DeedList-Level1-Bold", ["Fees and payment"]),
      ...L("DeedList-Level2-Normal", ["The Principal must pay the Consultant the Fees in accordance with Schedule 1."]),
      ...L("DeedList-Level2-Normal", [
        "The Consultant must invoice the Principal in accordance with Schedule 1. Each invoice must set out the Services to which it relates in enough detail for the Principal to verify it.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Unless Schedule 1 says otherwise, invoices are payable within ",
        field("payment_terms", "Payment terms", "14 days of the date of the invoice"),
        ". Amounts payable under this agreement are exclusive of GST, which the Principal must pay in addition on receipt of a valid tax invoice.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Principal must reimburse the Consultant for expenses reasonably and properly incurred in providing the Services, to the extent pre-approved by the Principal in writing and evidenced by receipts.",
      ]),

      ...L("DeedList-Level1-Bold", ["Independent contractor status"]),
      ...L("DeedList-Level2-Normal", [
        "The Consultant is an independent contractor. Nothing in this agreement makes the Consultant, or any of its Personnel, an employee, partner or agent of the Principal, and the Consultant must not represent itself as one.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Subject to clause 6.1 and the Principal's reasonable directions as to outcome, the Consultant controls how, when and by whom (among its Personnel) the Services are performed, and may use its own equipment, tools and premises in doing so.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Consultant is responsible for its own, and its Personnel's, taxation, superannuation, workers compensation and insurance obligations, and indemnifies the Principal against any liability, penalty or claim the Principal incurs because the Consultant or any of its Personnel is found to be an employee of the Principal, except to the extent the finding arises from the Principal's own conduct.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Clause 6.3 does not affect any entitlement the Consultant or its Personnel has under superannuation guarantee legislation that cannot be excluded by agreement.",
      ]),

      ...L("DeedList-Level1-Bold", ["Intellectual property"]),
      ...L("DeedList-Level2-Normal", [
        "On payment in full for the Services to which they relate, the Consultant assigns to the Principal all Intellectual Property in the Deliverables created by the Consultant or its Personnel in performing the Services.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Clause 7.1 does not apply to Intellectual Property that existed before this agreement, or that the Consultant develops independently of this engagement, or that is generic to the Consultant's business (its own methods, tools and templates) rather than specific to the Deliverables (Consultant Background IP). The Consultant grants the Principal a non-exclusive, royalty-free, perpetual licence to use Consultant Background IP to the extent it is incorporated in a Deliverable, for the Principal's own internal business purposes.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Consultant must obtain from its Personnel whatever assignments and consents are necessary to give full effect to this clause 7.",
      ]),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must keep the other's Confidential Information confidential, use it only for the purposes of this agreement, and not disclose it except to Personnel or professional advisers who need it for those purposes, with the discloser's prior written consent, or as required by law.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "This clause survives termination of this agreement and continues for ",
        field("confidentiality_term", "How long confidentiality survives termination", "three years after termination"),
        ", except that obligations in respect of a trade secret continue for so long as the information retains that character.",
      ]),

      ...L("DeedList-Level1-Bold", ["Warranties"]),
      ...L("DeedList-Level2-Normal", ["Each party warrants that it has full power and authority to enter into and perform this agreement."]),
      ...L("DeedList-Level2-Normal", [
        "The Consultant warrants that it holds, and will maintain for the term of this agreement, any licence, registration or qualification required by law to provide the Services, and that providing the Services will not infringe the intellectual property or other rights of any third party.",
      ]),

      ...L("DeedList-Level1-Bold", ["Insurance"]),
      ...L("DeedList-Level2-Normal", [
        "The Consultant must hold, for the term of this agreement, public liability insurance of at least ",
        field("public_liability_amount", "Public liability insurance amount", "$10,000,000"),
        " and professional indemnity insurance of at least ",
        field("pi_insurance_amount", "Professional indemnity insurance amount", "$2,000,000"),
        ", and must provide evidence of currency on the Principal's reasonable request.",
      ]),

      ...L("DeedList-Level1-Bold", ["Termination"]),
      ...L("DeedList-Level2-Normal", [
        "Either party may terminate this agreement for convenience on ",
        field("termination_notice", "Notice period for termination without cause", "30 days'"),
        " written notice to the other.",
      ]),
      ...L("DeedList-Level2-Normal", ["Either party may terminate this agreement immediately by written notice if the other party:"]),
      ...L("DeedList-Level3", ["commits a material breach of this agreement that is not remedied within 14 days of written notice requiring it to be remedied; or"]),
      ...L("DeedList-Level3", ["becomes insolvent, has a controller or administrator appointed, or enters into any arrangement with its creditors."]),
      ...L("DeedList-Level2-Normal", [
        "On termination, the Principal must pay the Consultant for Services properly performed, and expenses properly incurred, up to the date of termination, and the Consultant must deliver up all Deliverables and Confidential Information in its possession in accordance with clause 8.",
      ]),

      ...L(null, ["[Delete clause 12 if a non-solicitation restraint was not agreed.]"]),
      ...L("DeedList-Level1-Bold", ["Non-solicitation"]),
      ...L("DeedList-Level2-Normal", [
        "For ",
        field("non_solicit_period", "Non-solicitation period", "12 months from termination of this agreement"),
        ", the Consultant must not solicit or entice away any employee of the Principal with whom it dealt in the course of this engagement, except in response to a general advertisement that is not directed at that person.",
      ]),

      ...L("DeedList-Level1-Bold", ["Liability"]),
      ...L("DeedList-Level2-Normal", [
        "To the maximum extent permitted by law, neither party is liable to the other for any indirect or consequential loss, including loss of profits, revenue or business opportunity, arising out of or in connection with this agreement.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "To the maximum extent permitted by law, each party's total liability arising out of or in connection with this agreement, whether in contract, tort (including negligence) or otherwise, is limited to ",
        field("liability_cap", "Liability cap", "the total Fees paid or payable under this agreement in the 12 months before the claim arose"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Clause 13.1 and clause 13.2 do not apply to loss arising from a party's fraud, wilful misconduct, or death or personal injury caused by its negligence, or to any liability that cannot be excluded or limited by law.",
      ]),

      ...generalProvisions(),
      ...execution("Principal", "Consultant"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Services"]),
      ...L("DeedList-Level2-Bold", ["Services"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("services_description", "Description of the Services", "Provision of financial modelling and feasibility advice for the Principal's proposed development at 100 Sample Road, Newtown NSW, including the deliverables set out below."),
      ]),
      ...L("DeedList-Level2-Bold", ["Deliverables and timetable"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("deliverables", "Deliverables and timetable", "Draft feasibility model within 4 weeks of commencement; final model and written report within 8 weeks of commencement."),
      ]),
      ...L("DeedList-Level2-Bold", ["Fees"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("fees", "Fees and how they're calculated", "$18,500 (excluding GST), payable as to 50% on commencement and 50% on delivery of the final report."),
      ]),
      ...L("DeedList-Level2-Bold", ["Invoicing"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("invoicing", "Invoicing arrangements", "Monthly in arrears, or on achievement of the milestones above, whichever Schedule the parties have agreed applies."),
      ]),
    ],
  },

  // ── Independent contractor ──────────────────────────────────────
  {
    key: "agr.independent_contractor_agreement",
    name: "Independent Contractor Agreement",
    description:
      "Contractor engagement in full, with the operative clauses -- not just a recital -- doing the work of supporting genuine contractor status: right to delegate, own equipment, no exclusivity.",
    category: "Commercial",
    subcategory: "Services",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "The clauses that support contractor status -- right to delegate, own equipment, no exclusivity, invoicing rather than wages -- only work if they reflect what will actually happen. If the Principal in fact directs how and when the work is done, requires personal performance, supplies the tools and expects exclusivity, this document will not save the characterisation and should not be used; engage the person as an employee instead. Confirm whether superannuation guarantee applies despite genuine contractor status -- s 12(3) of the Superannuation Guarantee (Administration) Act 1992 (Cth) can still apply where the contract is wholly or principally for the person's labour, even where the multi-factor employment test points the other way. Where the Contractor operates through its own company, note that this reduces but does not eliminate misclassification risk for the individual actually doing the work. Fill in Schedule 1 with the actual services before sending.",
    aiInstructions:
      "This document exists mainly to withstand a characterisation challenge, and it only does that if the operative clauses actually differ from an employment contract, not just the labels. Give the Contractor a genuine, usable right to delegate or subcontract (subject to the Principal's consent, which must not be unreasonably withheld); make clear the Contractor supplies its own equipment and tools unless Schedule 1 says otherwise; state expressly that the Contractor is free to provide services to others during the term, subject only to confidentiality and any genuine conflict of interest; and structure payment as invoicing against milestones or time, not as a salary. Do not include a clause purporting to declare the Contractor's status conclusively -- courts look at the substance of the relationship, not a label the parties chose, so a declaratory clause protects nobody and can look like an attempt to disguise the true relationship. Keep the sham contracting risk in the review note rather than the contract itself: it is advice to the drafter, not something a clause can fix.",
    segments: [
      ...L(null, ["INDEPENDENT CONTRACTOR AGREEMENT"]),
      ...L(null, [""]),
      ...opening(
        {
          key: "principal",
          label: "Principal",
          example: "ACME Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email accounts@acme.com.au",
          shortExample: "the Principal",
        },
        {
          key: "contractor",
          label: "Contractor",
          example: "J Citizen Contracting Pty Ltd ACN 222 222 222 of 5 Trade Street, Bankstown NSW 2200, email jcitizen@example.com.au",
          shortExample: "the Contractor",
        },
        [
          ...L("DeedRecital", [
            "The Principal wishes to engage the Contractor, as an independent contractor and not as an employee, to provide the services described in Schedule 1 (the Services), and the Contractor has agreed to do so on the terms of this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", [
        "Confidential Information means all information of or relating to a party or its Related Bodies Corporate that is disclosed to, or observed or obtained by, the other party or its Personnel in connection with this agreement, whether before or after the date of this agreement, in any form, but does not include information that:",
      ]),
      ...confidentialInformationExceptions(),
      ...L("DeedList-Level3", ["Fees has the meaning given in Schedule 1."]),
      ...L("DeedList-Level3", [
        "Intellectual Property means all intellectual property rights, including copyright, patents, trade marks, design rights, trade secrets and know-how, whether registered or unregistered.",
      ]),
      ...L("DeedList-Level3", ["Personnel means any employee, subcontractor or agent the Contractor engages to help perform the Services."]),
      ...L("DeedList-Level3", ["Related Body Corporate has the meaning given in the Corporations Act 2001 (Cth)."]),
      ...L("DeedList-Level3", ["Services has the meaning given in Schedule 1."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Engagement and term"]),
      ...L("DeedList-Level2-Normal", ["The Principal engages the Contractor, and the Contractor accepts the engagement, to provide the Services as an independent contractor."]),
      ...L("DeedList-Level2-Normal", [
        "This agreement commences on ",
        field("commencement_date", "Commencement date", "1 September 2026"),
        " and continues for ",
        field("term", "Term", "12 months"),
        " unless ended earlier under clause 10, and may be extended by written agreement of the parties.",
      ]),

      ...L("DeedList-Level1-Bold", ["Basis of engagement"]),
      ...L("DeedList-Level2-Normal", [
        "The Contractor controls the manner in which the Services are performed. The Principal may specify the result required and reasonable deadlines, but must not direct the day-to-day manner or hours of the Contractor's work.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Contractor may engage Personnel to perform the Services, or any part of them, and is not required to perform the Services personally, provided the Contractor remains responsible for the Services being performed to the standard required by this agreement and remains liable for its Personnel's acts and omissions as if they were its own.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Unless Schedule 1 says otherwise, the Contractor must supply its own equipment, tools, materials and place of work required to perform the Services, at its own cost.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Contractor is free to provide services to other clients during the term of this agreement, including competitors of the Principal, subject to clause 8 (confidentiality) and to not allowing any conflict of interest to affect performance of the Services.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Nothing in this agreement entitles the Contractor or its Personnel to any employee entitlement, including annual leave, personal leave, notice of termination or redundancy pay.",
      ]),

      ...L("DeedList-Level1-Bold", ["Fees and payment"]),
      ...L("DeedList-Level2-Normal", ["The Principal must pay the Contractor the Fees in accordance with Schedule 1."]),
      ...L("DeedList-Level2-Normal", [
        "The Contractor must invoice the Principal for the Fees. Unless Schedule 1 says otherwise, invoices are payable within ",
        field("payment_terms", "Payment terms", "14 days of the date of the invoice"),
        ". Amounts payable under this agreement are exclusive of GST, which the Principal must pay in addition on receipt of a valid tax invoice.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Contractor is responsible for its own, and its Personnel's, taxation, superannuation (except to the extent superannuation guarantee legislation requires the Principal to contribute despite the Contractor's independent status), workers compensation and insurance obligations.",
      ]),

      ...L("DeedList-Level1-Bold", ["Insurance"]),
      ...L("DeedList-Level2-Normal", [
        "The Contractor must hold, for the term of this agreement, public liability insurance of at least ",
        field("public_liability_amount", "Public liability insurance amount", "$10,000,000"),
        " and, if it engages any Personnel, the workers compensation insurance required by law, and must provide evidence of currency on the Principal's reasonable request.",
      ]),

      ...L("DeedList-Level1-Bold", ["Intellectual property"]),
      ...L("DeedList-Level2-Normal", [
        "On payment in full for the Services to which they relate, the Contractor assigns to the Principal all Intellectual Property created by the Contractor or its Personnel in performing the Services, other than Intellectual Property that existed before this agreement or is generic to the Contractor's business rather than specific to what was created for the Principal (Contractor Background IP), in which the Contractor grants the Principal a non-exclusive, royalty-free, perpetual licence to the extent it is incorporated in what was created for the Principal.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Contractor must obtain from its Personnel whatever assignments and consents are necessary to give full effect to this clause 7.",
      ]),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must keep the other's Confidential Information confidential, use it only for the purposes of this agreement, and not disclose it except to Personnel or professional advisers who need it for those purposes, with the discloser's prior written consent, or as required by law.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "This clause survives termination of this agreement and continues for ",
        field("confidentiality_term", "How long confidentiality survives termination", "three years after termination"),
        ", except that obligations in respect of a trade secret continue for so long as the information retains that character.",
      ]),

      ...L("DeedList-Level1-Bold", ["Warranties"]),
      ...L("DeedList-Level2-Normal", [
        "The Contractor warrants that it holds, and will maintain for the term of this agreement, any licence, registration or qualification required by law to provide the Services, and that it and its Personnel have the right to work in Australia.",
      ]),

      ...L("DeedList-Level1-Bold", ["Termination"]),
      ...L("DeedList-Level2-Normal", [
        "Either party may terminate this agreement for convenience on ",
        field("termination_notice", "Notice period for termination without cause", "30 days'"),
        " written notice to the other.",
      ]),
      ...L("DeedList-Level2-Normal", ["Either party may terminate this agreement immediately by written notice if the other party:"]),
      ...L("DeedList-Level3", ["commits a material breach of this agreement that is not remedied within 14 days of written notice requiring it to be remedied; or"]),
      ...L("DeedList-Level3", ["becomes insolvent, has a controller or administrator appointed, or enters into any arrangement with its creditors."]),
      ...L("DeedList-Level2-Normal", [
        "On termination, the Principal must pay the Contractor for Services properly performed, and expenses properly incurred, up to the date of termination.",
      ]),

      ...L("DeedList-Level1-Bold", ["Liability"]),
      ...L("DeedList-Level2-Normal", [
        "To the maximum extent permitted by law, neither party is liable to the other for any indirect or consequential loss, including loss of profits, revenue or business opportunity, arising out of or in connection with this agreement.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "To the maximum extent permitted by law, each party's total liability arising out of or in connection with this agreement, whether in contract, tort (including negligence) or otherwise, is limited to ",
        field("liability_cap", "Liability cap", "the total Fees paid or payable under this agreement in the 12 months before the claim arose"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Clause 11.1 and clause 11.2 do not apply to loss arising from a party's fraud, wilful misconduct, or death or personal injury caused by its negligence, or to any liability that cannot be excluded or limited by law.",
      ]),

      ...generalProvisions(),
      ...execution("Principal", "Contractor"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Services"]),
      ...L("DeedList-Level2-Bold", ["Services"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("services_description", "Description of the Services", "Carpentry and fit-out works at the Principal's premises at 100 Sample Road, Newtown NSW, in accordance with the specification provided separately."),
      ]),
      ...L("DeedList-Level2-Bold", ["Equipment supplied by the Principal (if any)"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("equipment_supplied", "Any equipment the Principal supplies (state 'None' if the Contractor supplies everything)", "None -- the Contractor supplies all tools and equipment."),
      ]),
      ...L("DeedList-Level2-Bold", ["Fees"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("fees", "Fees and how they're calculated", "$85 per hour (excluding GST), invoiced fortnightly against timesheets."),
      ]),
    ],
  },

  // ── Terms of trade ───────────────────────────────────────────────
  {
    key: "agr.terms_of_trade",
    name: "Terms and Conditions of Trade (Sale of Goods and Services)",
    description:
      "Standard trading terms in full, doubling as a credit application: incorporation, retention of title drafted for PPSR registration, ACL-compliant warranty limits and a director's personal guarantee.",
    category: "Commercial",
    subcategory: "Trading Terms",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "Registering the security interest this document creates is not optional -- retention of title unregistered on the PPSR is close to worthless if the Customer becomes insolvent, because an unperfected security interest usually vests in the customer's administrator or liquidator. Diarise registration within the statutory window (before delivery for priority as a purchase money security interest in inventory; otherwise within 15 business days of delivery) every time these terms are used, and register a change statement if the Customer's details change. Confirm the Customer is not a 'consumer' under s 3 of the Australian Consumer Law before relying on the liability cap in clause 11 -- it does not apply to goods or services of a kind ordinarily acquired for personal, domestic or household use, and cannot be read down to exclude consumer guarantees that apply regardless. Check the Guarantor is a real individual who understands they are personally liable -- a guarantee signed without genuine attention to what it does is vulnerable to being set aside, particularly where the relationship suggests undue influence. If these terms will be incorporated by reference on quotes and invoices rather than signed as a credit application, keep clause 3 (incorporation) but delete the execution page and the guarantee, since an unsigned deed provision cannot bind a guarantor.",
    aiInstructions:
      "Draft standard terms and conditions of trade, structured as a credit application the Customer signs once and which then governs every order. Clause 3 (incorporation) is where most trading terms actually fail in practice, because they are relied on without ever being validly incorporated -- state plainly that these terms apply to every Order, and that any terms the Customer proposes are excluded unless the Supplier agrees to them in writing. Draft retention of title (clause 8) so it is registrable as a purchase money security interest under the Personal Property Securities Act 2009 (Cth): title stays with the Supplier until the Customer has paid everything it owes the Supplier, not just for the goods in that order; the Customer holds unpaid Goods as bailee; and if the Customer sells Goods before paying for them, the proceeds are held on trust for the Supplier up to the amount owing. Pair it with a general security clause and an attorney appointment so the Supplier can perfect and, if needed, complete registration itself. On liability, do not exclude the Australian Consumer Law consumer guarantees -- they cannot be excluded -- but do limit liability for their breach to the extent s 64A of the ACL permits (repair, replacement, resupply or the cost of it) for goods and services not ordinarily acquired for personal use. Draft the personal guarantee as a genuine, standalone indemnity, not a throwaway line, because it is usually the only real recourse if a corporate Customer folds still owing money.",
    segments: [
      ...L(null, ["TERMS AND CONDITIONS OF TRADE"]),
      ...L(null, [""]),
      ...opening(
        {
          key: "supplier",
          label: "Supplier",
          example: "ACME Supplies Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email accounts@acmesupplies.com.au",
          shortExample: "the Supplier",
        },
        {
          key: "customer",
          label: "Customer",
          example: "Brightside Builders Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email accounts@brightsidebuilders.com.au",
          shortExample: "the Customer",
        },
        [
          ...L("DeedRecital", [
            "The Customer wishes to be able to order Goods and Services from the Supplier from time to time, and the Supplier is willing to supply them, on the terms of this document.",
          ]),
          ...L("DeedRecital", [
            "The Guarantor has agreed to guarantee the Customer's obligations to the Supplier, as set out in clause 15.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this document:"]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this document."]),
      ...L("DeedList-Level3", ["GST has the meaning given in the A New Tax System (Goods and Services Tax) Act 1999 (Cth)."]),
      ...L("DeedList-Level3", ["Goods means any goods the Supplier supplies to the Customer under an Order."]),
      ...L("DeedList-Level3", ["Guarantor means the person who signs the guarantee in clause 15."]),
      ...L("DeedList-Level3", ["Order means a purchase order, quote acceptance or other order for Goods or Services the Customer places with the Supplier."]),
      ...L("DeedList-Level3", ["Price means the price for Goods or Services as quoted by the Supplier, or if none was quoted, the Supplier's price list current at the date of the Order."]),
      ...L("DeedList-Level3", ["PPSA means the Personal Property Securities Act 2009 (Cth)."]),
      ...L("DeedList-Level3", ["Security Interest has the meaning given in the PPSA."]),
      ...L("DeedList-Level3", ["Services means any services the Supplier supplies to the Customer under an Order."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Application of these terms"]),
      ...L("DeedList-Level2-Normal", [
        "These terms apply to every Order and form the entire agreement between the Supplier and the Customer for the supply of Goods and Services, to the exclusion of any terms the Customer proposes, whether in a purchase order or otherwise, unless the Supplier agrees to them in writing.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Placing an Order is the Customer's acknowledgment that it has received, read and agreed to these terms. These terms may also be accepted by the Customer signing this document as a credit application.",
      ]),

      ...L("DeedList-Level1-Bold", ["Orders"]),
      ...L("DeedList-Level2-Normal", ["An Order is an offer by the Customer to buy Goods or Services on these terms, which the Supplier may accept or decline in its discretion."]),
      ...L("DeedList-Level2-Normal", [
        "Once accepted, an Order may only be cancelled or varied with the Supplier's written consent, and the Customer must reimburse the Supplier for any cost or loss reasonably incurred as a result of the cancellation or variation.",
      ]),

      ...L("DeedList-Level1-Bold", ["Price and GST"]),
      ...L("DeedList-Level2-Normal", ["The Price is exclusive of GST. The Customer must pay GST on any taxable supply made under these terms, in addition to the Price, on receipt of a valid tax invoice."]),
      ...L("DeedList-Level2-Normal", [
        "The Supplier may vary the Price by notice to the Customer to reflect an increase in its costs, for any Order not yet accepted.",
      ]),

      ...L("DeedList-Level1-Bold", ["Payment"]),
      ...L("DeedList-Level2-Normal", [
        "The Customer must pay each invoice by ",
        field("payment_terms", "Payment terms", "the last Business Day of the month following the month of the invoice"),
        ", without deduction or set-off.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Interest accrues on any amount overdue, from the due date until paid, at ",
        field("interest_rate", "Interest rate on overdue amounts", "2% per month"),
        ". The Customer must also pay the Supplier's reasonable costs of recovering an overdue amount, including debt collection agency fees and legal costs on a solicitor-client basis.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Supplier may suspend further supply to the Customer, without liability, while any amount is overdue.",
      ]),

      ...L("DeedList-Level1-Bold", ["Delivery"]),
      ...L("DeedList-Level2-Normal", ["Delivery dates are estimates only. The Supplier is not liable for any loss arising from a delay in delivery."]),
      ...L("DeedList-Level2-Normal", ["Risk in Goods passes to the Customer on delivery, or on collection if the Customer collects."]),
      ...L("DeedList-Level2-Normal", [
        "The Customer must inspect Goods on delivery and notify the Supplier of any shortage, damage or defect within ",
        field("inspection_period", "Period to notify a defect after delivery", "5 Business Days"),
        ", after which the Goods are taken to have been delivered in good order and accepted.",
      ]),

      ...L("DeedList-Level1-Bold", ["Retention of title and security interest"]),
      ...L("DeedList-Level2-Normal", [
        "Title to Goods does not pass to the Customer until the Customer has paid the Supplier in full for those Goods and every other amount the Customer then owes the Supplier, even if the Goods have been delivered.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Until title passes, the Customer holds the Goods as bailee for the Supplier, must store them separately and identifiably as the Supplier's property, must not encumber them, and must insure them for their full replacement value with the Supplier's interest noted.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Customer sells or otherwise disposes of Goods before title has passed, it does so as the Supplier's agent, and holds the proceeds of that sale on trust for the Supplier up to the amount the Customer then owes the Supplier, separately from its own money.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Customer defaults in payment, the Supplier may, without liability for trespass, enter any premises where the Goods are located to recover them, and the Customer must give the Supplier access for that purpose.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "This clause 8 creates a purchase money security interest in favour of the Supplier over the Goods, and clause 9 creates a Security Interest over the Customer's other property. The Customer must do everything the Supplier reasonably requires, including signing any document and providing any information, to enable the Supplier to register, perfect and maintain those Security Interests under the PPSA.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "To the extent the law allows, the Customer waives its right to receive notice of, or to object to, anything the PPSA otherwise entitles it to notice of or to object to in connection with a Security Interest granted under this document, and agrees that sections 96, 118, 121(4), 125, 130, 132(3)(d), 132(4), 135, 142 and 143 of the PPSA do not apply to the extent they are capable of exclusion.",
      ]),
      ...L(null, ["[Clause 8.7 excludes PPSA provisions that may only be excluded where the Goods are not used predominantly for personal, domestic or household purposes -- confirm that is the case before relying on it.]"]),

      ...L("DeedList-Level1-Bold", ["General security and power of attorney"]),
      ...L("DeedList-Level2-Normal", [
        "As continuing security for everything the Customer owes the Supplier, the Customer charges in favour of the Supplier all of its present and after-acquired property.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Customer irrevocably appoints the Supplier, and each of its directors, as its attorney to do anything the Customer is required to do under clause 8 or this clause 9 but fails to do within a reasonable time after being asked, including signing any document and effecting any registration.",
      ]),

      ...L("DeedList-Level1-Bold", ["Warranties and Australian Consumer Law"]),
      ...L("DeedList-Level2-Normal", [
        "Nothing in these terms excludes, restricts or modifies a guarantee, right or remedy the Customer has under the Australian Consumer Law or any other law that cannot be excluded, restricted or modified by agreement.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "To the extent the Goods or Services are not of a kind ordinarily acquired for personal, domestic or household use, the Supplier's liability for a failure to comply with a consumer guarantee is limited, at the Supplier's election and to the extent section 64A of the Australian Consumer Law allows, to replacing or repairing the Goods, supplying equivalent goods, paying the cost of doing so, or re-supplying or paying the cost of re-supplying the Services.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Any manufacturer's warranty on the Goods is passed on to the Customer to the extent it is capable of being passed on, in place of any warranty from the Supplier as manufacturer or importer.",
      ]),

      ...L("DeedList-Level1-Bold", ["Limitation of liability"]),
      ...L("DeedList-Level2-Normal", [
        "Subject to clause 10, to the maximum extent permitted by law the Supplier is not liable for any indirect or consequential loss, including loss of profits, revenue or business opportunity, arising out of or in connection with the supply of Goods or Services.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Subject to clause 10, to the maximum extent permitted by law the Supplier's total liability arising out of or in connection with these terms, whether in contract, tort (including negligence) or otherwise, is limited to the Price paid for the Goods or Services giving rise to the liability.",
      ]),

      ...L("DeedList-Level1-Bold", ["Force majeure"]),
      ...L("DeedList-Level2-Normal", [
        "The Supplier is not liable for any failure or delay in performing its obligations to the extent caused by an event beyond its reasonable control, and its obligations are suspended for so long as the event continues.",
      ]),

      ...L("DeedList-Level1-Bold", ["Default and termination"]),
      ...L("DeedList-Level2-Normal", ["The Supplier may terminate these terms, or any Order, immediately by written notice if the Customer:"]),
      ...L("DeedList-Level3", ["fails to pay any amount when due;"]),
      ...L("DeedList-Level3", ["commits any other material breach of these terms that is not remedied within 7 days of written notice requiring it to be remedied; or"]),
      ...L("DeedList-Level3", ["becomes insolvent, has a controller or administrator appointed, or enters into any arrangement with its creditors."]),
      ...L("DeedList-Level2-Normal", [
        "Termination does not affect any right or obligation that accrued before termination, including the Customer's obligation to pay for Goods and Services already supplied.",
      ]),

      ...L("DeedList-Level1-Bold", ["Credit limit and review"]),
      ...L("DeedList-Level2-Normal", [
        "The Supplier may set, and from time to time review and reduce, a credit limit for the Customer, and may require payment in advance or other security for any Order that would exceed it.",
      ]),

      ...L("DeedList-Level1-Bold", ["Personal guarantee and indemnity"]),
      ...L("DeedList-Level2-Normal", [
        "In consideration of the Supplier agreeing to supply the Customer on these terms, the Guarantor unconditionally and irrevocably guarantees to the Supplier the due and punctual performance by the Customer of all of its obligations under these terms, and indemnifies the Supplier against any loss the Supplier suffers if the Customer fails to perform those obligations.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "This guarantee is a continuing guarantee and is not affected by any change in the Customer's structure, any extension of time or other indulgence the Supplier gives the Customer, or any other thing that might otherwise release a guarantor at law.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Guarantor acknowledges that the Supplier has recommended the Guarantor obtain independent legal advice before signing this guarantee, and that the Guarantor either has done so or has chosen not to.",
      ]),

      ...generalProvisions(),

      ...L(null, [""]),
      // The signing page starts a fresh page: a deed that is signed halfway
      // down a page of clauses reads as an afterthought, and the block can be
      // separated from what it signs.
      ...L(null, [DEED_PAGE_BREAK]),
      ...L("DeedHeading", ["Execution"]),
      ...L(null, [executedAsLine("deed")]),
      ...L(null, [""]),
      ...L(null, [CHOOSE_EXECUTION_BLOCK_NOTE]),
      ...L(null, [""]),
      ...executionLines("company_127_two_officers", "deed", "Customer"),
      ...L(null, [""]),
      ...L("DeedList-Level2-Bold", ["Guarantor"]),
      ...executionLines("individual", "deed", "Guarantor"),
    ],
  },
];
