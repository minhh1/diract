// lib/precedents/library/agreementsBatch6.ts
// Full commercial agreements, continuing agreementsBatch1.ts -- 5.ts: an
// intellectual property licence agreement, a software development agreement,
// and website terms of use and a privacy policy.
//
// A licence isn't an assignment -- nothing changes hands permanently, which
// is exactly why the IP licence agreement has to do more ongoing work than
// deedsBatch4.ts's two assignments. Quality control is the clause that gets
// the most attention there, and for a reason specific to trade marks: a
// licensor who lets a licensee use its mark without actually controlling the
// quality of what it's used on risks the mark becoming deceptive (the public
// trusts the mark to mean a consistent standard, and if the licensor isn't
// policing that, the mark no longer reliably means anything) -- which is a
// real ground to have the mark removed or found invalid, not just a
// commercial nicety.
//
// Website Terms of Use and Privacy Policy doesn't fit this file's usual
// two-party shape at all, and isn't drafted to. Nobody signs published
// website terms -- a visitor accepts them by using the site, not by
// executing a deed -- so this document has no Parties section, no
// recitals and no execution page; it's a cover page naming the Operator,
// straight into two parts. It's also the one document in the library
// written in the second person ("you"), because that's how every website
// terms and privacy policy actually reads in practice, and drafting it in
// the library's usual third-person "the party" register would read as
// obviously wrong to anyone who has ever clicked "I agree" on one.
import { field, type PrecedentSeed } from "./types";
import { L } from "./instrumentParts";
import { opening, interpretation, generalProvisions, execution, confidentialInformationExceptions } from "./agreementParts";
import { DEED_PAGE_BREAK, deedCover } from "@/lib/precedents/deedDocx";

const COMMERCIAL = ["Commercial"];

