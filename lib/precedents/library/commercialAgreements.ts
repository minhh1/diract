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
  // ── Confidentiality ─────────────────────────────────────────────
  {
    key: "cagr.nda_mutual",
    name: "Confidentiality Agreement (Mutual)",
    description: "Two-way NDA for parties exchanging confidential information during negotiations.",
    category: "Commercial",
    subcategory: "Confidentiality",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a mutual confidentiality agreement. Include: definition of confidential information (broad, but with the standard carve-outs for information already public, already known, independently developed, or required to be disclosed by law or a regulator); permitted purpose, tightly defined; permitted disclosees (employees, advisers, financiers) and the obligation to procure their compliance; obligations of use and non-use; return or destruction on request, with a carve-out for backup archives and records required to be retained; term of the obligations (which should survive the agreement); no licence or IP transfer; no obligation to proceed with the transaction; remedies including acknowledgment that damages may be inadequate and injunctive relief may be sought; and governing law. Keep it proportionate -- an oppressive NDA delays deals and is often simply refused.",
    segments: [
      text("CONFIDENTIALITY AGREEMENT (MUTUAL)\n\nParties: "),
      field("parties", "Parties", "Example Holdings Pty Ltd (ACN 000 000 000) and Sample Ventures Pty Ltd (ACN 111 111 111)"),
      text("\nDate: "),
      field("date", "Date", "20 September 2026"),
      text("\n\nPERMITTED PURPOSE\n\n"),
      field("purpose", "Permitted purpose", "Evaluating a possible acquisition by Sample Ventures Pty Ltd of the business assets of Example Holdings Pty Ltd."),
      text("\n\nTERM OF OBLIGATIONS\n\n"),
      field("term", "Term of confidentiality obligations", "3 years from the date of this agreement, and indefinitely in respect of any information constituting a trade secret."),
      text("\n\n[Full agreement to be drafted -- see instructions]"),
    ],
  },
  {
    key: "cagr.nda_one_way",
    name: "Confidentiality Agreement (One Way)",
    description: "One-way NDA where only one party is disclosing.",
    category: "Commercial",
    subcategory: "Confidentiality",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a one-way confidentiality agreement protecting the disclosing party. Same structure as a mutual NDA but drafted from the discloser's perspective: broader definition of confidential information, tighter permitted purpose, express acknowledgment that no representation or warranty is given as to accuracy or completeness of the information disclosed, no obligation to proceed, and a clear statement that no licence or right in the information passes. Where acting for the RECIPIENT, note in the covering advice which terms should be pushed back on -- particularly an unlimited term, a residuals clause, or an obligation extending to information the recipient already held.",
  },

  // ── Services and consultancy ────────────────────────────────────
  {
    key: "cagr.consultancy_agreement",
    name: "Consultancy Agreement",
    description: "Engagement of a consultant, with IP, confidentiality and contractor-status protections.",
    category: "Commercial",
    subcategory: "Services",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a consultancy agreement. Include: scope of services and deliverables (by reference to a schedule so the agreement need not be redrafted for each engagement); fees, expenses and invoicing; term and termination, including for convenience on notice and immediately for breach or insolvency; intellectual property, assigning IP created in performing the services to the principal with a licence back for the consultant's general know-how; confidentiality; the consultant's status as an independent contractor and not an employee, with an indemnity for tax and superannuation if the characterisation is challenged; insurance requirements; restraint where appropriate; and liability caps. Flag in the drafting that a contractor clause does not determine the true characterisation -- the substance of the relationship governs, and superannuation may be payable to an individual contracting principally for their labour regardless of what the agreement says.",
  },
  {
    key: "cagr.independent_contractor_agreement",
    name: "Independent Contractor Agreement",
    description: "Contractor engagement with sham-contracting and superannuation risk addressed.",
    category: "Commercial",
    subcategory: "Services",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft an independent contractor agreement. Cover services, fees, term, IP assignment, confidentiality, insurance and termination. Critically, address the characterisation risk directly in the drafting notes: label alone does not determine status; the multi-factor test looks at control, ability to delegate, provision of tools, commercial risk and integration into the business; sham contracting attracts penalties; and superannuation may be payable where the contract is principally for the person's labour, even for a genuine contractor. Where the contractor operates through a company, note that this reduces but does not eliminate the risk.",
  },
  {
    key: "cagr.terms_of_trade",
    name: "Terms and Conditions of Trade (Sale of Goods and Services)",
    description: "Standard trading terms including retention of title and PPSR protection.",
    category: "Commercial",
    subcategory: "Trading Terms",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft terms and conditions of trade for a supplier. Include: application of the terms and how they are incorporated (this is where most terms fail -- they must be brought to the customer's attention before the contract is formed, not printed on the back of the invoice); price and GST; payment terms, interest on overdue amounts and recovery costs; delivery and risk; RETENTION OF TITLE, drafted so it is registrable as a purchase money security interest on the PPSR, together with a charging clause and consent to registration; warranties and the limits on excluding them given the Australian Consumer Law consumer guarantees cannot be contracted out of; limitation of liability; personal guarantee from directors where the customer is a company; and termination. Emphasise that retention of title is worthless unless registered on the PPSR within the statutory window.",
  },

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
  {
    key: "cagr.share_sale_agreement",
    name: "Share Sale Agreement",
    description: "Sale of shares in a company, with warranties, conditions and completion mechanics.",
    category: "Commercial",
    subcategory: "Business Sale",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a share sale agreement. Include: parties and the shares being sold; purchase price and any adjustment mechanism (completion accounts or locked box); conditions precedent (regulatory approvals, third party consents, change of control consents under material contracts and leases); conduct of the business between signing and completion; completion mechanics and deliverables (share transfers, resignations, minute books, ASIC forms, releases of guarantees); warranties from the seller as to title, capacity, accounts, tax, litigation, employees, IP and compliance; disclosure against warranties and the disclosure letter; limitations on warranty claims (time limits, de minimis, cap); tax indemnity; restraint; and confidentiality. Note in the drafting that a share sale transfers liabilities with the company, unlike an asset sale, so buyer-side due diligence and warranty protection matter far more.",
    requiresReview: true,
    reviewNote:
      "Duty on a transfer of shares differs by state and by whether the company is land-rich. Confirm the duty position and any landholder duty exposure before completion.",
  },
  {
    key: "cagr.asset_sale_agreement",
    name: "Asset Sale Agreement",
    description: "Sale of business assets rather than shares, with employee and contract transfer provisions.",
    category: "Commercial",
    subcategory: "Business Sale",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft an asset sale agreement. Include: identification of the assets sold and, importantly, the assets and liabilities EXCLUDED; apportionment of the price across goodwill, plant and equipment, and stock; GST and the going concern exemption with its conditions expressly recorded as required; conditions precedent including landlord consent to lease assignment and any licence transfer; treatment of employees (whether the buyer offers employment, and how accrued entitlements are adjusted); assignment or novation of contracts; PPSR releases; warranties; restraint; and completion deliverables. Note that unlike a share sale, historical liabilities generally stay with the seller, which is why sellers usually prefer share sales and buyers usually prefer asset sales.",
  },
  {
    key: "cagr.restraint_of_trade_deed",
    name: "Restraint of Trade Deed",
    description: "Standalone restraint on a departing seller, shareholder or employee.",
    category: "Commercial",
    subcategory: "Restraints",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a restraint of trade deed. Include non-compete, non-solicitation of clients, non-solicitation of employees and non-interference with suppliers. Draft the restraint as CASCADING alternatives for both period and geographic area, so that if the widest is held unreasonable a narrower one survives severance. Identify the legitimate business interest being protected -- goodwill purchased, confidential information, client connection -- because a restraint that protects nothing legitimate is unenforceable regardless of how it is drafted. Include acknowledgment of reasonableness and consideration. Note that a restraint on a seller of a business is enforced far more readily than one on an employee.",
  },

  // ── Corporate structures ────────────────────────────────────────
  {
    key: "cagr.shareholders_agreement_drafting",
    name: "Shareholders Agreement",
    description: "Full shareholders agreement governing control, transfers, deadlock and exit.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a shareholders agreement. Include: share capital and classes; board composition and appointment rights; reserved matters requiring special or unanimous consent; funding obligations and the consequences of failing to contribute (dilution or loan); dividend policy; pre-emptive rights on transfer; tag-along and drag-along; compulsory transfer on death, incapacity, bankruptcy or cessation of employment; valuation mechanism; deadlock resolution culminating in a buy-sell mechanism; restraints; confidentiality; and the relationship with the constitution, including that the agreement prevails between the shareholders and that the constitution should be amended to be consistent. Note in the drafting that the valuation mechanism and the compulsory transfer triggers are the clauses that matter most and are most often left vague.",
  },
  {
    key: "cagr.unit_trust_deed",
    name: "Unit Trust Deed",
    description: "Establishes a unit trust with fixed proportionate entitlements.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a unit trust deed. Include: the trustee and its powers; issue, transfer and redemption of units; the unitholders' fixed proportionate entitlement to income and capital, which is what distinguishes a unit trust from a discretionary trust; distributions and the requirement to resolve before year end; unitholder meetings and voting; the vesting date; amendment powers and their limits; and retirement and replacement of the trustee. Note that fixed entitlements are what allow a unit trust to be used where investors want certainty, and that the deed should be reviewed against the tests for a fixed trust if losses or franking credits are to flow through.",
    requiresReview: true,
    reviewNote:
      "Trust deed stamping requirements and timeframes differ by state, and some impose no duty. Confirm the requirement for the state of establishment, and whether the deed satisfies the fixed trust tests if that matters for the client's tax position.",
  },
  {
    key: "cagr.unitholders_agreement",
    name: "Unitholders Agreement",
    description: "Governs the relationship between unitholders, alongside the trust deed.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a unitholders agreement. Cover the same ground as a shareholders agreement but adapted to a trust: control of the trustee company and its board, reserved matters, pre-emptive rights on unit transfers, tag and drag, compulsory transfer events, valuation, distribution policy, funding, deadlock, and restraints. Note the interaction with the trust deed and that where they conflict the deed generally governs the trustee's powers while the agreement governs the unitholders as between themselves.",
  },
  {
    key: "cagr.partnership_agreement",
    name: "Partnership Agreement",
    description: "Governs a partnership, displacing the default statutory position.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a partnership agreement. Include: capital contributions; profit and loss sharing; management, decision-making and which decisions need unanimity; drawings; admission of new partners; retirement, expulsion and death, and what happens to the outgoing partner's interest; valuation; restraints; dissolution and winding up; and dispute resolution. Emphasise in the drafting that partners are JOINTLY AND SEVERALLY LIABLE for partnership debts -- each partner is exposed to the whole of the liability, which is the single most important thing a client entering a partnership should understand and the main reason many should incorporate instead.",
    requiresReview: true,
    reviewNote:
      "Partnership is governed by each state's Partnership Act, which supplies default terms where the agreement is silent. Confirm the applicable Act and that the agreement displaces the defaults the parties do not want.",
  },
  {
    key: "cagr.joint_venture_agreement",
    name: "Joint Venture Agreement (Incorporated or Unincorporated)",
    description: "Governs a joint venture, with the structural choice addressed.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a joint venture agreement. First address the structural choice: an INCORPORATED JV (a company owned by the participants, giving limited liability and a clean exit mechanism) or an UNINCORPORATED JV (a contractual arrangement where participants hold assets in defined shares and take their own share of output, often preferred for tax reasons but leaving participants exposed unless liability is carefully limited). Then include: contributions; scope and purpose, tightly defined; management and decision-making; funding and default; distribution of output or profit; IP ownership and licensing; default and exit; deadlock; restraints; and termination and winding up. Warn against drafting an unincorporated JV in terms that make it a partnership, which imports joint and several liability.",
  },
  {
    key: "cagr.buy_sell_agreement",
    name: "Buy-Sell Agreement (Business Succession)",
    description: "Provides for compulsory transfer of an owner's interest on death or disablement, usually insurance-funded.",
    category: "Commercial",
    subcategory: "Structuring",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a buy-sell agreement for business succession. Include: the trigger events (death, total and permanent disablement, trauma, and sometimes retirement); the obligation to transfer and to acquire; the valuation mechanism; how the purchase is funded, usually by insurance, and who owns the policies (self-ownership, cross-ownership or trust ownership) since that drives the tax outcome; what happens if the insurance proceeds are insufficient; and the interaction with the shareholders or unitholders agreement so the two do not conflict. Note the tax consequences differ markedly depending on the ownership structure of the policies, and the client should obtain specific tax advice on that choice.",
    requiresReview: true,
    reviewNote:
      "The capital gains and insurance tax consequences turn on the policy ownership structure chosen. Confirm the client has obtained tax advice on that choice before settling the agreement.",
  },

  // ── Intellectual property and technology ────────────────────────
  {
    key: "cagr.ip_licence_agreement",
    name: "Intellectual Property Licence Agreement",
    description: "Licenses IP, with scope, exclusivity, royalties and quality control.",
    category: "Commercial",
    subcategory: "Intellectual Property",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft an IP licence agreement. Include: identification of the licensed IP; scope -- exclusive, sole or non-exclusive, the territory, the field of use, and whether sublicensing is permitted; term and renewal; royalties, minimum royalties, reporting and audit rights; quality control obligations (essential for a trade mark licence, since a licensor who does not control quality risks the mark becoming vulnerable); improvements and who owns them; infringement -- who may sue and who bears the cost; warranties as to ownership and non-infringement; indemnities; and termination and what happens to stock and sublicences on termination.",
  },
  {
    key: "cagr.trademark_assignment",
    name: "Trade Mark Assignment",
    description: "Assigns a registered or unregistered trade mark, with or without goodwill.",
    category: "Commercial",
    subcategory: "Intellectual Property",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a trade mark assignment. Include: identification of the marks by registration number and class, or a description if unregistered; whether the assignment is WITH or WITHOUT goodwill, which matters because an assignment without goodwill can leave the mark vulnerable; assignment of the right to sue for past infringements; warranties as to ownership and that the mark is not subject to encumbrance; obligation to execute the documents needed to record the assignment with IP Australia; and further assurance. Note that the assignment should be recorded with IP Australia, and that an unrecorded assignment can create difficulties for the assignee in enforcement.",
  },
  {
    key: "cagr.copyright_assignment",
    name: "Copyright Assignment",
    description: "Assigns copyright, addressing moral rights and future works.",
    category: "Commercial",
    subcategory: "Intellectual Property",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a copyright assignment. Include: identification of the works; assignment of all copyright including the right to sue for past infringement; assignment of copyright in FUTURE works where relevant, which requires express words; MORAL RIGHTS, which cannot be assigned in Australia -- the correct approach is a written consent to specified acts or omissions that would otherwise infringe them; warranties as to ownership and originality; and further assurance. Flag that moral rights consent is frequently overlooked and is the reason many assignments do not achieve what the client assumes.",
  },
  {
    key: "cagr.software_development_agreement",
    name: "Software Development Agreement",
    description: "Commissioned software development, with IP, acceptance and support addressed.",
    category: "Commercial",
    subcategory: "Technology",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a software development agreement. Include: scope and specification by reference to a schedule; development methodology and milestones; acceptance testing and the consequences of failure to accept, with a clear mechanism rather than an open-ended right to reject; fees and payment against milestones; IP ownership -- who owns the developed software, and the treatment of the developer's pre-existing tools and libraries, which should be licensed rather than assigned; third party and open source components and the licence obligations they carry; warranties and defect rectification; support and maintenance, or an agreement to enter one; source code escrow where the client depends on the software; confidentiality; data and privacy obligations; liability caps; and termination with transition assistance.",
  },
  {
    key: "cagr.website_terms_privacy",
    name: "Website Terms of Use and Privacy Policy",
    description: "Terms of use and a privacy policy for a business website or online service.",
    category: "Commercial",
    subcategory: "Technology",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft website terms of use and a privacy policy. Terms of use: acceptance and how the terms bind users, permitted use, IP ownership of site content, user-generated content and the licence granted to the operator, disclaimers and the limits on them given the Australian Consumer Law, liability limitation, third party links, and termination. Privacy policy: what personal information is collected and how, purposes of collection, disclosure including any overseas disclosure and to which countries, direct marketing and opt-out, cookies and analytics, data security, how an individual may access and correct their information, and how to complain including the ability to escalate to the OAIC. Note that the Privacy Act applies to entities above the turnover threshold and to certain others regardless of turnover, and that consumer guarantees under the ACL cannot be excluded.",
    requiresReview: true,
    reviewNote:
      "Privacy Act obligations depend on turnover and on the nature of the entity and information handled, and the Act has been under review with amendments in train. Confirm whether the client is an APP entity and the current obligations before finalising.",
  },
  {
    key: "cagr.distribution_agreement",
    name: "Distribution Agreement",
    description: "Appoints a distributor, with territory, exclusivity and competition compliance.",
    category: "Commercial",
    subcategory: "Distribution",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a distribution agreement. Include: appointment and whether exclusive, sole or non-exclusive; territory and any field of use; minimum purchase or performance obligations and the consequence of failure; ordering, pricing and payment; title and risk; trade mark licence for the purpose of distribution; marketing obligations and any contribution; warranties and product liability allocation, including recall; term, renewal and termination; and post-termination stock and customer transition. Flag the competition law issues: resale price maintenance is prohibited outright, and exclusive dealing and territorial restrictions can raise issues under the Competition and Consumer Act. A distributor agreement that fixes the distributor's resale price is unlawful regardless of how it is worded.",
    requiresReview: true,
    reviewNote:
      "Resale price maintenance is prohibited under the Competition and Consumer Act 2010 (Cth) and exclusive dealing provisions may require notification. Have the competition law position reviewed before the agreement is executed.",
  },
  {
    key: "cagr.franchise_agreement",
    name: "Franchise Agreement",
    description: "Franchise grant, subject to the Franchising Code of Conduct.",
    category: "Commercial",
    subcategory: "Franchise",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a franchise agreement. Include: grant, territory and exclusivity; term and renewal rights; fees, including initial fee, ongoing royalties and marketing fund contributions with an obligation to account for the fund; system and operations manual compliance; training and support; IP licence; supply arrangements; premises and lease or licence to occupy; performance standards; transfer and the franchisor's consent rights; termination and post-termination obligations including restraint and de-identification; and dispute resolution. Critically, flag the Franchising Code of Conduct obligations: the disclosure document, the key facts sheet, the mandatory cooling-off period after signing, the requirement to give documents a prescribed period before signing, and the restrictions on what a franchisor may require. Non-compliance with the Code carries penalties.",
    requiresReview: true,
    reviewNote:
      "The Franchising Code of Conduct prescribes disclosure documents, timing and cooling-off, and has been amended. Confirm the current Code requirements -- non-compliance carries civil penalties and can render terms unenforceable.",
  },

  // ── Settlement and debt documents ───────────────────────────────
  {
    key: "cagr.deed_of_settlement_release",
    name: "Deed of Settlement and Release",
    description: "Settles a dispute and releases claims, with the scope of release defined carefully.",
    category: "Commercial",
    subcategory: "Dispute Resolution",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a deed of settlement and release. Include: recitals identifying the dispute; the settlement sum and payment terms, including what happens on default; the release, drafted with care as to whether it is mutual, whether it covers unknown claims, and whether it extends to related entities, officers and employees; a bar to further proceedings; no admission of liability; confidentiality and non-disparagement; costs; and execution as a deed so consideration is not an issue. Note that the scope of the release is where these deeds are litigated -- a release that is too narrow leaves the dispute alive, and one that is too broad may be resisted.",
    segments: [
      text("DEED OF SETTLEMENT AND RELEASE\n\nParties: "),
      field("parties", "Parties", "ABC Supplies Pty Ltd (ACN 000 000 000) and XYZ Builders Pty Ltd (ACN 111 111 111)"),
      text("\nDate: "),
      field("date", "Date", "20 September 2026"),
      text("\n\nBACKGROUND\n\n"),
      field("background", "Background / recitals", "A. The parties entered a supply agreement dated 1 March 2026.\nB. A dispute arose concerning invoices totalling $18,450 and the conformity of goods delivered on 26 April 2026.\nC. Proceedings were commenced in the District Court of New South Wales, No 2026/00123456.\nD. The parties have agreed to settle on the terms below."),
      text("\n\nSETTLEMENT SUM\n\n"),
      field("settlement_terms", "Settlement sum and payment", "XYZ Builders Pty Ltd will pay ABC Supplies Pty Ltd $12,000 within 14 days of the date of this deed. If payment is not made by that date, the full sum of $18,450 becomes immediately payable and ABC may enter judgment for that amount."),
      text("\n\nRELEASE\n\n"),
      field("release_scope", "Scope of the release", "Each party releases the other, and each of their related bodies corporate, officers and employees, from all claims arising out of or in connection with the supply agreement and the proceedings, whether known or unknown, up to the date of this deed."),
      text("\n\nPROCEEDINGS\n\n"),
      field("proceedings", "What happens to the proceedings", "Upon payment, the parties will file consent orders dismissing the proceedings with no order as to costs."),
      text("\n\nNO ADMISSION\n\nThis deed is entered into in compromise. Nothing in it is an admission of liability by any party.\n\nCONFIDENTIALITY\n\n"),
      field("confidentiality", "Confidentiality", "The terms of this deed are confidential and must not be disclosed except as required by law, to professional advisers, or to a party's insurer or financier."),
      text("\n\nCOSTS\n\n"),
      field("costs", "Costs", "Each party bears its own costs of the dispute and of this deed."),
    ],
  },
  {
    key: "cagr.deed_of_acknowledgement_of_debt",
    name: "Deed of Acknowledgement of Debt",
    description: "Records an admitted debt and a repayment arrangement, with default consequences.",
    category: "Commercial",
    subcategory: "Debt Recovery",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    aiInstructions:
      "Draft a deed of acknowledgement of debt. Include: acknowledgment of the debt and that it is due and payable; the repayment schedule; interest; what constitutes default and the consequence, being that the whole balance becomes immediately due and judgment may be entered; any security or guarantee given; and execution as a deed. Note that an acknowledgment can restart a limitation period, which is often the practical reason for obtaining one.",
    segments: [
      text("DEED OF ACKNOWLEDGEMENT OF DEBT\n\nCreditor: "),
      field("creditor", "Creditor", "ABC Supplies Pty Ltd (ACN 000 000 000)"),
      text("\nDebtor: "),
      field("debtor", "Debtor", "XYZ Builders Pty Ltd (ACN 111 111 111)"),
      text("\nDate: "),
      field("date", "Date", "20 September 2026"),
      text("\n\nACKNOWLEDGMENT\n\nThe Debtor acknowledges that it owes the Creditor "),
      field("amount", "Amount owed", "$18,450.00"),
      text(" (Debt), that the Debt is due and payable, and that it has no set-off, counterclaim or defence to it.\n\nREPAYMENT\n\n"),
      field("repayment", "Repayment schedule", "The Debtor will pay the Debt by six equal monthly instalments of $3,075.00, commencing 1 October 2026 and payable on the first day of each month thereafter."),
      text("\n\nINTEREST\n\n"),
      field("interest", "Interest", "Interest is suspended while the Debtor complies strictly with the repayment schedule. On default, interest accrues at 10% per annum from the date of this deed."),
      text("\n\nDEFAULT\n\nIf any instalment is not paid in full by its due date, the entire outstanding balance becomes immediately due and payable, and the Creditor may commence proceedings or enter judgment for that balance without further notice.\n\n"),
      field("security", "Security or guarantee (or 'Nil')", "The Debtor's directors, John Builder and Mary Builder, guarantee performance of this deed. Their guarantee is set out in the schedule."),
    ],
    requiresReview: true,
    reviewNote:
      "An acknowledgment of debt can restart the limitation period. Confirm the limitation position before advising either party, and if acting for the debtor, advise on that consequence.",
  },

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
