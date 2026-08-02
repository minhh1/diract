// lib/precedents/library/deedsBatch4.ts
// Full deeds, continuing deedsBatch1.ts -- 3.ts: a trade mark assignment and
// a copyright assignment.
//
// Both are genuinely short instruments in real practice -- an assignment
// transfers a defined right, it doesn't regulate an ongoing relationship --
// so neither is padded out to match the length of the library's bigger
// agreements. What each gets instead is the one thing that actually trips
// these documents up: for a trade mark, whether goodwill goes with it (an
// assignment without goodwill can leave the mark vulnerable to being found
// deceptive or non-distinctive in the assignee's hands); for copyright,
// moral rights, which cannot be assigned in Australia at all -- the correct
// mechanism is a written consent to specified acts that would otherwise
// infringe them, which is the clause most of these assignments skip and the
// reason many don't achieve what the client assumed they'd bought.
import { field, type PrecedentSeed } from "./types";
import { L } from "./instrumentParts";
import { opening, generalProvisions } from "./deedParts";

const COMMERCIAL = ["Commercial"];

export const DEEDS_BATCH_4: PrecedentSeed[] = [
  // ── Trade mark assignment ────────────────────────────────────────
  {
    key: "deed.trademark_assignment",
    name: "Trade Mark Assignment",
    description:
      "Assigns a registered or unregistered trade mark in full, with the goodwill choice made explicit, the right to sue for past infringement, and the recordal step IP Australia needs.",
    category: "Commercial",
    subcategory: "Intellectual Property",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "Confirm whether the assignment is with or without goodwill before sending -- an assignment of a registered mark without the goodwill of the business it distinguishes can leave the mark vulnerable to removal for non-use or to a finding it has become deceptive in the assignee's hands, because the mark no longer points to the business the public associates it with. Check the mark is free of any registered security interest on the Personal Property Securities Register and any licence that would survive the assignment, and record the assignment with IP Australia promptly -- an unrecorded assignment can create real difficulties for the assignee enforcing the mark against a later infringer or a later registered interest.",
    aiInstructions:
      "Draft a trade mark assignment. Identify the marks precisely -- registration number and class if registered, or a description of the mark and the goods or services it's used for if not. Make the goodwill choice an explicit clause, not an assumption: assigning WITH the goodwill of the business associated with the mark, or WITHOUT it, are different transactions with different risks, and the assignment should say which. Assign the right to sue for infringements that occurred before the assignment date, since that right doesn't pass automatically. Include warranties that the assignor owns the mark, that it isn't subject to an encumbrance or a licence inconsistent with the assignment, and an obligation to sign whatever IP Australia needs to record the change of ownership.",
    segments: [
      ...opening("TRADE MARK ASSIGNMENT", [
        ...L("DeedRecital", [
          "The First party is the registered or beneficial owner of the trade marks described in Schedule 1 (the Marks).",
        ]),
        ...L("DeedRecital", [
          "The First party has agreed to assign, and the Second party has agreed to accept the assignment of, the Marks on the terms of this deed.",
        ]),
      ]),

      ...L("DeedList-Level1-Bold", ["Assignment"]),
      ...L("DeedList-Level2-Normal", [
        "The First party assigns to the Second party the whole of its right, title and interest in the Marks, ",
        field("goodwill_choice", "With or without the goodwill of the associated business", "together with the goodwill of the business in connection with which the Marks have been used"),
        ", to hold absolutely.",
      ]),
      ...L("DeedList-Level2-Normal", [
        "The assignment includes the First party's right to sue for, and to retain damages or an account of profits in respect of, any infringement of the Marks occurring before the date of this deed.",
      ]),

      ...L("DeedList-Level1-Bold", ["Warranties"]),
      ...L("DeedList-Level2-Normal", ["The First party warrants that:"]),
      ...L("DeedList-Level3", ["it is the sole legal and beneficial owner of the Marks;"]),
      ...L("DeedList-Level3", ["the Marks are free from any encumbrance, and are not the subject of any licence, that would survive this assignment;"]),
      ...L("DeedList-Level3", ["so far as it is aware, the Marks do not infringe the rights of any third party; and"]),
      ...L("DeedList-Level3", ["it has not done, and is not aware of any circumstance that would give rise to, anything that would entitle a third party to apply to remove or cancel the registration of a Mark."]),

      ...L("DeedList-Level1-Bold", ["Further assurance and recordal"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must promptly sign any document, and do anything else, reasonably required to record this assignment with IP Australia or any equivalent register, and to give full effect to this deed.",
      ]),

      ...generalProvisions(),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Marks"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("marks_schedule", "The Marks: registration number(s) and class(es), or a description if unregistered", "Australian Trade Mark Registration No. 1234567, word mark \"ACME\", class 25 (clothing)."),
      ]),
    ],
  },

  // ── Copyright assignment ─────────────────────────────────────────
  {
    key: "deed.copyright_assignment",
    name: "Copyright Assignment",
    description:
      "Assigns copyright in full, including future works where agreed, with a genuine moral rights consent -- the step most copyright assignments skip and the reason many don't achieve what the client assumed.",
    category: "Commercial",
    subcategory: "Intellectual Property",
    documentType: "deed",
    matterTypes: COMMERCIAL,
    requiresReview: true,
    reviewNote:
      "Moral rights cannot be assigned in Australia under any circumstances -- clause 2 is a consent to specified acts or omissions, which is the only mechanism the Copyright Act 1968 (Cth) allows, and it is only effective to the extent the consent is genuinely informed and the acts are specified with enough particularity. A blanket, unspecific consent risks being found ineffective. If the assignment is meant to cover works the assignor hasn't created yet, confirm clause 1.2 is actually needed and wanted -- an assignment of future copyright binds works created after this deed but has no effect on copyright the assignor no longer owns at the time of creation (for example, if the assignor is by then an employee of someone else, in which case the employer owns it under s 35(6)).",
    aiInstructions:
      "Draft a copyright assignment. Identify the works precisely by description. Assign all copyright in the identified works, including the right to sue for infringement occurring before the assignment date. If the parties want future works covered, include an express assignment of future copyright -- this needs explicit words, since an assignment of existing copyright does not automatically extend to works not yet created. Treat moral rights as their own clause, not folded into the general assignment: draft a written consent, specific about what acts or omissions it covers (not attributing the assignee as author, allowing the work to be modified, and so on), because that specificity is what makes the consent effective. Include warranties of ownership and originality (that the work is the assignor's own and doesn't infringe a third party's copyright), and a further assurance obligation.",
    segments: [
      ...opening("COPYRIGHT ASSIGNMENT", [
        ...L("DeedRecital", [
          "The First party is the owner of the copyright in the works described in Schedule 1 (the Works).",
        ]),
        ...L("DeedRecital", [
          "The First party has agreed to assign, and the Second party has agreed to accept the assignment of, the copyright in the Works on the terms of this deed.",
        ]),
      ]),

      ...L("DeedList-Level1-Bold", ["Assignment"]),
      ...L("DeedList-Level2-Normal", [
        "The First party assigns to the Second party the whole of its right, title and interest in the copyright subsisting in the Works, to hold absolutely, including the right to sue for, and to retain damages or an account of profits in respect of, any infringement occurring before the date of this deed.",
      ]),
      ...L(null, ["[Delete clause 1.2 if future works are not being assigned.]"]),
      ...L("DeedList-Level2-Normal", [
        "The First party also assigns to the Second party the whole of its right, title and interest in the copyright subsisting in ",
        field("future_works", "Description of future works being assigned, if any", "any further work of the same kind as the Works that the First party creates for the Second party within 12 months of the date of this deed"),
        ", such copyright to vest in the Second party immediately on the creation of the relevant work.",
      ]),

      ...L("DeedList-Level1-Bold", ["Moral rights consent"]),
      ...L("DeedList-Level2-Normal", [
        "Moral rights in the Works cannot be assigned. To the extent the First party holds moral rights in the Works, the First party consents, for the purposes of the Copyright Act 1968 (Cth), to the following acts and omissions by or on behalf of the Second party, its licensees and successors, whether occurring before or after the date of this deed:",
      ]),
      ...L("DeedList-Level3", ["not attributing the First party as the author or maker of the Works, or attributing a person other than the First party;"]),
      ...L("DeedList-Level3", [
        field("moral_rights_acts", "Other specific acts or omissions consented to", "reproducing, adapting, modifying, editing or altering the Works, and using the Works or an adaptation of them in a context the First party has not approved"),
        "; and",
      ]),
      ...L("DeedList-Level3", ["dealing with the Works in any manner that would otherwise infringe the First party's moral rights, to the extent consistent with this clause."]),

      ...L("DeedList-Level1-Bold", ["Warranties"]),
      ...L("DeedList-Level2-Normal", ["The First party warrants that:"]),
      ...L("DeedList-Level3", ["the Works are original and are the First party's own work, or the First party otherwise owns the copyright in them;"]),
      ...L("DeedList-Level3", ["the Works do not infringe the copyright or other rights of any third party; and"]),
      ...L("DeedList-Level3", ["the copyright in the Works is free from any encumbrance and any licence that would survive this assignment."]),

      ...L("DeedList-Level1-Bold", ["Further assurance"]),
      ...L("DeedList-Level2-Normal", [
        "Each party must promptly sign any document, and do anything else, reasonably required to give full effect to this deed.",
      ]),

      ...generalProvisions(),

      ...L(null, [""]),
      ...L("DeedHeading", ["Schedule 1 -- Works"]),
      ...L("DeedList-Level2-NoNumbering", [
        field("works_schedule", "Description of the Works", "The website design, source code and content for acmetrading.com.au, created between 1 March 2026 and 30 April 2026."),
      ]),
    ],
  },
];
