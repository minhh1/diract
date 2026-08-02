// lib/precedents/library/commercialAgreements.ts
// Transactional commercial documents: confidentiality, consultancy, supply
// and distribution, intellectual property, corporate structures, technology
// and settlement deeds.
//
// A NOTE ON HOW THESE WORK, because it differs from the rest of the library.
//
// Most precedents elsewhere are correspondence, where a body_template of
// fixed text plus fill-in fields is exactly right. A shareholders agreement
// or a software development agreement is not that -- it is thirty pages of
// interlocking clauses whose content is driven entirely by the deal.
//
// So the long-form agreements below carry rich aiInstructions (the clauses
// to include, the drafting traps, the positions to take depending on which
// side the firm acts for) and NO body_template. The solicitor briefs the
// matter and the draft comes back structured; they then do what solicitors
// do with any precedent, which is adapt it.
//
// Documents that genuinely suit a fill-in structure -- heads of agreement,
// deeds of release, acknowledgements of debt, company resolutions -- keep
// their segments.
//
// Corporations Act 2001 (Cth) and the Australian Consumer Law are federal.
// Duty on transfers of shares and units, and on trust deeds, is state-based
// and prompted rather than assumed.
import { text, field, type PrecedentSeed } from "./types";

const COMMERCIAL = ["Commercial"];

