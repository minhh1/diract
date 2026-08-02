// lib/precedents/library/deedParts.ts
// Shared scaffolding for genuine deeds (not agreements): the cover page,
// date, parties and recitals, and the boilerplate general provisions plus
// execution page.
//
// Mirrors the split agreementParts.ts already does for agreements -- pulled
// out once a second deed batch needed the same boilerplate deedsBatch1.ts
// already had, rather than duplicating it a third time. Content matches
// deedsBatch1.ts's own (previously local, unexported) opening()/
// generalProvisions() exactly; deedsBatch1.ts is left untouched rather than
// repointed at this file, since touching it isn't necessary for a new batch
// to reuse the same wording. Deed-flavoured throughout: "this deed", not
// "this agreement"; execution opens "Signed, sealed and delivered", not
// "Executed by"; and unlike agreementParts.ts's execution() (which defaults
// both parties to a specific company signing block), this shows all five
// signing variants with an instruction to keep the ones that fit and delete
// the rest, matching deedsBatch1.ts's own two-party-of-unknown-kind deeds.
import { field } from "./types";
import { L, executionLines } from "./instrumentParts";
import { executedAsLine } from "@/lib/precedents/executionClauses";
import { DEED_PAGE_BREAK, deedCover } from "@/lib/precedents/deedDocx";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

/** The cover page, the date, the parties (First party / Second party) and the recitals. */
export function opening(title: string, recitals: BodyTemplateSegment[]): BodyTemplateSegment[] {
  return [
    ...L(null, [deedCover({
      title,
      parties: ["[First party: name, ACN/ABN and address]", "[Second party: name, ACN/ABN and address]"],
    })]),
    ...L(null, [DEED_PAGE_BREAK]),
    ...L(null, ["Date: ", field("deed_date", "Date of the deed", "12 August 2026")]),
    ...L(null, [""]),
    ...L("DeedHeading", ["Parties"]),
    ...L(null, [field("party_a", "First party: name, ACN/ABN and address", "ACME Pty Ltd ACN 000 000 000 of Level 3, 20 Market Street, Sydney NSW 2000")]),
    ...L(null, ["(", field("party_a_short", "First party short name", "the Company"), ")"]),
    ...L(null, [""]),
    ...L(null, [field("party_b", "Second party: name, ACN/ABN and address", "John Citizen of 10 Smith Street, Parramatta NSW 2150")]),
    ...L(null, ["(", field("party_b_short", "Second party short name", "the Employee"), ")"]),
    ...L(null, [""]),
    ...L("DeedHeading", ["Background"]),
    ...recitals,
    ...L(null, [""]),
    ...L("DeedHeading", ["Operative Provisions"]),
  ];
}

/** The boilerplate every deed built on this scaffolding ends with, then the execution page. */
export function generalProvisions(): BodyTemplateSegment[] {
  return [
    ...L("DeedList-Level1-Bold", ["General"]),
    ...L("DeedList-Level2-Bold", ["Entire agreement"]),
    ...L("DeedList-Level2-NoNumbering", [
      "This deed records the entire agreement between the parties about its subject matter and supersedes all previous negotiations, understandings and agreements about that subject matter.",
    ]),
    ...L("DeedList-Level2-Bold", ["Variation"]),
    ...L("DeedList-Level2-NoNumbering", [
      "No variation of this deed is effective unless it is in writing and signed by each party.",
    ]),
    ...L("DeedList-Level2-Bold", ["Further assurances"]),
    ...L("DeedList-Level2-NoNumbering", [
      "Each party must do everything reasonably necessary, including signing any document, to give full effect to this deed.",
    ]),
    ...L("DeedList-Level2-Bold", ["Counterparts"]),
    ...L("DeedList-Level2-NoNumbering", [
      "This deed may be signed in counterparts, and all counterparts together constitute one instrument.",
    ]),
    ...L("DeedList-Level2-Bold", ["Governing law"]),
    ...L("DeedList-Level2-NoNumbering", [
      "This deed is governed by the law of ",
      field("jurisdiction", "Governing law", "New South Wales"),
      ", and each party submits to the non-exclusive jurisdiction of the courts of that place.",
    ]),
    ...L("DeedList-Level2-Bold", ["Costs"]),
    ...L("DeedList-Level2-NoNumbering", [
      "Each party bears its own costs of preparing and signing this deed.",
    ]),
    ...L(null, [""]),
    // The signing page starts a fresh page: a deed that is signed halfway
    // down a page of clauses reads as an afterthought, and the block can be
    // separated from what it signs.
    ...L(null, [DEED_PAGE_BREAK]),
    ...L("DeedHeading", ["Execution"]),
    ...L(null, [executedAsLine("deed")]),
    ...L(null, [""]),
    // All four blocks are laid out, not one guessed at. Which a party uses
    // turns on what that party IS -- a natural person, or a company signing
    // under s 127(1) or s 126 -- and the precedent cannot know that. Deleting
    // the three that don't apply is quick; noticing that the wrong statutory
    // words are under a party's name is not.
    ...L(null, ["[Keep the block that fits each party and delete the rest.]"]),
    ...L(null, [""]),
    ...executionLines("individual", "deed", "Individual party"),
    ...L(null, [""]),
    ...executionLines("individual", "agreement", "Individual party"),
    ...L(null, [""]),
    ...executionLines("company_127_two_officers", "deed", "Company party"),
    ...L(null, [""]),
    ...executionLines("company_127_sole_director", "deed", "Company party"),
    ...L(null, [""]),
    ...executionLines("company_126_authorised", "deed", "Company party"),
  ];
}
