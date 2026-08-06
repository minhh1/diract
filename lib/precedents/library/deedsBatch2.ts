// lib/precedents/library/deedsBatch2.ts
// Full deeds, continuing deedsBatch1.ts: a standalone restraint of trade
// deed.
//
// A restraint deed is drafted CASCADING rather than as one fixed period and
// area, because that is what actually survives a reasonableness challenge --
// a court that finds five years unreasonable does not get to rewrite the
// clause down to something it would have accepted; if the clause only ever
// said five years, the whole restraint fails. Restraint Period and Restraint
// Area are each defined as a ladder of alternatives from widest to narrowest,
// and clause 3 (construction) reads each rung as a separate, standalone
// covenant, so a court can sever the ones it doesn't accept and enforce the
// widest one that survives. This is what a legitimate-interest restraint
// looks like when it's drafted to actually be enforced rather than just to
// look thorough on the page.
//
// Executed as a deed rather than an agreement because a restraint given on
// exit -- retirement, sale, cessation of employment -- often has no fresh
// consideration flowing to the restrained party at the moment they sign;
// a deed doesn't need one. Uses deedParts.ts's shared scaffolding, which is
// deedsBatch1.ts's own wording extracted for reuse rather than duplicated.
import { field, type PrecedentSeed } from "./types";
import { L } from "./instrumentParts";
import { opening, generalProvisions } from "./deedParts";