export const COMMERCIAL_AGREEMENT_PRECEDENTS: PrecedentSeed[] = [
  // Five agreements lived here as stubs -- confidentiality (mutual and one
  // way), consultancy, independent contractor and terms of trade -- each
  // carrying only aiInstructions and no body. All five are now written out in
  // full in agreementsBatch1.ts and agreementsBatch2.ts under new keys, and
  // the stubs are gone so a firm installing today gets one of each rather
  // than a stub alongside the full draft.

  // ── Deal documents ──────────────────────────────────────────────
  {
    key: "cagr.heads_of_agreement",
    name: "Heads of Agreement / MOU",
    description: "Records the commercial terms agreed in principle, with binding and non-binding parts separated.",
    category: "Commercial",
    subcategory: "Deal Documents",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft heads of agreement. The single most important drafting decision is which parts bind: state EXPRESSLY that the commercial terms are subject to formal documentation and not binding, while confidentiality, exclusivity, costs and governing law ARE binding. A heads of agreement that is silent on this can be held to be a binding contract, which is usually the opposite of what the parties intended. Include the parties, the transaction, price and structure, key conditions, an exclusivity/no-shop period, a timetable, and who bears costs.",
    segments: [
      text("HEADS OF AGREEMENT\n\nParties: "),
      field("parties", "Parties", "Example Holdings Pty Ltd (Seller) and Sample Ventures Pty Ltd (Buyer)"),
      text("\nDate: "),
      field("date", "Date", "20 September 2026"),
      text("\n\n1. THE TRANSACTION\n\n"),
      field("transaction", "The transaction", "The Buyer proposes to acquire the business assets of the Seller's cafe operation trading as 'Example Cafe' at 100 Sample Road, Newtown NSW."),
      text("\n\n2. PRICE AND STRUCTURE\n\n"),
      field("price", "Price and structure", "$420,000, comprising goodwill $310,000, plant and equipment $85,000, and stock at valuation on completion. Payable: 10% deposit on signing the formal contract, balance on completion."),
      text("\n\n3. KEY CONDITIONS\n\n"),
      field("conditions", "Key conditions", "(a) Buyer's satisfactory due diligence within 21 days.\n(b) Landlord's consent to assignment of the lease.\n(c) Buyer obtaining finance.\n(d) Transfer of the liquor licence."),
      text("\n\n4. TIMETABLE\n\n"),
      field("timetable", "Timetable", "Formal contract to be executed by 20 October 2026; completion by 30 November 2026."),
      text("\n\n5. EXCLUSIVITY\n\nThe Seller will not negotiate with, or solicit offers from, any other party until "),
      field("exclusivity_end", "Exclusivity period ends", "20 October 2026"),
      text(".\n\n6. WHAT BINDS AND WHAT DOES NOT\n\nClauses 1 to 4 record the parties' intentions only. They are SUBJECT TO CONTRACT and are NOT legally binding. No party is obliged to proceed and either may withdraw at any time.\n\nClause 5 (exclusivity), together with confidentiality, costs and governing law below, ARE binding.\n\n7. COSTS\n\n"),
      field("costs", "Costs", "Each party bears its own costs."),
      text("\n\n8. GOVERNING LAW\n\n"),
      field("governing_law", "Governing law", "New South Wales."),
    ],
    requiresReview: true,
    reviewNote:
      "Check the binding/non-binding split is unambiguous. A heads of agreement that is silent on this, or that uses language of commitment in the commercial terms, can be held to be a binding contract.",
  },
  // Share Sale Agreement and Asset Sale Agreement lived here as stubs
  // (cagr.share_sale_agreement, cagr.asset_sale_agreement). Both are now
  // written out in full in agreementsBatch3.ts under new keys, and the stubs
  // are gone so a firm installing today gets one of each rather than a stub
  // alongside the full draft.
  // Restraint of Trade Deed lived here as a stub (cagr.restraint_of_trade_deed).
  // It's now written out in full in deedsBatch2.ts under a new key, and the
  // stub is gone so a firm installing today gets the full draft, not a stub
  // alongside it.

  // ── Corporate structures ────────────────────────────────────────
  // Every stub that lived in this section -- Shareholders Agreement, Unit
  // Trust Deed, Unitholders Agreement, Partnership Agreement, Joint Venture
  // Agreement and Buy-Sell Agreement -- is now written out in full elsewhere
  // in the library under new keys (agreementsBatch4.ts, deedsBatch3.ts and
  // agreementsBatch5.ts), and the stubs are gone so a firm installing today
  // gets the full draft, not a stub alongside it.

  // ── Intellectual property and technology ────────────────────────
  // IP Licence Agreement, Trade Mark Assignment, Copyright Assignment,
  // Software Development Agreement, Website Terms of Use and Privacy Policy,
  // Distribution Agreement and Franchise Agreement all lived here as stubs
  // too. All seven are now written out in full in deedsBatch4.ts and
  // agreementsBatch6.ts -- 7.ts under new keys, and the stubs are gone for
  // the same reason.

  // ── Settlement and debt documents ───────────────────────────────
  // cagr.deed_of_settlement_release was a working but plain fill-in template
  // for the same document deedsBatch1.ts's deed.settlement_and_release
  // already covers in full (definitions, a proper release clause, a bar to
  // proceedings) -- rather than draft a third version, this stub is simply
  // retired in favour of the one that already exists. Deed of Acknowledgement
  // of Debt (cagr.deed_of_acknowledgement_of_debt) is rewritten in full,
  // rather than retired, in deedsBatch3.ts under deed.acknowledgement_of_debt
  // -- the old version worked but had no styled clauses and only referenced a
  // guarantee rather than actually drafting one.

  // ── Corporate housekeeping ──────────────────────────────────────
  {
    key: "cagr.company_resolution",
    name: "Company Resolution (Directors or Members)",
    description: "Circulating or minuted resolution for a company decision.",
    category: "Commercial",
    subcategory: "Corporate Housekeeping",
    documentType: "form",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a company resolution. Identify whether it is a directors' resolution or a members' resolution, and whether ordinary or special (a special resolution requires 75% and prior notice). Record the company, the date, those present or the circulating signatories, the resolution itself in operative terms, and any declaration of interest required. Note that a sole director company can resolve by recording the decision, and that resolutions should be entered in the minute book.",
    segments: [
      text("MINUTES OF MEETING / CIRCULATING RESOLUTION\n\nCompany: "),
      field("company", "Company", "Example Holdings Pty Ltd (ACN 000 000 000)"),
      text("\nType: "),
      field("type", "Type of resolution", "Directors' resolution, passed by circulating resolution"),
      text("\nDate: "),
      field("date", "Date", "20 September 2026"),
      text("\n\nPRESENT / SIGNATORIES\n\n"),
      field("present", "Present or signatories", "John Citizen (Director)\nMary Citizen (Director)"),
      text("\n\nDECLARATIONS OF INTEREST\n\n"),
      field("interests", "Declarations of interest (or 'Nil')", "John Citizen declared an interest in the transaction the subject of the resolution below, being a director of the counterparty. The remaining director consented to his participation."),
      text("\n\nRESOLVED\n\n"),
      field("resolution", "The resolution", "THAT the Company enter into a loan agreement with Example Bank Limited for a facility of $750,000 on the terms of the draft provided, and THAT any one director be authorised to execute the loan agreement and all associated security documents on behalf of the Company."),
      text("\n\nSigned: ____________________________\n"),
      field("signatory1", "Signatory 1", "John Citizen, Director"),
      text("\n\nSigned: ____________________________\n"),
      field("signatory2", "Signatory 2", "Mary Citizen, Director"),
    ],
  },
];
