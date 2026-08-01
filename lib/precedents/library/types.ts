// lib/precedents/library/types.ts
// Shared types for the seeded Australian law-firm precedent library.
//
// A PrecedentSeed is authored here as typed data (not SQL) so it's
// diff-reviewable in git and readable by a practitioner signing it off --
// see scripts/seedPrecedentLibrary.ts for how these become `precedents`
// rows, and supabase/migrations/20260802180000_precedent_library.sql for
// the columns each field maps to.
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

/**
 * States the library ships content for. Territories (ACT, NT) are
 * deliberately absent -- nothing is seeded for them yet, and claiming
 * coverage we haven't written would be worse than the gap. A firm can
 * still tag its own precedents with them.
 */
export type Jurisdiction = "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS";

export const ALL_JURISDICTIONS: Jurisdiction[] = ["NSW", "VIC", "QLD", "SA", "WA", "TAS"];

/**
 * Practice area. Mirrors how a firm actually files work, and drives the
 * collapsible grouping in PrecedentsTab.
 */
export type PrecedentCategory =
  | "Client Care"
  | "Conveyancing"
  | "Commercial"
  | "Debt Recovery"
  | "Litigation"
  | "Family Law"
  | "Personal Injury"
  | "Wills & Estates"
  | "Criminal"
  | "Immigration";

/**
 * Rendering/intent hint, not a strict schema -- 'court_document' is the one
 * that carries real weight because it forces requiresReview (see
 * assertSeedsValid below).
 */
export type PrecedentDocumentType =
  | "letter"
  | "advice"
  | "court_document"
  | "deed"
  | "form"
  | "file_note";

export interface PrecedentSeed {
  /**
   * Stable slug, e.g. 'debt.letter_of_demand'. Never change one after
   * release -- it's the upsert key, so renaming it orphans the old row and
   * silently installs a duplicate alongside it.
   */
  key: string;
  name: string;
  description: string;
  category: PrecedentCategory;
  subcategory?: string;
  documentType: PrecedentDocumentType;
  /** Omit for "applies in every jurisdiction" -- see the migration's note. */
  jurisdictions?: Jurisdiction[];
  /** Omit to show on matters of any type. */
  matterTypes?: string[];
  /** Steers the AI draft on top of the staff member's own prompt. */
  aiInstructions: string;
  /** Fixed boilerplate + fill-in fields. Omit for AI-only precedents. */
  segments?: BodyTemplateSegment[];
  requiresReview?: boolean;
  reviewNote?: string;
}

/** Fixed boilerplate. */
export function text(t: string): BodyTemplateSegment {
  return { type: "text", text: t };
}

/**
 * A fill-in field. `autoFillFieldId` binds it to one of the matter's own
 * custom fields so it pre-populates instead of being retyped -- resolved at
 * issue time by app/api/precedents/[id]/body-template/route.ts. It's a
 * per-company custom-field UUID, which the seed can't know, so seeds pass a
 * stable field_key here and the seed script resolves it per company.
 */
export function field(key: string, label: string, example: string, autoFillFieldKey?: string): BodyTemplateSegment {
  return {
    type: "field",
    key,
    label,
    example,
    // Carried through as a field_key; scripts/seedPrecedentLibrary.ts swaps
    // it for that company's real company_custom_fields.id before insert.
    autoFillFieldId: autoFillFieldKey ?? null,
  };
}

/**
 * Catches the mistakes that actually happen when authoring hundreds of
 * these by hand: duplicate keys (silently collapse on upsert), and a court
 * document shipped without the "verify against the current prescribed form"
 * flag. Called by the seed script and the library's own unit check.
 */
export function assertSeedsValid(seeds: PrecedentSeed[]): void {
  const seen = new Set<string>();
  const problems: string[] = [];

  for (const s of seeds) {
    if (seen.has(s.key)) problems.push(`duplicate key: ${s.key}`);
    seen.add(s.key);

    if (!/^[a-z0-9]+(\.[a-z0-9_]+)+$/.test(s.key)) {
      problems.push(`key not in 'area.snake_case' form: ${s.key}`);
    }
    if (s.documentType === "court_document" && !s.requiresReview) {
      problems.push(`court document without requiresReview: ${s.key}`);
    }
    if (s.requiresReview && !s.reviewNote) {
      problems.push(`requiresReview without reviewNote: ${s.key}`);
    }
    if (s.jurisdictions && s.jurisdictions.length === 0) {
      problems.push(`empty jurisdictions array (use undefined for "all"): ${s.key}`);
    }
  }

  if (problems.length) {
    throw new Error(`Invalid precedent seeds:\n  - ${problems.join("\n  - ")}`);
  }
}
