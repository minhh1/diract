// lib/smartValidation/nameQuality.ts
// Pure, field-agnostic "does this name look right?" checks -- no React/UI
// dependency, so the exact same rules can be wired into any name/title
// field across the app (see components/SmartFieldHint.tsx /
// lib/hooks/useNameQualityCheck.ts for the UI side). Deliberately a small,
// curated ruleset aimed at the specific mistakes data entry actually makes
// here (typo'd legal suffixes, a first-name-only entry, an unnamed trust),
// not a general spell-checker.
import { similarity } from "@/lib/duplicates/similarity";

export interface NameSuggestionResult {
  // The field's own corrected value, when there is one (suffix-typo fix).
  // Absent for a purely advisory nudge (incomplete name / bare "trust")
  // that has nothing concrete to auto-apply.
  correctedValue?: string;
}

export interface TrustStructureResult {
  trusteeName: string;
  trustName: string;
}

// One shared shape for every suggestion source (generic name-quality checks
// AND the entity-only trust-structure parse below) so a single UI component
// (components/SmartFieldHint.tsx) can render either without knowing which
// produced it -- callers distinguish the two shapes apply() can return by
// checking which properties are present ('trusteeName' vs 'correctedValue').
export interface NameSuggestion {
  id: string;
  message: string;
  // Present only when apply() actually changes something -- the UI shows a
  // plain dismiss (no action button) when this is absent, since there's
  // nothing to "apply" for an advisory-only nudge.
  actionLabel?: string;
  apply?: () => NameSuggestionResult | TrustStructureResult;
}

// Legal-suffix typo detection -- deliberately just the handful of suffixes
// this app's data actually uses, not a general English dictionary.
const KNOWN_SUFFIXES = ["Pty Ltd", "Pty Limited", "Ltd", "Limited", "Trust"];
const SUFFIX_SIMILARITY_MIN = 0.6; // below this: unrelated words, not a typo
const SUFFIX_SIMILARITY_MAX = 0.999; // at/above this: already correct

function suffixTypoSuggestion(name: string): NameSuggestion | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const words = trimmed.split(/\s+/);

  // Try 2-word suffixes ("Pty Ltd") before 1-word ones ("Ltd") so a
  // two-word match wins when both could plausibly apply.
  for (const wordCount of [2, 1]) {
    if (words.length <= wordCount) continue;
    const tail = words.slice(-wordCount).join(" ");
    for (const known of KNOWN_SUFFIXES) {
      if (known.split(/\s+/).length !== wordCount) continue;
      if (tail.toLowerCase() === known.toLowerCase()) continue; // already correct
      const score = similarity(tail, known);
      if (score >= SUFFIX_SIMILARITY_MIN && score < SUFFIX_SIMILARITY_MAX) {
        const correctedValue = [...words.slice(0, -wordCount), known].join(" ");
        return {
          id: "suffix-typo",
          message: `Did you mean "${known}"?`,
          actionLabel: "Fix it",
          apply: () => ({ correctedValue }),
        };
      }
    }
  }
  return null;
}

// Mirrors the Postgres `incomplete_name` auto_fed rule's own check (see
// supabase/migrations/20260729390000_irregularities_all_companies.sql) --
// a real full name has at least one non-space run, whitespace, then
// another non-space run somewhere in it.
function looksIncomplete(name: string): boolean {
  return !/\S\s+\S/.test(name.trim());
}

function bareTrustSuggestion(name: string): NameSuggestion | null {
  if (!/^trust$/i.test(name.trim())) return null;
  return {
    id: "bare-trust-name",
    message: "You should add the full name of the trust.",
  };
}

function incompleteNameSuggestion(name: string): NameSuggestion | null {
  const trimmed = name.trim();
  if (!trimmed || !looksIncomplete(trimmed)) return null;
  return {
    id: "incomplete-name",
    message: "A full name would be better.",
  };
}

// Generic checks, usable on any name/title-style field.
export function checkNameQuality(name: string): NameSuggestion[] {
  const suggestions: NameSuggestion[] = [];
  const bareTrust = bareTrustSuggestion(name);
  // Bare "trust" is a more specific case of "incomplete" -- show only the
  // more specific message, not both.
  if (bareTrust) suggestions.push(bareTrust);
  else {
    const incomplete = incompleteNameSuggestion(name);
    if (incomplete) suggestions.push(incomplete);
  }
  const suffixTypo = suffixTypoSuggestion(name);
  if (suffixTypo) suggestions.push(suffixTypo);
  return suggestions;
}

// Entity-specific -- only ever wired into NewEntityModal.tsx, since acting
// on it means switching that form into its existing Trust-creation mode
// (see NewEntityModal.tsx's isTrust branch) rather than anything a matter/
// property/custom-table name field could sensibly do. "atf" = "as trustee
// for", the standard way Australian conveyancing/legal documents name a
// corporate trustee holding on behalf of a trust.
export function checkEntityTrustStructure(name: string): NameSuggestion | null {
  const match = name.match(/^(.+?)\s+atf\s+(.+)$/i);
  if (!match) return null;
  const trusteeName = match[1].trim();
  const trustName = match[2].trim();
  if (!trusteeName || !trustName) return null;
  return {
    id: "atf-trust-split",
    message: `I'll add "${trustName}" as a linked trust for you. Pick its trust type below to finish.`,
    actionLabel: "Split into trustee + trust",
    apply: () => ({ trusteeName, trustName }),
  };
}