export const AGREEMENTS_BATCH_6: PrecedentSeed[] = [
  {
    key: "agr.ip_licence_agreement",
    name: "Intellectual Property Licence Agreement",
    description:
      "Licenses IP in full: exclusive/sole/non-exclusive scope, territory and field of use, royalties with reporting and audit rights, quality control (essential for a trade mark licence), improvements, infringement conduct, and what happens to stock and sublicences on termination.",
    category: "Commercial",
    subcategory: "Intellectual Property",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "If the Licensed IP includes a trade mark, clause 6 (quality control) is not optional -- a trade mark licence granted without the licensor actually policing the quality of what the licensee sells under it is a real ground for the mark to be found deceptive or for a third party to apply to remove it for non-distinctiveness. Confirm the exclusivity level in clause 3 matches what was actually negotiated: exclusive (not even the Licensor may use the IP), sole (Licensor may use it but grants no other licence) and non-exclusive are three different bargains with three different prices. Check the royalty and minimum royalty figures against a realistic sales forecast before they're locked in -- a minimum royalty set too high is a common reason a licensee simply stops paying rather than terminating properly.",
    aiInstructions:
      "Draft an IP licence agreement. Identify the Licensed IP precisely by reference to a schedule (registration numbers where registered, and a description of anything unregistered, such as know-how). Draft the grant clause to state clearly whether it is exclusive, sole or non-exclusive, the Territory, the Field of Use, and whether sublicensing is permitted and on what conditions -- these are the terms that actually define the bargain and shouldn't be left implicit. Build royalties with a reporting obligation (the Licensee must report sales each period, not just pay) and an audit right, because a royalty clause with no way to verify what's been reported is unenforceable in practice even if it's enforceable on paper. If the Licensed IP includes a trade mark, make quality control a real, checkable obligation -- specifications or standards the Licensor sets, a right to inspect, and a right to require non-conforming use to stop -- not a bare recital that quality will be maintained. Deal with improvements (who owns them, usually the party that creates them, with a licence back), infringement (who has the first right to sue a third party, and how costs and any recovery are shared), warranties and indemnities, and what happens to the Licensee's stock and any sublicences on termination.",
    segments: [
      ...opening(
        "INTELLECTUAL PROPERTY LICENCE AGREEMENT",
        {
          key: "licensor",
          label: "Licensor",
          example: "ACME Trading Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email licensing@acmetrading.com.au",
          shortExample: "the Licensor",
        },
        {
          key: "licensee",
          label: "Licensee",
          example: "Brightside Manufacturing Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email admin@brightsidemanufacturing.com.au",
          shortExample: "the Licensee",
        },
        [
          ...L("DeedRecital", [
            "The Licensor owns the intellectual property described in Schedule 1 (the Licensed IP), and has agreed to licence it to the Licensee on the terms of this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", ["Field of Use means ", field("field_of_use", "Field of use the licence is limited to", "the manufacture and sale of outdoor furniture"), "."]),
      ...L("DeedList-Level3", ["Improvement means any improvement, modification or enhancement to the Licensed IP created during the term of this agreement."]),
      ...L("DeedList-Level3", ["Licensed IP has the meaning given in Recital A."]),
      ...L("DeedList-Level3", ["Licensed Products means products or services made, provided or sold using or under the Licensed IP within the Field of Use."]),
      ...L("DeedList-Level3", ["Net Sales means the gross amount invoiced for Licensed Products, less GST, returns and standard trade discounts actually given."]),
      ...L("DeedList-Level3", ["Royalty Period means each ", field("royalty_period", "Royalty reporting/payment period", "calendar quarter"), "."]),
      ...L("DeedList-Level3", ["Territory means ", field("territory", "Licensed territory", "Australia and New Zealand"), "."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Grant of licence"]),
      ...L("DeedList-Level2-Normal", [
        "The Licensor grants the Licensee a ",
        field("exclusivity", "Exclusive, sole or non-exclusive", "exclusive"),
        " licence to use the Licensed IP within the Territory and the Field of Use, for the term of this agreement.",
      ]),
      ...L("DeedList-Level2-Normal", [
        field("sublicensing", "Whether sublicensing is permitted, and on what conditions", "The Licensee may not grant a sublicence without the Licensor's prior written consent, which must not be unreasonably withheld, and any sublicence must be on terms no less protective of the Licensor than this agreement"),
        ".",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Except as expressly granted under this clause 3, the Licensor reserves all rights in the Licensed IP, and nothing in this agreement transfers any ownership interest in it to the Licensee.",
      ]),

      ...L("DeedList-Level1-Bold", ["Term and renewal"]),
      ...L("DeedList-Level2-Normal", [
        "This agreement commences on ",
        field("commencement_date", "Commencement date", "1 September 2026"),
        " and continues for ",
        field("initial_term", "Initial term", "3 years"),
        ", and then automatically renews for successive periods of ",
        field("renewal_term", "Renewal term", "1 year"),
        " unless either party gives the other at least ",
        field("non_renewal_notice", "Notice period to prevent renewal", "3 months'"),
        " written notice before the end of the then current term that it will not renew.",
      ]),

      ...L("DeedList-Level1-Bold", ["Royalties"]),
      ...L("DeedList-Level2-Normal", [
        "The Licensee must pay the Licensor a royalty of ",
        field("royalty_rate", "Royalty rate", "6% of Net Sales"),
        " for each Royalty Period, subject to a minimum royalty of ",
        field("minimum_royalty", "Minimum royalty per period (or 'Nil')", "$5,000 per Royalty Period"),
        ", whichever is greater.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Within ",
        field("reporting_period", "Period after each Royalty Period to report and pay", "20 Business Days"),
        " after the end of each Royalty Period, the Licensee must give the Licensor a written report of Net Sales for that period, in enough detail to verify the royalty calculation, together with payment of the royalty due.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Licensee must keep accurate records sufficient to verify Net Sales and the royalty payable, and the Licensor may, on reasonable notice and not more than once in any 12 month period, audit those records at its own cost, except that the Licensee must pay the reasonable cost of the audit if it reveals an underpayment of more than 5% for the period audited.",
      ]),

      ...L(null, ["[Delete clause 6 if the Licensed IP does not include a trade mark or other IP requiring quality control.]"]),
      ...L("DeedList-Level1-Bold", ["Quality control"]),
      ...L("DeedList-Level2-Normal", [
        "The Licensee must ensure that Licensed Products meet the specifications and standards the Licensor notifies from time to time, and must not use the Licensed IP on or in connection with anything that does not meet them.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Licensor may, on reasonable notice, inspect the Licensee's premises and Licensed Products to verify compliance with clause 6.1, and the Licensee must give the Licensor the assistance it reasonably requires to do so.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Licensor reasonably considers a Licensed Product does not meet the required specifications or standards, the Licensee must immediately stop using the Licensed IP in connection with it until the non-conformity is remedied to the Licensor's reasonable satisfaction.",
      ]),

      ...L("DeedList-Level1-Bold", ["Improvements"]),
      ...L("DeedList-Level2-Normal", [
        "Each party owns any Improvement it creates. The creating party grants the other a non-exclusive, royalty-free licence to use that Improvement on the same terms as the Licensed IP, for the remainder of the term.",
      ]),

      ...L("DeedList-Level1-Bold", ["Infringement"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must promptly notify the other if it becomes aware of any actual or suspected infringement of the Licensed IP by a third party, or any claim that the Licensed IP infringes a third party's rights.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Licensor has the first right to bring proceedings against a third party infringer, at its own cost and for its own benefit. If the Licensor does not do so within ",
        field("infringement_notice_period", "Period for the Licensor to act before the Licensee may", "60 Business Days"),
        " of becoming aware of the infringement, the Licensee may bring proceedings itself, at its own cost, and any damages or account of profits recovered are shared between the parties in proportion to the loss each has suffered.",
      ]),

      ...L("DeedList-Level1-Bold", ["Warranties and indemnity"]),
      ...L("DeedList-Level2-Normal", [
        "The Licensor warrants that it owns, or has the right to licence, the Licensed IP, and that, so far as it is aware, the Licensed IP does not infringe the rights of any third party.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Licensor indemnifies the Licensee against any loss the Licensee suffers arising from a breach of the warranty in clause 9.1, and the Licensee indemnifies the Licensor against any loss the Licensor suffers arising from the Licensee's use of the Licensed IP otherwise than as permitted by this agreement.",
      ]),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must keep confidential, and not disclose except to its professional advisers or as required by law, the terms of this agreement and any Confidential Information of the other party, being information disclosed in connection with this agreement that is not public other than through a breach of this clause, but does not include information that:",
      ]),
      ...confidentialInformationExceptions(),

      ...L("DeedList-Level1-Bold", ["Termination"]),
      ...L("DeedList-Level2-Normal", ["Either party may terminate this agreement immediately by written notice if the other party:"]),
      ...L("DeedList-Level3", ["commits a material breach of this agreement that is not remedied within 20 Business Days of written notice requiring it to be remedied; or"]),
      ...L("DeedList-Level3", ["becomes insolvent, has a controller or administrator appointed, or enters into any arrangement with its creditors."]),
      ...L("DeedList-Level2-Normal", [
        "On termination or expiry, the licence granted under clause 3 ends, and the Licensee must, within ",
        field("wind_down_period", "Period to stop using the Licensed IP and dispose of stock after termination", "60 Business Days"),
        ", stop using the Licensed IP, and may sell existing stock of Licensed Products already made, after which it must stop selling them too. Every sublicence granted under clause 3.2 also ends, unless the Licensor agrees in writing to assume it directly.",
      ]),

      ...L("DeedList-Level1-Bold", ["Liability"]),
      ...L("DeedList-Level2-Normal", [
        "To the maximum extent permitted by law, neither party is liable to the other for any indirect or consequential loss arising out of or in connection with this agreement.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Clause 12.1 does not limit either party's liability under the indemnity in clause 9.2, for a breach of clause 10 (confidentiality), or for a liability that cannot be excluded or limited by law.",
      ]),

      ...generalProvisions(),
      ...execution("Licensor", "Licensee"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Licensed IP"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("licensed_ip_schedule", "Description of the Licensed IP", "Australian Trade Mark Registration No. 1234567, word mark \"ACME\", class 20 (furniture); together with the design specifications and manufacturing know-how described in the attached technical schedule."),
      ]),
    ],
  },

  // ── Software development agreement ──────────────────────────────
  {
    key: "agr.software_development_agreement",
    name: "Software Development Agreement",
    description:
      "Commissioned software development in full: scope by specification, milestone-based acceptance testing with a real mechanism rather than an open-ended right to reject, IP that assigns what's built but licenses the developer's own pre-existing tools, and liability caps aligned with the fees.",
    category: "Commercial",
    subcategory: "Technology",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "Fill in Schedule 1 with the actual specification and milestones before sending -- a specification described only as 'a website' or 'an app' gives no basis to say a Milestone was or wasn't met. Confirm the IP position in clause 6 matches what the Client actually needs: assigning the Developer's Pre-Existing Materials outright (rather than licensing them) can leave the Developer unable to reuse its own general-purpose tools and libraries on its next project, which is usually not what either side intends and is a common point of pushback. Check clause 7's open source position against what the Developer is actually using -- a copyleft licence (such as the GPL) can impose obligations on the Client's whole product if incorporated without the right boundaries, and that needs to be flagged specifically rather than left to a general warranty. If the Client's business depends on the software continuing to run if the Developer fails, consider whether clause 10 (source code escrow) should be included.",
    aiInstructions:
      "Draft a software development agreement between a Client and a Developer. Anchor scope in a Specification held in Schedule 1, and structure delivery around Milestones with dates and payment tied to each, rather than one lump description and one lump sum. Build acceptance testing as a real mechanism -- the Client tests against defined Acceptance Tests within a stated period, must give specific written reasons for any rejection, and the Developer gets a defined period to remedy and resubmit, with Milestone Deliverables deemed accepted if the Client doesn't respond in time. On IP, assign to the Client what's actually built for it, but licence rather than assign the Developer's Pre-Existing Materials (its own general-purpose tools, frameworks and libraries) -- an outright assignment of those is usually neither intended nor workable, since the Developer needs to keep using them elsewhere. Flag third party and open source components as their own clause, because the licence terms attaching to them (particularly copyleft licences) can impose obligations on the Client's finished product that a generic IP warranty won't catch. Include warranties with a defect-rectification period, support and maintenance terms (or an obligation to enter a separate agreement for them), confidentiality, data and privacy obligations if the software processes personal information, liability caps proportionate to the fees, and termination with transition assistance so the Client isn't left stranded mid-project.",
    segments: [
      ...opening(
        "SOFTWARE DEVELOPMENT AGREEMENT",
        {
          key: "client",
          label: "Client",
          example: "ACME Trading Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000, email projects@acmetrading.com.au",
          shortExample: "the Client",
        },
        {
          key: "developer",
          label: "Developer",
          example: "Brightside Software Pty Ltd ACN 111 111 111 of 8 Phillip Street, Parramatta NSW 2150, email hello@brightsidesoftware.com.au",
          shortExample: "the Developer",
        },
        [
          ...L("DeedRecital", [
            "The Client wishes to engage the Developer to design and develop the software described in Schedule 1 (the Software), and the Developer has agreed to do so on the terms of this agreement.",
          ]),
        ]
      ),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this agreement:"]),
      ...L("DeedList-Level3", ["Acceptance Tests means the tests described in Schedule 1 for determining whether a Milestone Deliverable meets the Specification."]),
      ...L("DeedList-Level3", ["Business Day means a day other than a Saturday, Sunday or public holiday in the place whose law governs this agreement."]),
      ...L("DeedList-Level3", ["Deliverables means the Software and the Documentation."]),
      ...L("DeedList-Level3", ["Documentation means user and technical documentation for the Software the Developer provides under this agreement."]),
      ...L("DeedList-Level3", ["Milestone means each stage of development described in Schedule 1, and Milestone Deliverable means the Deliverable, or part of it, due at a Milestone."]),
      ...L("DeedList-Level3", ["Pre-Existing Materials means software, tools, libraries, frameworks and know-how that exist before this agreement or that the Developer creates independently of it, other than material created specifically to meet the Specification."]),
      ...L("DeedList-Level3", ["Specification means the functional and technical specification for the Software set out in Schedule 1, as varied under clause 3.2."]),

      ...interpretation(),

      ...L("DeedList-Level1-Bold", ["Development services"]),
      ...L("DeedList-Level2-Normal", [
        "The Developer must design and develop the Software in accordance with the Specification, and deliver it by Milestones, in accordance with Schedule 1.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Specification may only be varied by written agreement between the parties, including any consequent adjustment to the fees or the timetable in Schedule 1.",
      ]),

      ...L("DeedList-Level1-Bold", ["Acceptance testing"]),
      ...L("DeedList-Level2-Normal", [
        "Within ",
        field("acceptance_testing_period", "Period to test each Milestone Deliverable", "10 Business Days"),
        " of delivery of a Milestone Deliverable, the Client must test it against the Acceptance Tests and either accept it, or reject it by written notice setting out, in reasonable detail, the respects in which it fails the Acceptance Tests.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Client does not respond within the period in clause 4.1, the Milestone Deliverable is taken to be accepted.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If the Client validly rejects a Milestone Deliverable, the Developer must remedy the defects and redeliver it within ",
        field("remediation_period", "Period to remedy and redeliver a rejected Milestone Deliverable", "10 Business Days"),
        ", after which clause 4.1 applies again to the redelivered Milestone Deliverable.",
      ]),

      ...L("DeedList-Level1-Bold", ["Fees and payment"]),
      ...L("DeedList-Level2-Normal", [
        "The Client must pay the Developer the fees set out in Schedule 1 against each Milestone, on acceptance (or deemed acceptance) of the Milestone Deliverable for that Milestone.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "Unless Schedule 1 says otherwise, invoices are payable within ",
        field("payment_terms", "Payment terms", "14 days of the date of the invoice"),
        ". Amounts payable under this agreement are exclusive of GST, which the Client must pay in addition on receipt of a valid tax invoice.",
      ]),

      ...L("DeedList-Level1-Bold", ["Intellectual property"]),
      ...L("DeedList-Level2-Normal", [
        "On payment in full for the Deliverables to which they relate, the Developer assigns to the Client all intellectual property rights in the Deliverables created specifically to meet the Specification, other than Pre-Existing Materials.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "To the extent Pre-Existing Materials are incorporated in the Deliverables, the Developer grants the Client a non-exclusive, perpetual, royalty-free licence to use them as part of the Deliverables, for the Client's own business purposes.",
      ]),

      ...L("DeedList-Level1-Bold", ["Third party and open source components"]),
      ...L("DeedList-Level2-Normal", [
        "The Developer must give the Client a written list of every third party and open source component incorporated in the Software, with the licence terms applying to each, before the relevant Milestone Deliverable is accepted.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Developer must not incorporate an open source component under a licence that would require the Client's own proprietary code to be disclosed or licensed to third parties, without the Client's prior written consent.",
      ]),

      ...L("DeedList-Level1-Bold", ["Warranties and defect rectification"]),
      ...L("DeedList-Level2-Normal", [
        "The Developer warrants that, for ",
        field("warranty_period", "Defect warranty period after acceptance", "90 days"),
        " after acceptance of the relevant Milestone Deliverable, the Software will perform materially in accordance with the Specification, and that it will remedy, at its own cost, a material defect the Client notifies within that period.",
      ]),

      ...L(null, ["[Delete clause 9 if support and maintenance is covered by a separate agreement.]"]),
      ...L("DeedList-Level1-Bold", ["Support and maintenance"]),
      ...L("DeedList-Level2-Normal", [
        field("support_terms", "Support and maintenance terms", "For 12 months from final acceptance, the Developer will provide support and maintenance on the terms set out in Schedule 2, for the fee set out there"),
        ".",
      ]),

      ...L(null, ["[Delete clause 10 if source code escrow was not agreed.]"]),
      ...L("DeedList-Level1-Bold", ["Source code escrow"]),
      ...L("DeedList-Level2-Normal", [
        "The Developer must deposit the source code for the Software, and updates to it, with ",
        field("escrow_agent", "Escrow agent", "an independent escrow agent the parties agree"),
        ", to be released to the Client if the Developer becomes insolvent or materially breaches its support obligations under clause 9 and does not remedy that breach within a reasonable time.",
      ]),

      ...L("DeedList-Level1-Bold", ["Confidentiality"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must keep confidential, and not disclose except to its professional advisers, financiers or as required by law, the terms of this agreement and any Confidential Information of the other party, being information disclosed in connection with this agreement that is not public other than through a breach of this clause, but does not include information that:",
      ]),
      ...confidentialInformationExceptions(),

      ...L(null, ["[Delete clause 12 if the Software does not process personal information.]"]),
      ...L("DeedList-Level1-Bold", ["Data and privacy"]),
      ...L("DeedList-Level2-Normal", [
        "To the extent the Software collects, stores or processes personal information, the Developer must comply with the Privacy Act 1988 (Cth) and the Australian Privacy Principles in developing and testing it, and must not use any personal information provided by the Client for a purpose other than performing this agreement.",
      ]),

      ...L("DeedList-Level1-Bold", ["Liability"]),
      ...L("DeedList-Level2-Normal", [
        "To the maximum extent permitted by law, neither party is liable to the other for any indirect or consequential loss arising out of or in connection with this agreement.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "To the maximum extent permitted by law, each party's total liability arising out of or in connection with this agreement is limited to ",
        field("liability_cap", "Liability cap", "the total fees paid or payable under this agreement"),
        ", except for a breach of clause 11 (confidentiality) or a liability that cannot be excluded or limited by law.",
      ]),

      ...L("DeedList-Level1-Bold", ["Termination"]),
      ...L("DeedList-Level2-Normal", [
        "Either party may terminate this agreement immediately by written notice if the other party commits a material breach not remedied within 20 Business Days of written notice requiring it to be remedied, or becomes insolvent, has a controller or administrator appointed, or enters into any arrangement with its creditors.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "On termination, the Client must pay the Developer for accepted Milestone Deliverables and work properly performed towards the next Milestone, and the Developer must deliver up all work in progress, Documentation and materials the Client needs to continue development, whether itself or through another developer.",
      ]),

      ...generalProvisions(),
      ...execution("Client", "Developer"),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Specification, Milestones and Fees"]),
      ...L("DeedList-Level2-Bold", ["Specification"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("specification", "The Specification", "A customer-facing web application for online booking of appointments, as further described in the functional specification document dated 1 August 2026."),
      ]),
      ...L("DeedList-Level2-Bold", ["Milestones, Acceptance Tests and fees"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("milestones", "Milestones, Acceptance Tests and fees against each", "Milestone 1 (design and wireframes, due 4 weeks from commencement, fee $8,000, accepted on the Client's written sign-off of the wireframes); Milestone 2 (functional build, due 10 weeks from commencement, fee $20,000, accepted on successful completion of the test scripts in Annexure A); Milestone 3 (final delivery and go-live, due 12 weeks from commencement, fee $7,000, accepted on 5 consecutive days of stable production operation)."),
      ]),
    ],
  },

  // ── Website terms of use and privacy policy ─────────────────────
  {
    key: "agr.website_terms_privacy",
    name: "Website Terms of Use and Privacy Policy",
    description:
      "Full terms of use and privacy policy for a business website: acceptance, permitted use, IP and user-generated content, ACL-aware disclaimers, and a privacy policy covering collection, disclosure (including overseas), direct marketing, security, access/correction and the OAIC complaint path.",
    category: "Commercial",
    subcategory: "Technology",
    documentType: "deed",
    requiresReview: true,
    reviewNote:
      "Confirm whether the Operator is an APP entity before relying on Part B as drafted -- the Privacy Act 1988 (Cth) applies by reference to turnover (currently a $3 million annual threshold) and to certain entities regardless of turnover (health service providers, entities that trade in personal information, and others), and the Act has been under periodic reform, so check the current position rather than assuming either way. List the actual overseas countries data may be disclosed to in Part B clause 11 -- 'the countries where our service providers are located' is not sufficient disclosure under Australian Privacy Principle 8, and a generic placeholder left in this document is the kind of gap a privacy complaint targets first. Nothing in Part A can exclude a consumer guarantee under the Australian Consumer Law -- check clause 5 does not overreach into liability that cannot lawfully be excluded for a website that sells goods or services to consumers.",
    aiInstructions:
      "Draft website terms of use and a privacy policy for a business website, in the second person, addressed to the site's users -- this document is published, not signed, so it should read the way every real website terms page does, not like a bilateral contract between named parties. Terms of use: how the terms bind a user (acceptance by use of the site), permitted use, ownership of site content, the licence a user grants the Operator in anything they post or upload, disclaimers that stop short of excluding what the Australian Consumer Law does not allow to be excluded, a liability limitation, third party links, and suspension or termination of access. Privacy policy: precisely what personal information is collected and how (directly, via cookies, from third parties), the purposes of collection, disclosure -- including to which specific categories of recipient and, if applicable, to which named overseas countries, since a vague 'may disclose overseas' does not meet the Australian Privacy Principles -- direct marketing and how to opt out, cookies and analytics, data security measures, how an individual accesses or corrects their information, and the complaint path, ending in the ability to complain to the OAIC if unresolved. Do not draft anything requiring signature -- there is no execution page.",
    segments: [
      ...L(null, [deedCover({
        title: "WEBSITE TERMS OF USE AND PRIVACY POLICY",
        parties: ["[Operator: name, ACN/ABN and website domain]"],
      })]),
      ...L(null, [DEED_PAGE_BREAK]),
      ...L(null, [
        field("operator", "Operator: name, ACN/ABN and address", "ACME Trading Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000"),
        " (we, us or our) operates ",
        field("website", "Website domain", "www.acmetrading.com.au"),
        " (the Site).",
      ]),
      ...L(null, [""]),
      ...L(null, ["Effective date: ", field("effective_date", "Effective date", "12 August 2026")]),
      ...L(null, [""]),
      ...L(null, [
        "These terms of use, and our privacy policy below, apply to your access to and use of the Site. By using the Site, you agree to them. If you do not agree, you must not use the Site.",
      ]),
      ...L(null, [""]),
      ...L("DeedHeading", ["Part A -- Terms of Use"]),

      ...L("DeedList-Level1-Bold", ["Acceptance"]),
      ...L("DeedList-Level2-Normal", [
        "By accessing or using the Site, you agree to be bound by these terms of use. We may update these terms from time to time by publishing an updated version on the Site, and your continued use of the Site after an update takes effect means you accept the update.",
      ]),

      ...L("DeedList-Level1-Bold", ["Permitted use"]),
      ...L("DeedList-Level2-Normal", [
        "You may use the Site for its intended purpose, being ",
        field("permitted_use", "The Site's intended purpose", "browsing and purchasing our products"),
        ". You must not use the Site in a way that breaches any law, infringes anyone's rights, or interferes with the Site's operation or another user's use of it, including by introducing malicious code or attempting unauthorised access.",
      ]),

      ...L("DeedList-Level1-Bold", ["Intellectual property"]),
      ...L("DeedList-Level2-Normal", [
        "All content on the Site, including text, graphics, logos and software, is owned by us or our licensors and is protected by copyright, trade mark and other laws. Except as necessary to use the Site for its intended purpose, you must not copy, reproduce, modify or distribute any content from the Site without our prior written consent.",
      ]),

      ...L("DeedList-Level1-Bold", ["User-generated content"]),
      ...L("DeedList-Level2-Normal", [
        "If the Site allows you to post, upload or submit content (User Content), you grant us a non-exclusive, royalty-free, worldwide licence to use, reproduce and display that User Content for the purposes of operating and promoting the Site. You must not submit User Content that is unlawful, defamatory or infringes a third party's rights, and we may remove User Content at our discretion.",
      ]),

      ...L("DeedList-Level1-Bold", ["Disclaimers and liability"]),
      ...L("DeedList-Level2-Normal", [
        "The Site and its content are provided on an \"as is\" basis. To the maximum extent permitted by law, we exclude all warranties other than any consumer guarantee under the Australian Consumer Law that cannot lawfully be excluded.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "To the maximum extent permitted by law, and subject to any consumer guarantee that cannot be excluded, our liability to you arising out of or in connection with the Site is limited, at our election, to re-supplying the relevant goods or services or paying the cost of doing so, and we are not liable for any indirect or consequential loss.",
      ]),

      ...L("DeedList-Level1-Bold", ["Third party links"]),
      ...L("DeedList-Level2-Normal", [
        "The Site may contain links to third party websites. We do not endorse and are not responsible for the content or practices of any linked website.",
      ]),

      ...L("DeedList-Level1-Bold", ["Suspension and termination"]),
      ...L("DeedList-Level2-Normal", [
        "We may suspend or terminate your access to the Site, without notice, if we reasonably believe you have breached these terms.",
      ]),

      ...L(null, [""]),
      ...L(null, [DEED_PAGE_BREAK]),
      ...L("DeedHeading", ["Part B -- Privacy Policy"]),

      ...L("DeedList-Level1-Bold", ["Information we collect"]),
      ...L("DeedList-Level2-Normal", [
        "We collect personal information you provide to us, such as ",
        field("info_collected", "Categories of personal information collected", "your name, email address, postal address, phone number and payment details"),
        ", and information collected automatically through your use of the Site, such as your IP address, device information and browsing activity.",
      ]),

      ...L("DeedList-Level1-Bold", ["How we collect information"]),
      ...L("DeedList-Level2-Normal", [
        "We collect personal information directly from you when you use the Site, and may also collect it from ",
        field("third_party_sources", "Third party sources personal information may be collected from (or 'no third party sources')", "payment processors and analytics providers we engage"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["How we use information"]),
      ...L("DeedList-Level2-Normal", [
        "We use personal information to ",
        field("purposes_of_use", "Purposes personal information is used for", "provide and improve the Site, process orders and payments, respond to your enquiries, and, if you consent, send you marketing communications"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Disclosure"]),
      ...L("DeedList-Level2-Normal", [
        "We may disclose personal information to ",
        field("disclosure_recipients", "Categories of recipient personal information is disclosed to", "our payment processor, delivery providers, and IT service providers who help us operate the Site"),
        ", and to a government agency or other third party where required or authorised by law.",
      ]),
      ...L(null, ["[List the specific countries here -- 'the countries where our service providers are located' does not satisfy Australian Privacy Principle 8.]"]),
      ...L("DeedList-Level2-Normal", [
        field("overseas_disclosure", "Overseas disclosure: to which countries (or 'We do not disclose personal information overseas')", "We may disclose personal information to service providers located in the United States and Singapore"),
        ".",
      ]),

      ...L("DeedList-Level1-Bold", ["Direct marketing"]),
      ...L("DeedList-Level2-Normal", [
        "We may send you direct marketing communications with your consent, or as otherwise permitted by law. You may opt out at any time using the unsubscribe function in our communications, or by contacting us using the details in clause 17.",
      ]),

      ...L("DeedList-Level1-Bold", ["Cookies and analytics"]),
      ...L("DeedList-Level2-Normal", [
        "The Site uses cookies and similar technologies, including ",
        field("analytics_tools", "Analytics/cookie tools used", "Google Analytics"),
        ", to operate the Site and understand how it is used. You can control cookies through your browser settings, though this may affect how the Site functions.",
      ]),

      ...L("DeedList-Level1-Bold", ["Data security"]),
      ...L("DeedList-Level2-Normal", [
        "We take reasonable technical and organisational measures to protect the personal information we hold from misuse, interference, loss, and unauthorised access, modification or disclosure.",
      ]),

      ...L("DeedList-Level1-Bold", ["Access and correction"]),
      ...L("DeedList-Level2-Normal", [
        "You may request access to, or correction of, the personal information we hold about you by contacting us using the details in clause 17. We will respond within a reasonable time and may need to verify your identity first.",
      ]),

      ...L("DeedList-Level1-Bold", ["Complaints"]),
      ...L("DeedList-Level2-Normal", [
        "If you have a complaint about how we handle your personal information, contact us using the details in clause 17. If you are not satisfied with our response, you may complain to the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au.",
      ]),

      ...L("DeedList-Level1-Bold", ["Contact us"]),
      ...L("DeedList-Level2-Normal", [
        "You can contact us about these terms or this privacy policy at ",
        field("contact_details", "Contact details", "privacy@acmetrading.com.au"),
        ".",
      ]),

      ...L(null, [""]),
      ...L("DeedList-Level1-Bold", ["Governing law"]),
      ...L("DeedList-Level2-Normal", [
        "These terms are governed by the law of ",
        field("jurisdiction", "Governing law", "New South Wales"),
        ", and you submit to the non-exclusive jurisdiction of the courts of that place.",
      ]),
    ],
  },
];
