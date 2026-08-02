// lib/precedents/crossRefCheck/checkDefinedTerms.ts
// Two checks, deliberately different in confidence:
//
// 1. A term is defined ("X means ..." or "(the X)") but never used again --
//    reliable and low-noise: the definition is unambiguous, and counting
//    later occurrences of the exact phrase is a plain word-boundary search.
//
// 2. A capitalised, multi-word phrase is used repeatedly as though it were
//    a defined term, but no matching definition was found -- a heuristic,
//    not a certainty (it can't tell a genuinely undefined term from a
//    company or person's name used more than once), so it's reported with
//    hedged wording rather than flat "this is wrong".
import type { DocParagraph } from "./documentModel";

export interface DefinedTermIssue {
  kind: "definedTermUnused" | "definedTermUndefined";
  term: string;
  paragraphIndex: number;
  charOffset: number;
  message: string;
  /**
   * "high" (definedTermUnused): the definition itself is unambiguous, so
   * finding it never used again is a plain count. "heuristic"
   * (definedTermUndefined): a capitalised phrase used repeatedly looks like
   * an undefined term, but the same pattern matches a person's name, a
   * company, or an address used more than once -- worth a human glancing at
   * it, not a confirmed defect the way a broken clause reference is.
   */
  confidence: "high" | "heuristic";
}

const TERM_START_RE = /^([A-Z][A-Za-z0-9 '&/-]*?)\s+(?:means\b|has the meaning\b)/;
const PAREN_DEFINITION_RE = /\(the\s+["“]?([A-Z][A-Za-z0-9 '&/-]*?)["”]?\)/g;
const QUOTED_DEFINITION_RE = /\(["“]([A-Z][A-Za-z0-9 '&/-]*?)["”]\)/g;
// A definitions clause laid out as a two-column table (term | meaning,
// common in trust deeds) puts the term and its "means ..." in separate
// cells -- separate paragraphs once flattened, but consecutive ones. A bare
// term paragraph looks nothing like a sentence: short, no punctuation, no
// verb.
const BARE_TERM_RE = /^[A-Z][A-Za-z0-9 '&/-]{0,50}$/;
const MEANS_START_RE = /^(?:means\b|has the meaning\b)/;

interface DefinedTerm {
  term: string;
  paragraphIndex: number;
  charOffset: number;
}

function collectDefinedTerms(paragraphs: DocParagraph[]): DefinedTerm[] {
  const out: DefinedTerm[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const startMatch = TERM_START_RE.exec(p.text);
    if (startMatch) out.push({ term: startMatch[1].trim(), paragraphIndex: p.index, charOffset: 0 });

    for (const m of p.text.matchAll(PAREN_DEFINITION_RE)) {
      out.push({ term: m[1].trim(), paragraphIndex: p.index, charOffset: m.index ?? 0 });
    }
    for (const m of p.text.matchAll(QUOTED_DEFINITION_RE)) {
      out.push({ term: m[1].trim(), paragraphIndex: p.index, charOffset: m.index ?? 0 });
    }

    const term = p.text.trim();
    const next = paragraphs[i + 1]?.text.trim();
    if (term && next && BARE_TERM_RE.test(term) && MEANS_START_RE.test(next)) {
      out.push({ term, paragraphIndex: p.index, charOffset: 0 });
    }
  }
  return out;
}

function countOccurrences(paragraphs: DocParagraph[], term: string): number {
  const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
  let count = 0;
  for (const p of paragraphs) count += (p.text.match(re) ?? []).length;
  return count;
}

// Common capitalised words that show up repeatedly without being defined
// terms -- sentence starts, months, the document's own recurring headings.
// Kept short and conservative: better to miss a real undefined term than to
// bury the reliable "unused" findings under noise.
const COMMON_NON_TERMS = new Set([
  "the", "this", "that", "these", "those", "background", "definitions",
  "interpretation", "general", "operative provisions", "schedule", "annexure",
  "parties", "date", "recitals",
]);

function collectRepeatedCapitalisedPhrases(paragraphs: DocParagraph[]): Map<string, { count: number; first: DefinedTerm }> {
  const PHRASE_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
  const seen = new Map<string, { count: number; first: DefinedTerm }>();
  for (const p of paragraphs) {
    for (const m of p.text.matchAll(PHRASE_RE)) {
      const phrase = m[1];
      if (COMMON_NON_TERMS.has(phrase.toLowerCase())) continue;
      const existing = seen.get(phrase);
      if (existing) existing.count++;
      else seen.set(phrase, { count: 1, first: { term: phrase, paragraphIndex: p.index, charOffset: m.index ?? 0 } });
    }
  }
  return seen;
}

export function checkDefinedTerms(paragraphs: DocParagraph[]): DefinedTermIssue[] {
  const issues: DefinedTermIssue[] = [];
  const defined = collectDefinedTerms(paragraphs);
  const definedTermNames = new Set(defined.map(d => d.term));

  for (const d of defined) {
    // The definition itself is one occurrence; anything less means it's
    // never referred to again.
    if (countOccurrences(paragraphs, d.term) <= 1) {
      issues.push({
        kind: "definedTermUnused",
        term: d.term,
        paragraphIndex: d.paragraphIndex,
        charOffset: d.charOffset,
        message: `"${d.term}" is defined here but doesn't appear to be used anywhere else in the document.`,
        confidence: "high",
      });
    }
  }

  const repeated = collectRepeatedCapitalisedPhrases(paragraphs);
  for (const [phrase, info] of repeated) {
    if (info.count < 3) continue;
    if (definedTermNames.has(phrase)) continue;
    issues.push({
      kind: "definedTermUndefined",
      term: phrase,
      paragraphIndex: info.first.paragraphIndex,
      charOffset: info.first.charOffset,
      message: `"${phrase}" is capitalised and used ${info.count} times like a defined term, but no definition for it was found ("${phrase} means ..." or "(the ${phrase})"). Worth checking it's meant to be defined.`,
      confidence: "heuristic",
    });
  }

  return issues;
}