export const DEEDS_BATCH_2: PrecedentSeed[] = [
  {
    key: "deed.restraint_of_trade",
    name: "Restraint of Trade Deed",
    description:
      "Standalone restraint on a departing seller, shareholder or employee in full: cascading period and area so a narrower restraint survives if the widest is struck down, non-solicitation and confidentiality, and the acknowledgments a court looks for.",
    category: "Commercial",
    subcategory: "Restraints",
    documentType: "deed",
    requiresReview: true,
    reviewNote:
      "Cut the cascading ladders in clause 1 down to what is actually realistic for this restraint before sending: four alternatives that are all implausibly wide protects nothing and just signals the drafting wasn't thought through. Identify the real legitimate interest in clause 4 with precision: goodwill actually paid for, genuine client connection, or confidential information actually held; a restraint that protects nothing beyond keeping out competition is unenforceable regardless of how carefully it cascades. Confirm what consideration the Restrained Party is actually receiving: a restraint on a departing employee with nothing given for it beyond past employment is far more likely to fail than one given in exchange for sale proceeds, a payment, or continued engagement. A restraint on a seller of a business is enforced far more readily than one on an employee or a minority shareholder; weigh the drafting posture (how far to push the cascading ladders) against which of those this actually is.",
    aiInstructions:
      "Draft a standalone restraint of trade deed. The whole document turns on clause 1's cascading definitions of Restraint Period and Restraint Area: draft each as a numbered list from widest to narrowest, at least three rungs, so that if a court rejects the widest it can still enforce a narrower one instead of striking the restraint out entirely. Cover four kinds of restriction: non-compete, non-solicitation of clients and customers, non-solicitation of employees and contractors, and non-interference with suppliers, each measured against the same Restraint Period and Restraint Area so the cascade only needs to be defined once. Make clause 3 (construction) do the real work of explaining that each combination of restriction, period and area is a separate covenant, severable from the rest, because that is the mechanism that makes cascading drafting actually effective rather than decorative. Include an acknowledgments clause reciting that the restraint is no wider than reasonably necessary, that it protects a specific legitimate interest (name it as a field, not generically), and what consideration was given for it: courts weigh acknowledgments like this as evidence, not as something that makes an otherwise unreasonable restraint enforceable by saying so.",
    segments: [
      ...opening("RESTRAINT OF TRADE DEED", [
        ...L("DeedRecital", [
          "This deed is entered into in connection with ",
          field("context", "The context this restraint arises from", "the sale by the Restrained Party of the Restrained Party's shares in the Beneficiary, and the termination of the Restrained Party's employment with the Beneficiary"),
          " (together, the Trigger Event).",
        ]),
        ...L("DeedRecital", [
          "In consideration of ",
          field("consideration", "What the Restrained Party receives for giving this restraint", "the Beneficiary agreeing to pay the Restrained Party $50,000 within 14 days of the date of this deed"),
          ", the Restrained Party has agreed to be bound by the restraints in this deed.",
        ]),
      ]),

      ...L("DeedList-Level1-Bold", ["Definitions"]),
      ...L("DeedList-Level2-NoNumbering", ["In this deed:"]),
      ...L("DeedList-Level3", [
        "Beneficiary means the Second party named above, together with ",
        field("related_bodies_corporate", "Whether related bodies corporate are protected too", "its related bodies corporate"),
        ".",
      ]),
      ...L("DeedList-Level3", [
        "Confidential Information means information that is confidential to the Beneficiary and that the Restrained Party had access to because of the relationship described in Recital A, including ",
        field("confidential_info_examples", "What confidential information the restraint is protecting", "client lists, pricing, business plans and financial information"),
        ".",
      ]),
      ...L("DeedList-Level3", ["Restrained Party means the First party named above."]),
      ...L("DeedList-Level3", ["Trigger Event has the meaning given in Recital A."]),
      ...L("DeedList-Level3", [
        "Restrained Business means ",
        field("restrained_business", "The business the Restrained Party must not compete with", "the business of residential and commercial conveyancing carried on by the Beneficiary at the date of this deed"),
        ".",
      ]),
      ...L("DeedList-Level3", [
        "Restraint Area means, subject to clause 3, whichever of the following is the widest area found to be enforceable:",
      ]),
      ...L("DeedList-Level4", [field("area_1", "Restraint area: widest", "Australia")]),
      ...L("DeedList-Level4", [field("area_2", "Restraint area: next widest", "New South Wales")]),
      ...L("DeedList-Level4", [field("area_3", "Restraint area: narrower still", "within 50 kilometres of the Beneficiary's principal place of business")]),
      ...L("DeedList-Level4", [field("area_4", "Restraint area: narrowest", "within 10 kilometres of the Beneficiary's principal place of business")]),
      ...L("DeedList-Level3", [
        "Restraint Period means, subject to clause 3, whichever of the following is the longest period found to be enforceable, running from the date of the Trigger Event:",
      ]),
      ...L("DeedList-Level4", [field("period_1", "Restraint period: longest", "3 years")]),
      ...L("DeedList-Level4", [field("period_2", "Restraint period: next longest", "2 years")]),
      ...L("DeedList-Level4", [field("period_3", "Restraint period: shorter still", "1 year")]),
      ...L("DeedList-Level4", [field("period_4", "Restraint period: shortest", "6 months")]),

      ...L("DeedList-Level1-Bold", ["Restraint"]),
      ...L("DeedList-Level2-Normal", [
        "The Restrained Party must not, during the Restraint Period and within the Restraint Area, directly or indirectly, whether alone or with, for or through any other person, and whether as principal, agent, employee, partner, shareholder, unitholder, financier or consultant:",
      ]),
      ...L("DeedList-Level3", ["carry on, or be engaged, concerned or interested in, any business that competes with the Restrained Business;"]),
      ...L("DeedList-Level3", ["solicit, canvass, approach or accept an approach from any person who was a client or customer of the Beneficiary at any time in the 12 months before the date of this deed, for the purpose of providing goods or services that compete with the Restrained Business;"]),
      ...L("DeedList-Level3", ["induce or attempt to induce any employee or contractor of the Beneficiary to leave that engagement; or"]),
      ...L("DeedList-Level3", ["interfere with, or attempt to interfere with, the relationship between the Beneficiary and any of its suppliers."]),
      ...L("DeedList-Level2-Normal", [
        "Clause 2.1 does not prevent the Restrained Party from holding, for investment only, up to 5% of the shares in a company listed on a recognised stock exchange, even if that company competes with the Restrained Business.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The Restrained Party must keep the Confidential Information confidential, and must not use or disclose it except as required by law, indefinitely and without regard to the Restraint Period.",
      ]),

      ...L("DeedList-Level1-Bold", ["Construction"]),
      ...L("DeedList-Level2-Normal", [
        "Each restriction in clause 2.1, for each period in the Restraint Period and each area in the Restraint Area, is a separate and independent covenant, severable from every other combination.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "If any covenant arising under clause 3.1 is held to be void, unenforceable or unreasonable, it must be severed and the remaining covenants continue to apply, and the parties intend that the widest restriction of each kind that is not held void, unenforceable or unreasonable is to be enforced.",
      ]),

      ...L("DeedList-Level1-Bold", ["Acknowledgments"]),
      ...L("DeedList-Level2-Normal", ["The Restrained Party acknowledges that:"]),
      ...L("DeedList-Level3", [
        "the restraints in this deed are no wider than reasonably necessary to protect the Beneficiary's legitimate interest in ",
        field("legitimate_interest", "The specific legitimate interest being protected", "the goodwill of the Restrained Business and the client connections the Restrained Party developed while a shareholder and employee of the Company"),
        ";",
      ]),
      ...L("DeedList-Level3", ["the consideration described in Recital B is fair and reasonable compensation for entering into this deed;"]),
      ...L("DeedList-Level3", ["the Beneficiary would not have agreed to the arrangement described in Recital A without this deed; and"]),
      ...L("DeedList-Level3", ["the Restrained Party has had the opportunity to obtain independent legal advice on this deed before signing it."]),

      ...L("DeedList-Level1-Bold", ["Remedies"]),
      ...L("DeedList-Level2-Normal", [
        "The Restrained Party acknowledges that damages may not be an adequate remedy for a breach of clause 2, and that the Beneficiary is entitled to seek an injunction or specific performance in addition to any other remedy available at law or in equity.",
      ]),

      ...generalProvisions(),
    ],
  },
];
